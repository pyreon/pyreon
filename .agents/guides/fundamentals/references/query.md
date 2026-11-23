# @pyreon/query

- TanStack Query adapter: `useQuery`, `useMutation`, `useInfiniteQuery`, `useQueries`, `useSuspenseQuery` and the rest; `/persist` and `/devtools` subpaths.
- Pass `useQuery` options as a function (`useQuery(() => ({ queryKey: [id()], … }))`) so `queryKey` can read signals and refetch reactively. `useMutation` takes a plain object.
- Persisted mutations (`/persist`, `persist-mutations.ts`). TanStack persists a mutation only while paused, so one in flight is lost when the tab dies (#4723). The four `persistQueryClient*` functions (TanStack's signatures) and the provider apply one contract:
  - Which: `shouldPersistMutation(mutation, client)`. Pending; not `meta: { persist: false }`; resumable, meaning `client.defaultMutationOptions({ mutationKey })` resolves to the very `mutationFn` it runs (a keyless or inline-function mutation never reaches storage, so a sign-in's password never does); variables survive JSON (a `File`, `Date`, `Map`, class instance, BigInt or cycle is left out with a dev warning, so neither a corrupted body nor a failed whole-cache write).
  - Precedence is TanStack's: explicit option, then the client's `defaultOptions.dehydrate`, then this default.
  - Ownership: a Web Lock per persisted mutation (held until it settles) and one per page (held for its life). A restoring page leaves a mutation whose lock is held, writes it back unchanged, and takes it over only once the lock is released AND the owner page is gone (owner alive means it settled it). Without Web Locks an in-flight mutation is not persisted (TanStack's at-most-once). Entries are tagged with their lock by the `state` object `dehydrate` copies by reference.
  - Prompt writes: the `/persist` storage persisters carry `FLUSH`, used when a mutation starts being persisted, when it settles (before its lock is released) and on page hide; the same snapshot also goes to the throttled path so an older pending write cannot undo it.
  - Delivery is at-least-once. Tests: `persist-mutations.test.tsx` (a fake shared LockManager simulates tabs and tab death) and the two-tab cases in `e2e/pwa-offline.spec.ts`.
- `defineQueries({ … })` declares named parallel queries.
- Results are fine-grained per-field signals, created lazily behind property getters.
- Type helpers `QueryData`/`QueryError` unwrap the result bags.
- Re-exports query-core, pinned repo-wide through `overrides`.
- Native: `PyreonQueryCache` (Swift + Kotlin) is the query client. Keys are the colon-joined web keys (`['todo', 5]` → `todo:5`), and a query is LIVE once `run` registered its request. The live registry is a leak surface: Swift holds weak refs and unregisters in `deinit`; Kotlin removes by identity in `RememberObserver.onForgotten` / `onAbandoned`, which works only because the emit `remember`s the `PyreonQuery` itself. `invalidateQueries` marks entries stale (kept and served) rather than dropping them. Both rules have cleanup tests in `native/tests`.
