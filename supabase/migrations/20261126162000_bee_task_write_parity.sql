-- New versioned copy of current deployed core, preserving existing operations.
-- Old core retained as rollback. Dispatcher keeps existing memory.replace path.
CREATE OR REPLACE FUNCTION bee.command_core_20261126(p_owner uuid, p_request uuid, p_operation text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  perform bee.keys(p_payload,array['title','due_at','recurrence_rule','instructions','difficulty','reward_coins','activity_id','task_location','task_category','planned_on']);
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
  if (p_payload ? 'planned_on') and jsonb_typeof(p_payload->'planned_on') <> 'null' and (jsonb_typeof(p_payload->'planned_on')<>'string' or p_payload->>'planned_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    raise exception 'planned_on must be YYYY-MM-DD or JSON null';
  end if;
  insert into public.tasks(owner_id,title,instructions,due_at,recurrence_rule,recurrence_series_id,difficulty,reward_coins,task_origin,activity_id,task_location,task_category,planned_on)
  values(p_owner,coalesce(p_payload->>'title',a.title),coalesce(p_payload->>'instructions',a.notes),
   (p_payload->>'due_at')::timestamptz,p_payload->>'recurrence_rule',
   case when p_payload->>'recurrence_rule' is not null then gen_random_uuid() end,
   difficulty,coalesce((p_payload->>'reward_coins')::integer,bee.reward(difficulty)),'bee',a.id,
   case when p_payload ? 'task_location' then p_payload->>'task_location'
        else nullif(array_to_string(a.locations,', '),'') end,
   case when p_payload ? 'task_category' then p_payload->>'task_category' else a.category end,
   (p_payload->>'planned_on')::date)
  returning to_jsonb(tasks.*) into result;
 when 'task.edit','task.plan','task.status','task.complete','task.delete' then
  if p_operation='task.plan' then
   perform bee.keys(p_payload,array['id','expected_updated_at','planned_on']);
  else
   perform bee.keys(p_payload,array['id','expected_updated_at','patch','status','notes','confirm_delete']);
  end if;
  select * into t from public.tasks where id=rid and owner_id=p_owner for update;
  if not found then raise exception 'Task not found'; end if;
  if expected is null or expected<>t.updated_at then raise exception 'Task changed; read it again'; end if;
  if p_operation='task.edit' then
   if t.status<>'open' then raise exception 'Only open tasks can be edited'; end if;
   patch:=p_payload->'patch';
   perform bee.keys(patch,array['title','due_at','instructions','difficulty','reward_coins','task_location','task_category']);
   if patch?'difficulty' and not patch?'reward_coins' then patch:=patch||jsonb_build_object('reward_coins',bee.reward(patch->>'difficulty')); end if;
   t:=jsonb_populate_record(t,patch);
   update public.tasks set title=t.title,due_at=t.due_at,instructions=t.instructions,
    difficulty=t.difficulty,reward_coins=t.reward_coins,task_location=t.task_location,task_category=t.task_category,updated_at=clock_timestamp()
    where id=rid and owner_id=p_owner returning to_jsonb(tasks.*) into result;
  elsif p_operation='task.plan' then
   if t.status<>'open' then raise exception 'Only open tasks can be planned'; end if;
   if not (p_payload ? 'planned_on') then raise exception 'planned_on must be supplied as YYYY-MM-DD or JSON null'; end if;
   if jsonb_typeof(p_payload->'planned_on') <> 'null' and (jsonb_typeof(p_payload->'planned_on')<>'string' or p_payload->>'planned_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
     raise exception 'planned_on must be YYYY-MM-DD or JSON null';
   end if;
   update public.tasks
      set planned_on=(p_payload->>'planned_on')::date,updated_at=clock_timestamp()
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
end $function$
;

revoke all on function bee.command_core_20261126(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function bee.command_core_20261126(uuid,uuid,text,jsonb) to service_role;

CREATE OR REPLACE FUNCTION bee.command(p_owner uuid, p_request uuid, p_operation text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if p_operation='memory.replace' then return bee.memory_replace(p_owner,p_request,p_payload); end if;
 return bee.command_core_20261126(p_owner,p_request,p_operation,p_payload);
end $function$
;
