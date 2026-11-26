-- BEE milestone 5: compact, read-only synthesis summary of the established private Sleep read.
-- This function deliberately delegates all session attribution, overlap detection,
-- owner checks, freshness and null-total decisions to bee.read_sleep_20261120.
-- It neither changes the original detailed read nor grants browser/Data API access.
create or replace function bee.read_sleep_compact_20261126(
 p_owner uuid,
 p_query text default '',
 p_days integer default 7,
 p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $bee$
declare
 source jsonb;
 day jsonb;
 episode jsonb;
 compact_days jsonb := '[]'::jsonb;
 day_sessions integer;
 day_missing integer;
 day_overlap integer;
 day_minutes integer;
 day_last_wake timestamptz;
 last_wake timestamptz;
 sessions integer := 0;
 days_with_sessions integer := 0;
 days_without_sessions integer := 0;
 missing_asleep_count integer := 0;
 overlap_count integer := 0;
 summed_asleep integer := 0;
 has_unknown_minutes boolean := false;
begin
 perform bee.check_owner(p_owner);
 -- The source additionally rejects any owner other than the sole
 -- owner of existing imported rows, which have no owner_id column.
 source := bee.read_sleep_20261120(p_owner, p_query, p_days, p_offset);
 for day in select value from jsonb_array_elements(coalesce(source->'daily','[]'::jsonb))
 loop
  day_sessions := coalesce((day->>'session_count')::integer,0);
  day_missing := coalesce((day->>'missing_asleep_count')::integer,0);
  day_overlap := coalesce((day->>'overlapping_session_count')::integer,0);
  day_minutes := (day->>'actual_minutes_asleep')::integer;
  day_last_wake := null;
  for episode in
   select value from jsonb_array_elements(coalesce(day->'episodes','[]'::jsonb))
  loop
   if nullif(episode->>'end_time','') is not null then
    if day_last_wake is null or (episode->>'end_time')::timestamptz > day_last_wake then
     day_last_wake := (episode->>'end_time')::timestamptz;
    end if;
   end if;
  end loop;
  if last_wake is null or day_last_wake > last_wake then last_wake := day_last_wake; end if;

  sessions := sessions + day_sessions;
  missing_asleep_count := missing_asleep_count + day_missing;
  overlap_count := overlap_count + day_overlap;
  if day_sessions=0 then
   days_without_sessions := days_without_sessions + 1;
  else
   days_with_sessions := days_with_sessions + 1;
   if day_minutes is null then
    has_unknown_minutes := true;
   else
    summed_asleep := summed_asleep + day_minutes;
   end if;
  end if;

  compact_days := compact_days || jsonb_build_array(jsonb_build_object(
   'local_date',day->'local_date',
   'session_count',day_sessions,
   'actual_minutes_asleep',day->'actual_minutes_asleep',
   'missing_asleep_count',day_missing,
   'overlapping_session_count',day_overlap,
   'possible_double_count',coalesce((day->>'possible_double_count')::boolean,false),
   'latest_wake_at',day_last_wake
  ));
 end loop;

 return jsonb_build_object(
  'kind','sleep_compact',
  'format_version',1,
  'timezone',source->'timezone',
  'start_date',source->'start_date',
  'end_date',source->'end_date',
  'days_requested',source->'days_requested',
  'owner_id',p_owner,
  'daily',compact_days,
  'observed_session_count',sessions,
  'days_with_sessions',days_with_sessions,
  'days_without_sessions',days_without_sessions,
  -- Observed sessions only: blank dates do not mean zero sleep.
  -- A missing per-session asleep figure makes the window total unknown.
  'observed_minutes_asleep',case when sessions=0 or has_unknown_minutes then null else summed_asleep end,
  'latest_wake_at',last_wake,
  'data_flags',jsonb_build_object(
   'no_observed_sessions',sessions=0,
   'days_without_sessions',days_without_sessions>0,
   'missing_asleep_minutes',missing_asleep_count>0 or has_unknown_minutes,
   'possible_double_count',overlap_count>0,
   'coverage_complete',false
  ),
  'import',jsonb_build_object(
   'status',source->'import'->'status',
   'stale',source->'import'->'stale',
   'error_code',source->'import'->'error_code',
   'age_minutes',source->'import'->'age_minutes',
   'started_at',source->'import'->'started_at',
   'latest_successful_import_at',source->'latest_successful_import'->'finished_at',
   'latest_session_imported_at',source->'latest_session_imported_at'
  )
 );
end;
$bee$;

-- Keep this service-role administrative helper private, like the existing detail read.
revoke all on function bee.read_sleep_compact_20261126(uuid,text,integer,integer)
 from public,anon,authenticated;
grant execute on function bee.read_sleep_compact_20261126(uuid,text,integer,integer)
 to service_role;
