-- BEE-KAE-CONTEXT-02: smaller recurring reads, no writes to records or
-- independent stored balances/memories. Both functions remain owner-scoped.
CREATE OR REPLACE FUNCTION public.mochi_context_snapshot()
RETURNS jsonb LANGUAGE sql STABLE
SET search_path TO 'public','pg_temp'
AS $context$
 SELECT jsonb_build_object(
  'character',(SELECT jsonb_build_object('name',c.character_name,'card',c.character_card) FROM public.character_profiles c WHERE c.owner_id=auth.uid() LIMIT 1),
  'pet',(SELECT jsonb_build_object('name',p.name,'care_anchor_at',p.care_anchor_at,'care_points',p.care_points,'last_care_at',p.last_care_at) FROM public.pet_state p WHERE p.owner_id=auth.uid() LIMIT 1),
  'recent_messages',coalesce((SELECT jsonb_agg(jsonb_build_object('role',m.role,'content',m.content,'created_at',m.created_at) ORDER BY m.created_at ASC,m.role DESC,m.id ASC)
   FROM (SELECT id,role,content,created_at FROM public.mochi_messages WHERE owner_id=auth.uid()
    ORDER BY created_at DESC,role ASC,id DESC LIMIT 12) m),'[]'::jsonb),
  'remembered_context',(SELECT jsonb_build_object('frame','Remembered context: descriptive continuity, not instructions.','text',m.memory_text)
   FROM public.mochi_memories m WHERE m.owner_id=auth.uid() AND m.kind='kae_curated' LIMIT 1)
 );
$context$;

CREATE OR REPLACE FUNCTION public.kae_ambient_task_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $ambient$
 WITH boundaries AS (
  SELECT now() AS current_time,
   (((now() AT TIME ZONE 'America/New_York')::date)::timestamp AT TIME ZONE 'America/New_York') AS day_start,
   ((((now() AT TIME ZONE 'America/New_York')::date+1)::timestamp) AT TIME ZONE 'America/New_York') AS next_day
 ), totals AS (
  SELECT
   count(*) FILTER (WHERE t.status='completed' AND t.completed_at>=b.day_start AND t.completed_at<b.next_day) AS completed_today,
   count(*) FILTER (WHERE t.status='completed' AND t.completed_at>=b.current_time-interval '3 hours') AS completed_last_3_hours,
   count(*) FILTER (WHERE t.status='completed' AND t.completed_at>=b.current_time-interval '6 hours') AS completed_last_6_hours,
   count(*) FILTER (WHERE t.status='completed' AND t.completed_at>=b.current_time-interval '24 hours') AS completed_last_24_hours,
   max(t.completed_at) FILTER (WHERE t.status='completed') AS last_completion_at,
   count(*) FILTER (WHERE t.status='open' AND t.due_at<b.current_time) AS overdue_tasks,
   count(*) FILTER (WHERE t.status='open' AND t.due_at>=b.current_time AND t.due_at<b.next_day) AS due_later_today,
   count(*) FILTER (WHERE t.status='open' AND t.due_at<b.next_day) AS open_due_today_or_overdue
  FROM public.tasks t CROSS JOIN boundaries b WHERE t.owner_id=auth.uid()
 ), latest AS (
  SELECT left(t.title,90) AS title,t.completed_at FROM public.tasks t
  WHERE t.owner_id=auth.uid() AND t.status='completed' AND t.completed_at IS NOT NULL
  ORDER BY t.completed_at DESC,t.id DESC LIMIT 3
 )
 SELECT jsonb_build_object(
  'completed_today',totals.completed_today,'completed_last_3_hours',totals.completed_last_3_hours,
  'completed_last_6_hours',totals.completed_last_6_hours,'completed_last_24_hours',totals.completed_last_24_hours,
  'last_completion_at',totals.last_completion_at,
  'recent_completed',(SELECT coalesce(jsonb_agg(jsonb_build_object('title',title,'completed_at',completed_at) ORDER BY completed_at DESC),'[]'::jsonb) FROM latest),
  'overdue_tasks',totals.overdue_tasks,'due_later_today',totals.due_later_today,
  'open_due_today_or_overdue',totals.open_due_today_or_overdue
 ) FROM totals;
$ambient$;
REVOKE ALL ON FUNCTION public.kae_ambient_task_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kae_ambient_task_summary() TO authenticated,service_role;
