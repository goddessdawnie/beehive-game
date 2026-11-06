# Beehive data contract

Verified against the live project 2026-11-06. Project ID: `kyfyzrtsksybnrrlnhmj` (Supabase free plan). Source code: `goddessdawnie/beehive-game`.

| Intent | Table | Main fields |
|---|---|---|
| Tasks | `public.tasks` | `id,title,status,due_at,recurrence_rule,reward_coins,owner_id,instructions,completion_notes,task_origin,activity_id,difficulty` |
| Possibilities | `public.activity_catalog` | `id,owner_id,title,category,active,locations,work_compatible,notes,suggested_difficulty,property,times_done` |
| Timers | `public.beehive_timers` | `id,owner_id,label,duration_seconds,due_at,status,attempts,sent_at,last_error` |
| Bell queue & reminders | `public.beehive_bell_outbox` | `id,owner_id,source,title,body,status,due_at,attempts,sent_at,last_error` |
| Reward accounting | `public.reward_ledger` | Coin grants and deductions associated with task completion and purchases |
| Played games | `public.daily_game_claims` | Claims, **not** a registry of installed games |

Existing atomic transition functions: `set_task_status(p_task_id uuid,p_status text)`, `complete_task_with_notes(p_task_id uuid,p_notes text)`, `beehive_start_timer(p_seconds integer,p_label text)`, `beehive_cancel_timer(p_id uuid)`. Browser RPCs require `auth.uid()`; the management connector runs as `postgres`. The development migration factors task transitions into owner-checked shared core functions and exposes `bee.command` / `bee.read` only to the administrative channel. See [operations](operations.md).

`set_task_status` awards/removes coins and creates recurrence successors for daily/weekly tasks; `complete_task_with_notes` delegates to it. Never directly flip task status without preserving those effects.

The active `beehive-timer-push` Edge Function processes `beehive_timers` and `beehive_bell_outbox` using a 15-second cron. A successful push service response does not prove the phone received the notification.

A possibility remains reusable when copied to an active task. Edits to the task's difficulty are instance-only. Production game choices are defined in `index.html`. The development branch adds `beehive_games` owner-specific visibility settings, consumed by `js/game-registry.js`; it is not deployed yet.
