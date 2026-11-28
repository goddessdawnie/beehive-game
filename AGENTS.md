# Beehive maintainer map

This is a small static GitHub Pages application, not a framework project. Keep the [Notion Agent Runbook](https://app.notion.com/p/414dfa4a1fd08101bdcddde6a462e7a2) as the authority for builder leases, approval, deployment gates and checkpoints. Read the [active roadmap](https://app.notion.com/p/40edfa4a1fd081f3a906dfff4c6ae223) before choosing work. Do not duplicate Work Bee operations.

## Find the code

| Area | Primary entry points |
| --- | --- |
| Browser shell, timers, room and top-level controllers | `index.html` (large inline JS; extraction is incremental) |
| Three Things generation, reaction and task-action UI | `js/three-things-ui.js` (native browser controller; authenticated client injected) |
| Task tab membership, counts, search/context filters, and ordering | `js/task-selection.js` (pure native module); `index.html` retains DOM rendering |
| Auth-safe task/estate refresh and complete browser task history | `js/task-refresh.js` coordinates scoped/full requests and owns one projected 18-field, exact-count keyset-paged task reader; both `index.html` paths reuse it. Complete local history/search survives beyond 1,000 records. Reward/catalog/explicit refreshes remain full |
| Sleep history browser UI | `js/sleep-ui.js` (native module, injected authenticated RPC and DOM access); tab activation remains in `index.html` |
| Visual styles, theme and estate layering | `css/beehive.css`; asset URLs are relative to `css/` |
| Play game registry | `js/game-registry.js` |
| Scene images and generated catalog | `assets/`, `scripts/build-scene-catalog.mjs` |
| PWA, offline cache, install | `sw.js`, `manifest.webmanifest`, `icons/` |
| Database schema, RPCs, rewards and recurrence | `supabase/migrations/`; owner-authenticated `public.reward_ledger_totals()` replaces browser ledger-row transfer (no stored balance); purchase/care still validate against the raw ledger |
| Kae chat, context and ambient | `supabase/functions/kae-chat/` and `kae-ambient/`; 48h owner-authenticated `public.kae_recent_task_activity()` remains authoritative; Kae history has an age+character budget and duplicate routine events are collapsed without changing stored records. Existing `mochi_context_snapshot()` excludes unused tasks; one `kae_ambient_task_summary()` RPC replaces 100-row ambient history read |
| Private @Bee integration | `plugins/bee/`; see [source/release parity](docs/bee-plugin/RELEASE-PARITY.md) before package edits; source commits do not install the plugin |
| Incremental task discovery for Bees | `bee.read_task_workset_20261127` in migrations; [piloting and cursor contract](docs/bee-task-workset-incremental.md), not a scheduled-worker routing change |
| Browser smoke and test server | `scripts/browser-smoke.cjs` |
| Source and database regressions | `tests/*.test.mjs`, `scripts/test-postgres.mjs` |
| PR CI and Pages publishing | `.github/workflows/bee-verification.yml` and Pages workflow |

## Test and release

Run `npm ci --ignore-scripts && npm test`. For mocked phone/desktop checks run `npm run test:browser` (Playwright Chromium required). Run `npm run test:postgres` only against the documented disposable test cluster, never casually against live user data. CI runs all three on applicable PRs. `npm test` includes scene catalog consistency checks.

GitHub Pages serves from the project subpath `/beehive-game/`. `tests/pages-project-path.test.mjs` resolves actual HTML links, native module imports, CSS artwork URLs, PWA icons and notification paths against that subpath and checks asset-only CI triggers; run `npm test` after editing any of these. Do not test only from site root. Preserve the prepaint theme initialization, asset layering, PWA cache update behavior, authenticated owner isolation and reward/recurrence RPC semantics. Source checks and mocked browsers do not replace Android acceptance.

Use a short scoped lease and isolated PR. Verify exact PR-head CI before merge, merge with expected-head guard, then verify matching-commit Pages deployment and live assets before marking a runtime feature Completed. Documentation-only PRs may not trigger the source CI path filter; record that exception honestly and review the full diff. Never move unfinished roadmap items to Completed merely because one stage shipped.
