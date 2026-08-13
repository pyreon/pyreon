---
"@pyreon/sync": minor
---

refactor(sync): `ws` is now an OPTIONAL peer dependency — the client path is dependency-free

`ws` was a hard runtime dependency, but it is used ONLY by the server-only relay (`@pyreon/sync/server`, `WebSocketServer`). The **client** sync transport (`connectViaWebSocket`) already uses `globalThis.WebSocket` (browsers + Node 21+) with an injectable `WebSocketImpl`, and `useWebSocket` already lowers to the native `PyreonWebSocket` on iOS/Android — so a client consumer never needs `ws`. Making it an optional peer means the client (and native) dependency graph is `@pyreon/*` + platform WebSocket only, with no external `ws` install.

**Action for `@pyreon/sync/server` (relay) users**: add `ws` to your own dependencies. Client-only / native users need no change. (`ws` remains in `@pyreon/sync`'s devDependencies for its own relay tests.)
