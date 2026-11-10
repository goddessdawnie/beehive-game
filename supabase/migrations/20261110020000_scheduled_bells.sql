-- Reuse Beehive's existing bell outbox and 15-second push worker.
-- Scheduled notifications are independent of tasks, coins and Kae.
CREATE TABLE public.beehive_bell_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
 body text NOT NULL DEFAULT 'Scheduled reminder' CHECK (length(btrim(body)) BETWEEN 1 AND 400),
 kind text NOT NULL CHECK (kind IN ('once','weekly','monthly')),
 one_time_at timestamptz,
 local_time time without time zone,
 weekdays integer[] NOT NULL DEFAULT '{}'::integer[],
 month_day integer,
 timezone text NOT NULL DEFAULT 'America/New_York' CHECK (timezone='America/New_York'),
 next_due_at timestamptz,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT bell_schedule_shape CHECK (
  (kind='once' AND one_time_at IS NOT NULL AND local_time IS NULL AND cardinality(weekdays)=0 AND month_day IS NULL)
  OR (kind='weekly' AND one_time_at IS NULL AND local_time IS NOT NULL AND
      cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::integer[] AND month_day IS NULL)
  OR (kind='monthly' AND one_time_at IS NULL AND local_time IS NOT NULL AND
      cardinality(weekdays)=0 AND month_day BETWEEN 1 AND 31)
 )
);
ALTER TABLE public.beehive_bell_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY bell_schedules_select_own ON public.beehive_bell_schedules FOR SELECT TO authenticated
 USING (owner_id=(SELECT auth.uid()));
