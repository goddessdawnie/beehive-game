-- Fix ambiguous ordering when a user message and Kae reply share the same timestamp.
-- The newest 20 messages are selected deterministically and then presented
-- chronologically, with the human message before Kae's reply on a timestamp tie.
-- Preserve existing response fields, authorization and message history.
CREATE OR REPLACE FUNCTION public.mochi_context_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object(
 'character', (SELECT jsonb_build_object('name',c.character_name,'card',c.character_card) FROM public.character_profiles c WHERE c.owner_id=auth.uid() LIMIT 1),
 'pet', (SELECT jsonb_build_object('name',p.name,'care_anchor_at',p.care_anchor_at,'care_points',p.care_points,'last_care_at',p.last_care_at) FROM public.pet_state p WHERE p.owner_id=auth.uid() LIMIT 1),
 'recent_tasks', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT title,status,due_at,completed_at,completion_notes,reward_coins,task_origin FROM public.tasks WHERE owner_id=auth.uid() ORDER BY updated_at DESC LIMIT 15) x),'[]'::jsonb),
 'recent_messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('role',x.role,'content',x.content,'created_at',x.created_at) ORDER BY x.created_at ASC, x.role DESC, x.id ASC) FROM (SELECT id,role,content,created_at FROM public.mochi_messages WHERE owner_id=auth.uid() ORDER BY created_at DESC, role ASC, id DESC LIMIT 20) x),'[]'::jsonb),
 'memories', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',x.kind,'text',x.memory_text)) FROM (SELECT kind,memory_text FROM public.mochi_memories WHERE owner_id=auth.uid() ORDER BY updated_at DESC LIMIT 20) x),'[]'::jsonb)
 );
$function$
;
