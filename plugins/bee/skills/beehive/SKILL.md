---
name: beehive
description: "Use for Dawn's Beehive tasks, reusable possibilities, timers, reminders, notifications, installed game controls, pet and reward information. Uses the connected Supabase app."
---

# Bee

Use Supabase project `kyfyzrtsksybnrrlnhmj` and Dawn's owner UUID
`2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b`. Beehive remains the task source of truth.
Full direct Supabase access remains available; this interface simplifies common operations.
Do not search Notion for routing or create a parallel store.

## Check availability once per conversation

Use the existing Supabase `execute_sql` tool:

```sql
select to_regprocedure('bee.command(uuid,uuid,text,jsonb)') is not null as command_available,
       to_regprocedure('bee.read(uuid,text,text,uuid,integer,integer)') is not null as read_available;
```

The source includes a development migration, not proof of deployment. If absent, say the
new API is not deployed. Existing owner-filtered reads remain available; never deploy
schema changes as a side effect of an ordinary request or directly flip task status.

## Normal operation

Read [operations](references/operations.md) when first performing a write or unfamiliar read.
Use `bee.read` for bounded searches and `bee.command` for writes. Prefer one search,
one command, and one verification read. Reuse IDs and results already in context.

1. Search before creation; distinguish a repeat request from an intentional second occurrence.
   Resolve ambiguous records by title/status/context; never choose an arbitrary match.
2. Assign a fresh UUID request ID to each intended write. Retry an uncertain call with
   **the exact same ID, operation and payload**. Never invent a new ID merely because
   a call timed out. A replay returns the original outcome; re-read current state.
3. Supply the record's exact `updated_at` as `expected_updated_at` for edits/transitions.
   On a conflict, re-read and reassess before creating a new request ID.
4. Verify consequential writes by ID. Creation defaults to `task_origin='bee'`.
   Complete via `task.complete`; rewards, history and recurrence are atomic.
5. A possibility stays reusable. Resizing its task instance never edits its defaults.
   Cancel/archive by default; permanent deletion requires explicit user intent.
6. Interpret dates in America/New_York. Send timestamps with explicit UTC offset.
   Ask about ambiguous local DST times; do not silently pick an occurrence.
7. Notification `pending` means queued; `sent` means a push service accepted it,
   **not** handset receipt. Once delivery has been attempted, safe cancellation or
   rescheduling is unavailable. Do not claim a delivered alert was retracted.
8. Games can be enabled/disabled only after their executable code is installed.
   Registry toggles do not install new games or erase scores/claims.
9. Never reveal secrets, push endpoints, device auth values, or VAPID keys.
   Use sanitized health counts; database access alone does not prove worker health.

The SQL connector uses its existing administrative authorization. The private API
accepts an explicit owner; do not fabricate JWTs or set session claims. Browser
RPCs keep authenticated owner checks. Do not change permissions or revoke the
Bees' existing Supabase access.
