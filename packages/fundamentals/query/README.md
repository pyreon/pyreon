# @pyreon/query

Pyreon adapter for TanStack Query — reactive queries, mutations, suspense, subscriptions, SSE.

`@pyreon/query` wraps `@tanstack/query-core` with Pyreon's fine-grained signal model: every observer field (`data`, `error`, `isFetching`, …) is its own `Signal<T>`, so reading `query.data()` doesn't re-run when `isFetching` flips. Query options are passed as a **function** so reactive values (signal-driven query keys, params) trigger automatic refetches; mutation options are a plain object because mutations are imperative. Ships `useQuery` / `useMutation` / `useInfiniteQuery` / `useQueries`, Suspense variants, `useSubscription` (WebSocket) + `useSSE` (Server-Sent Events) with QueryClient cache integration, and the full `@tanstack/query-core` re-export so consumers get one import surface.

## Install

```bash
bun add @pyreon/query @pyreon/core @pyreon/reactivity
# @tanstack/query-core is a hard dependency, installed automatically
```

## Quick start

```tsx
import { QueryClient, QueryClientProvider, useQuery } from '@pyreon/query'

const queryClient = new QueryClient()

function UserProfile(props: { id: string }) {
  const query = useQuery(() => ({
    queryKey: ['user', props.id],
    queryFn: () => fetch(`/api/users/${props.id}`).then((r) => r.json()),
  }))

  return () => {
    if (query.isLoading()) return <p>Loading...</p>
    if (query.isError()) return <p>Error: {query.error()?.message}</p>
    return <h1>{query.data()?.name}</h1>
  }
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserProfile id="1" />
  </QueryClientProvider>
)
```

## `useQuery(() => options)`

Subscribe to a query with fine-grained signals. **Options are a function** — read signals inside and the observer reconfigures + refetches when they change.

```ts
const userId = signal(1)
const query = useQuery(() => ({
  queryKey: ['user', userId()],
  queryFn: () => fetchUser(userId()),
}))
// userId.set(2) → automatic refetch
```

Returns `UseQueryResult<TData, TError>`:

| Property      | Type                                            | Notes                                  |
| ------------- | ----------------------------------------------- | -------------------------------------- |
| `result`      | `Signal<QueryObserverResult>`                   | Full observer result (escape hatch)    |
| `data`        | `Signal<TData \| undefined>`                    |                                        |
| `error`       | `Signal<TError \| null>`                        |                                        |
| `status`      | `Signal<'pending' \| 'error' \| 'success'>`     |                                        |
| `isPending`   | `Signal<boolean>`                               | No data yet                            |
| `isLoading`   | `Signal<boolean>`                               | First fetch in progress                |
| `isFetching`  | `Signal<boolean>`                               | Any fetch (incl. background refetch)   |
| `isError`     | `Signal<boolean>`                               |                                        |
| `isSuccess`   | `Signal<boolean>`                               |                                        |
| `refetch()`   | `() => Promise<QueryObserverResult>`            | Manual refetch                         |

**Lazy signal allocation**: each property is materialized on first access via getter (`??=`), so a consumer that only reads `data` and `isLoading` doesn't allocate the other 7 signals. Same `Signal<T>` identity is preserved across repeat access.

## `useMutation(options)`

Mutations are imperative — options are a **plain object**, not a function.

```ts
const mutation = useMutation({
  mutationFn: (post: { title: string }) =>
    fetch('/api/posts', { method: 'POST', body: JSON.stringify(post) }).then((r) => r.json()),
  // Auto-invalidate queries on success (extension of TanStack's interface)
  invalidates: [['posts']],
  onSuccess: (data) => console.log('Created', data),
})

mutation.mutate({ title: 'Hello' })       // fire-and-forget, errors land in mutation.error()
await mutation.mutateAsync({ title: '!' }) // promise — use for try/catch
mutation.reset()                           // back to idle
```

`UseMutationResult` shape mirrors `UseQueryResult` plus `mutate` / `mutateAsync` / `reset`, with status `'idle' | 'pending' | 'success' | 'error'`.

## `useInfiniteQuery(() => options)` / `useSuspenseQuery` / `useSuspenseInfiniteQuery`

Same shape as `useQuery`. Suspense variants narrow `data` to `Signal<TData>` (non-undefined after suspense resolves) and MUST be wrapped in `<QuerySuspense>`.

```tsx
function UserList() {
  const query = useSuspenseQuery(() => ({
    queryKey: ['users'],
    queryFn: fetchUsers,
  }))
  return () => (
    <ul>
      {query.data().map((u) => (
        <li>{u.name}</li>
      ))}
    </ul>
  )
}

;<QuerySuspense fallback={<p>Loading...</p>}>
  <UserList />
</QuerySuspense>
```

## `useQueries(() => options)`

Multiple parallel queries. Options as a function so the query array itself can be reactive.

```ts
const ids = signal([1, 2, 3])
const queries = useQueries(() =>
  ids().map((id) => ({ queryKey: ['user', id], queryFn: () => fetchUser(id) })),
)
// queries is an array of UseQueryResult
```

## `defineQueries({ a, b, c })`

Named parallel queries returning a typed object instead of an array.

