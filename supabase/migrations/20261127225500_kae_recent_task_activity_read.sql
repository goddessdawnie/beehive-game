-- Kae's last-48-hour task context, owner authenticated. Replaces two
-- overlapping PostgREST task reads and the Edge-side merge/dedupe function.
-- No task/reward writes and no access to other owners' task activity.
--
-- The legacy private bee.read_task_context_20261126 pilot is NOT removed:
-- installed Bee v0.2.5 still documents it. Retire only after plugin parity.
CREATE INDEX IF NOT EXISTS tasks_owner_updated_at_id_idx
 ON public.tasks(owner_id,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS tasks_owner_completed_at_id_idx
 ON public.tasks(owner_id,completed_at DESC,id)
 WHERE status='completed';

CREATE OR REPLACE FUNCTION public.kae_recent_task_activity()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $kae$
declare
 v_owner uuid:=auth.uid();
 v_since timestamptz:=now()-interval '48 hours';
 v_packet jsonb;
begin
 if v_owner is null then
   raise exception 'Authentication required' using errcode='28000';
 end if;
 -- Most recent event wins, even if a task was created weeks ago or
 -- completed_at was updated without changing the older updated_at.
 -- Reopened tasks ignore their stale completed_at and old notes.
 with latest as (
   select t.id,t.title,t.status,t.updated_at,t.completed_at,
          t.completion_notes,t.task_origin,
          greatest(t.updated_at,
            case when t.status='completed' then coalesce(t.completed_at,t.updated_at)
                 else t.updated_at end) as event_at
   from public.tasks t
   where t.owner_id=v_owner
     and (t.updated_at>=v_since
       or (t.status='completed' and t.completed_at>=v_since))
   order by event_at desc,t.id
   limit 25
 ), ranked as (
   select latest.*,row_number() over(order by event_at desc,id) as rn
   from latest
 )
 select jsonb_build_object(
   'tasks',coalesce(jsonb_agg(
     jsonb_build_object(
       'title',left(coalesce(title,''),140),
       'status',status,
       'updated_at',updated_at,
       'completed_at',case when status='completed' then completed_at else null end,
       'completion_notes',case when status='completed'
          then left(coalesce(completion_notes,''),350) else null end,
       'task_origin',task_origin,
       'last_activity_at',to_char(event_at at time zone 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     ) order by event_at desc,id) filter(where rn<=24),'[]'::jsonb),
   'partial',count(*)>24,
   'window_hours',48
 ) into v_packet from ranked;
 return v_packet;
end;
$kae$;

REVOKE ALL ON FUNCTION public.kae_recent_task_activity() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kae_recent_task_activity() TO authenticated;
