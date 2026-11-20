-- BEE-TASK-ORG-01: deploy AFTER 20261116170000_task_context_planned_day.sql.
-- Replaces the existing owner-scoped Three Things action atomically.
-- 'add' chooses today's working list without manufacturing a due date;
-- 'keep' stores an undated Kae quest. Neither grants coins.
create or replace function public.three_things_act(p_id uuid, p_action text, p_notes text default ''::text)
returns public.three_things
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
 v public.three_things%rowtype;
 t public.tasks%rowtype;
 catalog_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_action not in ('complete','add','keep','clear') then raise exception 'Invalid action'; end if;
 select * into v from public.three_things
 where id=p_id and owner_id=auth.uid() for update;
 if not found or v.status<>'suggested' then raise exception 'Suggestion is no longer active'; end if;
 if p_action='clear' then
   update public.three_things set status='cleared' where id=p_id returning * into v;
   return v;
 end if;
 select id into catalog_id from public.activity_catalog
 where owner_id=auth.uid() and active=true
 and lower(btrim(title))=lower(btrim(v.title)) limit 1;
 insert into public.tasks
 (title,status,due_at,planned_on,reward_coins,owner_id,instructions,task_origin,
  task_category,difficulty,completion_notes,completed_at,activity_id)
 values
 (v.title,case when p_action='complete' then 'completed' else 'open' end,
  null,
  case when p_action='add' then (now() at time zone 'America/New_York')::date else null end,
  case v.difficulty when 'medium' then 5 when 'large' then 9 when 'ugh' then 12 else 2 end,
  auth.uid(),left(v.detail,2000),'kae',nullif(btrim(v.category),''),v.difficulty,
  case when p_action='complete' then left(coalesce(p_notes,''),3000) else null end,
  case when p_action='complete' then now() else null end,catalog_id)
 returning * into t;
 if p_action='complete' and t.reward_coins>0 then
  insert into public.reward_ledger(task_id,owner_id,coins_delta,reason)
  values(t.id,auth.uid(),t.reward_coins,'task_completed');
 end if;
 update public.three_things
 set status=case when p_action='complete' then 'completed' else 'added' end,
 completion_notes=case when p_action='complete' then left(coalesce(p_notes,''),3000) else null end,
 completed_at=case when p_action='complete' then now() else null end,
 task_id=t.id where id=p_id returning * into v;
 return v;
end $function$;
