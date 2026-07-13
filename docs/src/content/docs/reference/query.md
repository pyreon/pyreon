---
title: "TanStack Query Adapter — API Reference"
description: "TanStack Query adapter with signal-driven results + WebSocket subscriptions + SSE (useSSE)"
---

# @pyreon/query — API Reference

> **Generated** from `query`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [query](/docs/query).

Pyreon adapter for TanStack Query. Fine-grained signals per observer field (data, error, isFetching) so effects only re-run for the fields they read. Re-exports TanStack core (QueryClient, dehydrate/hydrate, etc.) so users import everything from `@pyreon/query`. Real-time hooks `useSubscription` (WebSocket, auto-reconnect, bidirectional) and `useSSE` (Server-Sent Events, read-only) share the QueryClient so cache invalidation from push updates is one line.

## Features

- Fine-grained signals per observer field (data, error, isFetching independent)
- Re-exports the full TanStack core surface: QueryClient/QueryCache/MutationCache, all four observers, dehydrate/hydrate, skipToken, focus/online/notify managers, matchQuery/matchMutation, replaceEqualDeep, etc.
- useQuery / useMutation / useInfiniteQuery / useQueries with signal-driven options
- useSuspenseQuery / useSuspenseInfiniteQuery / useSuspenseQueries + QuerySuspense boundary (non-undefined data)
- usePrefetchQuery / usePrefetchInfiniteQuery — warm the cache in setup (no loading flash)
- useMutationState — reactive read of the MutationCache (global in-flight mutation UI)
- HydrationBoundary — component that hydrates a server-dehydrated cache before children render
- useSubscription — reactive WebSocket with auto-reconnect and QueryClient cache integration
- useSSE — Server-Sent Events with QueryClient cache integration
- useIsFetching / useIsMutating — global count signals for spinners
- QueryErrorResetBoundary — resets errored queries when an ErrorBoundary recovers
- Offline persistence (`@pyreon/query/persist`): PersistQueryClientProvider + the framework-agnostic persist engine + sync/async storage persisters; queries defer their first fetch until restore completes (useIsRestoring)
- In-app devtools (`@pyreon/query/devtools`): QueryDevtools — the same TanStack panel React/Solid/Vue ship, as a thin shim; dev-only subpath, tree-shakes out of production

## Complete example

A full, end-to-end usage of the package:

