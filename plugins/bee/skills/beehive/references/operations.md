# Bee operations reference

Private Supabase SQL API in project `kyfyzrtsksybnrrlnhmj`, with Dawn owner UUID `2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b`.

`bee.read(owner, kind, query='', id=null, limit=25, offset=0)` returns JSON. Existing kinds: `tasks`, `possibilities`, `timers`, `reminders`, `games`, `ledger`, `activity`, `pet`, `health`, `request`, `conversations`, `conversation_updates`, `memories`, `schedules`; these remain unchanged. Query is a literal case-insensitive substring for tasks/possibilities; an ID read returns zero or one record. Use an explicit limit and offset for paging, up to 100 per page for legacy record kinds. `request` reads historical receipts only.

**New `sleep` kind:** `select bee.read('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b','sleep','',null,7,0);` Returns private read-only sessions, daily totals, overlap flags, and freshness. `query` is inclusive local end date `YYYY-MM-DD` or empty for today; `limit` is number of days capped at 30 and `offset` is number of days back capped at 365. An omitted limit retains the historic default of 25 days; use an explicit 7, 14, or 30. Full contract, assumptions and validation in [sleep](sleep.md). Only the fixed owner is accepted for these unowned imported rows; this is NOT a public reusable multiuser API.

**Task-context worker read (deployed private helper; selective adoption):** `select bee.read_task_context_20261126('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b',80,40,7);` returns one owner-scoped JSON object with separate `open` and `recent` sections. Each has `items`, `total`, `limit` and `truncated`; `recent.since` records the inclusive freshness cutoff. Default open/recent caps are 80/40 (hard limits 150/100), with a 7-day recent window (1..30 days). Open tasks order by due, planned date, updated time and ID; recent tasks order by `updated_at DESC,id ASC` so edits to older tasks are visible. Each item includes IDs, title, status, due/planned date, recurrence, origin, activity link, context and short instructions preview; recent items also include completion note preview. The original `bee.read(...,'tasks',...) ` remains fully available for by-ID detail and rollback. This SQL function is private/service-role only, not exposed to the browser. Deployment and the read-only Work pilot were verified November 26, 2026; this does **not** imply adoption by scheduled workers or that this GitHub reference has been repackaged into the installed plugin. Work Synthesis's existing narrower, full-detail query remains preferred without a separately reviewed routing change.

`bee.command(owner, request_uuid, operation, payload)` returns `{"replayed":false,"result":{...}}`. Preserve UUID for retries. Write operations: task.create, possibility.activate, task.edit, task.plan, task.complete, task.status, task.delete, possibility.create, possibility.edit, possibility.delete, timer.create, timer.adjust, timer.cancel, notification.send, reminder.create, reminder.edit, reminder.cancel, schedule.create, schedule.edit, schedule.cancel, game.set. For existing-record changes require `id` and `expected_updated_at`. For creation, task title is required; possibility activation requires `activity_id`. For task completion optional `notes`; task status supports open, cancelled and deferred (recurrence required). Deletion needs explicit confirmation and is constrained by history/references. Difficulties tiny=2, medium=5, large=9, ugh=12. Timer seconds 10..86400; reminders require future `due_at`. Timer/reminder edits/cancellations only while pending and zero delivery attempts. Notification receipt is not established by queueing or push acceptance. Reuse the source code and existing command behavior for the precise payload schema; do not guess unlisted fields or rewrite task reward mechanics.

SQL string literals must be safely escaped (double apostrophes), and payload must be valid JSON. Avoid interpolating untrusted user text. The private `bee` functions are not anonymous browser endpoints. All dates use America/New_York unless timestamps explicitly have offsets.

## Private command payload contract

