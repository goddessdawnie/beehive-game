-- BEE-TASK-ORG-01, November 27, 2026. One-time historical provenance repair.
-- The read-only production audit found 16 old tasks linked by
-- three_things.task_id but incorrectly tagged task_origin='user'.
-- New Three Things actions already write 'kae'; do not infer from prose.
--
-- Change ONLY public.tasks.task_origin. Task status, rewards, history, due/
-- planned dates, IDs and timestamps are preserved. The current tasks trigger
-- fires on INSERT or UPDATE OF status/completion_notes, not task_origin.
-- The count guard rejects unexpected sets. A second run is a no-op.
do $bee_legacy_kae_origin$
declare
  v_candidates integer;
  v_updated integer;
begin
  select count(*) into v_candidates
  from public.tasks t
  where t.owner_id='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'::uuid
    and t.task_origin='user'
    and t.created_at < timestamptz '2026-11-14 00:00:00+00'
    and exists (
      select 1 from public.three_things tt
      where tt.task_id=t.id and tt.owner_id=t.owner_id
        and tt.status in ('added','completed')
    );
  if v_candidates not in (0,16) then
    raise exception 'Unexpected legacy Three Things origin candidate count: %',v_candidates;
  end if;
  update public.tasks t
  set task_origin='kae'
  where t.owner_id='2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'::uuid
    and t.task_origin='user'
    and t.created_at < timestamptz '2026-11-14 00:00:00+00'
    and exists (
      select 1 from public.three_things tt
      where tt.task_id=t.id and tt.owner_id=t.owner_id
        and tt.status in ('added','completed')
    );
  get diagnostics v_updated = row_count;
  if v_updated <> v_candidates then
    raise exception 'Legacy Three Things origin update count changed: % / %',v_updated,v_candidates;
  end if;
end
$bee_legacy_kae_origin$;
