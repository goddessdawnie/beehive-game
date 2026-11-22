# Deployed Bee SQL function inventory (read-only reference)

**Captured:** 2026-11-22 (America/New_York). **Source:** read-only `pg_proc` / `pg_namespace` inspection of deployed Supabase project `kyfyzrtsksybnrrlnhmj`, recorded in the [Builder runbook](https://app.notion.com/p/414dfa4a1fd08101bdcddde6a462e7a2). **Git baseline:** `28f4700a5e142b18cdfb21aebadeb23f1eb9ced5`.

> **NOT A MIGRATION.** This document records observed production metadata, not executable SQL, a restore recipe, or a grant recommendation. Do not copy hashes into a deployment script, replay old migrations, or assume a matching routine name means matching behavior. Recheck production before changing anything.

## Verified deployed routines

MD5 below is the digest of the deployed function definition as captured in the read-only inventory, **not** a Git blob hash or cryptographic authenticity guarantee. Signatures should be re-fetched directly from `pg_get_function_identity_arguments` before any signature-sensitive deployment.

| Schema-qualified routine | Deployed definition MD5 | Definition bytes | Notes |
| --- | --- | ---: | --- |
| `bee.read` | `7ee2e2fd73791657dcba0cfad76c9db6` | 1,608 | Private read entry point; delegates to specialized helpers |
| `bee.command` | `17616f8ed494a6a5cab0ef43c43ed3e4` | 393 | Private command entry point |
| `bee.read_core_20261117` | `9ae1fe2a68ae61d50573c12f79ffeca9` | 3,657 | Includes owner-scoped schedules read |
| `bee.command_core_20261117` | `0d3a1f5f5df3b11a9dd0c638f9e9a465` | 14,166 | Includes schedule create/edit/cancel |
| `bee.read_sleep_20261120` | `e9806a418455cec3cf6802117e05843f` | 5,301 | Sleep read, New York attribution, overlap/freshness |
| `bee.read_with_kae_sources_20261117` | `80c96ec7d3190a2a6f8ad49a845273c4` | 3,454 | Read routing for Kae context |

The inventory counted **13 functions in schema `bee`**, so this is intentionally a *selected entry-point manifest*, not the full function inventory. The inventory found only `bee.complete_sleep_task_on_import` marked SECURITY DEFINER among those 13; the selected functions above were not SECURITY DEFINER. The separately deployed `public.bee_sleep_recent(p_days integer)` was observed as SECURITY DEFINER with definition MD5 `cfe7abfe75b6fc83f46c639e1be3d9f6`. Security posture is observed metadata, not an authorization to change privileges.

## Deployment/source mismatch

Production migration history contained **65 entries** at the audit, whereas `supabase/migrations/` in this repository contained **13 files**. Their version identifiers do not correspond one-to-one even where changes are conceptually similar. Therefore repository migrations must **not** be blindly applied, renamed to mimic production, or marked reconciled by filename. Missing source remains an open reconciliation task.

The installed private @Bee plugin is a **SQL connector interface**, not a `bee-api` Edge Function. Its documented calls use `bee.read` and `bee.command` in the `bee` schema; see `plugins/bee/skills/beehive/SKILL.md` and `references/operations.md`. The installed plugin was reported as release **0.2.4** at the audit; the repository text was synchronized in PR #60 and schedule operations documented in PR #61, but these source changes **do not redeploy the installed plugin**.

## Maintainer reconciliation procedure

1. Read the live Notion runbook and current roadmap; check exclusive lease and existing PRs.
2. Obtain a fresh **read-only** inventory of `pg_proc`, `pg_namespace`, `pg_get_functiondef`, `pg_get_function_identity_arguments`, SECURITY DEFINER, and effective grants in the **`bee` schema**. Avoid exporting owner data, credentials, or unrelated routines.
3. Compare actual deployed definitions, signatures and security semantics with repository SQL and the installed plugin's supported operation list. Identify *specific* gaps rather than assuming all 65 migrations should be reconstructed.
4. Add missing production reference material only as clearly **non-executable** documentation under `docs/`; executable migrations require a separate reviewed rollout, tested against the current live schema, with migration history reconciled first.
5. Run the Bee verification suite on the exact PR head, review the final diff and mergeability, and verify merged main before updating Completed. Document any installed-plugin deployment separately.

**Boundary:** This document itself changes no SQL, access control, plugin installation, user data, or runtime behavior.
