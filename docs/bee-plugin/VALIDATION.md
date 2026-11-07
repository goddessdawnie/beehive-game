# Bee v0.2.1 implementation and validation

## Current checkpoint — 2026-11-07

- GPT-6 installed the existing package privately using direct Plugin Creator upload. Plugin ID `plugins_6aee2379756881918d3fd643ea4fb5dc`, release `pluginrel_6aee2379f9088191a8a71c7a5c41fa7e`. No Sites adapter is needed. Dawn verified Android discovery, loaded instructions and Supabase tool availability in a separate chat. This Work session also loaded the installed skill and successfully ran its read-only Supabase preflight.
- Both backend availability flags remain false. No production migration, deployment or merge. Six captured public function definitions still match production byte-for-byte by MD5 (comparison only, not a security hash). This checks those functions, not all schema/policy drift.
- Refactored the synthetic database setup into a shared fixture; all 20 existing tests pass afterward. Added five native concurrency checks, with explicit lock-wait observation, in `scripts/test-postgres.mjs`. Syntax and refusal without opt-in were checked; native execution is **not yet verified**.
- Only the live Supabase project is available; this executor still has no usable native PostgreSQL runtime. No paid branch or service was created.
- A one-time read-only scheduled compatibility check was created from this Work conversation. Its result is pending; regular Bee schedules are unchanged. Success would verify only this scheduling environment, not the separate Chat Bee configuration.

Earlier checkpoint statements below describe their original date; installation blockers are superseded by this section.


## Implemented on feature/bee-plugin-design (not deployed)

- Private `bee.command` and bounded `bee.read`, using the existing Supabase management connector. Live connection verified as `postgres`; no JWT/session impersonation. Full connector access is unchanged.
- Request receipts committed atomically with each operation. Exact retry returns the original result; reusing a request ID with changed input fails. Per-owner transaction lock serializes new requests. Record locks plus expected timestamps guard edits against stale reads.
- Task create/edit/complete/status/cancel/reopen and constrained intentional deletion; possibility create/edit/archive/restore/activation and constrained deletion. Default rewards match the website (2/5/9/12; unrated 5). Imported rating defaults are preserved on activation.
- Existing task transition implementations moved to one owner-checked core; existing public browser signatures delegate to it. Catalog triggers, ledger, comfort and New York recurrence remain in use. Null status is now rejected explicitly; completion-note changes update their timestamp.
- Timer create/list/read/adjust/cancel; immediate bell and scheduled reminder create/read/reschedule/cancel. Existing tables, worker and cron are reused. Modification requires pending/zero attempts so an already attempted push is never represented as safely recalled.
- Worker claim RPCs recover an expired fifth-attempt lease to failed with an explicit *delivery status unknown* message; no sixth send is attempted. Existing service-only execution grants remain restricted.
- Owner-specific installed-game visibility settings, with browser refresh on load, Play selection and foreground return. Unknown game keys cannot install executable code. Missing settings preserve existing enabled behavior. Scores/claims are untouched.
- Sanitized health, bounded task/catalog/timer/reminder/history/ledger reads and pet state.
- Portable Bee source v0.2.1 with verified Supabase app dependency, availability preflight, retry protocol and operation reference. No new hosted service or costs.

## Verified

`npm ci --ignore-scripts && npm test`: 20 passing tests using PGlite (real PostgreSQL engine compiled to WASM).

Production metadata was read, not mutated. `tests/fixtures/live-contract.json` and `live-policies.json` capture relevant columns, constraints, functions, triggers and policies without user rows or secrets. Test-only auth, pet and subscription scaffolding supplies the required dependencies; this is not a full Supabase replica.

Coverage includes exact retry/conflicting retry, failed-write rollback, possibility defaults and imported ratings, difficulty rewards, one ledger entry, history counts/notes, undo/cancel, daily and weekly DST boundaries, recurrence successor deduplication, stale writes, invalid owner links/status/fields, timer limits and delivery races, reminder updates, safe deletion, browser-RPC authorization, game allowlist and worker final-lease recovery.

`npm run test:browser`: passed at 393×851 and 1280×900 with a mocked Supabase client and all external requests blocked. Tests visibility toggles, active-panel closure, refresh failure, the browser timer cancellation race and persistent warning, and absence of JS errors. This exercises the full page but **does not** test Supabase sign-in, PostgREST, real push, Android ChatGPT, or scheduled ChatGPT tasks.

The runtime lacked a browser and normal Playwright browser downloads were corrupt. Browser tests ran with Chromium 153 from an npm-distributed binary, using `BEE_BROWSER_EXECUTABLE`. Normal setup: `npx playwright install chromium`. An existing compatible Chromium can be selected with `BEE_BROWSER_EXECUTABLE=/absolute/path` (and its required shared-library environment).

Plugin JSON, YAML, included reference paths and archive contents were checked. An independent offline request exercise confirmed exact retry handling; two ambiguities about activation timestamps and Anytime scheduling were clarified. This is an instruction check, not installation verification.

## Not verified / release blockers

1. A real multi-connection Postgres integration run: PGlite runs one connection. The transaction and row-lock logic has sequential coverage, not a genuine concurrent browser/worker/Bee stress test.
2. Full Supabase staging integration: migration with the current production schema, RLS/privileges, browser sign-in and actual worker. No paid Supabase branch was created. No schema or live user data was changed.
3. Private-plugin installation is resolved; reuse the installed plugin ID above. Do not create another plugin.
4. Android discovery/instructions/tool availability are verified by Dawn. Actual backend workflows remain blocked on deployment. Separate Chat/Work scheduled compatibility and web Chat acceptance still need evidence; a read-only Work-origin test is pending. Existing scheduled prompts were not changed.
5. Real notification delivery/phone receipt. No live test bell was sent. Queue acceptance and push acceptance cannot prove receipt.
6. OAuth MCP adapter: deferred as the saved architecture specifies, until its cross-surface value is established. No unauthenticated write endpoint was published.

