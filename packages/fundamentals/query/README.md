# @pyreon/query

Pyreon adapter for TanStack Query. Reactive `useQuery`, `useMutation`, `useInfiniteQuery`, and Suspense integration with fine-grained signal updates.

## Install

```bash
bun add @pyreon/query @tanstack/query-core
```

## Quick Start

```tsx
import { QueryClient, QueryClientProvider, useQuery } from "@pyreon/query"

const queryClient = new QueryClient()

function UserProfile(props: { id: string }) {
  const query = useQuery(() => ({
    queryKey: ["user", props.id],
    queryFn: () => fetch(`/api/users/${props.id}`).then(r => r.json()),
  }))

  return () => {
    if (query.isLoading()) return <p>Loading...</p>
    if (query.isError()) return <p>Error</p>
    return <h1>{query.data()?.name}</h1>
  }
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserProfile id="1" />
  </QueryClientProvider>
)
```

## API

### `QueryClientProvider`

Provide a `QueryClient` to the component tree.

| Parameter | Type | Description |
| --- | --- | --- |
| `client` | `QueryClient` | TanStack Query client instance |

### `useQueryClient()`

Access the `QueryClient` from the nearest `QueryClientProvider`.

**Returns:** `QueryClient`

### `useQuery(options)`

Subscribe to a query with fine-grained reactive signals. Options are passed as a function so reactive values (e.g. signal-based query keys) trigger automatic refetches.

| Parameter | Type | Description |
| --- | --- | --- |
| `options` | `() => QueryObserverOptions` | Function returning query options |

**Returns:** `UseQueryResult<TData, TError>` with:

| Property | Type | Description |
| --- | --- | --- |
| `result` | `Signal<QueryObserverResult>` | Full observer result |
| `data` | `Signal<TData \| undefined>` | Query data |
| `error` | `Signal<TError \| null>` | Query error |
| `status` | `Signal<"pending" \| "error" \| "success">` | Query status |
| `isPending` | `Signal<boolean>` | No data yet |
| `isLoading` | `Signal<boolean>` | First fetch in progress |
| `isFetching` | `Signal<boolean>` | Any fetch in progress |
| `isError` | `Signal<boolean>` | Query errored |
| `isSuccess` | `Signal<boolean>` | Query succeeded |
| `refetch()` | `() => Promise<QueryObserverResult>` | Trigger manual refetch |

```ts
const userId = signal(1)
const query = useQuery(() => ({
  queryKey: ["user", userId()],
  queryFn: () => fetchUser(userId()),
}))
// Changing userId triggers automatic refetch
```

### `useMutation(options)`

Run a mutation with reactive status signals.

| Parameter | Type | Description |
| --- | --- | --- |
| `options` | `MutationObserverOptions` | Mutation config |

**Returns:** `UseMutationResult<TData, TError, TVariables, TContext>` with:

| Property | Type | Description |
| --- | --- | --- |
| `data` | `Signal<TData \| undefined>` | Mutation result |
| `error` | `Signal<TError \| null>` | Mutation error |
| `status` | `Signal<"idle" \| "pending" \| "success" \| "error">` | Status |
| `isPending` | `Signal<boolean>` | Mutation in progress |
| `isSuccess` | `Signal<boolean>` | Mutation succeeded |
| `isError` | `Signal<boolean>` | Mutation errored |
| `isIdle` | `Signal<boolean>` | Not yet fired |
| `mutate(vars, opts?)` | `Function` | Fire-and-forget mutation |
| `mutateAsync(vars, opts?)` | `Function` | Promise-returning mutation |
| `reset()` | `() => void` | Reset to idle state |

```ts
const mutation = useMutation({
  mutationFn: (data: { title: string }) =>
    fetch("/api/posts", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
})

mutation.mutate({ title: "New Post" })
```

### `useInfiniteQuery(options)`

Paginated/infinite query with the same fine-grained signal pattern as `useQuery`.

| Parameter | Type | Description |
| --- | --- | --- |
| `options` | `() => InfiniteQueryObserverOptions` | Function returning options |

**Returns:** `UseInfiniteQueryResult<TData, TError>` — same shape as `UseQueryResult`.

### `useQueries(options)`

Run multiple queries in parallel.

| Parameter | Type | Description |
| --- | --- | --- |
| `options` | `UseQueriesOptions` | Array of query configs |

**Returns:** Array of `UseQueryResult` objects.

### `useSuspenseQuery(options)` / `useSuspenseInfiniteQuery(options)`

Suspense-enabled queries. Data is guaranteed non-undefined after the suspense boundary resolves.

| Property | Type | Description |
| --- | --- | --- |
| `data` | `Signal<TData>` | Always defined (non-undefined) |

```tsx
function UserList() {
  const query = useSuspenseQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  })
  return () => (
    <ul>
      {query.data().map(u => <li>{u.name}</li>)}
    </ul>
  )
}
```

### `QuerySuspense`

Suspense wrapper component with built-in error handling.

| Parameter | Type | Description |
| --- | --- | --- |
| `fallback` | `VNodeChild` | Loading fallback |
| `children` | `VNodeChild` | Content |

```tsx
<QuerySuspense fallback={<p>Loading...</p>}>
  <UserList />
</QuerySuspense>
```

### `QueryErrorResetBoundary` / `useQueryErrorResetBoundary()`

Error boundary for resetting query errors on retry.

### `useIsFetching(filters?)` / `useIsMutating(filters?)`

Global counters of active queries/mutations as reactive signals.

| Parameter | Type | Description |
| --- | --- | --- |
| `filters` | `QueryFilters` / `MutationFilters` | Optional filters to narrow scope |

**Returns:** `Signal<number>`

```ts
const fetching = useIsFetching()
// fetching() => number of active queries
```

## Patterns

### SSR Dehydration

```ts
import { QueryClient, dehydrate, hydrate } from "@pyreon/query"

// Server: prefetch and serialize
const queryClient = new QueryClient()
await queryClient.prefetchQuery({ queryKey: ["users"], queryFn: fetchUsers })
const dehydratedState = dehydrate(queryClient)

// Client: restore cache
hydrate(queryClient, dehydratedState)
```

### Reactive Query Keys

Options are a function, so reading signals inside auto-tracks dependencies.

```ts
const filter = signal("active")
const query = useQuery(() => ({
  queryKey: ["todos", filter()],
  queryFn: () => fetchTodos(filter()),
}))
// Changing filter() triggers a new fetch
```

## Re-exports from `@tanstack/query-core`

**Runtime:** `QueryClient`, `QueryCache`, `MutationCache`, `dehydrate`, `hydrate`, `keepPreviousData`, `hashKey`, `isCancelledError`, `CancelledError`, `defaultShouldDehydrateQuery`, `defaultShouldDehydrateMutation`

**Types:** `QueryKey`, `QueryFilters`, `MutationFilters`, `DehydratedState`, `FetchQueryOptions`, `InvalidateQueryFilters`, `InvalidateOptions`, `RefetchQueryFilters`, `RefetchOptions`, `QueryClientConfig`

## Gotchas

- Each field on `UseQueryResult` is an independent signal. Reading `query.data()` does not re-run when `isFetching` changes, and vice versa.
- `useQuery` options must be a function `() => opts`, not a plain object. This is required for reactive option tracking.
- `useMutation` options are a plain object (not a function) since mutations are imperative.
- `mutate()` swallows errors into the `error` signal. Use `mutateAsync()` if you need try/catch.
- Observer subscriptions are cleaned up automatically on component unmount via `onUnmount`.
