# Beehive maintainer map

This is a small static GitHub Pages application, not a framework project. Keep the [Notion Agent Runbook](https://app.notion.com/p/414dfa4a1fd08101bdcddde6a462e7a2) as the authority for builder leases, approval, deployment gates and checkpoints. Read the [active roadmap](https://app.notion.com/p/40edfa4a1fd081f3a906dfff4c6ae223) before choosing work. Do not duplicate Work Bee operations.

## Find the code

| Area | Primary entry points |
| --- | --- |
| Browser shell, Three Things UI, chat, timers and room | `index.html` (large inline JS; extraction is incremental) |
| Task tab membership, counts, search/context filters, and ordering | `js/task-selection.js` (pure native module); `index.html` retains fetch, rendering, and refresh wiring |
| Sleep history browser UI | `js/sleep-ui.js` (native module, injected authenticated RPC and DOM access); tab activation remains in `index.html` |
| Visual styles, theme and estate layering | `css/beehive.css`; asset URLs are relative to `css/` |
| Play game registry | `js/game-registry.js` |
| Scene images and generated catalog | `assets/`, `scripts/build-scene-catalog.mjs` |
| PWA, offline cache, install | `sw.js`, `manifest.webmanifest`, `icons/` |
| Database schema, RPCs, rewards and recurrence | `supabase/migrations/`; review deployed schema before applying |
| Kae and Three Things generation | `supabase/functions/kae-chat/`, `supabase/functions/three-things/` and related functions |
| Private @Bee integration | `plugins/bee/`; reconcile installed release before changing |
| Browser smoke and test server | `scripts/browser-smoke.cjs` |
| Source and database regressions | `tests/*.test.mjs`, `scripts/test-postgres.mjs` |
| PR CI and Pages publishing | `.github/workflows/bee-verification.yml` and Pages workflow |

## Test and release

Run `npm ci --ignore-scripts && npm test`. For mocked phone/desktop checks run `npm run test:browser` (Playwright Chromium required). Run `npm run test:postgres` only against the documented disposable test cluster, never casually against live user data. CI runs all three on applicable PRs. `npm test` includes scene catalog consistency checks.

GitHub Pages serves from the project subpath `/beehive-game/`. Test relative CSS, JS, image and service-worker URLs under that subpath, not just from site root. Preserve the prepaint theme initialization, asset layering, PWA cache update behavior, authenticated owner isolation and reward/recurrence RPC semantics. Source checks and mocked browsers do not replace Android acceptance.

Use a short scoped lease and isolated PR. Verify exact PR-head CI before merge, merge with expected-head guard, then verify matching-commit Pages deployment and live assets before marking a runtime feature Completed. Documentation-only PRs may not trigger the source CI path filter; record that exception honestly and review the full diff. Never move unfinished roadmap items to Completed merely because one stage shipped.