```tsx
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useInfiniteQuery,
  useSubscription,
  useSSE,
  useSuspenseQuery,
  QuerySuspense,
} from '@pyreon/query'

// 1. Create a QueryClient and mount the provider at the app root.
const client = new QueryClient()

const App = () => (
  <QueryClientProvider client={client}>
    <Content />
  </QueryClientProvider>
)

// 2. useQuery — `options` is a function so it can read Pyreon signals.
//    When the signal changes (e.g. a reactive queryKey), the observer
//    updates and refetches automatically.
const userId = signal(1)
const user = useQuery(() => ({
  queryKey: ['user', userId()],
  queryFn: () => fetch(`/api/users/${userId()}`).then((r) => r.json()),
}))
// user.data(), user.error(), user.isFetching() — each is its own signal,
// so a template that reads only isFetching won't re-run when data changes.

// 3. useMutation — reactive pending/success/error state + mutate/mutateAsync.
const create = useMutation({
  mutationFn: (input: CreatePostInput) =>
    fetch('/api/posts', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.json()),
  onSuccess: () => client.invalidateQueries({ queryKey: ['posts'] }),
})
// <button onClick={() => create.mutate({ title: 'New' })}>Create</button>

// 4. useSubscription — reactive WebSocket with auto-reconnect. The
//    onMessage callback receives the QueryClient so push updates can
//    invalidate or directly patch cached queries.
const sub = useSubscription({
  url: 'wss://api.example.com/feed',
  onMessage: (event, queryClient) => {
    const payload = JSON.parse(event.data)
    if (payload.type === 'post-created') {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    }
  },
})
// sub.status() — 'connecting' | 'connected' | 'disconnected' | 'error'
// sub.send(data), sub.close(), sub.reconnect()

// 5. useSSE — same pattern as useSubscription but read-only (no send).
//    `parse` deserializes per message; `events` filters named event types.
const sse = useSSE({
  url: '/api/events',
  parse: JSON.parse,
  onMessage: (data, queryClient) => {
    if (data.type === 'order-updated') {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  },
})
// sse.data() — last parsed message. sse.lastEventId() honours SSE `id` field.

// 6. Suspense — useSuspenseQuery narrows `data` to Signal<TData> (never
//    undefined). Pair with QuerySuspense to gate children on success.
const profile = useSuspenseQuery(() => ({
  queryKey: ['profile', userId()],
  queryFn: fetchProfile,
}))

<QuerySuspense
  query={profile}
  fallback={<Spinner />}
  error={(err) => <ErrorCard message={String(err)} />}
>
  {() => <ProfileCard name={profile.data().name} />}
</QuerySuspense>

// 7. useInfiniteQuery — reactive pages + fetchNextPage / fetchPreviousPage.
const feed = useInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,
}))
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`QueryClientProvider`](#queryclientprovider) | component | Mounts a `QueryClient` at the root of the component tree via context so every descendant hook (`useQuery`, `useMutation` |
| [`HydrationBoundary`](#hydrationboundary) | component | Hydrates a server-dehydrated query cache into the nearest `QueryClient`, then renders its children — the ergonomic SSR c |
| [`useQuery`](#usequery) | hook | Subscribe to a query with fine-grained reactive signals. |
| [`useMutation`](#usemutation) | hook | Run a mutation (create / update / delete). |
| [`useMutationState`](#usemutationstate) | hook | Reactively read state from the MutationCache across the whole app — e.g. |
| [`useInfiniteQuery`](#useinfinitequery) | hook | Paginated / cursor-based query. |
| [`useQueries`](#usequeries) | hook | Subscribe to multiple queries in parallel. |
| [`usePrefetchQuery`](#useprefetchquery) | hook | Prefetch a query during component setup so its data is warm before a child's `useQuery` mounts. |
| [`usePrefetchInfiniteQuery`](#useprefetchinfinitequery) | hook | Infinite-query variant of `usePrefetchQuery` — warms the first page of a paginated query into the cache during setup, on |
| [`useSubscription`](#usesubscription) | hook | Reactive WebSocket with auto-reconnect and QueryClient cache integration. |
| [`useSSE`](#usesse) | hook | Reactive Server-Sent Events hook with QueryClient cache integration. |
| [`useSuspenseQuery`](#usesuspensequery) | hook | Like `useQuery` but `data` is narrowed to `Signal<TData>` (never undefined). |
| [`useSuspenseInfiniteQuery`](#usesuspenseinfinitequery) | hook | Like `useInfiniteQuery` but `data` is narrowed to `Signal<InfiniteData<TQueryFnData>>` (never undefined) — for use insid |
| [`useSuspenseQueries`](#usesuspensequeries) | hook | Like `useQueries` but shaped for a `QuerySuspense` boundary: aggregates the array of queries into ONE query-like (`isPen |
| [`QuerySuspense`](#querysuspense) | component | Pyreon-native Suspense boundary for queries — replaces `<Suspense>` for the query use case with explicit error handling. |
| [`useIsFetching`](#useisfetching) | hook | Global reactive count of currently-fetching queries. |
| [`useIsMutating`](#useismutating) | hook | Global reactive count of currently-running mutations (optionally filtered by `MutationFilters`). |
| [`QueryErrorResetBoundary`](#queryerrorresetboundary) | component | Resets errored queries inside its subtree when a sibling `ErrorBoundary` recovers. |
| [`useQueryErrorResetBoundary`](#usequeryerrorresetboundary) | hook | Imperative access to the nearest `QueryErrorResetBoundary`. |
| [`useQueryClient`](#usequeryclient) | hook | Access the nearest `QueryClient` from context. |
| [`PersistQueryClientProvider`](#persistqueryclientprovider) | component | Drop-in replacement for `<QueryClientProvider>` that ALSO restores the query cache from a persister on mount and keeps i |
| [`useIsRestoring`](#useisrestoring) | hook | Reactive accessor — `true` while the persisted cache is being restored by `<PersistQueryClientProvider>`. |
| [`QueryDevtools`](#querydevtools) | component | In-app TanStack Query devtools panel — the SAME panel React / Solid / Vue users see, as a thin shim over `@tanstack/quer |
| [`Persistence subpath re-exports`](#persistence-subpath-re-exports) | function | The `@pyreon/query/persist` subpath re-exports TanStack's framework-agnostic persist engine (`persistQueryClient` → `[un |
| [`TanStack core re-exports`](#tanstack-core-re-exports) | function | `@pyreon/query` re-exports the full framework-agnostic TanStack surface (identity-equal to `@tanstack/query-core`) so co |

## API

### QueryClientProvider `component`

```ts
(props: { client: QueryClient; children: VNodeChild }) => VNode
```

Mounts a `QueryClient` at the root of the component tree via context so every descendant hook (`useQuery`, `useMutation`, `useSubscription`, `useSSE`, etc.) can reach it via `useQueryClient()`. Must wrap the app — omitting it causes a runtime throw on the first hook call. One provider per app; nested providers are not supported (the deepest one wins, silently shadowing the outer).

**Example**

```tsx
const client = new QueryClient()
<QueryClientProvider client={client}>
  <App />
</QueryClientProvider>
```

**Common mistakes**

- Forgetting to wrap the app — every query/mutation hook throws "No QueryClient set" at runtime
- Creating the `QueryClient` inside a component body — it re-creates on every render. Hoist to module scope or use `useMemo`-equivalent (`const client = useMemo(() => new QueryClient())`)
- Nesting providers expecting scoped caches — only one provider is supported; the deepest one wins silently

**See also:** `useQueryClient` · `QueryClient`

---

### HydrationBoundary `component`

```ts
(props: { state?: DehydratedState | null; options?: HydrateOptions; children: VNodeChild }) => VNodeChild
```

Hydrates a server-dehydrated query cache into the nearest `QueryClient`, then renders its children — the ergonomic SSR companion to the `dehydrate` / `hydrate` functions. Hydration happens once, synchronously, in component setup BEFORE children mount, so descendant `useQuery` calls resolve from the server-fetched cache (no loading flash, no refetch). `state` is the static dehydrated blob serialized from the server render. Marked `nativeCompat` so the `useQueryClient()` lookup + `hydrate()` run in Pyreon's setup frame even under the `*-compat` jsx() runtimes.

**Example**

```tsx
// server: const state = dehydrate(queryClient)
// client:
<QueryClientProvider client={client}>
  <HydrationBoundary state={state}>
    <App />
  </HydrationBoundary>
</QueryClientProvider>
```

**Common mistakes**

- Passing a reactive accessor for `state` — hydration reads `state` once at setup; a server dehydrated blob is static, so a signal-wrapped value is unnecessary and only the initial read takes effect
- Hydrating into a different `QueryClient` than the one the children read — `HydrationBoundary` hydrates the nearest provider's client; ensure the same `QueryClientProvider` wraps both

**See also:** `QueryClientProvider` · `useQueryClient`

---

### useQuery `hook`

```ts
<TData, TError, TKey>(options: () => QueryObserverOptions<...>) => UseQueryResult<TData, TError>
```

Subscribe to a query with fine-grained reactive signals. `options` is a FUNCTION (not an object) so it can read Pyreon signals — when a tracked signal inside changes (e.g. a reactive queryKey), the observer re-evaluates options and refetches automatically. Returns one independent `Signal<T>` per observer field (`data`, `error`, `status`, `isPending`, `isLoading`, `isFetching`, `isError`, `isSuccess`) so templates only re-run for the exact fields they read. Internally wraps TanStack's `QueryObserver` and subscribes via `onUnmount`-guarded effect — the observer unsubscribes when the component unmounts.

**Example**

```tsx
const userId = signal(1)
const user = useQuery(() => ({
  queryKey: ['user', userId()],
  queryFn: () => fetch(`/api/users/${userId()}`).then((r) => r.json()),
}))
// user.data(), user.error(), user.isFetching() — each its own signal
```

**Common mistakes**

- Passing the options object directly instead of a function — loses reactive queryKey support; the observer never re-evaluates when signals change
- Reading `.data` / `.error` / `.isFetching` as plain values — they are `Signal<T>`, call them: `user.data()`, `user.isFetching()`
- Destructuring `const { data } = useQuery(...)` at setup and reading `data` later — captures the Signal reference once, which is fine, but storing `data()` at setup captures the initial VALUE and defeats reactivity
- Returning `user.data()` at the top of a component body instead of inside a reactive accessor — components run once; read signals inside `() => user.data()?.name` or effects
- Expecting refetch on `queryFn` closure changes alone — only signals read inside the options function trigger re-evaluation; a closure capture of a `let` variable does not

**See also:** `useQueryClient` · `useMutation` · `useSuspenseQuery`

---

### useMutation `hook`

```ts
<TData, TError, TVars, TCtx>(options: MutationObserverOptions<...>) => UseMutationResult<TData, TError, TVars, TCtx>
```

Run a mutation (create / update / delete). Returns reactive `pending` / `success` / `error` signals plus two firing modes: `mutate(vars)` (fire-and-forget — errors go to the `error` signal) and `mutateAsync(vars)` (returns a promise for try/catch). `reset()` returns state to idle. Unlike `useQuery`, options is a plain OBJECT (not a function) because mutations are imperative — there are no reactive queryKeys to re-evaluate, so the function-wrapper overhead would add no value. `onSuccess` / `onError` / `onSettled` callbacks fire synchronously after the mutation resolves, useful for cache invalidation (`client.invalidateQueries`).

**Example**

```tsx
const create = useMutation({
  mutationFn: (input) => fetch('/api/posts', { method: 'POST', body: JSON.stringify(input) }).then(r => r.json()),
  onSuccess: () => client.invalidateQueries({ queryKey: ['posts'] }),
})
// <button onClick={() => create.mutate({ title: 'New' })}>Create</button>
```

**Common mistakes**

- `mutate()` swallows errors into the `error` signal — use `mutateAsync()` with try/catch if you need programmatic error handling
- Calling `mutate()` inside a `useQuery` `queryFn` — mutations are imperative user actions, not data-fetching side effects; this causes infinite loops if the mutation invalidates the query that spawned it
- Reading `mutation.data()` outside a reactive scope — same rule as `useQuery`: read inside `() => mutation.data()` or effects

**See also:** `useQuery` · `useIsMutating` · `useMutationState`

---

### useMutationState `hook`

```ts
<TResult>(options?: () => { filters?: MutationFilters; select?: (m: Mutation) => TResult }) => Signal<TResult[]>
```

Reactively read state from the MutationCache across the whole app — e.g. to render in-flight mutations globally (optimistic-UI lists, a "saving…" indicator that shows the variables of every pending mutation). Returns a `Signal<TResult[]>` that re-snapshots whenever a matching mutation is added / updated / removed. `options` is a function so reactive filters (signal-driven `status` / `mutationKey`) re-evaluate automatically; `select` maps each matched `Mutation` to a value (defaults to `mutation.state`). Distinct from `useMutation` (which drives ONE mutation) — this OBSERVES the cache without owning a mutation.

**Example**

```tsx
const pending = useMutationState(() => ({
  filters: { status: 'pending' },
  select: (m) => m.state.variables,
}))
// pending() — array of variables of every in-flight mutation
```

**Common mistakes**

- Passing options as an object instead of a function — loses reactive filter tracking; a signal-driven `status` filter won't re-evaluate
- Expecting it to TRIGGER mutations — it only READS the cache; use `useMutation` to run a mutation
- Reading `pending()` outside a reactive scope — it is a `Signal`, call it inside `() => pending()` or an effect

**See also:** `useMutation` · `useIsMutating`

---

### useInfiniteQuery `hook`

```ts
<TQueryFnData, TError>(options: () => InfiniteQueryObserverOptions<...>) => UseInfiniteQueryResult<TQueryFnData, TError>
```

Paginated / cursor-based query. Returns reactive `data` (wrapping `InfiniteData<T>` with `.pages` + `.pageParams`), `hasNextPage` / `hasPreviousPage` booleans, and `fetchNextPage` / `fetchPreviousPage` trigger functions. Options is a function (same reactive-tracking contract as `useQuery`). `getNextPageParam` / `getPreviousPageParam` drive cursor progression — return `undefined` to signal the end.

**Example**

```tsx
const feed = useInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,
}))
```

**Common mistakes**

- Forgetting `initialPageParam` — required by TanStack v5; omitting it throws at the first `queryFn` call
- Using `data().pages` without flattening — `pages` is an array of page results; most UIs want `data().pages.flat()` or `data().pages.flatMap(p => p.items)`

**See also:** `useQuery` · `useSuspenseInfiniteQuery`

---

### useQueries `hook`

```ts
(queries: () => UseQueriesOptions[]) => Signal<QueryObserverResult[]>
```

Subscribe to multiple queries in parallel. Returns a `Signal<QueryObserverResult[]>` — one entry per input query. Options is a function so the query list can depend on signals (e.g. derive one query per item in a reactive array). Each inner query independently tracks its own `data` / `error` / `isFetching` — the outer signal fires when ANY inner query updates.

**Example**

```tsx
const results = useQueries(() =>
  userIds().map((id) => ({ queryKey: ['user', id], queryFn: () => fetchUser(id) })),
)
// results() is QueryObserverResult[] — one entry per input query
```

**Common mistakes**

- Expecting per-query fine-grained signals — `useQueries` returns a single combined signal, not individual `UseQueryResult` objects. For independent per-query tracking, call `useQuery` N times
- Passing a static array instead of a function — loses reactive query-list tracking; if the list of IDs changes (e.g. `userIds()` is a signal), the queries won't re-evaluate. Always wrap: `useQueries(() => ids().map(...))`

**See also:** `useQuery` · `useSuspenseQueries`

---

### usePrefetchQuery `hook`

```ts
<TData, TError, TKey>(options: () => FetchQueryOptions<...>) => void
```

Prefetch a query during component setup so its data is warm before a child's `useQuery` mounts. Fire-and-forget (returns nothing). Only prefetches when the key is NOT already in the cache, so it never re-fetches data the cache already has. Pair with `useSuspenseQuery` in a child to avoid a loading flash — the parent warms the cache, the suspense child reads it as immediately-resolved. `usePrefetchInfiniteQuery` is the paginated equivalent (requires `initialPageParam` + `getNextPageParam`).

**Example**

```tsx
// In a parent / layout component:
usePrefetchQuery(() => ({ queryKey: ['user', id], queryFn: fetchUser }))
// then a child's useSuspenseQuery(['user', id]) resolves instantly
```

**Common mistakes**

- Calling it inside a conditional/loop — like all hooks it must run unconditionally in component setup
- Expecting a return value — it is fire-and-forget; read the data via `useQuery` / `useSuspenseQuery` with the same key

**See also:** `usePrefetchInfiniteQuery` · `useSuspenseQuery` · `useQueryClient`

---

### usePrefetchInfiniteQuery `hook`

```ts
<TQueryFnData, TError, TData, TKey, TPageParam>(options: () => FetchInfiniteQueryOptions<...>) => void
```

Infinite-query variant of `usePrefetchQuery` — warms the first page of a paginated query into the cache during setup, only when the key isn't already cached. Requires `initialPageParam` + `getNextPageParam` like `useInfiniteQuery`. Pair with `useSuspenseInfiniteQuery` in a child.

**Example**

```tsx
usePrefetchInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.next,
}))
```

**See also:** `usePrefetchQuery` · `useSuspenseInfiniteQuery` · `useInfiniteQuery`

---

### useSubscription `hook`

```ts
(options: UseSubscriptionOptions) => UseSubscriptionResult
```

Reactive WebSocket with auto-reconnect and QueryClient cache integration. `onMessage` receives the active `QueryClient` so push updates can invalidate or directly patch cached queries in a single line. Exponential backoff on reconnect (default 1s doubling, max 10 attempts — configurable via `reconnectDelay` / `maxReconnectAttempts`). `url` and `enabled` may be signals for reactive connection management — changing the URL closes the old socket and opens a new one. Returns `status` (signal), `send(data)`, `close()`, `reconnect()`.

**Example**

```tsx
const sub = useSubscription({
  url: 'wss://api.example.com/feed',
  onMessage: (event, client) => {
    if (JSON.parse(event.data).type === 'post-created') {
      client.invalidateQueries({ queryKey: ['posts'] })
    }
  },
})
// sub.status() — 'connecting' | 'connected' | 'disconnected' | 'error'
// sub.send(data), sub.close(), sub.reconnect()
```

**Common mistakes**

- `onMessage` runs on every frame the socket receives — debounce cache invalidations for high-frequency streams or you'll trigger N refetches per second
- Storing data in a parallel signal instead of using `queryClient.setQueryData` inside `onMessage` — defeats the QueryClient cache; use `setQueryData` to push updates into the same cache that `useQuery` reads
- Forgetting `enabled: false` on unmount-sensitive connections — the WebSocket stays open unless `enabled` is a signal that tracks component lifecycle or a reactive condition

**See also:** `useSSE` · `useQuery`

---

### useSSE `hook`

```ts
<T>(options: UseSSEOptions<T>) => UseSSEResult<T>
```

Reactive Server-Sent Events hook with QueryClient cache integration. Same pattern as `useSubscription` but read-only (no `send`). `parse` deserializes raw event data per message (e.g. `JSON.parse`); `events` filters named SSE event types (defaults to generic `message` events). Honours the SSE spec `id` field via `lastEventId()` so the browser includes `Last-Event-ID` on reconnect and the server can resume from the right offset. `onMessage` receives the `QueryClient` for cache invalidation.

**Example**

```tsx
const sse = useSSE({
  url: '/api/events',
  parse: JSON.parse,
  onMessage: (data, queryClient) => {
    if (data.type === 'order-updated') {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  },
})
// sse.data() — last parsed message
// sse.status() — 'connecting' | 'connected' | 'disconnected' | 'error'
// sse.lastEventId(), sse.readyState(), sse.close(), sse.reconnect()
```

**Common mistakes**

- Passing `queryKey` (TanStack v4 pattern) instead of using `onMessage` for cache integration — Pyreon's `useSSE` does NOT auto-update query cache; use `queryClient.setQueryData` or `invalidateQueries` inside `onMessage`
- Omitting `parse` and expecting typed data — without `parse`, `data()` is `string` (raw event payload); pass `parse: JSON.parse` for auto-deserialization

**See also:** `useSubscription`

---

### useSuspenseQuery `hook`

```ts
<TData, TError>(options: () => QueryObserverOptions<...>) => UseSuspenseQueryResult<TData, TError>
```

Like `useQuery` but `data` is narrowed to `Signal<TData>` (never undefined). Designed for use inside a `QuerySuspense` boundary that guarantees children only render after the query succeeds — read `user.data().name` unconditionally, no `undefined` guard needed. The Suspense-mode observer fires a background refetch but never transitions `data` back to `undefined` (the previous data is retained as placeholder). `useSuspenseInfiniteQuery` is the equivalent for paginated queries.

**Example**

```tsx
const user = useSuspenseQuery(() => ({ queryKey: ['user', id()], queryFn: fetchUser }))

<QuerySuspense query={user} fallback={<Spinner />}>
  {() => <UserCard name={user.data().name} />}
</QuerySuspense>
```

**Common mistakes**

- Using `useSuspenseQuery` without a `QuerySuspense` wrapper — the narrowed type assumes a boundary guarantees data; without it, `data()` CAN be the initial value during the first render cycle
- Mixing `useSuspenseQuery` and `useQuery` for the same `queryKey` — the Suspense observer and the regular observer can race; use one or the other per key

**See also:** `QuerySuspense` · `useSuspenseInfiniteQuery` · `useQuery`

---

### useSuspenseInfiniteQuery `hook`

```ts
<TQueryFnData, TError>(options: () => InfiniteQueryObserverOptions<...>) => UseSuspenseInfiniteQueryResult<TQueryFnData, TError>
```

Like `useInfiniteQuery` but `data` is narrowed to `Signal<InfiniteData<TQueryFnData>>` (never undefined) — for use inside a `QuerySuspense` boundary. Returns the same `fetchNextPage` / `fetchPreviousPage` / `hasNextPage` / `hasPreviousPage` surface as `useInfiniteQuery`. Same caveats as `useSuspenseQuery` regarding Suspense boundary requirement.

**Example**

```tsx
const feed = useSuspenseInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,
}))

<QuerySuspense query={feed} fallback={<Spinner />}>
  {() => <Feed pages={feed.data().pages} onMore={feed.fetchNextPage} />}
</QuerySuspense>
```

**Common mistakes**

- Using without a `QuerySuspense` wrapper — same boundary-requirement as `useSuspenseQuery`; the narrowed type assumes success, but `data()` CAN be the initial value during the first render cycle without a boundary
- Mixing `useSuspenseInfiniteQuery` and `useInfiniteQuery` for the same `queryKey` — the Suspense observer and the regular observer can race; use one or the other per key

**See also:** `useSuspenseQuery` · `useInfiniteQuery` · `QuerySuspense`

---

### useSuspenseQueries `hook`

```ts
<TData, TError>(queries: () => UseQueriesOptions[]) => { results: Signal<...[]>; data: Signal<TData[]>; isPending: Signal<boolean>; isError: Signal<boolean>; error: Signal<TError | null> }
```

Like `useQueries` but shaped for a `QuerySuspense` boundary: aggregates the array of queries into ONE query-like (`isPending` = any pending, `isError` = any errored, `error` = first error) plus a `data` array. The returned object is itself a valid query-gate — pass the WHOLE result as the `query` of a `QuerySuspense`, and children render only after every query succeeds, at which point `data()` is the fully-populated (never-undefined) array. `queries` is reactive (signal-driven keys re-evaluate automatically).

**Example**

```tsx
const users = useSuspenseQueries(() =>
  ids().map((id) => ({ queryKey: ['user', id], queryFn: () => fetchUser(id) })),
)
<QuerySuspense query={users} fallback={<Spinner />}>
  {() => <UserList users={users.data()} />}
</QuerySuspense>
```

**Common mistakes**

- Gating a `QuerySuspense` on `users.data` instead of `users` — pass the whole result object as `query`; it carries the `isPending`/`isError`/`error` signals the boundary reads
- Passing a static array instead of a function — loses reactive query-list tracking (same rule as `useQueries`)
- Using without a `QuerySuspense` wrapper — `data()` can contain `undefined` entries until every query succeeds; the boundary is what guarantees a full array

**See also:** `useQueries` · `useSuspenseQuery` · `QuerySuspense`

---

### QuerySuspense `component`

```ts
(props: QuerySuspenseProps) => VNodeChild
```

Pyreon-native Suspense boundary for queries — replaces `<Suspense>` for the query use case with explicit error handling. Shows `fallback` while any query is `isPending`. On error, renders the `error` callback or re-throws to the nearest `ErrorBoundary`. Accepts a single query or an array — pass an array to gate on multiple queries in parallel. Children are a function (`{() => <UI />}`) so they only execute after all queries succeed.

**Example**

```tsx
<QuerySuspense
  query={[userQuery, postsQuery]}
  fallback={<Spinner />}
  error={(err) => <ErrorCard message={String(err)} />}
>
  {() => <Dashboard user={userQuery.data()} posts={postsQuery.data()} />}
</QuerySuspense>
```

**Common mistakes**

- Passing children as plain JSX (`<QuerySuspense query={q}><Data /></QuerySuspense>`) instead of a function — plain children evaluate eagerly, defeating the Suspense gate. Always wrap: `{() => <Data />}`
- Omitting the `error` callback — errors re-throw to the nearest `ErrorBoundary`, which may not exist or may be too far up the tree. Provide an explicit `error` fallback for precise error handling

**See also:** `useSuspenseQuery` · `useSuspenseInfiniteQuery`

---

### useIsFetching `hook`

```ts
(filters?: QueryFilters) => Signal<number>
```

Global reactive count of currently-fetching queries. Pass `QueryFilters` to narrow by `queryKey` prefix, `stale` status, or `fetchStatus`. Pair with `useIsMutating` to drive a top-of-page progress bar that aggregates ALL in-flight data fetching without tracking individual queries. Returns `Signal<number>` — zero when idle.

**Example**

```tsx
const fetching = useIsFetching()
// <TopSpinner visible={() => fetching() > 0} />
```

**See also:** `useIsMutating`

---

### useIsMutating `hook`

```ts
(filters?: MutationFilters) => Signal<number>
```

Global reactive count of currently-running mutations (optionally filtered by `MutationFilters`). Same pattern as `useIsFetching` but for the mutation pipeline. Returns `Signal<number>` — zero when no mutations are in flight.

**Example**

```tsx
const mutating = useIsMutating()
// <Banner visible={() => mutating() > 0}>Saving…</Banner>
```

**See also:** `useIsFetching`

---

### QueryErrorResetBoundary `component`

```ts
(props: QueryErrorResetBoundaryProps) => VNode
```

Resets errored queries inside its subtree when a sibling `ErrorBoundary` recovers. Wrap around a `QuerySuspense` + `ErrorBoundary` pair to get clean retry semantics — without this, a recovered `ErrorBoundary` re-renders children but the queries still hold their error state, so the boundary immediately catches the same error again (infinite error loop). Takes a normal child subtree (its `children` is `VNodeChild`, NOT a render prop); reach for the reset action via `useQueryErrorResetBoundary()` inside the `ErrorBoundary` fallback.

**Example**

```tsx
<QueryErrorResetBoundary>
  <ErrorBoundary
    fallback={(err, retry) => {
      const { reset } = useQueryErrorResetBoundary()
      return <button onClick={() => { reset(); retry() }}>Retry</button>
    }}
  >
    <QuerySuspense query={q}>{() => <Data />}</QuerySuspense>
  </ErrorBoundary>
</QueryErrorResetBoundary>
```

**See also:** `QuerySuspense`

---

### useQueryErrorResetBoundary `hook`

```ts
() => { reset: () => void }
```

Imperative access to the nearest `QueryErrorResetBoundary`. Returns `{ reset }` — call `reset()` to clear errored queries in the subtree. Useful when an error fallback has its own retry button outside the render-prop form of `QueryErrorResetBoundary`, e.g. inside a standalone `ErrorBoundary` fallback component that isn't a direct child of the boundary.

**Example**

```tsx
const { reset } = useQueryErrorResetBoundary()
// Inside an ErrorBoundary fallback:
<button onClick={() => { reset(); retry() }}>Try again</button>
```

**See also:** `QueryErrorResetBoundary`

---

### useQueryClient `hook`

```ts
() => QueryClient
```

Access the nearest `QueryClient` from context. Used to invalidate queries (`client.invalidateQueries`), prefetch data (`client.prefetchQuery`), read/write cache (`getQueryData` / `setQueryData`), or cancel queries. Throws "[Pyreon] No QueryClient set" if no `QueryClientProvider` is mounted above the call site. Returns the same `QueryClient` instance that TanStack core exposes — all TanStack methods work.

**Example**

```tsx
const client = useQueryClient()
client.invalidateQueries({ queryKey: ['posts'] })
await client.prefetchQuery({ queryKey: ['user', 1], queryFn: fetchUser })
```

**Common mistakes**

- Calling `useQueryClient()` at module scope — hooks require an active component setup context; hoist into the component body or pass the client as a function parameter

**See also:** `QueryClientProvider`

---

### PersistQueryClientProvider `component`

```ts
(props: { client: QueryClient; persistOptions: Omit<PersistQueryClientOptions, "queryClient">; onSuccess?: () => unknown; onError?: () => unknown; children?: VNodeChild }) => VNodeChild
```

Drop-in replacement for `<QueryClientProvider>` that ALSO restores the query cache from a persister on mount and keeps it persisted on every change — the offline / reload-survival story. Provides both the `QueryClient` AND the reactive `isRestoring` flag, so descendant `useQuery` calls DEFER their first fetch until restoration completes (no redundant network request for data the cache is about to restore). Import from `@pyreon/query/persist`. Built on TanStack's framework-agnostic `persistQueryClient` engine; pair with `createSyncStoragePersister({ storage: localStorage })`.

**Example**

```tsx
import { PersistQueryClientProvider, createSyncStoragePersister } from '@pyreon/query/persist'

const persister = createSyncStoragePersister({ storage: localStorage })
<PersistQueryClientProvider client={client} persistOptions={{ persister }}>
  <App />
</PersistQueryClientProvider>
```

**Common mistakes**

- Using BOTH `<QueryClientProvider>` and `<PersistQueryClientProvider>` — the persist provider already provides the client; nest only one
- Expecting synchronous restore — restoration is async (even sync localStorage resolves on a microtask). Gate UI on `useIsRestoring()` during the window
- A heavy `staleTime: 0` default — restored queries immediately refetch on subscribe; set a `staleTime` so the restored cache is treated as fresh

**See also:** `useIsRestoring` · `QueryClientProvider` · `HydrationBoundary`

---

### useIsRestoring `hook`

```ts
() => () => boolean
```

Reactive accessor — `true` while the persisted cache is being restored by `<PersistQueryClientProvider>`. Returns `() => false` when there is no persistence layer. Gate a splash / skeleton on it during the async restore window. Exported from both `@pyreon/query` and `@pyreon/query/persist`. `IsRestoringProvider` is the standalone provider for a custom restoration flow.

**Example**

```tsx
const isRestoring = useIsRestoring()
<Show when={() => !isRestoring()} fallback={<Splash />}>{() => <App />}</Show>
```

**Common mistakes**

- Reading it as a plain boolean — it returns an ACCESSOR; call it: `isRestoring()`

**See also:** `PersistQueryClientProvider`

---

### QueryDevtools `component`

```ts
(props: { client?: QueryClient; initialIsOpen?: boolean; buttonPosition?: DevtoolsButtonPosition; position?: DevtoolsPosition; errorTypes?: DevtoolsErrorType[]; shadowDOMTarget?: ShadowRoot }) => VNode
```

In-app TanStack Query devtools panel — the SAME panel React / Solid / Vue users see, as a thin shim over `@tanstack/query-devtools`'s framework-agnostic engine (on mount it instantiates the engine with the nearest `QueryClient` and mounts it into a host element; tears down on unmount). Import from the dev-only subpath `@pyreon/query/devtools` so it tree-shakes out of production. Render once under your provider. Config props are read once at mount.

**Example**

```tsx
import { QueryDevtools } from '@pyreon/query/devtools'

<QueryClientProvider client={client}>
  <App />
  {import.meta.env.DEV ? <QueryDevtools initialIsOpen={false} /> : null}
</QueryClientProvider>
```

**Common mistakes**

- Importing from `@pyreon/query` (main) — it lives at the `@pyreon/query/devtools` subpath so the heavy devtools engine stays out of the production bundle
- Rendering it unconditionally in production — gate on `import.meta.env.DEV` (or your bundler's dev flag) so it ships only in development

**See also:** `QueryClientProvider` · `useQueryClient`

---

### Persistence subpath re-exports `function`

```ts
import { persistQueryClient, persistQueryClientRestore, persistQueryClientSave, persistQueryClientSubscribe, removeOldestQuery, createSyncStoragePersister, createAsyncStoragePersister } from '@pyreon/query/persist'
```

The `@pyreon/query/persist` subpath re-exports TanStack's framework-agnostic persist engine (`persistQueryClient` → `[unsubscribe, restorePromise]`, plus the `*Restore` / `*Save` / `*Subscribe` granular pieces and `removeOldestQuery`) and the storage persisters (`createSyncStoragePersister` for localStorage/sessionStorage, `createAsyncStoragePersister` for IndexedDB / RN AsyncStorage / any Promise-returning store). Types (`Persister`, `PersistedClient`, `PersistQueryClientOptions`, …) re-export alongside. Use these for a custom persistence flow; most apps just use `<PersistQueryClientProvider>`.

**Example**

```tsx
import { persistQueryClient, createSyncStoragePersister } from '@pyreon/query/persist'

const persister = createSyncStoragePersister({ storage: localStorage })
const [unsubscribe, restored] = persistQueryClient({ queryClient: client, persister })
await restored // cache is now hydrated from storage
```

**See also:** `PersistQueryClientProvider` · `useIsRestoring`

---

### TanStack core re-exports `function`

```ts
import { QueryClient, QueryCache, MutationCache, QueryObserver, InfiniteQueryObserver, MutationObserver, QueriesObserver, dehydrate, hydrate, skipToken, keepPreviousData, hashKey, matchQuery, matchMutation, replaceEqualDeep, focusManager, onlineManager, notifyManager, isServer, isCancelledError, CancelledError, defaultShouldDehydrateQuery, defaultShouldDehydrateMutation } from '@pyreon/query'
```

`@pyreon/query` re-exports the full framework-agnostic TanStack surface (identity-equal to `@tanstack/query-core`) so consumers import every primitive from one entry: `QueryClient` / `QueryCache` / `MutationCache` (instance classes); all four observers (`QueryObserver` / `InfiniteQueryObserver` / `MutationObserver` / `QueriesObserver`) for advanced consumers driving query-core directly; `dehydrate` / `hydrate` (SSR serialization); `skipToken` (the v5 sentinel — `queryFn: skipToken` type-safely disables a query); `keepPreviousData`; the cache-key + structural-sharing utilities `hashKey` / `matchQuery` / `matchMutation` / `replaceEqualDeep`; the singleton managers `focusManager` / `onlineManager` / `notifyManager` (toggle focus/online refetch behaviour, batch notifications); `isServer`; `hashKey` / `isCancelledError` / `CancelledError`; and the `defaultShouldDehydrate*` predicates. Types (`QueryKey`, `QueryFilters`, `MutationFilters`, `Mutation`, `MutationState`, `QueryState`, `DehydratedState`, `HydrateOptions`, `InfiniteData`, `DefaultError`, `FetchQueryOptions`, `FetchInfiniteQueryOptions`, `InvalidateQueryFilters`, `InvalidateOptions`, `RefetchQueryFilters`, `RefetchOptions`, `QueryClientConfig`) re-export alongside the runtime values.

**Example**

```tsx
// SSR dehydration round-trip:
import { QueryClient, dehydrate, hydrate, skipToken } from '@pyreon/query'

const server = new QueryClient()
await server.prefetchQuery({ queryKey: ['users'], queryFn: fetchUsers })
const snapshot = dehydrate(server)

const client = new QueryClient()
hydrate(client, snapshot)

// skipToken: type-safe conditional disabling
useQuery(() => ({ queryKey: ['user', id()], queryFn: id() ? fetchUser : skipToken }))
```

**See also:** `QueryClientProvider` · `useQueryClient` · `HydrationBoundary`

---

## Package-level notes

> **Options as a function:** `useQuery` / `useInfiniteQuery` / `useQueries` / `useSuspenseQuery` take options as a FUNCTION (not an object) so `queryKey` and other fields can read Pyreon signals. TanStack core uses an object; Pyreon wraps so changing a tracked signal re-runs the observer options and refetches automatically.

> **Signals all the way down:** `result.data`, `.error`, `.isFetching`, etc. are independent `Signal<T>` values — not plain properties. Call them (`user.data()`) to read, and each field-level read only subscribes to that field so templates re-render with maximum precision.

> **Real-time + cache:** `useSubscription` (WebSocket) and `useSSE` (Server-Sent Events) both hand their `onMessage` callback the active `QueryClient`. Invalidate or patch queries directly from push updates instead of duplicating server state in a parallel signal store.

> **Suspense data is non-undefined:** `useSuspenseQuery` narrows `data: Signal<TData>` (never undefined). Read it unconditionally inside `QuerySuspense` children — the boundary guarantees success before rendering. Outside the boundary, use `useQuery` and handle the undefined case.