| Operation | Additional payload fields |
|---|---|
| `task.create` | `title`; optional `instructions`, `difficulty`, `reward_coins`, `due_at`, `recurrence_rule`, `activity_id`, `task_location`, `task_category`, `planned_on` (YYYY-MM-DD or JSON null) |
| `possibility.activate` | `activity_id`; optional task fields; title, notes, difficulty, category and comma-joined location default from possibility unless explicitly overridden |
| `task.edit` | `patch` containing title, instructions, difficulty, reward_coins, due_at, task_location and/or task_category; use JSON null to clear context fields |
| `task.plan` | `id`, `expected_updated_at`, **required** `planned_on` as strict local `YYYY-MM-DD` or JSON `null` to clear. Open tasks only; never modifies `due_at`. | 
| `task.complete` | optional `notes`, omitted/null clears notes even on previously completed tasks |
| `task.status` | `status`: open, cancelled or deferred; deferred requires recurrence |
| `task.delete` | `confirm_delete:true`, limited to cancelled nonrecurring tasks without history |
| `possibility.create` | `title`; optional category, notes, locations array, work_compatible, property, suggested_difficulty |
| `possibility.edit` | `patch` containing creation fields and/or `active` (false archives) |
| `possibility.delete` | `confirm_delete:true`, only inactive, unreferenced entries |
| `timer.create` | `seconds` from 10 to 86400; optional `label` 1-120 chars |
| `timer.adjust` | `delta_seconds` added to deadline and duration; optional label; final duration 10-86400, deadline future |
| `timer.cancel` | no additional fields |
| `notification.send` | `title` (1-120 chars), `body` (1-400 chars); queues immediately |
| `reminder.create` | title, body, future `due_at` with explicit time offset |
| `reminder.edit` | optional title, body, future due_at |
| `reminder.cancel` | no additional fields |
| `schedule.create` | `title`, `kind` (`once`, `weekly`, `monthly`); optional `body`, `one_time_at` (offset-aware timestamp), `local_time`, `weekdays` (integer array), `month_day`, `timezone` (defaults to `America/New_York`). Kind-specific values must satisfy the live schedule table constraints. |
| `schedule.edit` | `id`, `expected_updated_at`; optional `title`, `body`, `kind`, `one_time_at`, `local_time`, `weekdays`, `month_day`, `timezone`, `active` |
| `schedule.cancel` | `id`, `expected_updated_at` **only**; sets `active=false`, preserving the record |
| `game.set` | `game_key`, boolean `enabled`; no record ID or timestamp |

A `schedules` read returns an owner-scoped JSON array from `beehive_bell_schedules`, newest `created_at` first with ID tie-break; optional `id` narrows to one row, query matches title/body case-insensitively, and `limit`/`offset` page results (maximum 100). It includes inactive records; inspect `active` rather than assuming all rows are enabled. Use the returned `updated_at` for optimistic concurrency on edit/cancel. These operations are verified in deployed private SQL, but this repository documentation update does **not** update the installed private plugin release. Schedule commands use the same request UUID receipts and retry semantics as other writes. Do not confuse recurring bell schedules with one-time reminder outbox entries.

A read `request` kind requires ID=request UUID and returns a receipt or null without mutation; null receipt does not prove an in-flight transaction absent. Replayed command results are historical receipts and may differ from current state. Verify with fresh read. Task recurrence historically supported daily/weekly, and further recurrence features may be on the live site: inspect production before constructing unfamiliar rules. Property can be Florence, Williamsburg or null. Installed game keys include three, wordle, sudoku, wumpus and 2048; changing the registry only hides an installed game without deleting scores or claim history. A new executable game needs separate code and tests. Push notifications are best effort and a sent status does not imply handset receipt. An explicit reward override survives difficulty edits unless changed; otherwise an instance difficulty edit recalculates reward. A possibility's defaults do not change when the task instance is resized. Restarting an existing recurring series is not equivalent to reopening one occurrence; use the site when needed.

**Compact Sleep read (deployed private helper; worker adoption gated):** `bee.read_sleep_compact_20261126(owner,'',7,0)` summarizes the existing detailed private Sleep read without episodes or source identifiers. Preserve null/overlap/coverage warnings and fallback to `bee.read(...,'sleep',...)` for investigation. See [sleep](sleep.md). The helper was deployed and read-only verified November 26, 2026. This source documentation does not alter the separately installed plugin or any scheduled-worker routing; inspect coverage/freshness flags and use the detailed fallback when needed.

### Task metadata and planned-day parity (source + production SQL)

The versioned task-write core accepts optional `task_location` and `task_category` on `task.create`, `possibility.activate`, and in `task.edit.patch`. These are optional text fields; JSON `null` clears an existing field. Unknown fields are rejected. On activation without explicit overrides, the activity's category and comma-joined locations are used, without modifying the reusable Possibility.

A deliberate plan change is a separate command, not a due-date edit:

```sql
select bee.command(
  '2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b'::uuid,
  '<new-request-uuid>'::uuid,
  'task.plan',
  jsonb_build_object('id','<task-uuid>'::uuid,
                     'expected_updated_at','<exact-latest-updated_at>'::timestamptz,
                     'planned_on','2026-11-27')
);
```

Use `planned_on:null` to remove the task from its chosen day. An omitted `planned_on` is **invalid**; it does not mean clear. The date uses `America/New_York` calendar days, not a timestamp or a changed `due_at`. Read the record by ID, pass its current `updated_at` for optimistic concurrency, and on retry reuse the **same** request UUID and entire payload to retrieve the original receipt rather than writing twice. Stale versions and foreign-owner IDs fail. Existing `task.complete`, `task.status`, reward ledger, recurrence series and timer/reminder/schedule branches still use the original logic. Keep using `bee.read` for verification.

The installed private Bee release was independently read as v0.2.5 on November 27, 2026. Its packaged `operations.md` and `sleep.md` do **not** yet match the longer GitHub source references. Edits to this repository do not update the installed plugin; treat archive transport and release reconciliation as separate work. Do not claim worker adoption without independent validation.
