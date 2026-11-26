-- BEE milestone 3: one bounded, private task-context read for scheduled workers.
-- Deployed independently of the existing bee.read contract. No write paths.
create or replace function bee.read_task_context_20261126(
  p_owner uuid,
  p_open_limit integer default 80,
  p_recent_limit integer default 40,
  p_recent_days integer default 7
) returns jsonb
language plpgsql security invoker set search_path = '' as $bee$
declare
  open_lim integer := least(greatest(coalesce(p_open_limit,80),1),150);
  recent_lim integer := least(greatest(coalesce(p_recent_limit,40),1),100);
  days_back integer := least(greatest(coalesce(p_recent_days,7),1),30);
  since_at timestamptz;
  open_total integer;
  recent_total integer;
  open_rows jsonb;
  recent_rows jsonb;
begin
  perform bee.check_owner(p_owner);
  since_at := now() - make_interval(days => days_back);

  select count(*) into open_total
  from public.tasks where owner_id=p_owner and status='open';
  select coalesce(jsonb_agg(to_jsonb(t) order by t.due_at nulls last,
                           t.planned_on nulls last,t.updated_at desc,t.id),'[]'::jsonb)
    into open_rows
  from (
    select id,title,status,due_at,planned_on,recurrence_rule,task_origin,
           activity_id,task_location,task_category,difficulty,reward_coins,
           updated_at,created_at,
           left(nullif(btrim(instructions),''),200) as instructions_preview
    from public.tasks
    where owner_id=p_owner and status='open'
    order by due_at nulls last,planned_on nulls last,updated_at desc,id
    limit open_lim
  ) t;

  select count(*) into recent_total
  from public.tasks where owner_id=p_owner and updated_at>=since_at;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at desc,t.id),'[]'::jsonb)
    into recent_rows
  from (
    select id,title,status,due_at,planned_on,recurrence_rule,task_origin,
           activity_id,task_location,task_category,difficulty,reward_coins,
           updated_at,created_at,completed_at,
           left(nullif(btrim(instructions),''),200) as instructions_preview,
           left(nullif(btrim(completion_notes),''),200) as completion_preview
    from public.tasks
    where owner_id=p_owner and updated_at>=since_at
    order by updated_at desc,id
    limit recent_lim
  ) t;

  return jsonb_build_object(
    'api_version',1,'generated_at',now(),
    'open',jsonb_build_object('items',open_rows,'total',open_total,
                               'limit',open_lim,'truncated',open_total>open_lim),
    'recent',jsonb_build_object('items',recent_rows,'total',recent_total,
                                 'limit',recent_lim,'since',since_at,
                                 'truncated',recent_total>recent_lim)
  );
end;
$bee$;

-- Deliberately private: no anon/authenticated/public Data API exposure.
revoke all on function bee.read_task_context_20261126(uuid,integer,integer,integer)
  from public,anon,authenticated;
grant execute on function bee.read_task_context_20261126(uuid,integer,integer,integer)
  to service_role;
