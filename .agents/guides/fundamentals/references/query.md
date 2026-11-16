# @pyreon/query

- TanStack Query adapter: `useQuery`, `useMutation`, `useInfiniteQuery`, `useQueries`, `useSuspenseQuery` and the rest; `/persist` and `/devtools` subpaths.
- Pass `useQuery` options as a function (`useQuery(() => ({ queryKey: [id()], … }))`) so `queryKey` can read signals and refetch reactively. `useMutation` takes a plain object.
- `defineQueries({ … })` declares named parallel queries.
- Results are fine-grained per-field signals, created lazily behind property getters.
- Type helpers `QueryData`/`QueryError` unwrap the result bags.
- Re-exports query-core, pinned repo-wide through `overrides`.
- Native: `PyreonQueryCache` (Swift + Kotlin) is the query client. Keys are the colon-joined web keys (`['todo', 5]` → `todo:5`), and a query is LIVE once `run` registered its request. The live registry is a leak surface: Swift holds weak refs and unregisters in `deinit`; Kotlin removes by identity in `RememberObserver.onForgotten` / `onAbandoned`, which works only because the emit `remember`s the `PyreonQuery` itself. `invalidateQueries` marks entries stale (kept and served) rather than dropping them. Both rules have cleanup tests in `native/tests`.
- Native client calls: `useQueryClient()` / `new QueryClient()` bind `PyreonQueryCache`; `invalidateQueries({ queryKey, exact })` and `useMutation({ invalidates })` lower (`native-plugin/client.ts`). The colon-join is lossy, so a part containing `:`, a non-scalar part, and a key starting with an HTTP method (endpoint queries are keyed natively by `METHOD:url`, not the web's `[method, path, …]`) MUST be refused by name — never lowered to a different set of queries.
- Native errors: an endpoint request's middleware list always starts with `throwHttpErrors` (prepended by `@pyreon/http`'s `middlewareExpr`), which throws the web's `HttpError` message. A 204 on an endpoint / feature query throws `PyreonQueryDataUndefined(<queryHash>)` — TanStack v5 FAILS a query whose fetcher resolves `undefined`; it does not resolve with no data. The hash is emitted from the web key with object keys sorted (`endpointQueryHash`).
