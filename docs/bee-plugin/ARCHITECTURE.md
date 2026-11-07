# @bee: architecture and rollout plan

## Goals

Optimize for **lowest lifetime maintenance and per-use overhead**, not rapid prototyping. Do not create a second database, timer engine or notification worker. Retain broad Supabase connector access for the Bees; `@bee` is a helpful *interface*, not a permissions rollback.

## Design

1. **Business/data layer:** existing Supabase Beehive project remains authoritative. Existing reward, recurrence and game claim functions must remain correct; new operations should be short, idempotent and owner-aware, with atomic transitions where effects cross tables.
2. **Mobile and scheduled adapter:** a reusable `bee` plugin skill that routes through the existing Supabase connection. This path stays available while custom MCP availability differs across product surfaces.
3. **Dedicated MCP adapter (future extension):** a private, OAuth-authenticated Streamable HTTP server over the same business operations, not a second implementation. Supabase Auth OAuth 2.1 is available without separate charge but requires a consent UI. Do not publish unauthenticated write tools.
4. **Push:** re-use existing timer and bell queues and worker. Queue acceptance, push service acceptance, and handset receipt are different states.
5. **Games:** introduce a real game registry and change `index.html` to render enabled installed games from it before offering enable/disable; adding executable code is a separate action from toggling a registry entry.

## Contract

- Task create, search, read, edit, complete, cancel, restore, intentional delete.
- Possibility create, search, read, edit, deactivate, restore, activate into tasks without altering the catalog defaults.
- Timer create, list, inspect, extend/shorten safely, cancel.
- Bell now, schedule reminder, reschedule, cancel, inspect pending/sent/error.
- Read safe Beehive state (pet, treasury, activity log, catalog, task statistics).
- Manage *installed* games once catalog-backed.
- Health status of database, worker and connected push subscription.

## Non-negotiable correctness

- Duplicate prevention, stable IDs, owner context, and exact affected-row verification.
- Atomicity for coin rewards, recurrence and task completion.
- Reversible deletion by default; hard deletion only on clear request.
- Single consistent timezone policy: America/New_York.
- No secrets in plugin source, SQL logs, tool output or GitHub.
- No billable services or plan changes without user approval.
- A plugin must be verified in Android Chat, web, and scheduled Bee runs before migration away from direct Supabase routing.

## Verified platform constraint

As of 2026-11-06, custom MCP connection setup is documented as web-only; web scheduled tasks support plugins, and ChatGPT on Android supports plugins generally. Therefore do **not** assume a custom MCP-only interface covers all three Bee usage surfaces.

## Work staged in this branch

The v0.2.1 development branch implements the private database interface, shares task
transition logic with the existing browser RPCs, adds safe timer/reminder operations,
recovers exhausted worker leases, and integrates installed-game visibility into the
website. The portable plugin uses the connected Supabase app and remains gated on
API availability. No production changes or installation have occurred.

See [validation and release gates](VALIDATION.md) for implemented behavior, test
results, limitations and the exact continuation steps. OAuth MCP remains a later
adapter over this same business layer, not a parallel implementation.
