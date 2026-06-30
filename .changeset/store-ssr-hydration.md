---
"@pyreon/store": minor
---

Add SSR store hydration — `dehydrateStores(filter?)` (server) + `hydrateStores(data)` (client)

The `dehydrate → inline-script → hydrate` handshake (the TanStack-Query / loader-data
pattern, for `@pyreon/store`). `dehydrateStores()` snapshots every active per-request
store's signal `.state` into a JSON-serializable `Record<id, state>` after render;
`hydrateStores(data)` seeds the stores back on the client before mount — lazily (a
store seeds on first use) and as a boot-time one-shot.

This makes cross-island shared state production-complete: two islands that both import
the same store already share one instance on the client (the registry is a module
singleton), so a signal write in one is seen by the other with zero prop-drilling — the
only missing piece was hydrating that shared store once with server state instead of
per-island. These two helpers close it.
