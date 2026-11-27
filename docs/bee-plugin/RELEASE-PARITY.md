# Bee: Git source versus installed private release (read-only checkpoint)

**Checked November 27, 2026.** Git baseline: [Beehive `main` commit](https://github.com/goddessdawnie/beehive-game/commit/15e14a5729fa62a38a81732507212e22cf158308). Installed private Bee plugin: **v0.2.5**, current release `pluginrel_6b085cd2ed8881918a786fd054565fb1` (read-only owned-plugin file list and selected file reads); scope **USER**, discoverability **PRIVATE**. This document is not a plugin release, SQL deployment, migration or permissions change.

## Source comparison

The installed package contains nine text files. **7 of 9** match the exact GitHub `plugins/bee/` file contents at this checkpoint: `.app.json`, `.codex-plugin/plugin.json`, `plugin.json`, `skills/beehive/SKILL.md`, and `references/conversations.md`, `references/database-contract.md`, `references/deployed-parity.md`.

| Reference under `skills/beehive/references/` | Installed bytes | Git baseline bytes | Comparison |
| --- | ---: | ---: | --- |
| `operations.md` | 5,441 | 10,412 | **Different** |
| `sleep.md` | 4,136 | 5,978 | **Different** |

The installed `operations.md` lacks the detailed `schedule.create`, `schedule.edit`, `schedule.cancel`, `schedules` read and `task.plan` sections found in Git source. The installed `deployed-parity.md` **does** summarize deployed schedule/task operations but directs readers to the older operations reference for exact optional fields. This is a documented **packaged-reference gap**, not evidence of a production SQL defect. Installed `sleep.md` is also shorter; this file comparison does not establish a Sleep behavior bug. Matching manifests and the installed parity summary do not mean the complete installed reference package matches GitHub.

## Current source, production and release boundaries

- [Git source operations](../../plugins/bee/skills/beehive/references/operations.md) includes the extended schedule payload table. This source change corrects older `SOURCE ONLY` and `rollout-gated` labels for private task-context and compact-Sleep helpers already deployed and checked November 26. **The installed plugin is unchanged.**
- [Deployed parity reference](../../plugins/bee/skills/beehive/references/deployed-parity.md) matched the installed v0.2.5 file at this checkpoint and remains the starting point for owner scope, receipt retries, planned-day write rules, compact Sleep limitations and optional schedule operations. Its existence does not mean scheduled workers adopted the new reads.
- [Historical deployed SQL inventory and migration mappings](../bee-production-function-inventory.md) record selected deployed function provenance. The [repository schedule API migration](../../supabase/migrations/20261111230000_bee_schedule_api.sql) already has a November 23 recorded-statement mapping. Later deployments and the read-only Work task-context pilot appear in the [live Notion roadmap](https://app.notion.com/p/40edfa4a1fd081f3a906dfff4c6ae223). This slice did **not** rerun any production SQL or compare live grants/signatures.
- Production availability, packaged plugin documentation and scheduled-worker routing are **separate states**. Continue using the stable private `bee.read` / `bee.command` wrappers and their existing owner/version safeguards. Do not call versioned write cores directly.

## Remaining release work, separately gated

The installed plugin is unchanged by a GitHub source/docs PR. Updating its two divergent files requires a **separately verified, host-uploaded plugin archive**; that transport has not been established in prior attempts and is not attempted here. Recheck the latest installed release ID before any future guarded update, reconcile changed files, preserve the Supabase App binding/private scope, and verify contents after publication. Do not replay migrations, broaden privileges, change workers' routes, create bell schedules, or mutate tasks to test this documentation.

**Next bounded step:** resolve the supported archive transport for a guarded installed-plugin reference update. Meanwhile, use installed `deployed-parity.md` and confirmed production/source contracts when an unfamiliar scheduled-bell payload matters; do not invent missing parameters.
