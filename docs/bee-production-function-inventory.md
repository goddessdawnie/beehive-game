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

## Sleep helper migration-body provenance (2026-11-22)

A subsequent **read-only** comparison examined the single stored SQL statement for production migration `20261120181730` (`bee_sleep_read_private_20261120`) against the deployed definition of `bee.read_sleep_20261120(uuid,text,integer,integer)` from `pg_get_functiondef`. The recorded statement contains the helper's `CREATE OR REPLACE FUNCTION` plus separate `REVOKE`/`GRANT` commands, and the live definition uses different header formatting. Therefore the full statement MD5 (`38db3fc950d02ad70472f957dee9895a`) does **not** match the deployed normalized definition MD5 (`e9806a418455cec3cf6802117e05843f`); this mismatch alone is **not** evidence of behavior drift.

Extracting only the PL/pgSQL bodies between their dollar-quote delimiters and normalizing **whitespace and letter case only** yielded **5,062 characters on each side**, with the same compact body MD5: `405723683147ecfa5afcb6c63c207d7d`. This supports **body-level provenance** of the deployed helper to the recorded migration. It does **not** establish full SQL statement equivalence, grant parity, independent semantic correctness, or completeness of production migration history. The source body, private configured owner identity and executable migration statement are deliberately **not reproduced here**.

The related migrations `20261120181808` (`bee_sleep_read_route_20261120`) and `20261120182140` (`bee_sleep_explicit_window_20261120`) replace the `bee.read` wrapper, not the private sleep helper; the latter migration's recorded statement MD5 matched the deployed wrapper definition MD5 (`7ee2e2fd73791657dcba0cfad76c9db6`) in the read-only audit. The production-versus-repository migration gap (65 versus 13 at capture) and installed private plugin release parity remain **unresolved**. Do not execute stored statements or interpret this provenance note as approval for a database migration.


## Three Things feedback-note migration mapping (2026-11-22)

A read-only comparison of repository `supabase/migrations/20261116140100_three_things_feedback_note.sql` and production migration `20261116195713` (`three_things_feedback_note`) established **semantic parity for this one migration**. The production statement was 475 characters (MD5 `eb1bfdb81e259edaf861c14b2f22cb46`). Both sources perform these four operations in the same order: add nullable `public.three_things.feedback_note text` if absent; drop `three_things_feedback_note_length` if present; add that constraint checking `feedback_note IS NULL OR char_length(feedback_note) <= 500`; and apply the identical column comment. Repository comments, whitespace, and different migration timestamp explain raw-text/provenance differences; this is **not** a byte-for-byte SQL hash match.

This verifies **one source-to-production mapping only**, not the remaining repository files or all 65 production migrations. Do not replay either migration or infer global migration-history reconciliation. The installed private plugin release remains separately unreconciled.

## Maintainer reconciliation procedure

1. Read the live Notion runbook and current roadmap; check exclusive lease and existing PRs.
2. Obtain a fresh **read-only** inventory of `pg_proc`, `pg_namespace`, `pg_get_functiondef`, `pg_get_function_identity_arguments`, SECURITY DEFINER, and effective grants in the **`bee` schema**. Avoid exporting owner data, credentials, or unrelated routines.
3. Compare actual deployed definitions, signatures and security semantics with repository SQL and the installed plugin's supported operation list. Identify *specific* gaps rather than assuming all 65 migrations should be reconstructed.
4. Add missing production reference material only as clearly **non-executable** documentation under `docs/`; executable migrations require a separate reviewed rollout, tested against the current live schema, with migration history reconciled first.
5. Run the Bee verification suite on the exact PR head, review the final diff and mergeability, and verify merged main before updating Completed. Document any installed-plugin deployment separately.

**Boundary:** This document itself changes no SQL, access control, plugin installation, user data, or runtime behavior.
