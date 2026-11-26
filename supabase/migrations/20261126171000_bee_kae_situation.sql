-- BEE-KAE-CONTEXT-01: one private, bounded read-only situational source
-- shared by Kae chat and Three Things. No sleep copies or permanent context state.
-- The only Data API entry point has no owner parameter and explicitly checks auth.
create or replace function bee.kae_situation_at_20261126(
  p_owner uuid, p_at timestamptz
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $bee$
declare
 detail jsonb;
 day_record jsonb;
 episode jsonb;
 session_start timestamptz;
 session_end timestamptz;
 minutes integer;
 has_overlap boolean;
 count24 integer := 0;
 count48 integer := 0;
 sum24 integer := 0;
 sum48 integer := 0;
 missing24 integer := 0;
 missing48 integer := 0;
 overlap24 integer := 0;
 overlap48 integer := 0;
 longest48 integer := null;
 wake_latest timestamptz := null;
 day_local integer;
 minute_local integer;
 usual_shift boolean;
 source_status text;
 stale boolean;
 baseline_comparison text;
begin
 perform bee.check_owner(p_owner);
 if p_owner <> '2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'::uuid then
  raise exception 'Sleep data not assigned to this owner' using errcode='42501';
 end if;
 if p_at is null then raise exception 'Observation timestamp required' using errcode='22023'; end if;

 -- Existing private detailed read owns session-start attribution, overlap
 -- detection, actual asleep-minute semantics, and import freshness metadata.
 -- Four local days encompass both rolling elapsed-hour windows, including DST.
 detail := bee.read_sleep_20261120(
  p_owner,(p_at at time zone 'America/New_York')::date::text,4,0
 );
 for day_record in select value from jsonb_array_elements(coalesce(detail->'daily','[]'::jsonb))
 loop
  for episode in select value from jsonb_array_elements(coalesce(day_record->'episodes','[]'::jsonb))
  loop
   session_start := nullif(episode->>'start_time','')::timestamptz;
   session_end := nullif(episode->>'end_time','')::timestamptz;
   if session_start is null or session_start < p_at - interval '48 hours'
      or session_start >= p_at then continue; end if;
   -- Full recorded minutes are attributed to the session's start; they cannot
   -- be accurately prorated at the edge of a rolling window.
   if session_end is not null and session_end <= p_at and
      (wake_latest is null or session_end > wake_latest) then
    wake_latest := session_end;
   end if;
   count48 := count48+1;
   minutes := (episode->>'minutes_asleep')::integer;
   has_overlap := coalesce(jsonb_array_length(episode->'overlaps'),0)>0;
   if minutes is null then missing48 := missing48+1;
   else
    sum48 := sum48+minutes;
    if longest48 is null or minutes>longest48 then longest48 := minutes; end if;
   end if;
   if has_overlap then overlap48 := overlap48+1; end if;
   if session_start >= p_at - interval '24 hours' then
    count24 := count24+1;
    if minutes is null then missing24 := missing24+1; else sum24 := sum24+minutes; end if;
    if has_overlap then overlap24 := overlap24+1; end if;
   end if;
  end loop;
 end loop;

 -- This is a *usual schedule hypothesis*, not observed work, attendance, or
 -- a calendar exception check. Kept outside character and curated memories.
 -- Typical starts Thursday–Sunday 21:30 Eastern, ends following day 08:00.
 day_local := extract(isodow from (p_at at time zone 'America/New_York'))::integer;
 minute_local := extract(hour from (p_at at time zone 'America/New_York'))::integer*60
               + extract(minute from (p_at at time zone 'America/New_York'))::integer;
 usual_shift :=
   (day_local in (4,5,6,7) and minute_local>=21*60+30) or
   (day_local in (5,6,7,1) and minute_local<8*60);
 source_status := detail->'import'->>'status';
 stale := coalesce((detail->'import'->>'stale')::boolean,true);

 baseline_comparison := case
   when count48=0 or missing48>0 or overlap48>0 then 'unknown'
   when longest48<300 then 'longest_observed_episode_shorter_than_usual_main_sleep'
   when longest48<=330 then 'longest_observed_episode_within_usual_main_sleep_range'
   else 'longest_observed_episode_longer_than_usual_main_sleep'
 end;

 return jsonb_build_object(
  'kind','kae_situation','version',1,'timezone','America/New_York',
  'observed_at',p_at,
  'sleep',jsonb_build_object(
    'window_policy','Recorded full minutes_asleep for complete sessions STARTING within each elapsed-hour window; not prorated at boundaries',
    'observed_sessions_starting_24h',count24,
    'observed_sessions_starting_48h',count48,
    'observed_minutes_asleep_24h',case when count24>0 and missing24=0 and overlap24=0 then sum24 else null end,
    'observed_minutes_asleep_48h',case when count48>0 and missing48=0 and overlap48=0 then sum48 else null end,
    'latest_observed_wake_at',wake_latest,
    'multiple_sessions_48h',count48>=2,
    'longest_observed_episode_minutes_48h',longest48,
    'usual_main_sleep_minutes',jsonb_build_array(300,330),
    'main_episode_comparison',baseline_comparison,
    'source_import',jsonb_build_object(
      'status',source_status,'stale',stale,
      'started_at',detail->'import'->'started_at',
      'error_code',detail->'import'->'error_code',
      'latest_successful_import_at',detail->'latest_successful_import'->'finished_at'
    ),
    'data_flags',jsonb_build_object(
      'incomplete_coverage',true,
      'no_observed_sessions_48h',count48=0,
      'missing_minutes',missing48>0,
      'possible_double_count',overlap48>0,
      'sync_stale_or_unknown',stale or source_status is distinct from 'success',
      'totals_unknown_when_missing_or_overlapping',true
    )
  ),
  'work',jsonb_build_object(
    'usual_shift_window',usual_shift,
    'usual_shift_start_local','21:30',
    'usual_shift_end_local','08:00',
    'usual_shift_start_days',jsonb_build_array('Thursday','Friday','Saturday','Sunday'),
    'basis','established typical schedule only',
    'actually_working',null,
    'exceptions_checked',false,
    'interpretation','Usual shift window is not confirmation of working; days off and calendar exceptions are not available in this source'
  ),
  'guidance','Use as uncertain, occasional context. No compulsory rest or productivity commentary. Naps or split sessions are possible when multiple sessions appear; do not assume a cause.'
 );
end;
$bee$;

revoke all on function bee.kae_situation_at_20261126(uuid,timestamptz)
 from public,anon,authenticated;
grant execute on function bee.kae_situation_at_20261126(uuid,timestamptz)
 to service_role;

-- Authenticated per-user endpoint. The definer only bypasses RLS after
-- explicitly checking auth.uid() and the established one-owner pet record.
create or replace function public.bee_kae_situation_snapshot()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $rpc$
declare owner uuid := auth.uid();
begin
 if owner is null
    or owner <> '2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'::uuid
    or not exists(select 1 from public.pet_state p where p.owner_id=owner)
 then raise exception 'Not authorized' using errcode='42501'; end if;
 return bee.kae_situation_at_20261126(owner,now());
end;
$rpc$;
revoke all on function public.bee_kae_situation_snapshot() from public,anon,authenticated;
grant execute on function public.bee_kae_situation_snapshot() to authenticated;
