# @pyreon/query

Pyreon adapter for [TanStack Query](https://tanstack.com/query). Wraps TanStack Query's core with reactive signal-based hooks, Suspense integration, WebSocket subscriptions, and SSR dehydration/hydration.

## Installation

```bash
bun add @pyreon/query @tanstack/query-core
```

## Quick Start

```tsx
import { QueryClient, QueryClientProvider, useQuery } from "@pyreon/query"

const queryClient = new QueryClient()

function UserProfile({ id }: { id: string }) {
  const query = useQuery(() => ({
    queryKey: ["user", id],
    queryFn: () => fetch(`/api/users/${id}`).then(r => r.json()),
  }))

  return (
    <div>
      {() => query.isLoading() ? <Spinner /> : null}
      {() => query.isError() ? <p>Error: {query.error()?.message}</p> : null}
      {() => query.data() ? <h1>{query.data().name}</h1> : null}
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UserProfile id="1" />
    </QueryClientProvider>
  )
}
```

## QueryClientProvider

Provides a `QueryClient` instance to the component tree via context:

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
})

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

## useQuery

Returns a reactive query result with signal-based properties. Options are passed as a function so reactive signals can be read inside — when a signal changes, the observer updates automatically.

```tsx
const query = useQuery(() => ({
  queryKey: ["todos"],
  queryFn: fetchTodos,
}))

query.data()        // T | undefined
query.isLoading()   // boolean
query.isError()     // boolean
query.error()       // Error | null
query.isFetching()  // boolean
query.status()      // "pending" | "error" | "success"
```

### Reactive Query Keys

```tsx
function UserPosts({ userId }: { userId: () => string }) {
  const query = useQuery(() => ({
    queryKey: ["posts", userId()],
    queryFn: () => fetchPosts(userId()),
    enabled: !!userId(),
  }))
}
```

## useMutation

```tsx
const mutation = useMutation({
  mutationFn: (text: string) =>
    fetch("/api/todos", {
      method: "POST",
      body: JSON.stringify({ text }),
    }).then(r => r.json()),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["todos"] })
  },
})

mutation.mutate("New todo")
mutation.isPending()  // boolean signal
```

## useInfiniteQuery

Options are passed as a function, same as `useQuery`. The result `data` signal is typed as `InfiniteData<TQueryFnData>` — containing `pages` and `pageParams` arrays.

```tsx
const query = useInfiniteQuery(() => ({
  queryKey: ["posts"],
  queryFn: ({ pageParam }) => fetchPosts({ page: pageParam }),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.nextPage,
}))

query.data()?.pages      // all fetched pages (InfiniteData<TQueryFnData>)
query.fetchNextPage()    // load next
query.hasNextPage()      // boolean signal
query.isFetchingNextPage()     // boolean signal
query.isFetchingPreviousPage() // boolean signal
```

## Suspense

### useSuspenseQuery

Like `useQuery` but `data` is typed as `Signal<TData>` (never undefined). Designed for use inside a `QuerySuspense` boundary.

```tsx
function UserList() {
  const query = useSuspenseQuery(() => ({
    queryKey: ["users"],
    queryFn: fetchUsers,
  }))

  return (
    <ul>
      {query.data().map(u => <li>{u.name}</li>)}
    </ul>
  )
}
```

### QuerySuspense

Pyreon-native suspense boundary for queries. Shows `fallback` while any query is pending. On error, renders the `error` fallback or re-throws to the nearest `ErrorBoundary`.

```tsx
const userQuery = useSuspenseQuery(() => ({
  queryKey: ["user"],
  queryFn: fetchUser,
}))

<QuerySuspense
  query={userQuery}
  fallback={<Spinner />}
  error={(err) => <p>Failed: {String(err)}</p>}
>
  <UserProfile user={userQuery.data()} />
</QuerySuspense>
```

The `query` prop accepts a single query result or an array of them — children only render when all queries have succeeded.

## SSR Dehydration

### Server

```ts
const queryClient = new QueryClient()
await queryClient.prefetchQuery({ queryKey: ["users"], queryFn: fetchUsers })
const dehydratedState = dehydrate(queryClient)
```

### Client

```ts
const queryClient = new QueryClient()
hydrate(queryClient, dehydratedState)
```

## Additional Hooks

| Hook | Description |
| --- | --- |
| `useQueryClient()` | Access the current `QueryClient` |
| `useQueries(options)` | Run multiple queries in parallel |
| `useIsFetching(filters?)` | Signal of active query count |
| `useIsMutating(filters?)` | Signal of active mutation count |
| `useQueryErrorResetBoundary()` | Reset error state for retry |
| `QueryErrorResetBoundary` | Component — scopes error reset to a subtree |
| `useSuspenseInfiniteQuery(options)` | Infinite query with Suspense |

## useSubscription

Reactive WebSocket subscription that integrates with the query cache. Auto-reconnects with exponential backoff. Cleans up on unmount.

```tsx
import { useSubscription } from "@pyreon/query"

const sub = useSubscription({
  url: "wss://api.example.com/ws",
  onMessage: (event, queryClient) => {
    const data = JSON.parse(event.data)
    if (data.type === "order-updated") {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
    }
  },
})

sub.status()  // "connecting" | "connected" | "disconnected" | "error"
sub.send(JSON.stringify({ subscribe: "orders" }))
sub.close()
sub.reconnect()
```

**Options:**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | `string \| () => string` | required | WebSocket URL (reactive when function) |
| `protocols` | `string \| string[]` | — | WebSocket sub-protocols |
| `onMessage` | `(event, queryClient) => void` | required | Message handler with QueryClient access |
| `onOpen` | `(event) => void` | — | Connection opened callback |
| `onClose` | `(event) => void` | — | Connection closed callback |
| `onError` | `(event) => void` | — | Connection error callback |
| `reconnect` | `boolean` | `true` | Auto-reconnect on disconnect |
| `reconnectDelay` | `number` | `1000` | Initial reconnect delay (doubles per retry) |
| `maxReconnectAttempts` | `number` | `10` | Max retries (0 = unlimited) |
| `enabled` | `boolean \| () => boolean` | `true` | Enable/disable the subscription reactively |

**Returns:** `UseSubscriptionResult` with `status`, `send()`, `close()`, `reconnect()`.

## Gotchas

**All result properties are signals.** Call them with `()`: `query.data()`, not `query.data`.

**`QueryClientProvider` is required.** Without it, hooks throw at runtime.

**Mutation errors are logged in dev mode** to aid debugging while preventing unhandled promise rejections.
