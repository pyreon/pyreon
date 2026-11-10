---
'@pyreon/sync': minor
---

The `createSyncServer` relay now closes a browser WebSocket upgrade with 4403, before `authorize` runs, when its `Origin` is neither same-origin with the upgrade's `Host` nor listed in the new `allowedOrigins` option (array of origins or a predicate). Browsers attach cookies to an upgrade that any site opens, so cookie-based `authorize` was open to cross-site WebSocket hijacking. Upgrades without an `Origin` header (Node, Bun, native) are unaffected. `AuthorizeContext` gains `origin`. Breaking for apps served from a different origin than the relay, or behind a proxy that rewrites `Host`: list the app's origin in `allowedOrigins`.
