# Bee: deployed private API parity, November 26, 2026

This is the current additive operational contract. It supplements [legacy operations](operations.md), [sleep](sleep.md), [conversation guidance](conversations.md) and [database contract](database-contract.md). Read or introspect production before using any operation whose signature cannot be confirmed. This reference documents **availability**, not automatic use by scheduled workers.

Use the existing connected Supabase `execute_sql` app, project `kyfyzrtsksybnrrlnhmj`, with owner UUID `2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b`. The private administrative schema is **not** a public browser API. Do not alter privileges or schedule routing as a result of reading this file.

## Task reads

`bee.read(owner,'tasks',query,id,limit,offset)` retains its original bounded and by-ID behavior. The separate **private task context** helper was deployed and independently tested:

```sql
select bee.read_task_context_20261126(
 '2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'::uuid,80,40,7);
```

It returns independent `open` and `recent` sections, each with `items`, `total`, `limit` and `truncated`; the recent section includes `since`. Defaults are open 80/recent 40/7 days; caps 150/100/30. Open rows are due/planned ordered with stable ID tie-break, recent rows by `updated_at DESC,id`. Recently edited older tasks can appear. Previews are abbreviated; use `bee.read` by exact ID for full task instructions and completion notes. Truncated results must **not** be mistaken for complete coverage. This can help legacy workers scanning multiple paginated pages, but **do not replace Work Synthesis's existing targeted SQL solely because this helper exists**.

## Task writes

Always call the stable dispatcher `bee.command(owner,request_uuid,operation,payload)`. The deployed dispatcher retains `memory.replace` and all legacy operations, and delegates to the updated versioned private core; do not call the core directly. `bee.command` still uses owner checks, request UUID receipt replay, owner advisory serialization, optimistic `expected_updated_at`, recurrence and reward ledger transitions.

- `task.create` or `possibility.activate`: optional `task_location`, `task_category`, and `planned_on` (strict local `YYYY-MM-DD` or JSON null), in addition to existing task fields. If not overridden, a Possibility supplies category and comma-joined locations. Its reusable defaults do not change.
- `task.edit`: `patch` may change `task_location` and `task_category`, including JSON null to clear. Use the latest `updated_at`. It **does not** accept `planned_on` in the patch.
- **`task.plan`**: supply `id`, exact `expected_updated_at`, and required `planned_on` with `YYYY-MM-DD` or JSON `null` to remove it from the selected day. Missing `planned_on` is an error, not a clear. It is for open tasks only; it never changes the real due date `due_at`.

For writes, reuse the exact request UUID **and complete payload** on a retry; a new request UUID is a new action, not a retry. On stale versions, fetch by ID and reassess instead of forcing an overwrite. Unknown payload fields and foreign-owner IDs fail. For completion use `task.complete` to retain recurrence and reward invariants; never manually update task status.

Example of clearing a chosen day, with real IDs and timestamp obtained from the current task read:

```sql
select bee.command(
 '2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'::uuid,
 '<new-request-uuid>'::uuid,
 'task.plan',
 jsonb_build_object(
   'id','<existing-task-uuid>'::uuid,
   'expected_updated_at','<exact-updated-at>'::timestamptz,
   'planned_on',null)
);
```

These are illustrative placeholders: do not execute the example unchanged or generate test records in production to validate the plugin.

## Schedule and reminders

`bee.read(owner,'schedules',query,id,limit,offset)` reads owner-scoped schedules, including inactive ones. `bee.command` supports `schedule.create`, `schedule.edit`, and `schedule.cancel` with the same receipt/expected-version rules. This is separate from one-time `reminder.*` and does not authorize creating additional passes or changing Work Bee cadence. Consult [operations](operations.md) for exact optional schedule fields; verify against production for unfamiliar recurring patterns.

## Sleep compact read

`bee.read_sleep_compact_20261126(owner,query='',days=7,offset=0)` is a private, read-only projection of the existing detailed Sleep read:

```sql
select bee.read_sleep_compact_20261126(
 '2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'::uuid,'',7,0);
```

Daily `local_date`, `session_count`, `actual_minutes_asleep`, missing/overlap flags and `latest_wake_at`; window observed session totals and counts of days with/without observations; `import` freshness/status/error metadata. The summary excludes full episodes and source IDs. A day with no sessions has an **unknown** asleep total, not zero. If any recorded session lacks actual asleep minutes, window observed minutes are null. Possible overlaps remain flagged rather than silently deduplicated. `coverage_complete` remains false even after a successful sync. For individual episodes, corrected sources, overlaps, or uncertain data, use `bee.read(...,'sleep',...)` and [sleep guidance](sleep.md).

In the November 26 live comparison, 7-day detailed JSON was 8,033 characters versus 2,347 for compact, with 11 observed sessions in both. This is a measured response-size reduction, **not** proven lower billed tokens or fewer database calls. New helper adoption by Synthesis/Kae is gated on the separate audit/pilot; publishing this plugin does not change their schedules or saved prompts.
