# Beehive

Private, mobile-friendly task-and-companion game featuring Kae, a fictional dragon. Live site: https://goddessdawnie.github.io/beehive-game/

## Source of truth

- **GitHub Pages:** `index.html` is the complete browser interface. No build system or framework.
- **Supabase:** persistent user/game state, authenticated database RPCs and DeepSeek-backed Edge Functions.
- **Notion:** operating instructions for the existing scheduled Chat Bee and Work Bee passes. Notion is *not* a second task database.
- **DeepSeek:** generates dialogue and optional Three Things suggestions. The LLM has no direct database write tools; server code decides what is read or saved.

## Important data paths

- Tasks: `tasks` → authenticated `complete_task_with_notes` / `set_task_status` → `reward_ledger` and recurring task handling.
- Catalog: `activity_catalog`, `activity_log`; Three Things catalog matches retain `activity_id` on the resulting task.
- Kae: `character_profiles.character_card` is his voice/personality source. `kae-chat` receives selected estate facts and conversation history; `kae-ambient` produces a brief, independent observation. `pet_state` holds comfort.
- Treasury: `reward_shop`, `kae_inventory`, `reward_requests`; `purchase_kae_reward` performs an atomic purchase.
- Play: `three-things` Edge Function creates optional suggestions in `three_things`. `wordle_answers` is populated by the existing 8 AM Bee verification pass. `claim_daily_game` awards two coins once per game per New York calendar day, tracked in `daily_game_claims`.

Task and gift actions improve Kae's comfort; normal time passage reduces it. Comfort bands inform his circumstances but do not dictate his fictional reactions. Ordinary Three Things completions receive task rewards, not additional play-game coins.

## Maintenance boundaries

Use Supabase RPCs for transitions with reward, inventory or recurrence side effects. Do not update task status directly without preserving the same effects. Keep Kae's character card authoritative and his supporting prompts small. Preserve the difference between deployed features and future game ideas; Installed game keys in the current code are Wordle, Sudoku, 2048 and Wumpus, plus Three Things.

The repository includes automated database/regression tests, native PostgreSQL overlap and authenticated HTTP checks, and mocked mobile/desktop browser smoke tests. Real signed-in Android acceptance remains complementary to CI.

## Bee plugin development

The private **Bee** plugin source is in `plugins/bee/`. Its backend functions `bee.read` and `bee.command` and corresponding website compatibility changes were deployed, tested and merged in [PR #1](https://github.com/goddessdawnie/beehive-game/pull/1). The private plugin is installed in the user's account; do not create another plugin for routine updates. See [Bee validation and compatibility notes](docs/bee-plugin/VALIDATION.md) and the Notion roadmap for current status. Future changes must start from current `main` and preserve shared task transition/rewards, recurrence, timers and game registry behavior.

Run `npm ci --ignore-scripts && npm test` for standard regressions, `npm run test:browser` with Playwright Chromium for mocked phone/desktop checks, and `npm run test:postgres` only using its documented isolated test environment. These checks are also run in GitHub Actions on pull requests.
