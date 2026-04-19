import { defineManifest } from '@pyreon/manifest'

/**
 * Migrates the existing `@pyreon/query` entries in llms.txt and
 * llms-full.txt. Consolidates the previously-split "TanStack Query
 * Adapter" + "useSSE (Server-Sent Events)" sections into a single
 * manifest — all transport hooks (useQuery/useMutation/useSubscription/
 * useSSE) share the same QueryClient integration and belong in one
 * section.
 */
export default defineManifest({
  name: '@pyreon/query',
  title: 'TanStack Query Adapter',
  tagline:
    'TanStack Query adapter with signal-driven results + WebSocket subscriptions + SSE (useSSE)',
  description:
    'Pyreon adapter for TanStack Query. Fine-grained signals per observer field (data, error, isFetching) so effects only re-run for the fields they read. Re-exports TanStack core (QueryClient, dehydrate/hydrate, etc.) so users import everything from `@pyreon/query`. Real-time hooks `useSubscription` (WebSocket, auto-reconnect, bidirectional) and `useSSE` (Server-Sent Events, read-only) share the QueryClient so cache invalidation from push updates is one line.',
  category: 'universal',
  longExample: `import {
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

// 2. useQuery — \`options\` is a function so it can read Pyreon signals.
//    When the signal changes (e.g. a reactive queryKey), the observer
//    updates and refetches automatically.
const userId = signal(1)
const user = useQuery(() => ({
  queryKey: ['user', userId()],
  queryFn: () => fetch(\`/api/users/\${userId()}\`).then((r) => r.json()),
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
//    \`parse\` deserializes per message; \`events\` filters named event types.
const sse = useSSE({
  url: '/api/events',
  parse: JSON.parse,
  onMessage: (data, queryClient) => {
    if (data.type === 'order-updated') {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  },
})
// sse.data() — last parsed message. sse.lastEventId() honours SSE \`id\` field.

// 6. Suspense — useSuspenseQuery narrows \`data\` to Signal<TData> (never
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
}))`,
  features: [
    'Fine-grained signals per observer field (data, error, isFetching independent)',
    'Re-exports TanStack core: QueryClient, dehydrate/hydrate, CancelledError, keepPreviousData, etc.',
    'useQuery / useMutation / useInfiniteQuery / useQueries with signal-driven options',
    'useSuspenseQuery / useSuspenseInfiniteQuery + QuerySuspense boundary (non-undefined data)',
    'useSubscription — reactive WebSocket with auto-reconnect and QueryClient cache integration',
    'useSSE — Server-Sent Events with QueryClient cache integration',
    'useIsFetching / useIsMutating — global count signals for spinners',
    'QueryErrorResetBoundary — resets errored queries when an ErrorBoundary recovers',
  ],
  api: [
    {
      name: 'QueryClientProvider',
      kind: 'component',
      signature: '(props: { client: QueryClient; children: VNodeChild }) => VNode',
      summary:
        'Mounts a `QueryClient` at the root of the component tree via context so every descendant hook (`useQuery`, `useMutation`, `useSubscription`, `useSSE`, etc.) can reach it via `useQueryClient()`. Must wrap the app — omitting it causes a runtime throw on the first hook call. One provider per app; nested providers are not supported (the deepest one wins, silently shadowing the outer).',
      example: `const client = new QueryClient()
<QueryClientProvider client={client}>
  <App />
</QueryClientProvider>`,
      mistakes: [
        'Forgetting to wrap the app — every query/mutation hook throws "No QueryClient set" at runtime',
        'Creating the `QueryClient` inside a component body — it re-creates on every render. Hoist to module scope or use `useMemo`-equivalent (`const client = useMemo(() => new QueryClient())`)',
        'Nesting providers expecting scoped caches — only one provider is supported; the deepest one wins silently',
      ],
      seeAlso: ['useQueryClient', 'QueryClient'],
    },
    {
      name: 'useQuery',
      kind: 'hook',
      signature:
        '<TData, TError, TKey>(options: () => QueryObserverOptions<...>) => UseQueryResult<TData, TError>',
      summary:
        'Subscribe to a query with fine-grained reactive signals. `options` is a FUNCTION (not an object) so it can read Pyreon signals — when a tracked signal inside changes (e.g. a reactive queryKey), the observer re-evaluates options and refetches automatically. Returns one independent `Signal<T>` per observer field (`data`, `error`, `status`, `isPending`, `isLoading`, `isFetching`, `isError`, `isSuccess`) so templates only re-run for the exact fields they read. Internally wraps TanStack\'s `QueryObserver` and subscribes via `onUnmount`-guarded effect — the observer unsubscribes when the component unmounts.',
      example: `const userId = signal(1)
const user = useQuery(() => ({
  queryKey: ['user', userId()],
  queryFn: () => fetch(\`/api/users/\${userId()}\`).then((r) => r.json()),
}))
// user.data(), user.error(), user.isFetching() — each its own signal`,
      mistakes: [
        'Passing the options object directly instead of a function — loses reactive queryKey support; the observer never re-evaluates when signals change',
        'Reading `.data` / `.error` / `.isFetching` as plain values — they are `Signal<T>`, call them: `user.data()`, `user.isFetching()`',
        'Destructuring `const { data } = useQuery(...)` at setup and reading `data` later — captures the Signal reference once, which is fine, but storing `data()` at setup captures the initial VALUE and defeats reactivity',
        'Returning `user.data()` at the top of a component body instead of inside a reactive accessor — components run once; read signals inside `() => user.data()?.name` or effects',
        'Expecting refetch on `queryFn` closure changes alone — only signals read inside the options function trigger re-evaluation; a closure capture of a `let` variable does not',
      ],
      seeAlso: ['useQueryClient', 'useMutation', 'useSuspenseQuery'],
    },
    {
      name: 'useMutation',
      kind: 'hook',
      signature:
        '<TData, TError, TVars, TCtx>(options: MutationObserverOptions<...>) => UseMutationResult<TData, TError, TVars, TCtx>',
      summary:
        'Run a mutation (create / update / delete). Returns reactive `pending` / `success` / `error` signals plus two firing modes: `mutate(vars)` (fire-and-forget — errors go to the `error` signal) and `mutateAsync(vars)` (returns a promise for try/catch). `reset()` returns state to idle. Unlike `useQuery`, options is a plain object — mutations are imperative, no reactive-tracking needed. `onSuccess` / `onError` / `onSettled` callbacks fire synchronously after the mutation resolves, useful for cache invalidation (`client.invalidateQueries`).',
      mistakes: [
        '`mutate()` swallows errors into the `error` signal — use `mutateAsync()` with try/catch if you need programmatic error handling',
        'Calling `mutate()` inside a `useQuery` `queryFn` — mutations are imperative user actions, not data-fetching side effects; this causes infinite loops if the mutation invalidates the query that spawned it',
        'Reading `mutation.data()` outside a reactive scope — same rule as `useQuery`: read inside `() => mutation.data()` or effects',
      ],
      example: `const create = useMutation({
  mutationFn: (input) => fetch('/api/posts', { method: 'POST', body: JSON.stringify(input) }).then(r => r.json()),
  onSuccess: () => client.invalidateQueries({ queryKey: ['posts'] }),
})
// <button onClick={() => create.mutate({ title: 'New' })}>Create</button>`,
      seeAlso: ['useQuery', 'useIsMutating'],
    },
    {
      name: 'useInfiniteQuery',
      kind: 'hook',
      signature:
        '<TQueryFnData, TError>(options: () => InfiniteQueryObserverOptions<...>) => UseInfiniteQueryResult<TQueryFnData, TError>',
      summary:
        'Paginated / cursor-based query. Returns reactive `data` (wrapping `InfiniteData<T>` with `.pages` + `.pageParams`), `hasNextPage` / `hasPreviousPage` booleans, and `fetchNextPage` / `fetchPreviousPage` trigger functions. Options is a function (same reactive-tracking contract as `useQuery`). `getNextPageParam` / `getPreviousPageParam` drive cursor progression — return `undefined` to signal the end.',
      mistakes: [
        'Forgetting `initialPageParam` — required by TanStack v5; omitting it throws at the first `queryFn` call',
        'Using `data().pages` without flattening — `pages` is an array of page results; most UIs want `data().pages.flat()` or `data().pages.flatMap(p => p.items)`',
      ],
      example: `const feed = useInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,
}))`,
      seeAlso: ['useQuery', 'useSuspenseInfiniteQuery'],
    },
    {
      name: 'useQueries',
      kind: 'hook',
      signature: '(queries: () => UseQueriesOptions[]) => Signal<QueryObserverResult[]>',
      summary:
        'Subscribe to multiple queries in parallel. Returns a `Signal<QueryObserverResult[]>` — one entry per input query. Options is a function so the query list can depend on signals (e.g. derive one query per item in a reactive array). Each inner query independently tracks its own `data` / `error` / `isFetching` — the outer signal fires when ANY inner query updates.',
      mistakes: [
        'Expecting per-query fine-grained signals — `useQueries` returns a single combined signal, not individual `UseQueryResult` objects. For independent per-query tracking, call `useQuery` N times',
      ],
      example: `const results = useQueries(() =>
  userIds().map((id) => ({ queryKey: ['user', id], queryFn: () => fetchUser(id) })),
)
// results() is QueryObserverResult[] — one entry per input query`,
      seeAlso: ['useQuery'],
    },
    {
      name: 'useSubscription',
      kind: 'hook',
      signature: '(options: UseSubscriptionOptions) => UseSubscriptionResult',
      summary:
        'Reactive WebSocket with auto-reconnect and QueryClient cache integration. `onMessage` receives the active `QueryClient` so push updates can invalidate or directly patch cached queries in a single line. Exponential backoff on reconnect (default 1s doubling, max 10 attempts — configurable via `reconnectDelay` / `maxReconnectAttempts`). `url` and `enabled` may be signals for reactive connection management — changing the URL closes the old socket and opens a new one. Returns `status` (signal), `send(data)`, `close()`, `reconnect()`.',
      example: `const sub = useSubscription({
  url: 'wss://api.example.com/feed',
  onMessage: (event, client) => {
    if (JSON.parse(event.data).type === 'post-created') {
      client.invalidateQueries({ queryKey: ['posts'] })
    }
  },
})
// sub.status() — 'connecting' | 'connected' | 'disconnected' | 'error'
// sub.send(data), sub.close(), sub.reconnect()`,
      mistakes: [
        '`onMessage` runs on every frame the socket receives — debounce cache invalidations for high-frequency streams or you\'ll trigger N refetches per second',
        'Storing data in a parallel signal instead of using `queryClient.setQueryData` inside `onMessage` — defeats the QueryClient cache; use `setQueryData` to push updates into the same cache that `useQuery` reads',
        'Forgetting `enabled: false` on unmount-sensitive connections — the WebSocket stays open unless `enabled` is a signal that tracks component lifecycle or a reactive condition',
      ],
      seeAlso: ['useSSE', 'useQuery'],
    },
    {
      name: 'useSSE',
      kind: 'hook',
      signature: '<T>(options: UseSSEOptions<T>) => UseSSEResult<T>',
      summary:
        'Reactive Server-Sent Events hook with QueryClient cache integration. Same pattern as `useSubscription` but read-only (no `send`). `parse` deserializes raw event data per message (e.g. `JSON.parse`); `events` filters named SSE event types (defaults to generic `message` events). Honours the SSE spec `id` field via `lastEventId()` so the browser includes `Last-Event-ID` on reconnect and the server can resume from the right offset. `onMessage` receives the `QueryClient` for cache invalidation.',
      mistakes: [
        'Passing `queryKey` (TanStack v4 pattern) instead of using `onMessage` for cache integration — Pyreon\'s `useSSE` does NOT auto-update query cache; use `queryClient.setQueryData` or `invalidateQueries` inside `onMessage`',
        'Omitting `parse` and expecting typed data — without `parse`, `data()` is `string` (raw event payload); pass `parse: JSON.parse` for auto-deserialization',
      ],
      example: `const sse = useSSE({
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
// sse.lastEventId(), sse.readyState(), sse.close(), sse.reconnect()`,
      seeAlso: ['useSubscription'],
    },
    {
      name: 'useSuspenseQuery',
      kind: 'hook',
      signature:
        '<TData, TError>(options: () => QueryObserverOptions<...>) => UseSuspenseQueryResult<TData, TError>',
      summary:
        'Like `useQuery` but `data` is narrowed to `Signal<TData>` (never undefined). Designed for use inside a `QuerySuspense` boundary that guarantees children only render after the query succeeds — read `user.data().name` unconditionally, no `undefined` guard needed. The Suspense-mode observer fires a background refetch but never transitions `data` back to `undefined` (the previous data is retained as placeholder). `useSuspenseInfiniteQuery` is the equivalent for paginated queries.',
      mistakes: [
        'Using `useSuspenseQuery` without a `QuerySuspense` wrapper — the narrowed type assumes a boundary guarantees data; without it, `data()` CAN be the initial value during the first render cycle',
        'Mixing `useSuspenseQuery` and `useQuery` for the same `queryKey` — the Suspense observer and the regular observer can race; use one or the other per key',
      ],
      example: `const user = useSuspenseQuery(() => ({ queryKey: ['user', id()], queryFn: fetchUser }))

<QuerySuspense query={user} fallback={<Spinner />}>
  {() => <UserCard name={user.data().name} />}
</QuerySuspense>`,
      seeAlso: ['QuerySuspense', 'useSuspenseInfiniteQuery', 'useQuery'],
    },
    {
      name: 'useSuspenseInfiniteQuery',
      kind: 'hook',
      signature:
        '<TQueryFnData, TError>(options: () => InfiniteQueryObserverOptions<...>) => UseSuspenseInfiniteQueryResult<TQueryFnData, TError>',
      summary:
        'Like `useInfiniteQuery` but `data` is narrowed to `Signal<InfiniteData<TQueryFnData>>` (never undefined) — for use inside a `QuerySuspense` boundary. Returns the same `fetchNextPage` / `fetchPreviousPage` / `hasNextPage` / `hasPreviousPage` surface as `useInfiniteQuery`. Same caveats as `useSuspenseQuery` regarding Suspense boundary requirement.',
      example: `const feed = useSuspenseInfiniteQuery(() => ({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last) => last.nextCursor,
}))

<QuerySuspense query={feed} fallback={<Spinner />}>
  {() => <Feed pages={feed.data().pages} onMore={feed.fetchNextPage} />}
</QuerySuspense>`,
      seeAlso: ['useSuspenseQuery', 'useInfiniteQuery', 'QuerySuspense'],
    },
    {
      name: 'QuerySuspense',
      kind: 'component',
      signature: '(props: QuerySuspenseProps) => VNodeChild',
      summary:
        'Pyreon-native Suspense boundary for queries — replaces `<Suspense>` for the query use case with explicit error handling. Shows `fallback` while any query is `isPending`. On error, renders the `error` callback or re-throws to the nearest `ErrorBoundary`. Accepts a single query or an array — pass an array to gate on multiple queries in parallel. Children are a function (`{() => <UI />}`) so they only execute after all queries succeed.',
      mistakes: [
        'Passing children as plain JSX (`<QuerySuspense query={q}><Data /></QuerySuspense>`) instead of a function — plain children evaluate eagerly, defeating the Suspense gate. Always wrap: `{() => <Data />}`',
        'Omitting the `error` callback — errors re-throw to the nearest `ErrorBoundary`, which may not exist or may be too far up the tree. Provide an explicit `error` fallback for precise error handling',
      ],
      example: `<QuerySuspense
  query={[userQuery, postsQuery]}
  fallback={<Spinner />}
  error={(err) => <ErrorCard message={String(err)} />}
>
  {() => <Dashboard user={userQuery.data()} posts={postsQuery.data()} />}
</QuerySuspense>`,
      seeAlso: ['useSuspenseQuery', 'useSuspenseInfiniteQuery'],
    },
    {
      name: 'useIsFetching',
      kind: 'hook',
      signature: '(filters?: QueryFilters) => Signal<number>',
      summary:
        'Global reactive count of currently-fetching queries. Pass `QueryFilters` to narrow by `queryKey` prefix, `stale` status, or `fetchStatus`. Pair with `useIsMutating` to drive a top-of-page progress bar that aggregates ALL in-flight data fetching without tracking individual queries. Returns `Signal<number>` — zero when idle.',
      example: `const fetching = useIsFetching()
// <TopSpinner visible={() => fetching() > 0} />`,
      seeAlso: ['useIsMutating'],
    },
    {
      name: 'useIsMutating',
      kind: 'hook',
      signature: '(filters?: MutationFilters) => Signal<number>',
      summary: 'Global reactive count of currently-running mutations (optionally filtered by `MutationFilters`). Same pattern as `useIsFetching` but for the mutation pipeline. Returns `Signal<number>` — zero when no mutations are in flight.',
      example: `const mutating = useIsMutating()
// <Banner visible={() => mutating() > 0}>Saving…</Banner>`,
      seeAlso: ['useIsFetching'],
    },
    {
      name: 'QueryErrorResetBoundary',
      kind: 'component',
      signature: '(props: QueryErrorResetBoundaryProps) => VNodeChild',
      summary:
        'Resets errored queries inside its subtree when a sibling `ErrorBoundary` recovers. Wrap around a `QuerySuspense` + `ErrorBoundary` pair to get clean retry semantics — without this, a recovered `ErrorBoundary` re-renders children but the queries still hold their error state, so the boundary immediately catches the same error again (infinite error loop). Accepts a render function child `{(reset) => ...}` so the reset action can be wired to a retry button.',
      example: `<QueryErrorResetBoundary>
  {(reset) => (
    <ErrorBoundary fallback={(err, retry) => <button onClick={() => { reset(); retry() }}>Retry</button>}>
      <QuerySuspense query={q}>{() => <Data />}</QuerySuspense>
    </ErrorBoundary>
  )}
</QueryErrorResetBoundary>`,
      seeAlso: ['QuerySuspense'],
    },
    {
      name: 'useQueryErrorResetBoundary',
      kind: 'hook',
      signature: '() => { reset: () => void }',
      summary:
        'Imperative access to the nearest `QueryErrorResetBoundary`. Returns `{ reset }` — call `reset()` to clear errored queries in the subtree. Useful when an error fallback has its own retry button outside the render-prop form of `QueryErrorResetBoundary`, e.g. inside a standalone `ErrorBoundary` fallback component that isn\'t a direct child of the boundary.',
      example: `const { reset } = useQueryErrorResetBoundary()
// Inside an ErrorBoundary fallback:
<button onClick={() => { reset(); retry() }}>Try again</button>`,
      seeAlso: ['QueryErrorResetBoundary'],
    },
    {
      name: 'useQueryClient',
      kind: 'hook',
      signature: '() => QueryClient',
      summary:
        'Access the nearest `QueryClient` from context. Used to invalidate queries (`client.invalidateQueries`), prefetch data (`client.prefetchQuery`), read/write cache (`getQueryData` / `setQueryData`), or cancel queries. Throws "[Pyreon] No QueryClient set" if no `QueryClientProvider` is mounted above the call site. Returns the same `QueryClient` instance that TanStack core exposes — all TanStack methods work.',
      mistakes: [
        'Calling `useQueryClient()` at module scope — hooks require an active component setup context; hoist into the component body or pass the client as a function parameter',
      ],
      example: `const client = useQueryClient()
client.invalidateQueries({ queryKey: ['posts'] })
await client.prefetchQuery({ queryKey: ['user', 1], queryFn: fetchUser })`,
      seeAlso: ['QueryClientProvider'],
    },
    {
      name: 'TanStack core re-exports',
      kind: 'function',
      signature:
        "import { QueryClient, QueryCache, MutationCache, dehydrate, hydrate, keepPreviousData, hashKey, isCancelledError, CancelledError, defaultShouldDehydrateQuery, defaultShouldDehydrateMutation } from '@pyreon/query'",
      summary:
        '`@pyreon/query` re-exports the framework-agnostic TanStack surface so consumers import every primitive from one entry: `QueryClient` / `QueryCache` / `MutationCache` (instance classes), `dehydrate` / `hydrate` (SSR serialization), `keepPreviousData` (placeholder helper), `hashKey` / `isCancelledError` / `CancelledError`, and the `defaultShouldDehydrate*` predicates. Types (`QueryKey`, `QueryFilters`, `MutationFilters`, `DehydratedState`, `FetchQueryOptions`, `InvalidateQueryFilters`, `InvalidateOptions`, `RefetchQueryFilters`, `RefetchOptions`, `QueryClientConfig`) re-export alongside the runtime values.',
      example: `// SSR dehydration round-trip:
import { QueryClient, dehydrate, hydrate } from '@pyreon/query'

const server = new QueryClient()
await server.prefetchQuery({ queryKey: ['users'], queryFn: fetchUsers })
const snapshot = dehydrate(server)

const client = new QueryClient()
hydrate(client, snapshot)`,
      seeAlso: ['QueryClientProvider', 'useQueryClient'],
    },
  ],
  gotchas: [
    // First gotcha also feeds the llms.txt one-liner teaser. Keep it
    // the most distinctive foot-gun — here, the function-options form
    // that enables reactive queryKeys (a departure from TanStack's
    // object-options convention everywhere else).
    {
      label: 'Options as a function',
      note: '`useQuery` / `useInfiniteQuery` / `useQueries` / `useSuspenseQuery` take options as a FUNCTION (not an object) so `queryKey` and other fields can read Pyreon signals. TanStack core uses an object; Pyreon wraps so changing a tracked signal re-runs the observer options and refetches automatically.',
    },
    {
      label: 'Signals all the way down',
      note: '`result.data`, `.error`, `.isFetching`, etc. are independent `Signal<T>` values — not plain properties. Call them (`user.data()`) to read, and each field-level read only subscribes to that field so templates re-render with maximum precision.',
    },
    {
      label: 'Real-time + cache',
      note: '`useSubscription` (WebSocket) and `useSSE` (Server-Sent Events) both hand their `onMessage` callback the active `QueryClient`. Invalidate or patch queries directly from push updates instead of duplicating server state in a parallel signal store.',
    },
    {
      label: 'Suspense data is non-undefined',
      note: '`useSuspenseQuery` narrows `data: Signal<TData>` (never undefined). Read it unconditionally inside `QuerySuspense` children — the boundary guarantees success before rendering. Outside the boundary, use `useQuery` and handle the undefined case.',
    },
  ],
})
