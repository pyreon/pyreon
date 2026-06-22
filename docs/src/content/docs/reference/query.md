---
title: "TanStack Query Adapter — API Reference"
description: "TanStack Query adapter with signal-driven results + WebSocket subscriptions + SSE (useSSE)"
---

# @pyreon/query — API Reference

> **Generated** from `query`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [query](/docs/query).

Pyreon adapter for TanStack Query. Fine-grained signals per observer field (data, error, isFetching) so effects only re-run for the fields they read. Re-exports TanStack core (QueryClient, dehydrate/hydrate, etc.) so users import everything from `@pyreon/query`. Real-time hooks `useSubscription` (WebSocket, auto-reconnect, bidirectional) and `useSSE` (Server-Sent Events, read-only) share the QueryClient so cache invalidation from push updates is one line.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`QueryClientProvider`](#queryclientprovider) | component | Mounts a `QueryClient` at the root of the component tree via context so every descendant hook (`useQuery`, `useMutation` |
| [`useQuery`](#usequery) | hook | Subscribe to a query with fine-grained reactive signals. |
| [`useMutation`](#usemutation) | hook | Run a mutation (create / update / delete). |
| [`useInfiniteQuery`](#useinfinitequery) | hook | Paginated / cursor-based query. |
| [`useQueries`](#usequeries) | hook | Subscribe to multiple queries in parallel. |
| [`useSubscription`](#usesubscription) | hook | Reactive WebSocket with auto-reconnect and QueryClient cache integration. |
| [`useSSE`](#usesse) | hook | Reactive Server-Sent Events hook with QueryClient cache integration. |
| [`useSuspenseQuery`](#usesuspensequery) | hook | Like `useQuery` but `data` is narrowed to `Signal<TData>` (never undefined). |
| [`useSuspenseInfiniteQuery`](#usesuspenseinfinitequery) | hook | Like `useInfiniteQuery` but `data` is narrowed to `Signal<InfiniteData<TQueryFnData>>` (never undefined) — for use insid |
| [`QuerySuspense`](#querysuspense) | component | Pyreon-native Suspense boundary for queries — replaces `<Suspense>` for the query use case with explicit error handling. |
| [`useIsFetching`](#useisfetching) | hook | Global reactive count of currently-fetching queries. |
| [`useIsMutating`](#useismutating) | hook | Global reactive count of currently-running mutations (optionally filtered by `MutationFilters`). |
| [`QueryErrorResetBoundary`](#queryerrorresetboundary) | component | Resets errored queries inside its subtree when a sibling `ErrorBoundary` recovers. |
| [`useQueryErrorResetBoundary`](#usequeryerrorresetboundary) | hook | Imperative access to the nearest `QueryErrorResetBoundary`. |
| [`useQueryClient`](#usequeryclient) | hook | Access the nearest `QueryClient` from context. |
| [`TanStack core re-exports`](#tanstack-core-re-exports) | function | `@pyreon/query` re-exports the framework-agnostic TanStack surface so consumers import every primitive from one entry: ` |

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

**See also:** `useQuery` · `useIsMutating`

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

**See also:** `useQuery`

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
(props: QueryErrorResetBoundaryProps) => VNodeChild
```

Resets errored queries inside its subtree when a sibling `ErrorBoundary` recovers. Wrap around a `QuerySuspense` + `ErrorBoundary` pair to get clean retry semantics — without this, a recovered `ErrorBoundary` re-renders children but the queries still hold their error state, so the boundary immediately catches the same error again (infinite error loop). Accepts a render function child `{(reset) => ...}` so the reset action can be wired to a retry button.

**Example**

```tsx
<QueryErrorResetBoundary>
  {(reset) => (
    <ErrorBoundary fallback={(err, retry) => <button onClick={() => { reset(); retry() }}>Retry</button>}>
      <QuerySuspense query={q}>{() => <Data />}</QuerySuspense>
    </ErrorBoundary>
  )}
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

### TanStack core re-exports `function`

```ts
import { QueryClient, QueryCache, MutationCache, dehydrate, hydrate, keepPreviousData, hashKey, isCancelledError, CancelledError, defaultShouldDehydrateQuery, defaultShouldDehydrateMutation } from '@pyreon/query'
```

`@pyreon/query` re-exports the framework-agnostic TanStack surface so consumers import every primitive from one entry: `QueryClient` / `QueryCache` / `MutationCache` (instance classes), `dehydrate` / `hydrate` (SSR serialization), `keepPreviousData` (placeholder helper), `hashKey` / `isCancelledError` / `CancelledError`, and the `defaultShouldDehydrate*` predicates. Types (`QueryKey`, `QueryFilters`, `MutationFilters`, `DehydratedState`, `FetchQueryOptions`, `InvalidateQueryFilters`, `InvalidateOptions`, `RefetchQueryFilters`, `RefetchOptions`, `QueryClientConfig`) re-export alongside the runtime values.

**Example**

```tsx
// SSR dehydration round-trip:
import { QueryClient, dehydrate, hydrate } from '@pyreon/query'

const server = new QueryClient()
await server.prefetchQuery({ queryKey: ['users'], queryFn: fetchUsers })
const snapshot = dehydrate(server)

const client = new QueryClient()
hydrate(client, snapshot)
```

**See also:** `QueryClientProvider` · `useQueryClient`

---

## Package-level notes

> **Options as a function:** `useQuery` / `useInfiniteQuery` / `useQueries` / `useSuspenseQuery` take options as a FUNCTION (not an object) so `queryKey` and other fields can read Pyreon signals. TanStack core uses an object; Pyreon wraps so changing a tracked signal re-runs the observer options and refetches automatically.

> **Signals all the way down:** `result.data`, `.error`, `.isFetching`, etc. are independent `Signal<T>` values — not plain properties. Call them (`user.data()`) to read, and each field-level read only subscribes to that field so templates re-render with maximum precision.

> **Real-time + cache:** `useSubscription` (WebSocket) and `useSSE` (Server-Sent Events) both hand their `onMessage` callback the active `QueryClient`. Invalidate or patch queries directly from push updates instead of duplicating server state in a parallel signal store.

> **Suspense data is non-undefined:** `useSuspenseQuery` narrows `data: Signal<TData>` (never undefined). Read it unconditionally inside `QuerySuspense` children — the boundary guarantees success before rendering. Outside the boundary, use `useQuery` and handle the undefined case.
