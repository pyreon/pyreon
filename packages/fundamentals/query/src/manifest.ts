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
        'Mounts a QueryClient at the root of the component tree so descendant hooks can reach it via useQueryClient(). Always wrap your app.',
      example: `const client = new QueryClient()
<QueryClientProvider client={client}>
  <App />
</QueryClientProvider>`,
      seeAlso: ['useQueryClient', 'QueryClient'],
    },
    {
      name: 'useQuery',
      kind: 'hook',
      signature:
        '<TData, TError, TKey>(options: () => QueryObserverOptions<...>) => UseQueryResult<TData, TError>',
      summary:
        'Subscribe to a query. `options` is a FUNCTION so it can read Pyreon signals — when a signal inside changes (e.g. a reactive queryKey), the observer updates and refetches automatically. Returns one signal per observer field so templates only re-run for fields they actually read.',
      example: `const userId = signal(1)
const user = useQuery(() => ({
  queryKey: ['user', userId()],
  queryFn: () => fetch(\`/api/users/\${userId()}\`).then((r) => r.json()),
}))
// user.data(), user.error(), user.isFetching() — each its own signal`,
      mistakes: [
        'Passing the options object directly instead of a function — loses reactive queryKey support',
        'Reading .data / .error / .isFetching as plain values — they are signals (call them)',
      ],
      seeAlso: ['useQueryClient', 'useMutation', 'useSuspenseQuery'],
    },
    {
      name: 'useMutation',
      kind: 'hook',
      signature:
        '<TData, TError, TVars, TCtx>(options: MutationObserverOptions<...>) => UseMutationResult<TData, TError, TVars, TCtx>',
      summary:
        'Run a mutation (create/update/delete). Returns reactive pending/success/error signals plus `mutate` (fire-and-forget) and `mutateAsync` (returns a promise for try/catch). `reset()` returns state to idle.',
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
        'Paginated / cursor-driven query. Returns reactive `data.pages`, `hasNextPage`, `hasPreviousPage`, plus `fetchNextPage` / `fetchPreviousPage`. Options is a function so `queryKey` can reference signals.',
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
        'Subscribe to multiple queries in parallel. Returns a signal of the combined result array. Accepts a function so the query list can depend on signals.',
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
        'Reactive WebSocket with auto-reconnect. `onMessage` receives the QueryClient so push updates can invalidate or patch cached queries. Exponential backoff on reconnect (1s → 2s → 4s…). `url` and `enabled` may be signals for reactive connection management.',
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
        'Forgetting that `onMessage` runs on every frame the socket receives — debounce invalidations for high-frequency streams',
      ],
      seeAlso: ['useSSE', 'useQuery'],
    },
    {
      name: 'useSSE',
      kind: 'hook',
      signature: '<T>(options: UseSSEOptions<T>) => UseSSEResult<T>',
      summary:
        'Reactive Server-Sent Events hook. Same pattern as `useSubscription` but read-only (no `send`). `parse` deserializes raw event data (e.g. `JSON.parse`); `events` filters named event types (defaults to generic `message` events). Honours the SSE `id` field via `lastEventId()` so reconnects can resume.',
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
        'Like `useQuery` but `data` is `Signal<TData>` (never undefined). Designed for use inside a `QuerySuspense` boundary, which gates children on query success. `useSuspenseInfiniteQuery` is the equivalent for paginated queries.',
      example: `const user = useSuspenseQuery(() => ({ queryKey: ['user', id()], queryFn: fetchUser }))

<QuerySuspense query={user} fallback={<Spinner />}>
  {() => <UserCard name={user.data().name} />}
</QuerySuspense>`,
      seeAlso: ['QuerySuspense', 'useSuspenseInfiniteQuery', 'useQuery'],
    },
    {
      name: 'QuerySuspense',
      kind: 'component',
      signature: '(props: QuerySuspenseProps) => VNodeChild',
      summary:
        'Pyreon-native Suspense boundary for queries. Shows `fallback` while any query is pending. On error, renders the `error` fallback or re-throws to the nearest `ErrorBoundary`. Accepts a single query or an array.',
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
        'Global count of currently-fetching queries (optionally filtered). Pair with `useIsMutating` to drive a top-of-page spinner without tracking individual queries.',
      example: `const fetching = useIsFetching()
// <TopSpinner visible={() => fetching() > 0} />`,
      seeAlso: ['useIsMutating'],
    },
    {
      name: 'useIsMutating',
      kind: 'hook',
      signature: '(filters?: MutationFilters) => Signal<number>',
      summary: 'Global count of currently-running mutations (optionally filtered).',
      example: `const mutating = useIsMutating()
// <Banner visible={() => mutating() > 0}>Saving…</Banner>`,
      seeAlso: ['useIsFetching'],
    },
    {
      name: 'QueryErrorResetBoundary',
      kind: 'component',
      signature: '(props: QueryErrorResetBoundaryProps) => VNodeChild',
      summary:
        'Resets errored queries inside its subtree when a sibling `ErrorBoundary` recovers. Wrap around a `QuerySuspense` + `ErrorBoundary` pair to get clean retry semantics.',
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
      name: 'useQueryClient',
      kind: 'hook',
      signature: '() => QueryClient',
      summary:
        'Access the nearest QueryClient from context. Used to invalidate queries, prefetch, or manipulate cache imperatively. Throws if no `QueryClientProvider` is mounted.',
      example: `const client = useQueryClient()
client.invalidateQueries({ queryKey: ['posts'] })
await client.prefetchQuery({ queryKey: ['user', 1], queryFn: fetchUser })`,
      seeAlso: ['QueryClientProvider'],
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
