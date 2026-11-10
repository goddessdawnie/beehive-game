-- Flexible due-date-anchored recurrence; keep legacy daily/weekly values valid.
ALTER TABLE public.tasks DROP CONSTRAINT recurrence_requires_date;
ALTER TABLE public.tasks ADD CONSTRAINT recurrence_requires_date CHECK (
 recurrence_rule IS NULL OR (
 due_at IS NOT NULL AND recurrence_series_id IS NOT NULL AND (
 recurrence_rule IN ('daily','weekly')
 OR recurrence_rule ~ '^every:([1-9][0-9]{0,2}):(days|weeks)$'
 OR recurrence_rule ~ '^monthly:(0?[1-9]|[12][0-9]|3[01])$'
 )));
CREATE OR REPLACE FUNCTION public.next_recurrence_due(p_due timestamptz,p_rule text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
DECLARE local_due timestamp; next_local timestamp; n int; unit text; anchor_day int; target_month date; last_day int;
BEGIN
 IF p_due IS NULL OR p_rule IS NULL THEN RAISE EXCEPTION 'Recurrence requires due date and rule'; END IF;
 local_due:=p_due AT TIME ZONE 'America/New_York';
 IF p_rule='daily' THEN next_local:=local_due+interval '1 day';
 ELSIF p_rule='weekly' THEN next_local:=local_due+interval '7 days';
 ELSIF p_rule ~ '^every:([1-9][0-9]{0,2}):(days|weeks)$' THEN
  n:=split_part(p_rule,':',2)::int; unit:=split_part(p_rule,':',3);
  next_local:=local_due+make_interval(days=>n*(CASE WHEN unit='weeks' THEN 7 ELSE 1 END));
 ELSIF p_rule ~ '^monthly:(0?[1-9]|[12][0-9]|3[01])$' THEN
  anchor_day:=split_part(p_rule,':',2)::int;
  target_month:=date_trunc('month',local_due)::date+interval '1 month';
  last_day:=extract(day from (target_month+interval '1 month'-interval '1 day'))::int;
  next_local:=target_month+make_interval(days=>least(anchor_day,last_day)-1)
   +(local_due-date_trunc('day',local_due));
 ELSE RAISE EXCEPTION 'Invalid recurrence rule'; END IF;
 RETURN next_local AT TIME ZONE 'America/New_York';
END $$;
CREATE OR REPLACE FUNCTION bee.set_task_status(p_owner uuid,p_task_id uuid,p_status text)
RETURNS public.tasks LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE t public.tasks%ROWTYPE; next_due timestamptz;
BEGIN
 PERFORM bee.check_owner(p_owner);
 IF p_status IS NULL OR p_status NOT IN ('open','completed','cancelled','deferred') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 SELECT * INTO t FROM public.tasks WHERE id=p_task_id AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
 IF p_status='deferred' AND t.recurrence_rule IS NULL THEN RAISE EXCEPTION 'Only recurring tasks can be deferred'; END IF;
 IF t.status IS DISTINCT FROM p_status THEN
  UPDATE public.tasks SET status=p_status,completed_at=CASE WHEN p_status='completed' THEN now() ELSE NULL END,updated_at=clock_timestamp() WHERE id=p_task_id RETURNING * INTO t;
  IF p_status='completed' AND t.reward_coins>0 THEN
   INSERT INTO public.reward_ledger(task_id,owner_id,coins_delta,reason) VALUES(p_task_id,p_owner,t.reward_coins,'task_completed')
   ON CONFLICT(task_id) WHERE reason='task_completed' DO NOTHING;
  ELSE
   DELETE FROM public.reward_ledger WHERE task_id=p_task_id AND reason='task_completed' AND owner_id=p_owner;
  END IF;
  IF p_status IN ('completed','deferred') AND t.recurrence_rule IS NOT NULL THEN
   next_due:=public.next_recurrence_due(t.due_at,t.recurrence_rule);
   WHILE next_due<=now() LOOP next_due:=public.next_recurrence_due(next_due,t.recurrence_rule); END LOOP;
   INSERT INTO public.tasks(title,status,due_at,recurrence_rule,recurrence_series_id,reward_coins,owner_id,instructions,task_origin,difficulty,activity_id)
   VALUES(t.title,'open',next_due,t.recurrence_rule,t.recurrence_series_id,t.reward_coins,p_owner,t.instructions,t.task_origin,t.difficulty,t.activity_id)
   ON CONFLICT(recurrence_series_id,due_at) WHERE recurrence_series_id IS NOT NULL DO NOTHING;
  END IF;
 END IF;
 RETURN t;
END $$;
CREATE OR REPLACE FUNCTION public.roll_forward_daily_tasks()
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
DECLARE t public.tasks%ROWTYPE; next_due timestamptz; advanced integer:=0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 FOR t IN SELECT * FROM public.tasks WHERE owner_id=auth.uid() AND status='open' AND recurrence_rule IS NOT NULL AND due_at<now() FOR UPDATE LOOP
  next_due:=t.due_at;
  WHILE public.next_recurrence_due(next_due,t.recurrence_rule)<=now() LOOP
   next_due:=public.next_recurrence_due(next_due,t.recurrence_rule);
  END LOOP;
  IF next_due IS DISTINCT FROM t.due_at THEN
   UPDATE public.tasks SET due_at=next_due,updated_at=now() WHERE id=t.id;
   advanced:=advanced+1;
  END IF;
 END LOOP;
 RETURN advanced;
END $$;
CREATE OR REPLACE FUNCTION public.restart_recurring_series(p_task_id uuid)
RETURNS public.tasks LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
DECLARE t public.tasks%ROWTYPE; result public.tasks%ROWTYPE; next_due timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT * INTO t FROM public.tasks WHERE id=p_task_id AND owner_id=auth.uid() AND recurrence_rule IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurring task not found'; END IF;
 IF t.status<>'cancelled' THEN RAISE EXCEPTION 'Only stopped recurring series can be restarted'; END IF;
 IF t.restarted_at IS NOT NULL THEN RAISE EXCEPTION 'This occurrence has already restarted a series'; END IF;
 IF EXISTS(SELECT 1 FROM public.tasks WHERE owner_id=auth.uid() AND recurrence_series_id=t.recurrence_series_id AND status='open') THEN RAISE EXCEPTION 'Series already has an open occurrence'; END IF;
 next_due:=t.due_at;
 WHILE next_due<=now() LOOP next_due:=public.next_recurrence_due(next_due,t.recurrence_rule); END LOOP;
 INSERT INTO public.tasks(title,status,due_at,recurrence_rule,recurrence_series_id,reward_coins,owner_id,instructions,task_origin,difficulty,activity_id)
 VALUES(t.title,'open',next_due,t.recurrence_rule,gen_random_uuid(),t.reward_coins,auth.uid(),t.instructions,t.task_origin,t.difficulty,t.activity_id)
 RETURNING * INTO result;
 UPDATE public.tasks SET restarted_at=now() WHERE id=t.id;
 RETURN result;
END $$;