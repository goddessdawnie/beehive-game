# Bee operations reference

Private Supabase SQL API in project `kyfyzrtsksybnrrlnhmj`, with Dawn owner UUID `2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b`.

`bee.read(owner, kind, query='', id=null, limit=25, offset=0)` returns JSON. Existing kinds: `tasks`, `possibilities`, `timers`, `reminders`, `games`, `ledger`, `activity`, `pet`, `health`, `request`, `conversations`, `conversation_updates`, `memories`; these remain unchanged. Query is a literal case-insensitive substring for tasks/possibilities; an ID read returns zero or one record. Use an explicit limit and offset for paging, up to 100 per page for legacy record kinds. `request` reads historical receipts only.

**New `sleep` kind:** `select bee.read('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b','sleep','',null,7,0);` Returns private read-only sessions, daily totals, overlap flags, and freshness. `query` is inclusive local end date `YYYY-MM-DD` or empty for today; `limit` is number of days capped at 30 and `offset` is number of days back capped at 365. An omitted limit retains the historic default of 25 days; use an explicit 7, 14, or 30. Full contract, assumptions and validation in [sleep](sleep.md). Only the fixed owner is accepted for these unowned imported rows; this is NOT a public reusable multiuser API.

`bee.command(owner, request_uuid, operation, payload)` returns `{"replayed":false,"result":{...}}`. Preserve UUID for retries. Write operations: task.create, possibility.activate, task.edit, task.complete, task.status, task.delete, possibility.create, possibility.edit, possibility.delete, timer.create, timer.adjust, timer.cancel, notification.send, reminder.create, reminder.edit, reminder.cancel, game.set. For existing-record changes require `id` and `expected_updated_at`. For creation, task title is required; possibility activation requires `activity_id`. For task completion optional `notes`; task status supports open, cancelled and deferred (recurrence required). Deletion needs explicit confirmation and is constrained by history/references. Difficulties tiny=2, medium=5, large=9, ugh=12. Timer seconds 10..86400; reminders require future `due_at`. Timer/reminder edits/cancellations only while pending and zero delivery attempts. Notification receipt is not established by queueing or push acceptance. Reuse the source code and existing command behavior for the precise payload schema; do not guess unlisted fields or rewrite task reward mechanics.

SQL string literals must be safely escaped (double apostrophes), and payload must be valid JSON. Avoid interpolating untrusted user text. The private `bee` functions are not anonymous browser endpoints. All dates use America/New_York unless timestamps explicitly have offsets.

## Existing command payload contract (unchanged)

| Operation | Additional payload fields |
|---|---|
| `task.create` | `title`; optional `instructions`, `difficulty`, `reward_coins`, `due_at`, `recurrence_rule`, `activity_id` |
| `possibility.activate` | `activity_id`; optional task fields; title, notes and difficulty default from possibility |
| `task.edit` | `patch` containing title, instructions, difficulty, reward_coins and/or due_at |
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
| `game.set` | `game_key`, boolean `enabled`; no record ID or timestamp |

A read `request` kind requires ID=request UUID and returns a receipt or null without mutation; null receipt does not prove an in-flight transaction absent. Replayed command results are historical receipts and may differ from current state. Verify with fresh read. Task recurrence historically supported daily/weekly, and further recurrence features may be on the live site: inspect production before constructing unfamiliar rules. Property can be Florence, Williamsburg or null. Installed game keys include three, wordle, sudoku, wumpus and 2048; changing the registry only hides an installed game without deleting scores or claim history. A new executable game needs separate code and tests. Push notifications are best effort and a sent status does not imply handset receipt. An explicit reward override survives difficulty edits unless changed; otherwise an instance difficulty edit recalculates reward. A possibility's defaults do not change when the task instance is resized. Restarting an existing recurring series is not equivalent to reopening one occurrence; use the site when needed.
