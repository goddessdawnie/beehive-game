

## Dragon conversation history (read-only)

Use `bee.read(owner,'conversations')` to retrieve the preceding 24 hours of Dawn and Kae's conversation, including both `user` and `mochi` roles. Use this interface rather than querying `public.mochi_messages` directly during normal operation. This is read-only; no conversation-writing operation is exposed.

- Empty query: preceding 24 hours, not calendar-day boundaries.
- `since:48h`, `since:7d` (or any positive integer up to four digits with `h`/`d`): alternate rolling windows.
- `all`: entire history, paginated.
- Optional ID: one message by UUID, subject to the selected time window.
- `limit` and `offset` paginate newest-first *selection*, but each returned page is ordered oldest-to-newest for coherent reading. Default page size 25, maximum 100. To read a whole window, continue with offset 25, 50, etc. (or the chosen page size) until a page has fewer than `limit` items. For full history, use `all` and paginate until exhausted.
- Returned fields: `id`, `role`, `content`, `source`, `created_at`. Messages are owner-scoped and include both sides of the exchange. Twenty messages usually represent ten exchanges, but do not assume perfect pairing.
- Do not mistake page-level chronological ordering for global chronological ordering across pages. For a single coherent long transcript, fetch all pages and sort them by `created_at` ascending, then `id` ascending.

Examples:
```sql
select bee.read('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b','conversations');
select bee.read('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b','conversations','since:7d',null,100,0);
select bee.read('2ba0f2a9-8af0-41a1-9bc6-b7448bd0bc9b','conversations','all',null,100,100);
```
