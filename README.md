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

The app currently has no automated integration tests; database probes, saved-state checks and signed-in browser regression tests are complementary, not interchangeable.

## Bee plugin development

Private plugin source: `plugins/bee/`. Backend migration and tests are staged on the development branch; see [validation and release gates](docs/bee-plugin/VALIDATION.md). Run `npm ci --ignore-scripts && npm test`; browser smoke checks use `npm run test:browser` with Playwright Chromium installed. Nothing in the draft PR has been deployed.
