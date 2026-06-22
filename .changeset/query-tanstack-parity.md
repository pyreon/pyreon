---
'@pyreon/query': minor
---

Close the TanStack Query v5 core API parity gaps. `@pyreon/query` now mirrors the full `@tanstack/query-core` surface plus the TanStack hook/component set:

- **New hooks**: `useMutationState` (reactive read of the MutationCache for global in-flight-mutation UI), `usePrefetchQuery` / `usePrefetchInfiniteQuery` (cache-guarded warm-up in component setup), `useSuspenseQueries` (aggregate query-like + a `data` array, passable straight to `QuerySuspense`).
- **New component**: `HydrationBoundary` — hydrates a server-dehydrated cache into the nearest `QueryClient` synchronously before children render (the SSR companion to the `dehydrate`/`hydrate` function re-exports; `nativeCompat`-marked).
- **Expanded core re-exports** (identity-equal to query-core): `skipToken`, all four observers (`QueryObserver`, `InfiniteQueryObserver`, `MutationObserver`, `QueriesObserver`), `focusManager` / `onlineManager` / `notifyManager`, `matchQuery` / `matchMutation`, `replaceEqualDeep`, `isServer`, plus the `Mutation` / `MutationState` / `QueryState` / `HydrateOptions` / `InfiniteData` / `DefaultError` / `FetchInfiniteQueryOptions` types.

Out of scope (separate TanStack ecosystem packages, not part of query-core): persistence (`@tanstack/query-persist-client-core`) and devtools (`@tanstack/react-query-devtools`). `streamedQuery` is not re-exported (absent from the pinned query-core@5.101 surface).
