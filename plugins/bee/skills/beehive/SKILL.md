---
name: beehive
description: "Use for Dawn's Beehive tasks, reusable possibilities, timers, reminders, notifications, schedules, game controls, pet/reward data, read-only Kae dialogue, and read-only imported sleep sessions. Uses the connected Supabase app."
---

# Bee

Use the existing connected Supabase project `kyfyzrtsksybnrrlnhmj` and Dawn's owner UUID `2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b`. Beehive is the source of truth. Do not create a parallel store or look for a separate Beehive SQL service.

## Check once per conversation

For relevant operations, check live production availability with the connected Supabase `execute_sql` tool:

```sql
select to_regprocedure('bee.command(uuid,uuid,text,jsonb)') is not null as command_available,
       to_regprocedure('bee.read(uuid,text,text,uuid,integer,integer)') is not null as read_available,
       to_regprocedure('bee.read_task_context_20261126(uuid,integer,integer,integer)') is not null as task_context_available,
       to_regprocedure('bee.read_sleep_compact_20261126(uuid,text,integer,integer)') is not null as compact_sleep_available,
       to_regprocedure('bee.command_core_20261126(uuid,uuid,text,jsonb)') is not null as task_write_parity_available;
```

The source release is not evidence of production deployment. Never apply migrations merely to serve a read, directly flip task status or expose administrative helpers to the browser.

## Read and write contracts

**Read [deployed parity](references/deployed-parity.md) first** for November 2026 task context, explicit planned-day actions, compact Sleep, and schedules. It supersedes any stale field lists in [legacy operations](references/operations.md). Legacy operations remain the detailed guide for existing commands and retries. Use `bee.read` for bounded records and `bee.command` for mutations; do **not** invoke versioned `bee.command_core_*` directly. Use exact owner scoping, one unique request UUID per intentional mutation, and retry uncertain writes with the **identical** UUID, operation, and payload. Supply latest `updated_at` for edits; verify consequential writes by ID. For every requested mutation distinguish request accepted, current state verified, and external delivery actually confirmed; follow the [fulfillment verification matrix](references/operations.md). A queued bell is not a handset receipt. Keep the existing reward ledger and recurrence transitions. Possibilities are reusable. Prefer archive/cancel over deletion unless expressly authorized.

For Kae, use `bee.read` kind `conversations` and [conversation guidance](references/conversations.md); read only, with owner scoping. For imported Sleep, use [sleep attribution and freshness](references/sleep.md). Detailed episode read `bee.read(...,'sleep',...)` remains the fallback for uncertainty, overlap, corrections and source provenance. The compact helper is optional and must not automatically replace worker-specific queries. Missing data is **unknown**, not zero; sync success is not proof of coverage. Do not infer energy scores or sleep debt.

**Do not change the Work Synthesis or Kae scheduled-worker routes from this plugin release.** Use new bounded reads only when their task independently calls for them; adopt as scheduled defaults only after the separately documented worker pilot and efficiency review.

Interpret dates in `America/New_York`. Write timestamps with an explicit UTC offset and disambiguate DST instants. A push marked `sent` means service acceptance, not confirmed handset delivery. Keep device/auth/push secrets private, preserve existing connector permissions, and never invent JWTs.
