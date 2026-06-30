---
"@pyreon/store": minor
"@pyreon/server": minor
"@pyreon/zero": minor
---

SSR store hydration — `dehydrateStores` / `hydrateStores` + framework auto-wiring

The `dehydrate → inline-script → hydrate` handshake (the TanStack-Query / loader-data
pattern, for `@pyreon/store`), wired into the SSR pipeline:

- **@pyreon/store**: `dehydrateStores(filter?)` (server) snapshots every active
  per-request store's signal `.state` into a JSON-serializable `Record<id, state>`;
  `hydrateStores(data)` (client) seeds the stores back before mount — lazily and as a
  boot-time one-shot. Registers a decoupled `globalThis` bridge on import so the
  framework can drive the handshake with no hard dependency (the styler-flush pattern).
- **@pyreon/server**: `renderPage` reads the bridge inside the request context and
  appends `<script>window.__PYREON_STORE_STATE__=…</script>` (same safe serializer as
  loader data) — so handler / SSG / dev all inject it with no caller change.
- **@pyreon/zero** + **@pyreon/server** client entries: seed stores from the snapshot
  before mount.

This makes cross-island shared state production-complete: two islands that both import
the same store already share one instance on the client (the registry is a module
singleton), so a signal write in one is seen by the other with zero prop-drilling — the
only missing piece was hydrating that shared store once with server state.
