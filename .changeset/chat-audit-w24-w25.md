---
'@pyreon/zero': patch
---

Chat audit (T4.3) — fix W24 (dev 404 handler shadowed user `/api/*`
middleware) + document W25 (passing `computed<T>` as a child prop).

**W24**: `@pyreon/zero`'s dev 404 handler at
`packages/zero/zero/src/vite-plugin.ts:364` caught BOTH HTML requests
AND wildcard-Accept requests (`*/*`) for any unmatched path, including
`/api/*`. When a user plugin registered its own dev API middleware
(via `configureServer`) AFTER zero in the plugin array — the typical
order — Zero's 404 handler ran first (Vite registers middlewares in
plugin-array order) and shadowed the user's handler for requests sent
with `Accept: */*` (curl, `fetch()` default). The user's middleware
NEVER ran for those paths.

Fix: the 404 handler now skips paths starting with `/api/`, so user
middleware registered after Zero is no longer shadowed regardless of
plugin order. The existing dev API-route dispatcher at line ~277
already handles fs-router `src/routes/api/*` paths; anything else
under `/api/*` falls through to user middleware OR to Vite's terminal
404 — both correct outcomes. `enforce: 'pre'` doesn't help because
`configureServer` hooks fire in plugin-array order independent of
`enforce`.

Bisect-verified: revert the path-skip → `examples/chat`'s
`/api/history/general` returns 404 (smoke fails with `messages
visible: 0`); restored → 200 + history loads + 60 messages render.
The chat audit example is the canonical test case (no prior audit
hit this — only the streaming-primitive surface area surfaces it).

**W25** is doc-only — when passing a `computed<T>()` declaration to
a child as a JSX prop, the compiler auto-calls the variable
(yielding the value, not an accessor), so the child's type signature
should be the value type `T` not `() => T`. Documented in
`examples/chat/WALLS.md` with the canonical call-site shape
(`<Comp prop={visible()} />`).
