---
name: beehive
description: "Use for Dawn's Beehive tasks, reusable possibilities, timers, reminders, notifications, game controls, pet/reward data, read-only Kae dialogue, and read-only imported sleep sessions. Uses the connected Supabase app."
---

# Bee

Use Supabase project `kyfyzrtsksybnrrlnhmj` and Dawn's owner UUID `2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b`.
Beehive remains the task source of truth. This connected private SQL interface simplifies reads and commands; do not create a parallel store or search Notion just to route Bee operations.

## Check once per conversation

Use Supabase `execute_sql` to verify production routines:

```sql
select to_regprocedure('bee.command(uuid,uuid,text,jsonb)') is not null as command_available,
       to_regprocedure('bee.read(uuid,text,text,uuid,integer,integer)') is not null as read_available,
       to_regprocedure('bee.read_sleep_20261120(uuid,text,integer,integer)') is not null as sleep_available;
```

Presence of source files alone does not establish deployment. Do not deploy migrations as a side effect of ordinary reads or manually flip task status.

## Operations

Read [operations](references/operations.md) for unfamiliar reads and all writes. Use `bee.read` for bounded retrieval, `bee.command` for writes. Reuse IDs, avoid duplicate creates, use a unique request UUID for each intentional write, and retry uncertain writes with the **same** UUID, operation and payload. Supply the latest `updated_at` for edits and verify consequential changes by ID. Task completion must retain ledger and recurrence effects. Possibilities stay reusable. Cancel/archive instead of permanent delete unless expressly requested.

For Kae, use `bee.read` kind `conversations` and [conversation guidance](references/conversations.md); read-only and owner-scoped.

For Dawn's imported sleep, use `bee.read` kind `sleep`, explicitly requesting 7, 14, or 30 dates. Read [sleep operation and attribution](references/sleep.md) first. The private single-owner route retains session source identifiers, user corrections, actual asleep minutes versus elapsed, daily aggregates, split episodes, overlap ambiguities and latest sync status. Missing records are *unknown*, not zero sleep. Sync success is not proof of coverage. Do not infer energy scores or sleep debt, and do not expose the administrative helper to the browser.

Interpret dates in `America/New_York`; send write timestamps with explicit offset and resolve ambiguous DST instants. Notifications marked `sent` were accepted by push service, not necessarily received by the phone. Avoid exposing device secrets, auth or push keys. SQL connector has its existing administrative authorization, and public browser RPCs continue requiring authenticated ownership; do not invent JWTs, change permissions, or revoke existing access.
