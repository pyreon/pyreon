# Chat (audit example)

Third user-shape audit (T4.3). Real-time chat — channels + live SSE
message stream + virtualized list + optimistic send. Following
hn-clone (T4.1, read-heavy feed) and kanban (T4.2, write-heavy CRUD)
to surface the streaming-primitive surface area no prior audit
exercised.

The audit surfaced **2 walls** (W24-W25); the W24 framework bug is
fixed in this PR. See [`WALLS.md`](./WALLS.md) for the full catalog.

## What works

- Channel rail with 5 default channels — `/channels/[id]` routing
- Per-channel history fetch via `@pyreon/query` `useQuery`
- Live message stream via `useSSE` against a dev backend (~60-line
  `configureServer` middleware in `vite.config.ts`)
- Virtualized message list via `@pyreon/virtual` (60+ history +
  appending live + auto-scroll-to-bottom)
- Optimistic send + dedupe on SSE echo
- Reactive channel switch closes old SSE + opens new (lifecycle test)
- URL-synced search filter (`?q=`)
- Cross-tab persistence — reload returns to last-visited channel
- Connection state toasts (`Reconnected` / `Connection lost`)
- Production build (`bun run build`) — the W19 SPA-skip fix from PR
  \#982 unblocks SPA-mode builds

## Packages exercised

- `@pyreon/query` — `useQuery` (history) + `useMutation` (send) + `useSSE` (stream)
- `@pyreon/virtual` — virtualized message list (first real-app exercise)
- `@pyreon/state-tree` — chainable `model().actions(...)` shape
- `@pyreon/router` — `/channels/[id]` route + reactive params
- `@pyreon/storage` (via `localStorage` directly) — last-visited channel
- `@pyreon/url-state` — search filter
- `@pyreon/toast` — connection state notifications
- `@pyreon/zero` — SPA mode with custom `configureServer` API backend

## Run

```bash
cd examples/chat
bun run dev
# open http://localhost:3001 → redirects to /channels/general
```

## Architecture notes

- **Messages live in queries, NOT state-tree** — high-frequency SSE
  pushes would re-stress the W23 shape we just fixed if state-tree
  held them. State-tree only holds what survives across remounts
  (channel list + last-visited).
- **SSE backend is dev-only** — `configureServer` middleware in
  `vite.config.ts` emits canned messages every 2-4s and accepts
  POST. No external service, runs entirely from `bun run dev`.
- **Plugin order doesn't matter post-W24-fix** — Zero's dev 404
  handler now skips `/api/*` so user plugins registering their own
  dev API middleware aren't shadowed regardless of order.
