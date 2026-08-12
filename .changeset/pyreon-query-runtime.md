---
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

PyreonQuery — the native cached data-fetching runtime, the core of `useQuery` on iOS and Android.

The delta over `PyreonFetch` is exactly what a query library adds over a bare fetch: a **keyed cache with stale-while-revalidate**, so the same `queryKey` shared across screens serves instantly and refetches in the background.

- `PyreonQueryCache` — a process-global cache shared across every `PyreonQuery` instance (two screens reading `["todos"]` hit the same entry). `invalidate(key)` + `clearAll()`. Swift: `@unchecked Sendable` + `NSLock`; Kotlin: `synchronized` `HashMap`.
- `PyreonQuery<T>` (`@Observable` / Compose `MutableState`) with the web `useQuery` result contract: `data` (nil until first success), `error` (last failure, nil on success), `isPending` (true only when there is NO data yet AND a fetch runs — a background refresh does NOT flip it, so shown data never blanks), `isFetching` (any in-flight fetch), `refetch()`. `begin`/`resolve`/`reject` mirror `PyreonFetch`, so it drives from the compiler-emitted async harness; `resolve` writes through to the cache. Coroutine-free — the network call is injected — so it stays dependency-light and synchronously unit-testable with a stub fetcher.

Both runtimes build + pass their unit tests (Swift `swift test`: 4 PyreonQuery cases; Kotlin `verify-kotlin --service=PyreonQuery`: typecheck + smoke) and join the per-service verify + service-coverage gates.

Deferred (disclosed): mutations, infinite queries, prefetch, cross-instance invalidation, retries/backoff, persistence, and bounded cache eviction. The `useQuery` **compiler lowering** (emitting `PyreonQuery` from `useQuery(() => ({ queryKey, queryFn, staleTime }))`) is a tracked follow-up; until it lands, `useQuery` still warns as unsupported on native — this PR ships the runtime it targets.
