# @pyreon/query

- TanStack Query adapter: `useQuery`, `useMutation`, `useInfiniteQuery`, `useQueries`, `useSuspenseQuery` and the rest; `/persist` and `/devtools` subpaths.
- Pass `useQuery` options as a function (`useQuery(() => ({ queryKey: [id()], … }))`) so `queryKey` can read signals and refetch reactively. `useMutation` takes a plain object.
- Persisted mutations (`/persist`): a mutation leaves storage only once it settles. `persist-mutations.ts` wraps TanStack's four `persistQueryClient*` functions (same signatures) and the provider uses them: dehydrate every `pending` mutation (`shouldPersistMutation`), and on restore mark a restored `pending` mutation paused, because its retryer died with the old page and query-core resumes only paused mutations. Both halves are needed; TanStack's default (`isPaused` only) loses a mutation whose request is in flight when the tab dies (#4723, real-Chromium cases in `e2e/pwa-offline.spec.ts`). Delivery is at-least-once.
- `defineQueries({ … })` declares named parallel queries.
- Results are fine-grained per-field signals, created lazily behind property getters.
- Type helpers `QueryData`/`QueryError` unwrap the result bags.
- Re-exports query-core, pinned repo-wide through `overrides`.
- Native: `PyreonQueryCache` (Swift + Kotlin) is the query client. Keys are the colon-joined web keys (`['todo', 5]` → `todo:5`), and a query is LIVE once `run` registered its request. The live registry is a leak surface: Swift holds weak refs and unregisters in `deinit`; Kotlin removes by identity in `RememberObserver.onForgotten` / `onAbandoned`, which works only because the emit `remember`s the `PyreonQuery` itself. `invalidateQueries` marks entries stale (kept and served) rather than dropping them. Both rules have cleanup tests in `native/tests`.
