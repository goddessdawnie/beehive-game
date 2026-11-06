# API v1

Call through connected Supabase execute_sql, project `kyfyzrtsksybnrrlnhmj`.
The `bee` schema is private, accessible to the existing administrative connection;
it is not an anonymous or public REST write endpoint.

```sql
select bee.read('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b','tasks','laundry');
select bee.command('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b',
  '<fresh-request-uuid>','task.create','{"title":"Do laundry","difficulty":"medium"}'::jsonb);
```

Escape SQL string literals by doubling apostrophes. Encode payloads as valid JSON;
never interpolate raw user text as SQL or use unvalidated dollar delimiters.

`bee.read(owner, kind, query='', id=null, limit=25, offset=0)` returns JSON.
Kinds: `tasks`, `possibilities`, `timers`, `reminders`, `games`, `ledger`, `activity`,
`pet`, `health`. Query is literal case-insensitive substring search for tasks and
possibilities. Results include all statuses; inspect them, and paginate if necessary.
Maximum page size is 100. Tasks/timers/reminders sort newest first; possibilities
sort by title. An ID read returns zero or one record.

`bee.command(owner, request_uuid, operation, payload)` returns
`{"replayed":false,"result":{...}}`. Replayed results are historical receipts, not
current state. Failures roll back both changes and receipt. UUIDs identify intended
operations, not user conversations. Preserve them across uncertain retries.

For edits, status transitions, completions, cancellations and deletions of existing
records, payload requires `id` and `expected_updated_at` copied from the latest read.
Creation operations, including `possibility.activate`, do not take those fields.
For an Anytime task, omit due_at (stored as null); recurrence must also be omitted.

| Operation | Additional payload fields |
|---|---|
| `task.create` | `title`; optional `instructions`, `difficulty`, `reward_coins`, `due_at`, `recurrence_rule`, `activity_id` |
| `possibility.activate` | `activity_id`; optional task fields above; title/notes/difficulty default from possibility |
| `task.edit` | `patch` containing title, instructions, difficulty, reward_coins and/or due_at |
| `task.complete` | optional `notes` (omitted/null clears notes, including on an already completed task) |
| `task.status` | `status`: open, cancelled or deferred; deferred requires recurrence |
| `task.delete` | `confirm_delete:true`; only cancelled nonrecurring tasks without history |
| `possibility.create` | `title`; optional category, notes, locations (string array), work_compatible, property, suggested_difficulty |
| `possibility.edit` | `patch` with creation fields and/or `active`; archive false, restore true |
| `possibility.delete` | `confirm_delete:true`; only inactive, unreferenced possibilities |
| `timer.create` | `seconds` (10–86400), optional `label` (1–120 chars) |
| `timer.adjust` | `delta_seconds` added to deadline and total duration; optional label; final duration 10–86400 and deadline future |
| `timer.cancel` | no additional fields |
| `notification.send` | `title` (1–120 chars), `body` (1–400 chars); queues immediately |
| `reminder.create` | title, body, future `due_at` with offset |
| `reminder.edit` | optional title, body, future due_at |
| `reminder.cancel` | no additional fields |
| `game.set` | `game_key` and boolean `enabled`; no record ID or timestamp |

Difficulties: tiny=2, medium=5, large=9, ugh=12; unrated=5 coins.
Explicit reward overrides are preserved. An instance difficulty edit recalculates its
reward unless reward_coins is supplied. Recurrence: daily/weekly, requires due_at;
series ID is generated automatically. Existing website restart-series behavior is
not replaced by reopening one occurrence; use the website for restarting a series.
Property: Florence, Williamsburg or null. Installed game keys: three, wordle,
sudoku, wumpus, 2048. Missing registry rows mean enabled. Disabling hides the game
on the website's next Play selection, refresh, or return to the foreground; it
preserves game code and claim history. Existing open clients may retain old state
until refresh. A new executable game requires code, registry allowlist and tests.

Timer/reminder edits and cancellations require pending status AND zero attempts.
Delivery already attempted means the worker may have sent a push; inspect and
explain rather than directly editing the queue. Notifications are best effort.
Health reports queue backlog/device count; worker status and handset receipt are
explicitly unproven. Other relevant information can still be read through full
Supabase access with owner filters and secret-safe column selection.
