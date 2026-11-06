# Bee v0.2 implementation and validation — 2026-11-06

## Implemented on feature/bee-plugin-design (not deployed)

- Private `bee.command` and bounded `bee.read`, using the existing Supabase management connector. Live connection verified as `postgres`; no JWT/session impersonation. Full connector access is unchanged.
- Request receipts committed atomically with each operation. Exact retry returns the original result; reusing a request ID with changed input fails. Per-owner transaction lock serializes new requests. Record locks plus expected timestamps guard edits against stale reads.
- Task create/edit/complete/status/cancel/reopen and constrained intentional deletion; possibility create/edit/archive/restore/activation and constrained deletion. Default rewards match the website (2/5/9/12; unrated 5). Imported rating defaults are preserved on activation.
- Existing task transition implementations moved to one owner-checked core; existing public browser signatures delegate to it. Catalog triggers, ledger, comfort and New York recurrence remain in use. Null status is now rejected explicitly; completion-note changes update their timestamp.
- Timer create/list/read/adjust/cancel; immediate bell and scheduled reminder create/read/reschedule/cancel. Existing tables, worker and cron are reused. Modification requires pending/zero attempts so an already attempted push is never represented as safely recalled.
- Worker claim RPCs recover an expired fifth-attempt lease to failed with an explicit *delivery status unknown* message; no sixth send is attempted. Existing service-only execution grants remain restricted.
- Owner-specific installed-game visibility settings, with browser refresh on load, Play selection and foreground return. Unknown game keys cannot install executable code. Missing settings preserve existing enabled behavior. Scores/claims are untouched.
- Sanitized health, bounded task/catalog/timer/reminder/history/ledger reads and pet state.
- Portable Bee source v0.2.0 with verified Supabase app dependency, availability preflight, retry protocol and operation reference. No new hosted service or costs.

## Verified

`npm ci --ignore-scripts && npm test`: 16 passing tests using PGlite (real PostgreSQL engine compiled to WASM).

Production metadata was read, not mutated. `tests/fixtures/live-contract.json` and `live-policies.json` capture relevant columns, constraints, functions, triggers and policies without user rows or secrets. Test-only auth, pet and subscription scaffolding supplies the required dependencies; this is not a full Supabase replica.

Coverage includes exact retry/conflicting retry, failed-write rollback, possibility defaults and imported ratings, difficulty rewards, one ledger entry, history counts/notes, undo/cancel, daily and weekly DST boundaries, recurrence successor deduplication, stale writes, invalid owner links/status/fields, timer limits and delivery races, reminder updates, safe deletion, browser-RPC authorization, game allowlist and worker final-lease recovery.

`npm run test:browser`: passed at 393×851 and 1280×900 with a mocked Supabase client and all external requests blocked. Tests visibility toggles, active-panel closure, refresh failure, and absence of JS errors. This exercises the full page but **does not** test Supabase sign-in, PostgREST, real push, Android ChatGPT, or scheduled ChatGPT tasks.

The runtime lacked a browser and normal Playwright browser downloads were corrupt. Browser tests ran with Chromium 153 from an npm-distributed binary, using `BEE_BROWSER_EXECUTABLE`. Normal setup: `npx playwright install chromium`. An existing compatible Chromium can be selected with `BEE_BROWSER_EXECUTABLE=/absolute/path` (and its required shared-library environment).

Plugin JSON, YAML, included reference paths and archive contents were checked. An independent offline request exercise confirmed exact retry handling; two ambiguities about activation timestamps and Anytime scheduling were clarified. This is an instruction check, not installation verification.

## Not verified / release blockers

1. A real multi-connection Postgres integration run: PGlite runs one connection. The transaction and row-lock logic has sequential coverage, not a genuine concurrent browser/worker/Bee stress test.
2. Full Supabase staging integration: migration with the current production schema, RLS/privileges, browser sign-in and actual worker. No paid Supabase branch was created. No schema or live user data was changed.
3. Private-plugin installation: `create_plugin`/update-upload tools are not exposed in this session. Source/package validation is not account installation; no claim that `@bee` is selectable yet.
4. Android ChatGPT, web ChatGPT and scheduled Bee execution with the installed plugin and connected Supabase. Existing scheduled prompts were not changed.
5. Real notification delivery/phone receipt. No live test bell was sent. Queue acceptance and push acceptance cannot prove receipt.
6. OAuth MCP adapter: deferred as the saved architecture specifies, until its cross-surface value is established. No unauthenticated write endpoint was published.

## Next release steps (do not skip)

1. Re-read live function/schema metadata and compare against the fixtures; account for any drift. Keep main unchanged until the release gate passes.
2. Run this migration in a disposable PostgreSQL/Supabase test environment, with no production cron/network credentials. Test simultaneous retry IDs, simultaneous task completion through both wrappers, and worker claiming against cancellation. Do not buy branching capacity without Dawn's approval.
3. Run browser regression with authenticated test users and RLS, plus security advisors. Test the real worker against a test subscription; verify actual receipt separately.
4. Install the private plugin from `plugins/bee/` when the account-upload tool is available. Verify the skill and Supabase dependency appear. Test read-only use on Android/web, then one reversible task workflow and a scheduled Bee run. Do not replace existing routing until all pass.
5. Apply the reviewed migration transactionally, verify functions/ACLs and owner reads, then merge/deploy the browser change. Keep the PR draft until release blockers are resolved. The registry code retains old games if the new table is absent; that fallback is not a substitute for the migration.
6. If reverting, restore the original four public task/worker function definitions from the captured fixture and revert the website commit. Keep request receipts and game settings for diagnosis; do not drop them casually or delete reward/history tables. Test rollback before production rollout.

## Deliberate boundaries

- `task.status(open)` reopens an occurrence; it does not implement the website's separate restart-series action. Use that UI for restarting a stopped recurring series.
- Game management enables/disables installed games. Installing new executable games remains a reviewed code change; historical game claims are not a registry.
- Hard deletion is deliberately constrained to cancelled, nonrecurring tasks without history and inactive unreferenced possibilities. Other deletion requires explicit impact review through the retained full Supabase access.
- Request receipts are retained to preserve retry safety. No automatic purge was introduced. Receipts include task content, stay in the private schema, and should be considered in future retention/export decisions.
