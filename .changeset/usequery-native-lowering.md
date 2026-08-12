---
'@pyreon/native-compiler': minor
---

`useQuery` now lowers to native — `@pyreon/query`'s flagship hook emits SwiftUI + Compose (v1).

PMTC compiles `useQuery<T>(() => ({ queryKey, queryFn, staleTime }))` to the `PyreonQuery` runtime — the useFetch lowering plus the one thing a query library adds over a bare fetch: a **keyed cache with stale-while-revalidate**.

- **Swift** → `@State private var q = PyreonQuery<T>(queryKey:, staleSeconds:)` + an `isStale`-guarded `.task` on the stable ZStack host (`begin → resolve|reject`). Reactive reads (`q.data`/`q.isPending`/`q.isFetching`/`q.error`) are bare `@Observable` properties.
- **Kotlin** → `remember { PyreonQuery<T>(queryKey =, staleMillis =) }` + an `isStale`-guarded `LaunchedEffect(Unit)`. Reactive reads append `.value` (Compose `MutableState`).

The `.task`/`LaunchedEffect` runs the fetch **only when the cache is stale**, so a fresh hit skips the network and serves the hydrated value — and a background refresh flips only `isFetching`, never `isPending`, so already-shown data never blanks. `useQuery` also participates in `<Suspense>`/`<ErrorBoundary>` and the `const { data, isPending } = useQuery(...)` destructure, exactly like `useFetch`.

A `queryFn` whose inline `fetch(url, { method, headers, body })` carries a verb/headers/body routes through `PyreonHttp` (mirroring `useFetch`) — so POST/authenticated queries work; a bare `fetch(url)` stays the GET path.

**v1 scope** (conservative, the same literal-only rule as `useFetch`): `queryKey` is an array of string/number literals (colon-joined into the cache key); `queryFn` is an inline `() => fetch('<url-literal>'[, { method, headers, body }])` whose URL + literal request fields are baked; `staleTime` is a number literal (ms). Anything else — a reactive `queryKey` (`['todo', id()]`), a `queryFn` function reference, a non-literal fetch URL, a non-literal method/body — **warns by name and bails**, so `useQuery` still reports as unsupported rather than mis-lowering a shape it cannot honour. Tracked follow-ups: reactive keys, `queryFn` references, mutations, infinite queries, cross-instance invalidation.

Proven at R2 (emit) + R3 (typecheck): the emitted Swift **and** Kotlin typecheck against the `PyreonQuery` stubs on both real toolchains (`swiftc`/`kotlinc`). The runtime it targets ships in `@pyreon/native-runtime-{swift,kotlin}` (`PyreonQuery` — a separate PR); a device (Simulator/Emulator) proof arrives with an example app that emits `useQuery`.