```ts
const queries = defineQueries({
  user: () => ({ queryKey: ['user'], queryFn: fetchUser }),
  posts: () => ({ queryKey: ['posts'], queryFn: fetchPosts }),
})
queries.user.data()
queries.posts.data()
```

## `useSubscription(options)`

Reactive WebSocket with auto-reconnect. `onMessage` receives the active `QueryClient` so pushes can directly invalidate cache. Exponential backoff (default 1s doubling, max 10 attempts). `url` and `enabled` may be signals.

```ts
const sub = useSubscription({
  url: 'wss://api.example.com/feed',
  onMessage: (event, client) => {
    const msg = JSON.parse(event.data)
    if (msg.type === 'post-created') {
      client.invalidateQueries({ queryKey: ['posts'] })
    }
  },
})
// sub.status() | sub.send(data) | sub.close() | sub.reconnect()
```

## `useSSE(options)`

Server-Sent Events — same shape as `useSubscription`, read-only. `parse` deserializes each event; `events` filters named event types. `lastEventId()` updates on every incoming `id` field.

```ts
const sse = useSSE({
  url: '/api/events',
  parse: JSON.parse,
  onMessage: (data, queryClient) => {
    if (data.type === 'order-updated') {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  },
})
```

**Resuming across remount**: `EventSource` cannot set `Last-Event-ID` on the FIRST connection — pair `useStorage` with the `initialLastEventId` option and pass the ID in the URL so the server reads it as a query param:

```ts
const lastId = useStorage('chat-last-id', '')
const sse = useSSE({
  url: () => `/api/events?lastId=${lastId() || ''}`,
  initialLastEventId: lastId,
  onMessage: (msg) => lastId.set(msg.id),
})
```

`initialLastEventId` is read **once at mount** — subsequent changes are ignored. Use the reactive `url` (or `sse.reconnect()`) for runtime overrides.

## `useIsFetching(filters?)` / `useIsMutating(filters?)`

Global counters as reactive signals — useful for top-of-page spinners.

```ts
const fetching = useIsFetching() // Signal<number>
const mutating = useIsMutating({ mutationKey: ['posts'] })
```

## `QueryErrorResetBoundary` / `useQueryErrorResetBoundary()`

Pair with a sibling `ErrorBoundary` so the fallback's retry button clears errored queries before retrying.

```tsx
<QueryErrorResetBoundary>
  {({ reset }) => (
    <ErrorBoundary fallback={(err, retry) => <button onClick={() => { reset(); retry() }}>Retry</button>}>
      <UserList />
    </ErrorBoundary>
  )}
</QueryErrorResetBoundary>
```

Or imperatively: `const { reset } = useQueryErrorResetBoundary()`.

## `useQueryClient()`

Access the nearest `QueryClient`. Throws if no provider is mounted above the call site.

## SSR dehydration

```ts
import { QueryClient, dehydrate, hydrate } from '@pyreon/query'

// Server:
const queryClient = new QueryClient()
await queryClient.prefetchQuery({ queryKey: ['users'], queryFn: fetchUsers })
const dehydratedState = dehydrate(queryClient)

// Client:
hydrate(queryClient, dehydratedState)
```

## Re-exports from `@tanstack/query-core`

Everything from `@tanstack/query-core` is re-exported, so `@pyreon/query` is your single import.

**Runtime**: `QueryClient`, `QueryCache`, `MutationCache`, `dehydrate`, `hydrate`, `keepPreviousData`, `hashKey`, `isCancelledError`, `CancelledError`, `defaultShouldDehydrateQuery`, `defaultShouldDehydrateMutation`.

**Types**: `QueryKey`, `QueryFilters`, `MutationFilters`, `DehydratedState`, `FetchQueryOptions`, `InvalidateQueryFilters`, `InvalidateOptions`, `RefetchQueryFilters`, `RefetchOptions`, `QueryClientConfig`.

## Gotchas

- **`useQuery` / `useInfiniteQuery` / `useQueries` / `useSuspenseQuery` take options as a FUNCTION**, not an object. Reading signals inside is the mechanism for reactive refetches. Caught by the lint rule + MCP detector `pyreon/query-options-as-function` (auto-fixable). `useMutation` is the exception — plain object.
- **Fields are independently subscribable** — `query.data()` does NOT re-run when `query.isFetching` flips, and vice versa. Read only what you need.
- **`mutate()` swallows errors** into the `error` signal. Use `mutateAsync()` if you need try/catch.
- **`useSuspenseQuery` / `useSuspenseInfiniteQuery` require `<QuerySuspense>`** — without it the narrowed `data: Signal<TData>` type lies (CAN be undefined during first render cycle).
- **`<QuerySuspense>` children should be a function**: `{() => <UI />}`. Plain JSX evaluates eagerly and defeats the suspense gate.
- **`useSubscription` `onMessage` runs on every WebSocket frame** — debounce cache invalidations for high-frequency streams.
- **`useSSE.parse` is required for typed data** — without it, `data()` is the raw `string` event payload.
- **`useSSE.initialLastEventId` is read once at mount** — runtime changes need the reactive `url` (or `reconnect()`).
- **Observer subscriptions auto-clean on unmount** via `onUnmount` — no manual disposal needed.

## Documentation

Full docs: [docs.pyreon.dev/docs/query](https://docs.pyreon.dev/docs/query) (or `docs/src/content/docs/query.md` in this repo).

## License

MIT