## Next release steps (do not skip)

1. Re-read live function/schema metadata and compare against the fixtures; account for any drift. Keep main unchanged until the release gate passes.
2. Run this migration in a disposable PostgreSQL/Supabase test environment, with no production cron/network credentials. Test simultaneous retry IDs, simultaneous task completion through both wrappers, and worker claiming against cancellation. Do not buy branching capacity without Dawn's approval.
3. Run browser regression with authenticated test users and RLS, plus security advisors. Test the real worker against a test subscription; verify actual receipt separately.
4. Reuse the installed private plugin. Complete web and scheduled compatibility checks, then one reversible task workflow after the backend is safely deployed. Do not replace existing routing until all pass.
5. Apply the reviewed migration transactionally, verify functions/ACLs and owner reads, then merge/deploy the browser change. Keep the PR draft until release blockers are resolved. The registry code retains old games if the new table is absent; that fallback is not a substitute for the migration.
6. If reverting, restore the original five public task/worker/timer-cancel function definitions from the captured fixture and revert the website commit. Keep request receipts and game settings for diagnosis; do not drop them casually or delete reward/history tables. Test rollback before production rollout.

## Deliberate boundaries

- `task.status(open)` reopens an occurrence; it does not implement the website's separate restart-series action. Use that UI for restarting a stopped recurring series.
- Game management enables/disables installed games. Installing new executable games remains a reviewed code change; historical game claims are not a registry.
- Hard deletion is deliberately constrained to cancelled, nonrecurring tasks without history and inactive unreferenced possibilities. Other deletion requires explicit impact review through the retained full Supabase access.
- Request receipts are retained to preserve retry safety. No automatic purge was introduced. Receipts include task content, stay in the private schema, and should be considered in future retention/export decisions.


## Resumed hardening checkpoint

After the usage interruption, verified saved GitHub commit `95d8259` against the local tested tree and recorded the recovery checkpoint in Notion before further work.

- Fixed the browser's older timer-cancel RPC so it cannot cancel a sending or previously attempted timer. The timer UI disables unsafe cancellation and preserves the race warning across countdown repaints.
- Added read-only request receipt lookup: `bee.read(owner,'request','',request_uuid)`. This supports checking an uncertain result without re-executing an operation. A missing receipt can still mean an in-flight transaction; exact replay remains the recovery mechanism.
- Added and passed tests for browser cancellation ownership and delivery races, private receipt/game-setting access, request lookup owner isolation, and restoring the five original public RPC definitions without deleting receipts. Rollback verification runs inside an isolated transaction and restores the migrated test state afterward.
- Re-ran the expanded phone/desktop browser checks successfully with a mocked backend. The updated source has 20 passing tests; no real phone or scheduled-task claim is implied.
- Native concurrency remains blocked: no PostgreSQL/Docker runtime is available, this executor maps only UID 0, and a test user-namespace mapping failed with `Operation not permitted`. Installing PostgreSQL alone would not supply the non-root execution context it requires. No paid branch, production substitute or privilege escalation was attempted.
- Account-plugin creation/upload tooling is still unavailable after rediscovery. The package remains ready for installation in a tool-enabled session, not installed.

Resume from the latest head of the existing draft PR, not the older checkpoint commit. Keep using the validation gates above. This is a release-environment/tooling boundary, not a request to restart the design or increase model effort.

## Native concurrency runner

Run `npm ci --ignore-scripts` in the repository on a machine with a **disposable local PostgreSQL 17 cluster**. This does not require any paid Supabase resource. Do not point it at a production tunnel. A local Docker example (requires Docker already installed):

```sh
docker run --rm -d --name bee-postgres-test -e POSTGRES_PASSWORD=bee-local-test -p 127.0.0.1:55432:5432 postgres:17
docker exec bee-postgres-test pg_isready -U postgres
BEE_ALLOW_DISPOSABLE_CLUSTER=yes BEE_TEST_CLUSTER_URL=postgresql://postgres:bee-local-test@127.0.0.1:55432/postgres npm run test:postgres
docker stop bee-postgres-test
```

Wait for `pg_isready` to report accepting connections before the test command. The Docker recipe has not been executed in this workspace. The password above is for the disposable local container only. No production credentials are needed.

The runner creates a uniquely named empty database, loads the same captured contract and synthetic users as the PGlite suite, applies the development migration, opens three independent connections, and exercises:

1. Exact retry while its original transaction remains uncommitted.
2. Conflicting edits based on the same record version.
3. Authenticated browser completion versus Bee completion, checking single reward and successor.
4. Browser cancellation holding the row while the worker attempts to claim it.
5. Worker claim holding the row while the browser attempts cancellation.

Cleanup closes its sessions, drops only the database it created, and drops only missing test roles it created. Existing cluster roles are preserved. Use a disposable cluster nevertheless; a process kill can bypass cleanup. It rejects nonlocal hosts, URL query overrides, missing explicit opt-in and PostgreSQL majors other than 17. Native success is a concurrency gate, not full Supabase/PostgREST/auth/push acceptance.
