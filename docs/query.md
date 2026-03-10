# Query

`@pyreon/query` is a Pyreon adapter for [TanStack Query](https://tanstack.com/query). It wraps TanStack Query's core with reactive signal-based hooks, Suspense integration, and SSR dehydration/hydration.

## Installation

```bash
bun add @pyreon/query @tanstack/query-core
```

## Quick Start

```tsx
import { QueryClient, QueryClientProvider, useQuery } from "@pyreon/query"

const queryClient = new QueryClient()

function UserProfile({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["user", id],
    queryFn: () => fetch(`/api/users/${id}`).then(r => r.json()),
  })

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
import { QueryClient, QueryClientProvider } from "@pyreon/query"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 minutes
      retry: 2,
    },
  },
})

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

## useQuery

Returns a reactive query result with signal-based properties:

```tsx
const query = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
})

// All properties are reactive signals:
query.data()        // T | undefined
query.isLoading()   // boolean
query.isError()     // boolean
query.error()       // Error | null
query.isFetching()  // boolean (true during background refetch)
query.status()      // "pending" | "error" | "success"
```

### Reactive Query Keys

Pass signal getters in query keys for automatic refetching:

```tsx
function UserPosts({ userId }: { userId: () => string }) {
  const query = useQuery({
    queryKey: () => ["posts", userId()],
    queryFn: () => fetchPosts(userId()),
    enabled: () => !!userId(),
  })
  // Refetches automatically when userId() changes
}
```

## useMutation

```tsx
import { useMutation } from "@pyreon/query"

function AddTodo() {
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

  return (
    <button
      onClick={() => mutation.mutate("New todo")}
      disabled={mutation.isPending()}
    >
      {() => mutation.isPending() ? "Adding..." : "Add Todo"}
    </button>
  )
}
```

## useInfiniteQuery

Paginated or infinite scroll queries:

```tsx
import { useInfiniteQuery } from "@pyreon/query"

const query = useInfiniteQuery({
  queryKey: ["posts"],
  queryFn: ({ pageParam }) => fetchPosts({ page: pageParam }),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.nextPage,
})

// query.data().pages — array of all fetched pages
// query.fetchNextPage() — load next page
// query.hasNextPage() — boolean signal
```

## Suspense Integration

### useSuspenseQuery

Suspends the component until data is available — no loading states needed:

```tsx
import { useSuspenseQuery } from "@pyreon/query"
import { Suspense } from "@pyreon/core"

function UserList() {
  const query = useSuspenseQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  })

  return (
    <ul>
      {query.data().map(u => <li>{u.name}</li>)}
    </ul>
  )
}

// Wrap with Suspense:
<Suspense fallback={<Spinner />}>
  <UserList />
</Suspense>
```

### QuerySuspense

A convenience wrapper that combines `Suspense` and `ErrorBoundary`:

```tsx
import { QuerySuspense } from "@pyreon/query"

<QuerySuspense fallback={<Spinner />}>
  <UserList />
</QuerySuspense>
```

## SSR Dehydration and Hydration

Prefetch queries on the server and transfer cache state to the client:

### Server

```ts
import { QueryClient, dehydrate } from "@pyreon/query"

const queryClient = new QueryClient()

// Prefetch data
await queryClient.prefetchQuery({
  queryKey: ["users"],
  queryFn: fetchUsers,
})

const dehydratedState = dehydrate(queryClient)

// Serialize into HTML:
const script = `<script>window.__QUERY_STATE__ = ${JSON.stringify(dehydratedState)}</script>`
```

### Client

```ts
import { QueryClient, hydrate } from "@pyreon/query"

const queryClient = new QueryClient()

// Restore server cache
const state = (window as any).__QUERY_STATE__
if (state) hydrate(queryClient, state)
```

## useQueries

Run multiple queries in parallel:

```tsx
import { useQueries } from "@pyreon/query"

const queries = useQueries({
  queries: userIds.map(id => ({
    queryKey: ["user", id],
    queryFn: () => fetchUser(id),
  })),
})
// queries is an array of query results
```

## Additional Hooks

| Hook | Description |
| --- | --- |
| `useQueryClient()` | Access the current `QueryClient` from context |
| `useIsFetching(filters?)` | Signal of active query count |
| `useIsMutating(filters?)` | Signal of active mutation count |
| `useQueryErrorResetBoundary()` | Reset error state for retry |
| `useSuspenseInfiniteQuery(options)` | Infinite query with Suspense |

## Gotchas

**All result properties are signals.** Call them with `()` to read: `query.data()`, not `query.data`.

**Query keys must be serializable.** Use primitives, plain objects, and arrays. Functions in query keys are not supported.

**`QueryClientProvider` is required.** Without it, hooks throw at runtime.

**Mutation errors are logged in dev mode.** Unhandled mutation rejections are caught and logged via `console.error` in development to aid debugging, while still preventing unhandled promise rejections.
