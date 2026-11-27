-- Private one-owner current work plus keyset-paged non-open task changes.
-- Not a durable deletion log: full periodic reconciliation still required.
-- Retain legacy bee.read_task_context_20261126 until installed plugin parity.
CREATE INDEX IF NOT EXISTS tasks_owner_closed_updated_id_idx
 ON public.tasks(owner_id,updated_at,id) WHERE status<>'open';

CREATE OR REPLACE FUNCTION bee.read_task_workset_20261127(
  p_owner uuid,
  p_since timestamptz DEFAULT NULL,
  p_through timestamptz DEFAULT NULL,
  p_after_updated timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_open_offset integer DEFAULT 0,
  p_open_limit integer DEFAULT 100,
  p_change_limit integer DEFAULT 100
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $work$
DECLARE
  v_through timestamptz:=coalesce(p_through,now());
  v_since timestamptz;
  v_open_offset integer:=coalesce(p_open_offset,0);
  v_open_limit integer:=coalesce(p_open_limit,100);
  v_change_limit integer:=coalesce(p_change_limit,100);
  v_open_total integer;
  v_open_rows jsonb;
  v_closed_rows jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
  v_open_count integer;
BEGIN
  PERFORM bee.check_owner(p_owner);
  v_since:=coalesce(p_since,v_through-interval '24 hours');
  IF v_since>v_through OR v_through>now() THEN
    RAISE EXCEPTION 'Invalid since/through checkpoint interval';
  END IF;
  IF (p_after_updated IS NULL)<>(p_after_id IS NULL) THEN
    RAISE EXCEPTION 'Closed-change cursor needs timestamp and ID together';
  END IF;
  IF p_after_updated IS NOT NULL AND
       (p_after_updated<v_since OR p_after_updated>v_through) THEN
    RAISE EXCEPTION 'Cursor outside requested window';
  END IF;
  IF v_open_offset<0 OR v_open_offset>100000 OR
     v_open_limit NOT BETWEEN 1 AND 150 OR
     v_change_limit NOT BETWEEN 1 AND 150 THEN
    RAISE EXCEPTION 'Invalid workset page size or offset';
  END IF;

  SELECT count(*) INTO v_open_total FROM public.tasks
   WHERE owner_id=p_owner AND status='open';
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.due_at NULLS LAST,
                           r.planned_on NULLS LAST,r.updated_at DESC,r.id),
                  '[]'::jsonb),count(*)
  INTO v_open_rows,v_open_count
  FROM (
    SELECT id,title,status,due_at,planned_on,updated_at,task_origin,
      recurrence_rule,activity_id,task_location,task_category,
      left(nullif(btrim(instructions),''),120) AS instructions_preview,
      (length(instructions)>120) AS instructions_truncated
    FROM public.tasks WHERE owner_id=p_owner AND status='open'
    ORDER BY due_at NULLS LAST,planned_on NULLS LAST,updated_at DESC,id
    LIMIT v_open_limit OFFSET v_open_offset
  ) r;

  WITH sample AS MATERIALIZED (
    SELECT id,title,status,due_at,planned_on,updated_at,task_origin,
      recurrence_rule,activity_id,task_location,task_category,completed_at,
      left(nullif(btrim(instructions),''),120) AS instructions_preview,
      (length(instructions)>120) AS instructions_truncated,
      left(nullif(btrim(completion_notes),''),120) AS completion_preview,
      (length(completion_notes)>120) AS completion_truncated
    FROM public.tasks
    WHERE owner_id=p_owner AND status<>'open'
      AND updated_at>v_since AND updated_at<=v_through
      AND (p_after_updated IS NULL OR (updated_at,id)>(p_after_updated,p_after_id))
    ORDER BY updated_at,id LIMIT v_change_limit+1
  ), numbered AS (
    SELECT sample.*,row_number() OVER (ORDER BY updated_at,id) AS rn FROM sample
  )
  SELECT
    coalesce(jsonb_agg(to_jsonb(n)-'rn' ORDER BY n.updated_at,n.id)
       FILTER (WHERE n.rn<=v_change_limit),'[]'::jsonb),
    count(*)>v_change_limit,
    (SELECT jsonb_build_object('updated_at',endrow.updated_at,'id',endrow.id)
     FROM numbered endrow WHERE endrow.rn=v_change_limit)
  INTO v_closed_rows,v_has_more,v_next_cursor
  FROM numbered n;
  IF NOT v_has_more THEN v_next_cursor:=NULL; END IF;
  RETURN jsonb_build_object(
    'api_version',1,'generated_at',now(),'through',v_through,'since',v_since,
    'open',jsonb_build_object(
      'items',v_open_rows,'total',v_open_total,'offset',v_open_offset,'limit',v_open_limit,
      'truncated',v_open_offset+v_open_count<v_open_total,
      'next_offset',CASE WHEN v_open_offset+v_open_count<v_open_total
                         THEN v_open_offset+v_open_count ELSE NULL END
    ),
    'closed_changes',jsonb_build_object(
      'items',v_closed_rows,'limit',v_change_limit,
      'has_more',v_has_more,'next_cursor',v_next_cursor
    )
  );
END;
$work$;
REVOKE ALL ON FUNCTION bee.read_task_workset_20261127(
 uuid,timestamptz,timestamptz,timestamptz,uuid,integer,integer,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bee.read_task_workset_20261127(
 uuid,timestamptz,timestamptz,timestamptz,uuid,integer,integer,integer
) TO service_role;