CREATE POLICY bell_schedules_insert_own ON public.beehive_bell_schedules FOR INSERT TO authenticated
 WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY bell_schedules_update_own ON public.beehive_bell_schedules FOR UPDATE TO authenticated
 USING (owner_id=(SELECT auth.uid())) WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY bell_schedules_delete_own ON public.beehive_bell_schedules FOR DELETE TO authenticated
 USING (owner_id=(SELECT auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.beehive_bell_schedules TO authenticated;
CREATE INDEX bell_schedules_due_idx ON public.beehive_bell_schedules(next_due_at) WHERE active;

ALTER TABLE public.beehive_bell_outbox
 ADD COLUMN schedule_id uuid REFERENCES public.beehive_bell_schedules(id) ON DELETE SET NULL,
 ADD COLUMN scheduled_for timestamptz;
CREATE UNIQUE INDEX bell_schedule_occurrence_once ON public.beehive_bell_outbox(schedule_id,scheduled_for)
 WHERE schedule_id IS NOT NULL;

-- All local clock times use Eastern (the user's work/home timezone).
-- The monthly original day is retained across short months.
CREATE FUNCTION public.beehive_next_scheduled_bell(
 p_kind text, p_once timestamptz, p_time time, p_days integer[], p_month_day integer, p_after timestamptz
) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
DECLARE local_day date; day_offset int; candidate timestamptz; month_start date; capped_day int;
BEGIN
 IF p_kind='once' THEN
  IF p_once>p_after THEN RETURN p_once; END IF;
  RETURN NULL;
 ELSIF p_kind='weekly' THEN
  local_day:=(p_after AT TIME ZONE 'America/New_York')::date;
  FOR day_offset IN 0..7 LOOP
   IF extract(isodow from local_day+day_offset)::integer=ANY(p_days) THEN
    candidate:=((local_day+day_offset)+p_time) AT TIME ZONE 'America/New_York';
    IF candidate>p_after THEN RETURN candidate; END IF;
   END IF;
  END LOOP;
 ELSIF p_kind='monthly' THEN
  local_day:=(p_after AT TIME ZONE 'America/New_York')::date;
  FOR day_offset IN 0..2 LOOP
   month_start:=(date_trunc('month',local_day::timestamp)+make_interval(months=>day_offset))::date;
   capped_day:=least(p_month_day,extract(day from (month_start+interval '1 month'-interval '1 day'))::integer);
   candidate:=((month_start+(capped_day-1))+p_time) AT TIME ZONE 'America/New_York';
   IF candidate>p_after THEN RETURN candidate; END IF;
  END LOOP;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION public.beehive_prepare_bell_schedule() RETURNS trigger LANGUAGE plpgsql
 SET search_path TO '' AS $$
BEGIN
 IF new.active THEN
  new.next_due_at:=public.beehive_next_scheduled_bell(
   new.kind,new.one_time_at,new.local_time,new.weekdays,new.month_day,now());
  IF new.next_due_at IS NULL THEN RAISE EXCEPTION 'Choose a future time for the scheduled ding'; END IF;
 ELSE
  new.next_due_at:=NULL;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER bell_schedule_prepare BEFORE INSERT OR UPDATE OF
 kind,one_time_at,local_time,weekdays,month_day,active
 ON public.beehive_bell_schedules FOR EACH ROW EXECUTE FUNCTION public.beehive_prepare_bell_schedule();

CREATE FUNCTION public.beehive_touch_bell_schedule() RETURNS trigger LANGUAGE plpgsql
 SET search_path TO '' AS $$
BEGIN new.updated_at:=clock_timestamp(); RETURN new; END $$;
CREATE TRIGGER bell_schedule_touch BEFORE UPDATE ON public.beehive_bell_schedules FOR EACH ROW
 EXECUTE FUNCTION public.beehive_touch_bell_schedule();

-- Called by the existing trusted worker, not by browsers.
-- Only the due occurrence is emitted. Outages longer than five minutes do not
-- backfill stale dings, and each occurrence has a unique database key.
CREATE OR REPLACE FUNCTION public.beehive_claim_due_bells(p_limit integer DEFAULT 20)
RETURNS SETOF public.beehive_bell_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE s public.beehive_bell_schedules%ROWTYPE; advanced timestamptz;
BEGIN
 FOR s IN SELECT * FROM public.beehive_bell_schedules
  WHERE active AND next_due_at<=now() ORDER BY next_due_at
  LIMIT 100 FOR UPDATE SKIP LOCKED
 LOOP
  IF s.next_due_at >= now()-interval '5 minutes' THEN
   INSERT INTO public.beehive_bell_outbox(owner_id,source,title,body,due_at,schedule_id,scheduled_for)
   VALUES(s.owner_id,'system',s.title,s.body,s.next_due_at,s.id,s.next_due_at)
   ON CONFLICT(schedule_id,scheduled_for) WHERE schedule_id IS NOT NULL DO NOTHING;
  END IF;
  IF s.kind='once' THEN
   UPDATE public.beehive_bell_schedules SET active=false,next_due_at=NULL WHERE id=s.id;
  ELSE
   advanced:=public.beehive_next_scheduled_bell(s.kind,s.one_time_at,s.local_time,s.weekdays,s.month_day,now());
   UPDATE public.beehive_bell_schedules SET next_due_at=advanced WHERE id=s.id;
  END IF;
 END LOOP;
 -- A queued scheduled ding cannot remain eligible for retries after its useful window.
 UPDATE public.beehive_bell_outbox SET status='cancelled',lease_until=NULL,retry_after=NULL,
  updated_at=now(),last_error='Scheduled ding expired before delivery'
 WHERE schedule_id IS NOT NULL AND scheduled_for < now()-interval '5 minutes'
   AND (status='pending' OR (status='sending' AND lease_until<now()));
 -- Original claim/retry/lease behavior is kept intact.
 UPDATE public.beehive_bell_outbox SET status='failed',lease_until=NULL,updated_at=now(),
  last_error='Delivery status unknown after final worker lease expired'
 WHERE status='sending' AND attempts>=5 AND lease_until<now();
 RETURN QUERY
 WITH picked AS (
  SELECT id FROM public.beehive_bell_outbox
  WHERE attempts<5 AND (
   (status='pending' AND due_at<=now() AND coalesce(retry_after,now())<=now())
   OR (status='sending' AND lease_until<now())
  )
  ORDER BY due_at ASC
  LIMIT least(greatest(coalesce(p_limit,20),1),40)
  FOR UPDATE SKIP LOCKED
 )
 UPDATE public.beehive_bell_outbox b
 SET status='sending',attempts=b.attempts+1,lease_until=now()+interval '2 minutes',
     retry_after=NULL,updated_at=now()
 FROM picked WHERE b.id=picked.id
 RETURNING b.*;
END $$;
REVOKE ALL ON FUNCTION public.beehive_claim_due_bells(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beehive_claim_due_bells(integer) TO service_role;
