---
'@pyreon/query': patch
---

fix(query): cancel pending reconnect timer before reconnecting (`useSubscription` + `useSSE`)

Both `useSubscription` (WebSocket) and `useSSE` (EventSource) scheduled a reconnect via `setTimeout` whose handle was only cleared in `close()`. A pending reconnect timer was NOT cleared before `connect()` / `scheduleReconnect()` re-established the connection — so a stale timer fired a spurious extra `connect()` after the socket was already back. Triggers: a reactive `url`/`enabled` change re-running `connect()` while a reconnect was pending; `reconnect()` (manualReconnect) called with a timer pending; or a rapid second close/error overwriting the timer handle and orphaning the first. Each orphan timer also pinned its closure for up to `reconnectDelay * 2^attempts` ms.

Both files now clear the pending timer at the top of `connect()` and before scheduling a new one (`clearReconnect()` helper; `close()` delegates to it). Bisect-verified: with a reconnect pending, calling `reconnect()` then waiting past the delay produces no extra socket (`tests/subscription.test.tsx` — pre-fix 3 sockets, post-fix 2). 152/152 query tests pass.
