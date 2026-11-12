-- BEE-TIMER-01: expose the existing Timer-tab bell schedules through the private Bee API.
-- Keep the original idempotent request ledger, owner lock and all existing dispatch paths.
-- Existing beehive_bell_schedules triggers calculate next_due_at; no parallel scheduler.
create or replace function bee.command(p_owner uuid,p_request uuid,p_operation text,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 previous bee.requests; result jsonb; rid uuid; expected timestamptz;
 t public.tasks; a public.activity_catalog; timer public.beehive_timers;
 bell public.beehive_bell_outbox; sched public.beehive_bell_schedules; patch jsonb; difficulty text; seconds integer;
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
 when 'schedule.create' then
  perform bee.keys(p_payload,array['title','body','kind','one_time_at','local_time','weekdays','month_day','timezone']);
  if nullif(btrim(p_payload->>'title'),'') is null or p_payload->>'kind' not in ('once','weekly','monthly') then
   raise exception 'Schedule title and valid kind required';
  end if;
  insert into public.beehive_bell_schedules(owner_id,title,body,kind,one_time_at,local_time,weekdays,month_day,timezone)
  values(p_owner,p_payload->>'title',coalesce(p_payload->>'body','Scheduled reminder'),p_payload->>'kind',
   (p_payload->>'one_time_at')::timestamptz,(p_payload->>'local_time')::time,
   coalesce(array(select jsonb_array_elements_text(p_payload->'weekdays')::integer),array[]::integer[]),
   (p_payload->>'month_day')::integer,coalesce(p_payload->>'timezone','America/New_York'))
  returning to_jsonb(beehive_bell_schedules.*) into result;
 when 'schedule.edit','schedule.cancel' then
  perform bee.keys(p_payload,array['id','expected_updated_at','title','body','kind','one_time_at','local_time','weekdays','month_day','timezone','active']);
  if rid is null then raise exception 'Schedule ID required'; end if;
  select * into sched from public.beehive_bell_schedules where id=rid and owner_id=p_owner for update;
  if not found then raise exception 'Schedule not found'; end if;
  if expected is null or expected<>sched.updated_at then raise exception 'Schedule changed; read it again'; end if;
  if p_operation='schedule.cancel' then
   if p_payload ?| array['title','body','kind','one_time_at','local_time','weekdays','month_day','timezone','active'] then
    raise exception 'Cancel accepts only ID and expected timestamp'; end if;
   update public.beehive_bell_schedules set active=false where id=rid and owner_id=p_owner
    returning to_jsonb(beehive_bell_schedules.*) into result;
  else
   update public.beehive_bell_schedules set
    title=case when p_payload?'title' then p_payload->>'title' else title end,
    body=case when p_payload?'body' then p_payload->>'body' else body end,
    kind=case when p_payload?'kind' then p_payload->>'kind' else kind end,
    one_time_at=case when p_payload?'one_time_at' then (p_payload->>'one_time_at')::timestamptz else one_time_at end,
    local_time=case when p_payload?'local_time' then (p_payload->>'local_time')::time else local_time end,
    weekdays=case when p_payload?'weekdays' then array(select jsonb_array_elements_text(p_payload->'weekdays')::integer) else weekdays end,
    month_day=case when p_payload?'month_day' then (p_payload->>'month_day')::integer else month_day end,
    timezone=case when p_payload?'timezone' then p_payload->>'timezone' else timezone end,
    active=case when p_payload?'active' then (p_payload->>'active')::boolean else active end
    where id=rid and owner_id=p_owner returning to_jsonb(beehive_bell_schedules.*) into result;
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

create or replace function bee.read(p_owner uuid,p_kind text,p_query text default '',p_id uuid default null,p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; lim integer:=least(greatest(coalesce(p_limit,25),1),100); off integer:=greatest(coalesce(p_offset,0),0);
begin
 perform bee.check_owner(p_owner);
 case p_kind
 when 'request' then
  if p_id is null then raise exception 'Request ID required'; end if;
  select to_jsonb(r) into result from
   (select req.request_id,req.operation,req.result,req.created_at from bee.requests req where req.owner_id=p_owner and req.request_id=p_id) r;
 when 'tasks' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from
   (select * from public.tasks where owner_id=p_owner and (p_id is null or id=p_id) and strpos(lower(title||' '||coalesce(instructions,'')),lower(coalesce(p_query,'')))>0 order by created_at desc,id limit lim offset off) r;
 when 'possibilities' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from
   (select * from public.activity_catalog where owner_id=p_owner and (p_id is null or id=p_id) and strpos(lower(title||' '||coalesce(notes,'')),lower(coalesce(p_query,'')))>0 order by title,id limit lim offset off) r;
 when 'timers' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from
   (select * from public.beehive_timers where owner_id=p_owner and (p_id is null or id=p_id) order by created_at desc,id limit lim offset off) r;
 when 'schedules' then
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from
   (select * from public.beehive_bell_schedules where owner_id=p_owner and (p_id is null or id=p_id)
    and strpos(lower(title||' '||body),lower(coalesce(p_query,'')))>0
    order by created_at desc,id limit lim offset off) r;
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

