# @pyreon/query

Pyreon adapter for TanStack Query. Provides reactive `useQuery`, `useMutation`, `useInfiniteQuery`, and Suspense integration with full SSR dehydration/hydration support.

## Install

```bash
bun add @pyreon/query @tanstack/query-core
```

## Quick Start

```ts
import { h } from "@pyreon/core"
import { QueryClient, QueryClientProvider, useQuery } from "@pyreon/query"

const queryClient = new QueryClient()

function UserProfile(props: { id: string }) {
  const query = useQuery({
    queryKey: ["user", props.id],
    queryFn: () => fetch(`/api/users/${props.id}`).then(r => r.json()),
  })

  if (query.isLoading()) return h("p", null, "Loading...")
  if (query.isError()) return h("p", null, "Error")
  return h("h1", null, query.data()?.name)
}

const App = () =>
  h(QueryClientProvider, { client: queryClient },
    h(UserProfile, { id: "1" }))
```

## Suspense

Use `useSuspenseQuery` or the `QuerySuspense` wrapper to integrate with Pyreon's Suspense:

```ts
import { useSuspenseQuery, QuerySuspense } from "@pyreon/query"

function UserList() {
  const query = useSuspenseQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  })
  return h("ul", null, ...query.data().map(u => h("li", null, u.name)))
}

const App = () =>
  h(QuerySuspense, { fallback: h("p", null, "Loading...") },
    h(UserList, null))
```

## SSR Dehydration

```ts
import { QueryClient, dehydrate, hydrate } from "@pyreon/query"

// Server: prefetch and serialize
const queryClient = new QueryClient()
await queryClient.prefetchQuery({ queryKey: ["users"], queryFn: fetchUsers })
const dehydratedState = dehydrate(queryClient)

// Client: restore cache
hydrate(queryClient, dehydratedState)
```

## API

### Provider

- `QueryClientProvider` -- provides a `QueryClient` to the component tree
- `useQueryClient()` -- access the current `QueryClient`

### Hooks

- `useQuery(options)` -- reactive query with signals
- `useMutation(options)` -- reactive mutation
- `useInfiniteQuery(options)` -- paginated/infinite query
- `useQueries(options)` -- run multiple queries in parallel
- `useSuspenseQuery(options)` -- query that suspends until resolved
- `useSuspenseInfiniteQuery(options)` -- infinite query with Suspense
- `useIsFetching(filters?)` -- signal of active query count
- `useIsMutating(filters?)` -- signal of active mutation count
- `useQueryErrorResetBoundary()` -- reset error state for retry

### Components

- `QuerySuspense` -- Suspense wrapper with built-in error handling
- `QueryErrorResetBoundary` -- boundary for resetting query errors

### Re-exports from `@tanstack/query-core`

`QueryClient`, `QueryCache`, `MutationCache`, `dehydrate`, `hydrate`, `keepPreviousData`, `hashKey`, `isCancelledError`, `CancelledError`, `defaultShouldDehydrateQuery`, `defaultShouldDehydrateMutation`
