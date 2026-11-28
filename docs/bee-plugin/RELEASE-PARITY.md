# Bee private release: source parity and update procedure

## Current verified state — November 28, 2026

The installed private <a href="https://chatgpt.com/plugins/plugins_6aee2379756881918d3fd643ea4fb5dc">Bee plugin</a> is **v0.2.6**, release `pluginrel_6b0a6ea2e5208191873bc55d67de695f`, scope `USER`, discoverability `PRIVATE`. It was updated after guarded merge of [PR #95](https://github.com/goddessdawnie/beehive-game/pull/95), main commit `9d5ddafb65f1b697d6fc24afe414b6f432f35773`. Exact-head [CI #46114631233](https://github.com/goddessdawnie/beehive-game/actions/runs/46114631233) succeeded (Node, disposable PostgreSQL and mocked browser).

**9 of 9** installed plugin files were fetched again and compared byte-for-byte with the exact merged GitHub source. All matched: both manifests, the hidden Supabase App binding, the top-level skill, and five references. `operations.md` now includes current task, schedule and receipt-verification contracts; `sleep.md` includes compact and detailed sleep attribution. The installed plugin is verified for source/release parity. This does not establish real Android/handset receipt or adoption by independently scheduled workers.

## Transport blocker removed

The former v0.2.5 release had an older `operations.md` (5,441 bytes) and `sleep.md` (4,136 bytes). Git source had the fuller references, but the plugin updater requires a **host-uploaded ZIP or tar.gz archive** rather than a Git commit or local path. A locally generated manifest-less ZIP was accepted as a file upload and rejected for its *contents*, proving file-ID transport worked. PR #95 added a supported package artifact to the existing CI; a GitHub connector download produced a file reference, and the Plugin Creator accepted it with an expected-current-release guard. The full release was read back after publication.

For future releases, use this sequence; never assume committing source automatically installs it:

1. Update both plugin manifests to the new semantic version, preserve `.app.json` Supabase App identity and private scope, and pass `tests/bee-plugin-package.test.mjs`. Include any changed skill/reference files in GitHub.
2. Run exact-PR-head CI. The existing workflow uploads a short-lived `bee-plugin-release` artifact from `plugins/bee/` with hidden files included. Inspect the ZIP root for `plugin.json`, `.app.json`, `.codex-plugin/plugin.json` and the complete `skills/beehive/` subtree.
3. Guarded merge to main, confirming the tested head. Download the same successful CI's artifact through the GitHub connector; take its host `file_uri.file_id`.
4. Refresh current installed plugin metadata. Use Plugin Creator `update_plugin` with that file ID and the *observed* `expected_release_id`; do not skip the version guard.
5. Fetch the installed plugin's full file list and content. Compare to the merged commit, check both manifest versions, the App binding, `USER/PRIVATE` audience and expected commands. Only then call the release completed.

## Runtime boundary

The `bee.read` and `bee.command` SQL wrappers remain private, owner-scoped and stable; packaged documentation is not evidence of a database migration. A request receipt proves a committed Bee command, not that current state still matches it after later edits. A queued bell is not handset delivery. Preserve existing scheduled-worker routing and plugin permissions unless separately approved and verified. **Do not replay** production migrations to test a plugin documentation upgrade. No tasks, user rewards, schedules, messages, notifications or SQL/Edge functions were changed by v0.2.6 publication.

## Historical evidence

[Previous v0.2.5 source-gap review](https://github.com/goddessdawnie/beehive-game/blob/2c3b6ee9aad452ea48ec3888ef4ef13f93b025fb/docs/bee-plugin/RELEASE-PARITY.md) remains retrievable from Git history. The current release procedure above supersedes its old “transport unestablished” and “installed unchanged” statements.
