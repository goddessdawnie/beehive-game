---
name: beehive
description: "Use for Dawn's private Beehive tasks, task possibilities, timers, notifications, reminders, and game, pet or reward information. Requires connected Supabase."
---

# Bee: stable Beehive interface

Beehive is the authoritative task-and-companion system. Use the already-connected **Supabase** app, project `kyfyzrtsksybnrrlnhmj` ("beehive"). This skill is a convenient route for common operations; it does not revoke or limit the Bees' existing database access.

## Operating protocol

1. Route directly to Supabase. Do not search Notion merely to discover the integration or create another task database.
2. Search for relevant existing records before inserting. If an ID is ambiguous, narrow it by title, status and context; never choose an arbitrary match.
3. Preserve existing business logic. Task completion MUST use the same reward, recurring-task and catalog-history behavior as the application's `complete_task_with_notes` / `set_task_status` functions. Do not merely UPDATE `tasks.status`.
4. For Bee-origin tasks set `task_origin='bee'`. Keep possibility defaults independent from individual task instances.
5. Verify consequential writes by re-reading. Tell the user whether a notification was **queued**, accepted by the push service, or actually received; do not conflate them.
6. Prefer reversible cancel/disable over permanent deletion. Permanent deletion needs explicit intent and FK/reward impact inspection.
7. Keep calls efficient: avoid full-table dumps, reuse known project identifiers and batch related reads. Interpret dates in America/New_York unless directed otherwise.
8. Do not expose secret keys, push subscription endpoints, VAPID keys, device auth values or other credentials.

## Routes

- Active tasks: `public.tasks`. Status values: `open`, `completed`, `cancelled`, `deferred`. Read, search, insert, edit and transition with existing atomic effects.
- Reusable possibilities: `public.activity_catalog`. Read, search, create, edit, archive by setting `active=false`, restore, and activate by creating a fresh task referring to `activity_id`. Activation must NOT remove the possibility.
- Timers: `public.beehive_timers` plus authenticated RPCs `beehive_start_timer` and `beehive_cancel_timer`. The worker processes the queue at approximately 15-second intervals. Timer modification needs a proper pending-state-safe operation, not arbitrary edits during sending.
- Bells/reminders: `public.beehive_bell_outbox`, using immediate or future `due_at`. Inspect for duplicates before retrying; alerts are best effort, not guaranteed device alarms.
- Other data: pet status, reward ledger/shop, activity history, Three Things, inventory and sanitized health statistics. Reading other DB information is fine when relevant; do not export secrets.
- Games: `daily_game_claims` currently tracks daily coin claims, but is NOT a game registry. Game enable/disable requires a registry integrated into the browser UI; don't misrepresent claims as a game toggle.
- Health: verify task access; pending, sent or failed timers and bells; push subscription presence; and scheduler activity where available.

## Connector caveat

The Supabase management connector uses an administrative SQL channel, not a logged-in browser session. RPCs that require `auth.uid()` may not work from it. Do not assume an authenticated user context, invent JWTs, or bypass authentication. Use verified, owner-scoped, side-effect-preserving operations; if unavailable, say precisely what remains blocked instead of silently corrupting rewards.

See [data contract](references/database-contract.md) for the schema.
