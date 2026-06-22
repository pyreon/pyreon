---
'@pyreon/query': minor
---

Add the two remaining TanStack Query ecosystem surfaces — **devtools** and **offline persistence** — as subpath entry points of `@pyreon/query` (no new packages). Both are faithful adapters over TanStack's framework-agnostic engines, not from-scratch builds.

**`@pyreon/query/devtools`** — `QueryDevtools`, a thin `onMount` shim over `@tanstack/query-devtools`'s `TanstackQueryDevtools` engine (the SAME panel React/Solid/Vue ship). Resolves the client from context or a `client` prop, mounts the engine into a host element, tears down on unmount. Dev-only subpath so the engine tree-shakes out of production; gate render on `import.meta.env.DEV`.

**`@pyreon/query/persist`** — `PersistQueryClientProvider` (drop-in for `QueryClientProvider` that restores the cache from a persister on mount + persists on change), plus identity re-exports of TanStack's framework-agnostic persist engine (`persistQueryClient` / `persistQueryClientRestore` / `persistQueryClientSave` / `persistQueryClientSubscribe` / `removeOldestQuery`) and the storage persisters (`createSyncStoragePersister`, `createAsyncStoragePersister`).

**`useIsRestoring()` + `IsRestoringProvider`** (new, exported from the main entry) — reactive restore-flag surface. All six query-reading hooks (`useQuery` / `useInfiniteQuery` / `useQueries` / the three suspense variants) now **defer their first fetch until restoration completes**, so a restored cache is never clobbered by a redundant network request. With no `<PersistQueryClientProvider>` mounted, `isRestoring` is always false and the hooks subscribe synchronously — byte-equivalent to the previous behavior (SSR unaffected).

The persist/devtools deps are subpath-only (tree-shaken from the main bundle). A single `@tanstack/query-core@5.101.0` is pinned tree-wide via root `overrides` so persist (which pins 5.101.0), devtools, and the adapter share one query-core type.
