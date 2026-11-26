# Private sleep read: API v1 extension (2026-11-20)

Run from the existing connected Supabase administrative SQL tool (project `kyfyzrtsksybnrrlnhmj`):

```sql
select bee.read('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b','sleep','',null,7,0);
select bee.read('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b','sleep','2026-11-19',null,14,0);
```

`kind='sleep'` is read only. Query is empty for current Eastern calendar date, otherwise a strict `YYYY-MM-DD` inclusive end date. `limit` selects 1-30 local dates (recommended: explicitly pass 7, 14, or 30); `offset` moves the entire window back 0-365 calendar days. No cursor ID is used. Other Bee read kinds are unchanged. The historical `bee.read` default limit is 25, so omitting the limit gives 25 days; always specify the intended window explicitly (7, 14, or 30). Access requires the existing private SQL administrative channel, `bee.check_owner`, AND Dawn's fixed owner UUID; current sleep source records have no owner_id, and this is **not** a reusable multi-tenant route or public browser RPC. Do not grant anon/authenticated direct table or helper access.

The JSON includes `timezone`, start/end dates, `daily[]`, `import`, `latest_successful_import`, and `latest_session_imported_at`. Each `daily` entry has `local_date`, `session_count`, `actual_minutes_asleep`, `summed_elapsed_minutes`, `missing_asleep_count`, `overlapping_session_count`, `possible_double_count`, and chronological `episodes[]`. Episodes retain source, source_id, database ID, UTC timestamps, local start date, `minutes_asleep`, `minutes_in_period`, `minutes_awake`, computed `elapsed_minutes`, `user_corrected`, imported/updated timestamps, and possible overlapping session IDs and same-interval indicators.

**Attribution:** assign each whole session's `minutes_asleep` to its `start_time` date in `America/New_York`, even if its ending is after midnight. A midnight-crossing session is never counted a second time the next day. Separate sessions, including naps, are not merged. The attribution is a calendar grouping, not a biological sleep day or shift-specific boundary. The daily sum uses `minutes_asleep` (NOT the broad start/end interval, `minutes_in_period`, or alleged time in bed). The summed elapsed session minutes are diagnostic and cannot be interpreted as actual sleep. The daily total is JSON null if there are no sessions or any session has unknown `minutes_asleep`; no records means unknown coverage, NOT zero sleep. Overlap candidates are **retained and flagged**, not deduplicated, so their aggregate can double-count; investigate before interpreting.

`import` describes the latest sync run, including status, errors, timestamps, age in minutes, and `stale` when its start is older than eight hours. `latest_successful_import` is separate; failure after success remains a failure in latest status. `coverage_complete` is always false: a successful import does not prove the wearable or upstream source captured everything. `latest_session_imported_at` gives last inserted session timing, not the latest observation time.

No energy scoring, sleep-debt inference, diagnosis, model, scheduling, importer, or user-interface change is part of this read. Interpret alongside Dawn's reported experience and work schedule. The user-facing BEE-SLEEP-01 display is separate and may reuse this deterministic read after designing an appropriate authenticated privacy boundary; this administrative function must not be exposed to client JavaScript.

**Validation evidence (2026-11-20):** production `bee.read` read returned seven days, 8 observed sessions, and for 2026-11-20 276 minutes asleep vs 281 elapsed. Existing tasks read continued to work. A transactional fixture with two separated same-day episodes, a session starting 23:50 Eastern and crossing midnight, an overlapping record, and a user-corrected flag passed assertions. A fixture latest failed run with error code was reflected in output, and a no-record date had a null total. Transaction rolled back. Existing tables have RLS enabled and no user-facing policies, with administrative service role grants only. No owner_id column was invented.

## Compact synthesis projection (milestone 5; deployed status must be checked)

Use the separate private SQL helper `bee.read_sleep_compact_20261126(owner, end_date='', days=7, offset=0)` to collect a lightweight overview without all episode and source identifiers. Example:

```sql
select bee.read_sleep_compact_20261126('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b','',7,0);
```

It delegates all owner validation, Eastern start-date attribution, overlap flags, missing-minute nulls, 1–30-day window and 0–365-day offset handling to `bee.read_sleep_20261120`; it does not reconstruct sleep time from elapsed intervals. Each date includes `local_date`, `session_count`, `actual_minutes_asleep`, `missing_asleep_count`, `overlapping_session_count`, `possible_double_count`, and `latest_wake_at`. Window fields include `observed_session_count`, `days_with_sessions`, `days_without_sessions`, `observed_minutes_asleep`, `latest_wake_at`, and explicit `data_flags`. `import` retains latest status, error, age, stale flag, latest successful import and last session import time. This is a summary of **observed sessions**, not evidence of all sleep: days without sessions remain unknown, not zero. A missing actual-asleep figure makes the window total null. Numeric totals with overlapping sessions may double-count, so inspect the overlap flag before interpreting. Sync success is never proof of coverage.

For individual episodes, corrections, source details and overlap investigation, fall back to the original `bee.read(...,'sleep',...)` (or underlying `bee.read_sleep_20261120`) with the same date/window. Do not replace the detailed route, grant browser access, infer sleep debt, or change Synthesis and Kae worker routing until their independent adoption gate. Updating this repository reference does **not** update an installed @Bee plugin.
