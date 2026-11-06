-- Additive private command interface; reviewed deployment required.
-- The Supabase management connector calls bee.command/read as postgres.
-- No fabricated JWT context, new service, or reduced connector permissions.
create schema if not exists bee;
revoke all on schema bee from public, anon, authenticated;
grant usage on schema bee to authenticated, service_role;

create function bee.check_owner(p_owner uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
 if p_owner is null then raise exception 'Owner required'; end if;
 if current_user not in ('postgres','service_role') and
    (auth.uid() is null or auth.uid() <> p_owner) then
   raise exception 'Owner access denied' using errcode='42501';
 end if;
end $$;
revoke all on function bee.check_owner(uuid) from public, anon;
grant execute on function bee.check_owner(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION bee.set_task_status(p_owner uuid, p_task_id uuid, p_status text)
 RETURNS public.tasks
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE t public.tasks%ROWTYPE; next_due timestamptz; step interval;
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
  IF p_status IN ('completed','deferred') AND t.recurrence_rule IN ('daily','weekly') THEN
   step:=CASE t.recurrence_rule WHEN 'weekly' THEN interval '7 days' ELSE interval '1 day' END;
   next_due:=((t.due_at AT TIME ZONE 'America/New_York')+step) AT TIME ZONE 'America/New_York';
   WHILE next_due<=now() LOOP
    next_due:=((next_due AT TIME ZONE 'America/New_York')+step) AT TIME ZONE 'America/New_York';
   END LOOP;
   INSERT INTO public.tasks(title,status,due_at,recurrence_rule,recurrence_series_id,reward_coins,owner_id,instructions,task_origin,difficulty,activity_id)
   VALUES(t.title,'open',next_due,t.recurrence_rule,t.recurrence_series_id,t.reward_coins,p_owner,t.instructions,t.task_origin,t.difficulty,t.activity_id)
   ON CONFLICT(recurrence_series_id,due_at) WHERE recurrence_series_id IS NOT NULL DO NOTHING;
  END IF;
 END IF;
 RETURN t;
END;$function$;

revoke all on function bee.set_task_status(uuid,uuid,text) from public, anon;
grant execute on function bee.set_task_status(uuid,uuid,text) to authenticated, service_role;
create or replace function public.set_task_status(p_task_id uuid, p_status text) returns public.tasks
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 return bee.set_task_status(auth.uid(),p_task_id,p_status);
end $$;

CREATE OR REPLACE FUNCTION bee.complete_task_with_notes(p_owner uuid, p_task_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS public.tasks
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE t public.tasks%ROWTYPE;
BEGIN
 PERFORM bee.check_owner(p_owner);
 SELECT * INTO t FROM public.tasks WHERE id=p_task_id AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
 IF t.status='completed' THEN
  UPDATE public.tasks SET completion_notes=NULLIF(BTRIM(p_notes),''),updated_at=clock_timestamp() WHERE id=p_task_id RETURNING * INTO t;
  RETURN t;
 END IF;
 IF t.status<>'open' THEN RAISE EXCEPTION 'Only open tasks can be completed'; END IF;
 UPDATE public.tasks SET completion_notes=NULLIF(BTRIM(p_notes),''),updated_at=clock_timestamp() WHERE id=p_task_id;
 RETURN bee.set_task_status(p_owner,p_task_id,'completed');
END;$function$;

revoke all on function bee.complete_task_with_notes(uuid,uuid,text) from public, anon;
grant execute on function bee.complete_task_with_notes(uuid,uuid,text) to authenticated, service_role;
create or replace function public.complete_task_with_notes(p_task_id uuid, p_notes text default null) returns public.tasks
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 return bee.complete_task_with_notes(auth.uid(),p_task_id,p_notes);
end $$;

create table bee.requests (
 owner_id uuid not null references auth.users(id),
 request_id uuid not null,
 operation text not null,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,request_id)
);
alter table bee.requests enable row level security;
revoke all on bee.requests from public,anon,authenticated;
grant all on bee.requests to service_role;

create table public.beehive_games (
 owner_id uuid not null references auth.users(id) on delete cascade,
 game_key text not null check(game_key in ('three','wordle','sudoku','wumpus','2048')),
 enabled boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key(owner_id,game_key)
);
alter table public.beehive_games enable row level security;
revoke all on public.beehive_games from public,anon,authenticated;
grant select on public.beehive_games to authenticated;
grant all on public.beehive_games to service_role;
create policy games_read_own on public.beehive_games for select to authenticated
 using(owner_id=(select auth.uid()));
-- Missing registry entries preserve existing enabled behavior.

create function bee.reward(p_difficulty text) returns integer
language sql immutable set search_path='' as $$
 select case p_difficulty when 'tiny' then 2 when 'medium' then 5 when 'large' then 9 when 'ugh' then 12 else 5 end
$$;
revoke all on function bee.reward(text) from public,anon,authenticated;
grant execute on function bee.reward(text) to service_role;

create function bee.keys(p jsonb, allowed text[]) returns void
language plpgsql set search_path='' as $$
begin
 if p is null or jsonb_typeof(p)<>'object' then raise exception 'Payload must be an object'; end if;
 if exists(select 1 from jsonb_object_keys(p) k where not k=any(allowed)) then
  raise exception 'Unknown payload field';
 end if;
end $$;
revoke all on function bee.keys(jsonb,text[]) from public,anon,authenticated;
grant execute on function bee.keys(jsonb,text[]) to service_role;

create function bee.command(p_owner uuid,p_request uuid,p_operation text,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 previous bee.requests; result jsonb; rid uuid; expected timestamptz;
 t public.tasks; a public.activity_catalog; timer public.beehive_timers;
 bell public.beehive_bell_outbox; patch jsonb; difficulty text; seconds integer;
begin
 perform bee.check_owner(p_owner);
 if p_request is null or p_operation is null then raise exception 'Request ID and operation required'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Payload must be an object'; end if;
 -- Serialize commands for this owner, including concurrent retries of a new request.
 perform pg_advisory_xact_lock(hashtextextended('bee:'||p_owner::text,0));
 select * into previous from bee.requests where owner_id=p_owner and request_id=p_request;
 if found then
  if previous.operation<>p_operation or previous.payload<>p_payload then
   raise exception 'Request ID reused with different input';
  end if;
  return jsonb_build_object('replayed',true,'result',previous.result);
 end if;
 rid:=(p_payload->>'id')::uuid;
 expected:=(p_payload->>'expected_updated_at')::timestamptz;
 case p_operation
 when 'task.create','possibility.activate' then
  perform bee.keys(p_payload,array['title','due_at','recurrence_rule','instructions','difficulty','reward_coins','activity_id']);
  if p_operation='possibility.activate' then
   select * into a from public.activity_catalog where id=(p_payload->>'activity_id')::uuid and owner_id=p_owner and active for share;
   if not found then raise exception 'Active possibility not found'; end if;
  elsif p_payload->>'activity_id' is not null then
   select * into a from public.activity_catalog where id=(p_payload->>'activity_id')::uuid and owner_id=p_owner for share;
   if not found then raise exception 'Possibility not found'; end if;
  end if;
  difficulty:=case when p_payload?'difficulty' then p_payload->>'difficulty' else coalesce(a.suggested_difficulty,
   (select size from (values ('tiny',a.rating_tiny,1),('medium',a.rating_medium,2),('large',a.rating_large,3),('ugh',a.rating_ugh,4)) r(size,rating,priority)
    where rating>0 order by rating desc,priority limit 1)) end;
  insert into public.tasks(owner_id,title,instructions,due_at,recurrence_rule,recurrence_series_id,difficulty,reward_coins,task_origin,activity_id)
  values(p_owner,coalesce(p_payload->>'title',a.title),coalesce(p_payload->>'instructions',a.notes),
   (p_payload->>'due_at')::timestamptz,p_payload->>'recurrence_rule',
   case when p_payload->>'recurrence_rule' is not null then gen_random_uuid() end,
   difficulty,coalesce((p_payload->>'reward_coins')::integer,bee.reward(difficulty)),'bee',a.id)
  returning to_jsonb(tasks.*) into result;
 when 'task.edit','task.status','task.complete','task.delete' then
  perform bee.keys(p_payload,array['id','expected_updated_at','patch','status','notes','confirm_delete']);
  select * into t from public.tasks where id=rid and owner_id=p_owner for update;
  if not found then raise exception 'Task not found'; end if;
  if expected is null or expected<>t.updated_at then raise exception 'Task changed; read it again'; end if;
  if p_operation='task.edit' then
   if t.status<>'open' then raise exception 'Only open tasks can be edited'; end if;
   patch:=p_payload->'patch';
   perform bee.keys(patch,array['title','due_at','instructions','difficulty','reward_coins']);
   if patch?'difficulty' and not patch?'reward_coins' then patch:=patch||jsonb_build_object('reward_coins',bee.reward(patch->>'difficulty')); end if;
   t:=jsonb_populate_record(t,patch);
   update public.tasks set title=t.title,due_at=t.due_at,instructions=t.instructions,
    difficulty=t.difficulty,reward_coins=t.reward_coins,updated_at=clock_timestamp()
    where id=rid and owner_id=p_owner returning to_jsonb(tasks.*) into result;
  elsif p_operation='task.complete' then
   t:=bee.complete_task_with_notes(p_owner,rid,p_payload->>'notes'); result:=to_jsonb(t);
  elsif p_operation='task.status' then
   if p_payload->>'status'='completed' then raise exception 'Use task.complete'; end if;
   t:=bee.set_task_status(p_owner,rid,p_payload->>'status'); result:=to_jsonb(t);
  else
   if coalesce((p_payload->>'confirm_delete')::boolean,false) is not true then raise exception 'Explicit deletion confirmation required'; end if;
   if t.status<>'cancelled' or t.recurrence_rule is not null or
    exists(select 1 from public.reward_ledger where task_id=rid) or
    exists(select 1 from public.activity_log where task_id=rid) then
    raise exception 'Deletion would affect history or recurrence; cancel instead'; end if;
   delete from public.tasks where id=rid and owner_id=p_owner;
   result:=jsonb_build_object('id',rid,'deleted',true);
  end if;
 when 'possibility.create' then
  perform bee.keys(p_payload,array['title','category','notes','locations','work_compatible','property','suggested_difficulty']);
  a:=jsonb_populate_record(null::public.activity_catalog,p_payload);
  insert into public.activity_catalog(owner_id,title,category,notes,locations,work_compatible,property,suggested_difficulty)
   values(p_owner,a.title,coalesce(a.category,'cleaning'),a.notes,coalesce(a.locations,'{}'),a.work_compatible,a.property,a.suggested_difficulty)
   returning to_jsonb(activity_catalog.*) into result;
 when 'possibility.edit','possibility.delete' then
  perform bee.keys(p_payload,array['id','expected_updated_at','patch','confirm_delete']);
  select * into a from public.activity_catalog where id=rid and owner_id=p_owner for update;
  if not found then raise exception 'Possibility not found'; end if;
  if expected is null or expected<>a.updated_at then raise exception 'Possibility changed; read it again'; end if;
  if p_operation='possibility.edit' then
   patch:=p_payload->'patch';
   perform bee.keys(patch,array['title','category','notes','locations','work_compatible','property','suggested_difficulty','active']);
   a:=jsonb_populate_record(a,patch);
   update public.activity_catalog set title=a.title,category=a.category,notes=a.notes,locations=a.locations,
    work_compatible=a.work_compatible,property=a.property,suggested_difficulty=a.suggested_difficulty,active=a.active,updated_at=clock_timestamp()
    where id=rid and owner_id=p_owner returning to_jsonb(activity_catalog.*) into result;
  else
   if coalesce((p_payload->>'confirm_delete')::boolean,false) is not true then raise exception 'Explicit deletion confirmation required'; end if;
   if a.active or exists(select 1 from public.tasks where activity_id=rid) or exists(select 1 from public.activity_log where activity_id=rid) then
    raise exception 'Archive instead; possibility is active or has history'; end if;
   delete from public.activity_catalog where id=rid and owner_id=p_owner;
   result:=jsonb_build_object('id',rid,'deleted',true);
  end if;
 when 'timer.create' then
  perform bee.keys(p_payload,array['seconds','label']);
  seconds:=(p_payload->>'seconds')::integer;
  insert into public.beehive_timers(owner_id,label,duration_seconds,due_at)
   values(p_owner,coalesce(p_payload->>'label','Timer'),seconds,now()+make_interval(secs=>seconds))
   returning to_jsonb(beehive_timers.*) into result;
 when 'timer.adjust','timer.cancel' then
  perform bee.keys(p_payload,array['id','expected_updated_at','delta_seconds','label']);
  select * into timer from public.beehive_timers where id=rid and owner_id=p_owner for update;
  if not found then raise exception 'Timer not found'; end if;
  if expected is null or expected<>timer.updated_at then raise exception 'Timer changed; read it again'; end if;
  if timer.status<>'pending' or timer.attempts<>0 then raise exception 'Delivery already attempted; cannot safely modify or cancel'; end if;
  if p_operation='timer.adjust' then
   seconds:=coalesce((p_payload->>'delta_seconds')::integer,0);
   if timer.due_at+make_interval(secs=>seconds)<=now() then raise exception 'Adjusted timer must remain in the future'; end if;
   update public.beehive_timers set due_at=due_at+make_interval(secs=>seconds),duration_seconds=duration_seconds+seconds,
    label=coalesce(p_payload->>'label',label),updated_at=clock_timestamp()
    where id=rid and owner_id=p_owner returning to_jsonb(beehive_timers.*) into result;
  else
   update public.beehive_timers set status='cancelled',updated_at=clock_timestamp()
    where id=rid and owner_id=p_owner returning to_jsonb(beehive_timers.*) into result;
  end if;
 when 'reminder.create','notification.send' then
  perform bee.keys(p_payload,array['title','body','due_at']);
  if p_operation='reminder.create' and ((p_payload->>'due_at')::timestamptz is null or (p_payload->>'due_at')::timestamptz<=now()) then
   raise exception 'Reminder due_at must be in the future'; end if;
  insert into public.beehive_bell_outbox(owner_id,source,title,body,due_at)
   values(p_owner,'bee',p_payload->>'title',p_payload->>'body',case when p_operation='notification.send' then now() else (p_payload->>'due_at')::timestamptz end)
   returning to_jsonb(beehive_bell_outbox.*) into result;
 when 'reminder.edit','reminder.cancel' then
  perform bee.keys(p_payload,array['id','expected_updated_at','due_at','title','body']);
  select * into bell from public.beehive_bell_outbox where id=rid and owner_id=p_owner for update;
  if not found then raise exception 'Reminder not found'; end if;
  if expected is null or expected<>bell.updated_at then raise exception 'Reminder changed; read it again'; end if;
  if bell.status<>'pending' or bell.attempts<>0 then raise exception 'Delivery already attempted; cannot safely modify or cancel'; end if;
  if p_operation='reminder.edit' then
   if coalesce((p_payload->>'due_at')::timestamptz,bell.due_at)<=now() then raise exception 'Reminder must remain in the future'; end if;
   update public.beehive_bell_outbox set due_at=coalesce((p_payload->>'due_at')::timestamptz,due_at),
    title=coalesce(p_payload->>'title',title),body=coalesce(p_payload->>'body',body),updated_at=clock_timestamp()
    where id=rid and owner_id=p_owner returning to_jsonb(beehive_bell_outbox.*) into result;
  else
   update public.beehive_bell_outbox set status='cancelled',updated_at=clock_timestamp()
    where id=rid and owner_id=p_owner returning to_jsonb(beehive_bell_outbox.*) into result;
  end if;
 when 'game.set' then
  perform bee.keys(p_payload,array['game_key','enabled']);
  if not p_payload?'enabled' then raise exception 'Enabled required'; end if;
  insert into public.beehive_games(owner_id,game_key,enabled)
   values(p_owner,p_payload->>'game_key',(p_payload->>'enabled')::boolean)
   on conflict(owner_id,game_key) do update set enabled=excluded.enabled,updated_at=clock_timestamp()
   returning to_jsonb(beehive_games.*) into result;
 else raise exception 'Unknown operation: %',p_operation;
 end case;
 if result is null then raise exception 'Operation changed no record'; end if;
 insert into bee.requests(owner_id,request_id,operation,payload,result) values(p_owner,p_request,p_operation,p_payload,result);
 return jsonb_build_object('replayed',false,'result',result);
end $$;
revoke all on function bee.command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function bee.command(uuid,uuid,text,jsonb) to service_role;

-- Finite read targets; never accepts SQL or arbitrary table names.
create function bee.read(p_owner uuid,p_kind text,p_query text default '',p_id uuid default null,p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; lim integer:=least(greatest(coalesce(p_limit,25),1),100); off integer:=greatest(coalesce(p_offset,0),0);
begin
 perform bee.check_owner(p_owner);
 case p_kind
 when 'tasks' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from
   (select * from public.tasks where owner_id=p_owner and (p_id is null or id=p_id) and strpos(lower(title||' '||coalesce(instructions,'')),lower(coalesce(p_query,'')))>0 order by created_at desc,id limit lim offset off) r;
 when 'possibilities' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from
   (select * from public.activity_catalog where owner_id=p_owner and (p_id is null or id=p_id) and strpos(lower(title||' '||coalesce(notes,'')),lower(coalesce(p_query,'')))>0 order by title,id limit lim offset off) r;
 when 'timers' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from
   (select * from public.beehive_timers where owner_id=p_owner and (p_id is null or id=p_id) order by created_at desc,id limit lim offset off) r;
 when 'reminders' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from
   (select * from public.beehive_bell_outbox where owner_id=p_owner and (p_id is null or id=p_id) order by created_at desc,id limit lim offset off) r;
 when 'games' then
  select jsonb_agg(jsonb_build_object('game_key',k,'enabled',coalesce(g.enabled,true))) into result
   from unnest(array['three','wordle','sudoku','wumpus','2048']) k left join public.beehive_games g on g.owner_id=p_owner and g.game_key=k;
 when 'ledger' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from
   (select * from public.reward_ledger where owner_id=p_owner order by created_at desc,id limit lim offset off) r;
 when 'activity' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from
   (select * from public.activity_log where owner_id=p_owner order by happened_at desc,id limit lim offset off) r;
 when 'pet' then
  select to_jsonb(r) into result from public.pet_state r where owner_id=p_owner;
 when 'health' then
  select jsonb_build_object('api_version',1,'database',true,
   'open_tasks',(select count(*) from public.tasks where owner_id=p_owner and status='open'),
   'notification_devices',(select count(*) from public.beehive_push_subscriptions where owner_id=p_owner),
   'overdue_timers',(select count(*) from public.beehive_timers where owner_id=p_owner and status in ('pending','sending') and due_at<now()-interval '2 minutes'),
   'overdue_reminders',(select count(*) from public.beehive_bell_outbox where owner_id=p_owner and status in ('pending','sending') and due_at<now()-interval '2 minutes'),
   'worker_status','not_probed','handset_receipt','not_observable') into result;
 else raise exception 'Unknown read target';
 end case;
 return result;
end $$;
revoke all on function bee.read(uuid,text,text,uuid,integer,integer) from public,anon,authenticated;
grant execute on function bee.read(uuid,text,text,uuid,integer,integer) to service_role;

-- Recover a worker that crashed during its final delivery attempt.
CREATE OR REPLACE FUNCTION public.beehive_claim_due_timers(p_limit integer DEFAULT 20)
 RETURNS SETOF public.beehive_timers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update public.beehive_timers set status='failed',lease_until=null,updated_at=now(),
  last_error='Delivery status unknown after final worker lease expired'
 where status='sending' and attempts>=5 and lease_until<now();
 return query
 with picked as (
  select id from public.beehive_timers
  where attempts < 5 and (
    (status='pending' and due_at<=now() and coalesce(retry_after,now())<=now())
    or (status='sending' and lease_until<now())
  )
  order by due_at asc
  limit least(greatest(coalesce(p_limit,20),1),40)
  for update skip locked
 )
 update public.beehive_timers t
 set status='sending',attempts=t.attempts+1,lease_until=now()+interval '2 minutes',retry_after=null,updated_at=now()
 from picked
 where t.id=picked.id
 returning t.*;
end;
$function$;

-- Recover a worker that crashed during its final delivery attempt.
CREATE OR REPLACE FUNCTION public.beehive_claim_due_bells(p_limit integer DEFAULT 20)
 RETURNS SETOF public.beehive_bell_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update public.beehive_bell_outbox set status='failed',lease_until=null,updated_at=now(),
  last_error='Delivery status unknown after final worker lease expired'
 where status='sending' and attempts>=5 and lease_until<now();
 return query
 with picked as (
  select id from public.beehive_bell_outbox
  where attempts < 5 and (
    (status='pending' and due_at<=now() and coalesce(retry_after,now())<=now())
    or (status='sending' and lease_until<now())
  )
  order by due_at asc
  limit least(greatest(coalesce(p_limit,20),1),40)
  for update skip locked
 )
 update public.beehive_bell_outbox b
 set status='sending',attempts=b.attempts+1,
     lease_until=now()+interval '2 minutes',
     retry_after=null,updated_at=now()
 from picked where b.id=picked.id
 returning b.*;
end;
$function$;

revoke all on function public.beehive_claim_due_timers(integer) from public,anon,authenticated;
grant execute on function public.beehive_claim_due_timers(integer) to service_role;

revoke all on function public.beehive_claim_due_bells(integer) from public,anon,authenticated;
grant execute on function public.beehive_claim_due_bells(integer) to service_role;

revoke all on function public.set_task_status(uuid,text) from public,anon;
grant execute on function public.set_task_status(uuid,text) to authenticated,service_role;

revoke all on function public.complete_task_with_notes(uuid,text) from public,anon;
grant execute on function public.complete_task_with_notes(uuid,text) to authenticated,service_role;
