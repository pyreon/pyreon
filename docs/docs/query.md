---
title: Query
description: Reactive data fetching powered by TanStack Query with fine-grained signal integration.
---

`@pyreon/query` is the Pyreon adapter for [TanStack Query](https://tanstack.com/query). It wraps TanStack Query's observer pattern with Pyreon's fine-grained reactivity signals, so each property (`data`, `error`, `isPending`, etc.) is an independent signal that only triggers updates for the effects that depend on it.

<PackageBadge name="@pyreon/query" href="/docs/query" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/query
```

```bash [bun]
bun add @pyreon/query
```

```bash [pnpm]
pnpm add @pyreon/query
```

```bash [yarn]
yarn add @pyreon/query
```

:::

TanStack Query core is included as a dependency -- you do not need to install `@tanstack/query-core` separately.

## How It Works

Traditional TanStack Query adapters (e.g., `@tanstack/react-query`) re-render the entire component when any query field changes. Pyreon's adapter creates separate signals for each field (`data`, `error`, `isPending`, `isFetching`, etc.) and uses `batch()` to coalesce all signal updates into a single notification flush. This means:

- A component that only reads `query.data()` will not re-run when `isFetching` flips.
- A loading spinner that only reads `query.isPending()` will not re-run when data arrives (it will re-run once to switch from pending to not-pending, but not for the data change itself).
- The `result` signal provides the full observer result for cases where you need multiple fields in one read.

## Setup

### QueryClientProvider

Wrap your app with `QueryClientProvider` to provide a `QueryClient` to all descendant components.

```tsx
import { defineComponent } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient, QueryClientProvider } from '@pyreon/query'

const queryClient = new QueryClient()

const App = defineComponent(() => {
  return () => (
    <QueryClientProvider client={queryClient}>
      <MyApp />
    </QueryClientProvider>
  )
})

mount(<App />, document.getElementById('app')!)
```

`QueryClientProvider` internally:

1. Pushes the `QueryClient` onto Pyreon's context stack so all descendants can access it via `useQueryClient()`.
2. Calls `client.mount()` on mount -- this activates window focus refetching and online/offline handling.
3. Calls `client.unmount()` on unmount -- this unsubscribes `focusManager` and `onlineManager`.

### QueryClient Configuration

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (garbage collection)
      retry: 3, // retry failed queries 3 times
      retryDelay: (
        attempt, // exponential backoff
      ) => Math.min(1000 * 2 ** attempt, 30000),
      refetchOnWindowFocus: true, // refetch when tab regains focus
      refetchOnReconnect: true, // refetch when network reconnects
      refetchOnMount: true, // refetch when component mounts
    },
    mutations: {
      retry: 0, // don't retry mutations by default
    },
  },
})
```

### useQueryClient

Returns the nearest `QueryClient` from context. Throws if called outside a `QueryClientProvider`.

```ts
import { useQueryClient } from '@pyreon/query'

function MyComponent() {
  const client = useQueryClient()

  // Use client for imperative operations:
  client.invalidateQueries({ queryKey: ['posts'] })
  client.prefetchQuery({ queryKey: ['user', 1], queryFn: fetchUser })
  client.setQueryData(['user', 1], updatedUser)
  client.getQueryData(['user', 1])
  client.removeQueries({ queryKey: ['stale-data'] })

  // ...
}
```

## Queries

### useQuery

Subscribe to a query. Returns fine-grained reactive signals for data, error, and status.

Options are passed as a function so reactive signals (e.g., a signal-based query key) can be read inside. When a signal changes, the observer updates and refetches automatically.

```ts
import { useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'

const userId = signal(1)

const query = useQuery(() => ({
  queryKey: ['user', userId()],
  queryFn: () => fetch(`/api/users/${userId()}`).then((r) => r.json()),
}))
```

<Playground title="Reactive Data Fetching" :height="120">
const userId = signal(1)
const loading = signal(false)
const data = signal(null)

const fetchUser = async () => {
  loading.set(true)
  const res = await fetch('https://jsonplaceholder.typicode.com/users/' + userId())
  data.set(await res.json())
  loading.set(false)
}
fetchUser()

const app = document.getElementById('app')
const ui = h('div', {},
  h('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
    h('button', { onClick: () => { userId.set(1); fetchUser() } }, 'User 1'),
    h('button', { onClick: () => { userId.set(2); fetchUser() } }, 'User 2'),
    h('button', { onClick: () => { userId.set(3); fetchUser() } }, 'User 3'),
  ),
  h('div', {}, () => loading() ? 'Loading...' : data() ? data().name + ' (' + data().email + ')' : ''),
)
mount(ui, app)
</Playground>

#### UseQueryResult

| Signal       | Type                                        | Description                                  |
| ------------ | ------------------------------------------- | -------------------------------------------- |
| `data`       | `Signal<TData \| undefined>`                | The resolved data                            |
| `error`      | `Signal<TError \| null>`                    | The error, if any                            |
| `status`     | `Signal<'pending' \| 'error' \| 'success'>` | Current status                               |
| `isPending`  | `Signal<boolean>`                           | No data yet (initial load)                   |
| `isLoading`  | `Signal<boolean>`                           | First fetch in progress                      |
| `isFetching` | `Signal<boolean>`                           | Any fetch in progress (including background) |
| `isError`    | `Signal<boolean>`                           | Query has errored                            |
| `isSuccess`  | `Signal<boolean>`                           | Query has data                               |
| `result`     | `Signal<QueryObserverResult>`               | Full observer result                         |

| Method      | Description                                    |
| ----------- | ---------------------------------------------- |
| `refetch()` | Manually trigger a refetch. Returns a promise. |

#### All useQuery Options

The options function receives all TanStack Query options. Here are the most commonly used:

```ts
const query = useQuery(() => ({
  // Required
  queryKey: ['user', userId()], // Unique cache key (array)
  queryFn: (
    { signal }, // Fetcher function
  ) => fetch(`/api/users/${userId()}`, { signal }).then((r) => r.json()),

  // Timing
  staleTime: 5 * 60 * 1000, // Data considered fresh for 5 minutes
  gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes
  refetchInterval: 30_000, // Poll every 30 seconds
  refetchIntervalInBackground: false, // Stop polling when tab is hidden

  // Behavior
  enabled: true, // Set to false to disable auto-fetching
  retry: 3, // Number of retries on failure
  retryDelay: (
    attempt, // Custom retry delay
  ) => Math.min(1000 * 2 ** attempt, 30000),
  refetchOnWindowFocus: true, // Refetch when tab regains focus
  refetchOnReconnect: true, // Refetch when network reconnects
  refetchOnMount: true, // Refetch when component mounts

  // Data transformation
  select: (data) => data.user, // Transform/select from cached data

  // Placeholder
  placeholderData: previousData, // Show while fetching
  initialData: cachedUser, // Seed the cache immediately
  initialDataUpdatedAt: Date.now(), // When initialData was last fetched
}))
```

#### Basic Component Example

```tsx
const UserProfile = defineComponent(() => {
  const query = useQuery(() => ({
    queryKey: ['user', 1],
    queryFn: () => fetch('/api/users/1').then((r) => r.json()),
  }))

  return () => {
    if (query.isPending()) return <p>Loading...</p>
    if (query.isError()) return <p>Error: {String(query.error())}</p>
    return <h1>{query.data()?.name}</h1>
  }
})
```

#### Reactive Query Keys

When signals are used inside the options function, the query automatically refetches when those signals change:

```tsx
const SearchResults = defineComponent(() => {
  const searchTerm = signal('')
  const category = signal('all')
  const page = signal(1)

  const query = useQuery(() => ({
    queryKey: ['search', searchTerm(), category(), page()],
    queryFn: () =>
      fetch(`/api/search?q=${searchTerm()}&cat=${category()}&page=${page()}`).then((r) => r.json()),
    // Don't search until user types something
    enabled: searchTerm().length > 0,
    // Keep showing old results while new ones load
    placeholderData: (prev: SearchResult | undefined) => prev,
    staleTime: 60_000, // Results are fresh for 1 minute
  }))

  return () => (
    <div>
      <input
        type="text"
        placeholder="Search..."
        onInput={(e) => {
          searchTerm.set(e.currentTarget.value)
          page.set(1) // Reset to page 1 on new search
        }}
      />
      <select onChange={(e) => category.set(e.currentTarget.value)}>
        <option value="all">All</option>
        <option value="posts">Posts</option>
        <option value="users">Users</option>
      </select>
      {() => {
        if (query.isPending()) return <Spinner />
        if (query.isError()) return <ErrorMessage error={query.error()} />
        return (
          <div>
            <ResultsList results={query.data()?.items} />
            <Pagination
              page={() => page()}
              total={query.data()?.totalPages}
              onPageChange={(p: number) => page.set(p)}
            />
          </div>
        )
      }}
    </div>
  )
})
```

#### Conditional/Enabled Queries

```tsx
const UserPosts = defineComponent((props: { userId: () => number | null }) => {
  const query = useQuery(() => ({
    queryKey: ['posts', props.userId()],
    queryFn: () => fetch(`/api/users/${props.userId()}/posts`).then((r) => r.json()),
    // Only fetch when userId is available
    enabled: props.userId() !== null,
  }))

  return () => {
    if (!props.userId()) return <p>Select a user to see their posts</p>
    if (query.isPending()) return <Spinner />
    return <PostList posts={query.data()} />
  }
})
```

#### Data Transformation with select

```tsx
const query = useQuery(() => ({
  queryKey: ['users'],
  queryFn: () => fetch('/api/users').then((r) => r.json()),
  // Only subscribe to the names -- other data changes won't trigger updates
  select: (data: User[]) => data.map((u) => u.name),
}))

// query.data() is Signal<string[] | undefined>
```

#### Query Cancellation

TanStack Query passes an `AbortSignal` to your query function. Pass it to `fetch` to support automatic cancellation when the query key changes or the component unmounts:

```tsx
const query = useQuery(() => ({
  queryKey: ['search', term()],
  queryFn: ({ signal }) => fetch(`/api/search?q=${term()}`, { signal }).then((r) => r.json()),
}))
```

When `term()` changes, the previous fetch is automatically aborted before the new one starts.

## Mutations

### useMutation

Run a mutation (create, update, delete). Returns reactive signals for state plus `mutate` and `mutateAsync` functions.

```ts
import { useMutation, useQueryClient } from '@pyreon/query'

const client = useQueryClient()

const mutation = useMutation({
  mutationFn: (data: { title: string }) =>
    fetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then((r) => r.json()),
  onSuccess: () => {
    client.invalidateQueries({ queryKey: ['posts'] })
  },
})

// Fire and forget (errors captured in signal)
mutation.mutate({ title: 'New Post' })

// Or await the result
try {
  const result = await mutation.mutateAsync({ title: 'New Post' })
} catch (err) {
  // handle error
}
```

#### UseMutationResult

| Signal      | Type                                                  | Description                     |
| ----------- | ----------------------------------------------------- | ------------------------------- |
| `data`      | `Signal<TData \| undefined>`                          | The mutation result data        |
| `error`     | `Signal<TError \| null>`                              | The error, if any               |
| `status`    | `Signal<'idle' \| 'pending' \| 'success' \| 'error'>` | Current status                  |
| `isPending` | `Signal<boolean>`                                     | Mutation is in flight           |
| `isSuccess` | `Signal<boolean>`                                     | Mutation succeeded              |
| `isError`   | `Signal<boolean>`                                     | Mutation errored                |
| `isIdle`    | `Signal<boolean>`                                     | Mutation hasn't been called yet |

| Method                             | Description                                                 |
| ---------------------------------- | ----------------------------------------------------------- |
| `mutate(variables, options?)`      | Fire the mutation. Error is captured in signal, not thrown. |
| `mutateAsync(variables, options?)` | Fire the mutation and return a promise. Throws on error.    |
| `reset()`                          | Reset mutation state back to idle.                          |

#### Mutation Callbacks

```ts
const mutation = useMutation({
  mutationFn: updateUser,
  onMutate: (variables) => {
    // Called before the mutation function fires
    console.log('Updating user:', variables)
    // Return context for onError
    return { previousUser: client.getQueryData(['user', variables.id]) }
  },
  onSuccess: (data, variables, context) => {
    // Called on success
    console.log('User updated:', data)
    client.invalidateQueries({ queryKey: ['user', variables.id] })
  },
  onError: (error, variables, context) => {
    // Called on error
    console.error('Update failed:', error)
    // Roll back optimistic update using context from onMutate
    if (context?.previousUser) {
      client.setQueryData(['user', variables.id], context.previousUser)
    }
  },
  onSettled: (data, error, variables, context) => {
    // Called on both success and error
    console.log('Mutation settled')
  },
})
```

#### Per-Call Callbacks

You can also pass callbacks to individual `mutate` calls. These run after the mutation-level callbacks:

```ts
mutation.mutate(
  { id: 1, name: 'Updated Name' },
  {
    onSuccess: (data) => {
      // Runs after the mutation-level onSuccess
      showToast('User updated successfully!')
    },
    onError: (error) => {
      showToast(`Update failed: ${error.message}`)
    },
  },
)
```

#### Optimistic Updates

Update the UI immediately, then roll back on error:

```tsx
const UpdateTodo = defineComponent((props: { todo: Todo }) => {
  const client = useQueryClient()

  const mutation = useMutation({
    mutationFn: (update: Partial<Todo>) =>
      fetch(`/api/todos/${props.todo.id}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
      }).then((r) => r.json()),

    onMutate: async (update) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await client.cancelQueries({ queryKey: ['todos'] })

      // Snapshot the previous value
      const previousTodos = client.getQueryData<Todo[]>(['todos'])

      // Optimistically update the cache
      client.setQueryData<Todo[]>(['todos'], (old) =>
        old?.map((t) => (t.id === props.todo.id ? { ...t, ...update } : t)),
      )

      return { previousTodos }
    },

    onError: (_err, _update, context) => {
      // Roll back to the previous value on error
      if (context?.previousTodos) {
        client.setQueryData(['todos'], context.previousTodos)
      }
    },

    onSettled: () => {
      // Refetch to make sure we're in sync with the server
      client.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  return () => (
    <div class="todo-item">
      <input
        type="checkbox"
        checked={() => props.todo.completed}
        onChange={(e) => {
          mutation.mutate({
            completed: e.currentTarget.checked,
          })
        }}
      />
      <span>{props.todo.title}</span>
      {() => mutation.isPending() && <Spinner size="sm" />}
    </div>
  )
})
```

#### CRUD Example

```tsx
function useTodos() {
  const client = useQueryClient()

  const todosQuery = useQuery(() => ({
    queryKey: ['todos'],
    queryFn: () => fetch('/api/todos').then((r) => r.json()),
  }))

  const createTodo = useMutation({
    mutationFn: (title: string) =>
      fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, completed: false }),
      }).then((r) => r.json()),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const updateTodo = useMutation({
    mutationFn: (update: { id: number; completed: boolean }) =>
      fetch(`/api/todos/${update.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: update.completed }),
      }).then((r) => r.json()),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const deleteTodo = useMutation({
    mutationFn: (id: number) => fetch(`/api/todos/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  return { todosQuery, createTodo, updateTodo, deleteTodo }
}
```

## Infinite Queries

### useInfiniteQuery

Subscribe to a paginated or infinite-scroll query. Returns all the signals from `useQuery` plus pagination-specific signals and methods.

```ts
import { useInfiniteQuery } from '@pyreon/query'

const query = useInfiniteQuery(() => ({
  queryKey: ['posts'],
  queryFn: ({ pageParam }) => fetch(`/api/posts?cursor=${pageParam}`).then((r) => r.json()),
  initialPageParam: 0,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
}))

// Access pages
query.data()?.pages // array of page results
query.data()?.pageParams // array of page params

// Pagination controls
query.hasNextPage()
query.hasPreviousPage()
query.fetchNextPage()
query.fetchPreviousPage()
query.isFetchingNextPage()
query.isFetchingPreviousPage()
```

#### UseInfiniteQueryResult

In addition to all `useQuery` signals, `useInfiniteQuery` returns:

| Signal                   | Type                                       | Description                              |
| ------------------------ | ------------------------------------------ | ---------------------------------------- |
| `data`                   | `Signal<InfiniteData<TData> \| undefined>` | Contains `pages` and `pageParams` arrays |
| `isFetchingNextPage`     | `Signal<boolean>`                          | True while fetching the next page        |
| `isFetchingPreviousPage` | `Signal<boolean>`                          | True while fetching the previous page    |
| `hasNextPage`            | `Signal<boolean>`                          | True if there are more pages to fetch    |
| `hasPreviousPage`        | `Signal<boolean>`                          | True if there are previous pages         |

| Method                | Description                                 |
| --------------------- | ------------------------------------------- |
| `fetchNextPage()`     | Fetch the next page. Returns a promise.     |
| `fetchPreviousPage()` | Fetch the previous page. Returns a promise. |
| `refetch()`           | Refetch all pages.                          |

#### Cursor-Based Pagination

```tsx
interface PostsResponse {
  posts: Post[]
  nextCursor: string | null
  previousCursor: string | null
}

const InfinitePostList = defineComponent(() => {
  const query = useInfiniteQuery(() => ({
    queryKey: ['posts'],
    queryFn: ({ pageParam }): Promise<PostsResponse> =>
      fetch(`/api/posts?cursor=${pageParam}&limit=20`).then((r) => r.json()),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    getPreviousPageParam: (firstPage) => firstPage.previousCursor,
  }))

  return () => (
    <div class="post-feed">
      {() => {
        if (query.isPending()) return <Spinner />
        if (query.isError()) return <p>Error: {String(query.error())}</p>

        const pages = query.data()?.pages ?? []
        return (
          <div>
            {pages.flatMap((page) =>
              page.posts.map((post) => <PostCard key={post.id} post={post} />),
            )}
            {query.hasNextPage() && (
              <button
                onClick={() => query.fetchNextPage()}
                disabled={() => query.isFetchingNextPage()}
              >
                {() => (query.isFetchingNextPage() ? 'Loading...' : 'Load More')}
              </button>
            )}
          </div>
        )
      }}
    </div>
  )
})
```

#### Infinite Scroll with Intersection Observer

```tsx
const InfiniteScroll = defineComponent(() => {
  const query = useInfiniteQuery(() => ({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => fetch(`/api/feed?page=${pageParam}`).then((r) => r.json()),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length + 1 : undefined),
  }))

  return () => (
    <div class="feed">
      {() =>
        query
          .data()
          ?.pages.flatMap((page) =>
            page.items.map((item: FeedItem) => <FeedCard key={item.id} item={item} />),
          )
      }

      {/* Sentinel element -- triggers fetchNextPage when scrolled into view */}
      {() =>
        query.hasNextPage() && (
          <div
            ref={(el: HTMLDivElement) => {
              const observer = new IntersectionObserver(([entry]) => {
                if (entry.isIntersecting && !query.isFetchingNextPage()) {
                  query.fetchNextPage()
                }
              })
              observer.observe(el)
              onCleanup(() => observer.disconnect())
            }}
            class="loading-sentinel"
          >
            {() => query.isFetchingNextPage() && <Spinner />}
          </div>
        )
      }
    </div>
  )
})
```

#### Offset-Based Pagination

```tsx
const PaginatedTable = defineComponent(() => {
  const page = signal(1)
  const pageSize = 25

  const query = useInfiniteQuery(() => ({
    queryKey: ['users', page()],
    queryFn: ({ pageParam }) =>
      fetch(`/api/users?offset=${(pageParam - 1) * pageSize}&limit=${pageSize}`).then((r) =>
        r.json(),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.total > lastPageParam * pageSize ? lastPageParam + 1 : undefined,
  }))

  return () => (
    <div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {() =>
            query.data()?.pages.flatMap((page) =>
              page.users.map((user: User) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                </tr>
              )),
            )
          }
        </tbody>
      </table>
      <div class="pagination">
        <button disabled={() => !query.hasPreviousPage()} onClick={() => query.fetchPreviousPage()}>
          Previous
        </button>
        <button disabled={() => !query.hasNextPage()} onClick={() => query.fetchNextPage()}>
          Next
        </button>
      </div>
    </div>
  )
})
```

## Parallel Queries

### useQueries

Subscribe to multiple queries in parallel. Returns a single signal containing the array of results, index-aligned with the input array.

```ts
import { useQueries } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'

const userIds = signal([1, 2, 3])

const results = useQueries(() =>
  userIds().map((id) => ({
    queryKey: ['user', id],
    queryFn: () => fetch(`/api/users/${id}`).then((r) => r.json()),
  })),
)

// results() is QueryObserverResult[]
results()[0]?.data // first user
results()[1]?.data // second user
```

#### Dynamic Parallel Queries

When the query array changes (e.g., new IDs are added), the observer automatically subscribes to new queries and unsubscribes from removed ones:

```tsx
const UserCards = defineComponent(() => {
  const selectedIds = signal<number[]>([1, 2])

  const results = useQueries(() =>
    selectedIds().map((id) => ({
      queryKey: ['user', id],
      queryFn: () => fetch(`/api/users/${id}`).then((r) => r.json()),
      staleTime: 5 * 60 * 1000,
    })),
  )

  return () => (
    <div class="user-cards">
      {() =>
        results().map((result, i) => {
          if (result.isPending) return <CardSkeleton key={selectedIds()[i]} />
          if (result.isError) return <CardError key={selectedIds()[i]} error={result.error} />
          return <UserCard key={selectedIds()[i]} user={result.data} />
        })
      }
    </div>
  )
})
```

#### Aggregating Parallel Results

```tsx
const Dashboard = defineComponent(() => {
  const results = useQueries(() => [
    { queryKey: ['stats', 'revenue'], queryFn: fetchRevenue },
    { queryKey: ['stats', 'users'], queryFn: fetchUserCount },
    { queryKey: ['stats', 'orders'], queryFn: fetchOrderCount },
  ])

  return () => {
    const allResults = results()
    const isAnyLoading = allResults.some((r) => r.isPending)
    const isAnyError = allResults.some((r) => r.isError)

    if (isAnyLoading) return <DashboardSkeleton />
    if (isAnyError) return <DashboardError />

    return (
      <div class="dashboard-grid">
        <StatCard title="Revenue" value={allResults[0]?.data} />
        <StatCard title="Users" value={allResults[1]?.data} />
        <StatCard title="Orders" value={allResults[2]?.data} />
      </div>
    )
  }
})
```

## Suspense Queries

### useSuspenseQuery

Like `useQuery`, but `data` is typed as `Signal<TData>` (never `undefined`). Use inside a `QuerySuspense` boundary, which guarantees children only render after the query succeeds.

```ts
import { useSuspenseQuery, QuerySuspense } from '@pyreon/query'

const userQuery = useSuspenseQuery(() => ({
  queryKey: ['user', 1],
  queryFn: () => fetch('/api/users/1').then((r) => r.json()),
}))

// userQuery.data() is Signal<User>, not Signal<User | undefined>
```

#### UseSuspenseQueryResult

Same as `UseQueryResult` except:

| Signal | Type            | Description                                    |
| ------ | --------------- | ---------------------------------------------- |
| `data` | `Signal<TData>` | Always defined inside a QuerySuspense boundary |

### useSuspenseInfiniteQuery

Like `useInfiniteQuery` but with non-undefined `data` typing. Use inside a `QuerySuspense` boundary.

```ts
const postsQuery = useSuspenseInfiniteQuery(() => ({
  queryKey: ['posts'],
  queryFn: ({ pageParam }) => fetchPosts(pageParam),
  initialPageParam: 0,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
}))

// postsQuery.data() is Signal<InfiniteData<PostsPage>>, never undefined
```

### QuerySuspense

A Pyreon-native suspense boundary for queries. Shows a fallback while any query is pending, and optionally renders an error fallback.

```tsx
import { QuerySuspense, useSuspenseQuery } from '@pyreon/query'

const UserCard = defineComponent(() => {
  const user = useSuspenseQuery(() => ({
    queryKey: ['user', 1],
    queryFn: fetchUser,
  }))

  return () => (
    <QuerySuspense
      query={user}
      fallback={<Spinner />}
      error={(err) => <p>Failed: {String(err)}</p>}
    >
      {() => <h1>{user.data().name}</h1>}
    </QuerySuspense>
  )
})
```

#### Multiple Queries

You can gate on multiple queries -- children render only when all succeed:

```tsx
const Dashboard = defineComponent(() => {
  const userQuery = useSuspenseQuery(() => ({
    queryKey: ['user'],
    queryFn: fetchUser,
  }))
  const postsQuery = useSuspenseQuery(() => ({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  }))

  return () => (
    <QuerySuspense
      query={[userQuery, postsQuery]}
      fallback={<DashboardSkeleton />}
      error={(err) => <DashboardError error={err} />}
    >
      {() => (
        <div class="dashboard">
          <UserHeader user={userQuery.data()} />
          <PostList posts={postsQuery.data()} />
        </div>
      )}
    </QuerySuspense>
  )
})
```

#### Nested Suspense Boundaries

```tsx
function App() {
  return () => (
    <div class="layout">
      {/* Header loads independently */}
      <QuerySuspense query={headerQuery} fallback={<HeaderSkeleton />}>
        {() => <Header data={headerQuery.data()} />}
      </QuerySuspense>

      <div class="content">
        {/* Sidebar loads independently */}
        <QuerySuspense query={sidebarQuery} fallback={<SidebarSkeleton />}>
          {() => <Sidebar items={sidebarQuery.data()} />}
        </QuerySuspense>

        {/* Main content loads independently */}
        <QuerySuspense query={contentQuery} fallback={<ContentSkeleton />}>
          {() => <MainContent data={contentQuery.data()} />}
        </QuerySuspense>
      </div>
    </div>
  )
}
```

#### QuerySuspenseProps

| Prop       | Type                             | Description                                                          |
| ---------- | -------------------------------- | -------------------------------------------------------------------- |
| `query`    | `AnyQueryLike \| AnyQueryLike[]` | Query result(s) to gate on                                           |
| `fallback` | `VNodeChild`                     | Rendered while any query is pending                                  |
| `error`    | `(err: unknown) => VNodeChild`   | Rendered on error (defaults to re-throwing to nearest ErrorBoundary) |
| `children` | `VNodeChild`                     | Rendered when all queries have succeeded                             |

## Dependent / Serial Queries

Use the `enabled` option to create query chains where one query depends on the result of another:

```tsx
const UserProfile = defineComponent((props: { userId: number }) => {
  // First query: fetch the user
  const userQuery = useQuery(() => ({
    queryKey: ['user', props.userId],
    queryFn: () => fetch(`/api/users/${props.userId}`).then((r) => r.json()),
  }))

  // Second query: fetch the user's team -- depends on user data
  const teamQuery = useQuery(() => ({
    queryKey: ['team', userQuery.data()?.teamId],
    queryFn: () => fetch(`/api/teams/${userQuery.data()!.teamId}`).then((r) => r.json()),
    // Only run when we have the teamId from the first query
    enabled: userQuery.data()?.teamId != null,
  }))

  // Third query: fetch team members -- depends on team data
  const membersQuery = useQuery(() => ({
    queryKey: ['members', teamQuery.data()?.id],
    queryFn: () => fetch(`/api/teams/${teamQuery.data()!.id}/members`).then((r) => r.json()),
    enabled: teamQuery.data()?.id != null,
  }))

  return () => (
    <div>
      {() => {
        if (userQuery.isPending()) return <p>Loading user...</p>
        if (userQuery.isError()) return <p>Error loading user</p>

        return (
          <div>
            <h1>{userQuery.data()?.name}</h1>
            {() => {
              if (teamQuery.isPending()) return <p>Loading team...</p>
              return <p>Team: {teamQuery.data()?.name}</p>
            }}
            {() => {
              if (membersQuery.isPending()) return <p>Loading members...</p>
              return (
                <ul>
                  {membersQuery.data()?.map((m: User) => (
                    <li key={m.id}>{m.name}</li>
                  ))}
                </ul>
              )
            }}
          </div>
        )
      }}
    </div>
  )
})
```

## Query Invalidation and Refetching

Use the `QueryClient` to invalidate queries, triggering background refetches:

```ts
const client = useQueryClient()

// Invalidate a specific query
client.invalidateQueries({ queryKey: ['todos'] })

// Invalidate all queries that start with 'user'
client.invalidateQueries({ queryKey: ['user'] })

// Invalidate everything
client.invalidateQueries()

// Invalidate with a predicate
client.invalidateQueries({
  predicate: (query) => query.queryKey[0] === 'todos' && query.state.data?.length > 10,
})

// Refetch (force immediate refetch, not just mark stale)
client.refetchQueries({ queryKey: ['todos'] })

// Remove queries from cache entirely
client.removeQueries({ queryKey: ['old-data'] })

// Manually set query data (e.g., after a mutation)
client.setQueryData(['todo', 1], {
  id: 1,
  title: 'Updated title',
  completed: true,
})

// Prefetch (fetch into cache without subscribing)
client.prefetchQuery({
  queryKey: ['user', 5],
  queryFn: () => fetchUser(5),
})
```

### Prefetching on Hover

```tsx
const UserLink = defineComponent((props: { userId: number; name: string }) => {
  const client = useQueryClient()

  const prefetch = () => {
    client.prefetchQuery({
      queryKey: ['user', props.userId],
      queryFn: () => fetchUser(props.userId),
      staleTime: 5 * 60 * 1000,
    })
  }

  return () => (
    <a href={`/users/${props.userId}`} onMouseEnter={prefetch} onFocus={prefetch}>
      {props.name}
    </a>
  )
})
```

## Global Loading Indicators

### useIsFetching

Returns a signal tracking how many queries are currently in-flight. Useful for global loading indicators.

```ts
import { useIsFetching } from '@pyreon/query'

const fetching = useIsFetching()
// In template: () => fetching() > 0 ? 'Loading...' : ''
```

With filters:

```ts
// Only track queries that match the filter
const fetchingTodos = useIsFetching({ queryKey: ['todos'] })
```

### useIsMutating

Returns a signal tracking how many mutations are currently in-flight.

```ts
import { useIsMutating } from '@pyreon/query'

const mutating = useIsMutating()
// In template: () => mutating() > 0 ? 'Saving...' : ''
```

### Global Loading Bar

```tsx
const GlobalLoadingBar = defineComponent(() => {
  const fetching = useIsFetching()
  const mutating = useIsMutating()

  return () => (
    <Show when={() => fetching() > 0 || mutating() > 0}>
      <div class="global-loading-bar">
        <div class="progress-bar" />
      </div>
    </Show>
  )
})
```

## Error Reset Boundary

### QueryErrorResetBoundary

Wraps a subtree so that `useQueryErrorResetBoundary()` descendants can reset all errored queries within this boundary. Pair with Pyreon's `ErrorBoundary` for retry patterns.

```tsx
import { QueryErrorResetBoundary, useQueryErrorResetBoundary } from '@pyreon/query'

const App = defineComponent(() => {
  return () => (
    <QueryErrorResetBoundary>
      <ErrorBoundary
        fallback={(err, boundaryReset) => {
          const { reset } = useQueryErrorResetBoundary()
          return (
            <div>
              <p>Something went wrong: {String(err)}</p>
              <button
                onClick={() => {
                  reset()
                  boundaryReset()
                }}
              >
                Retry
              </button>
            </div>
          )
        }}
      >
        <MyComponent />
      </ErrorBoundary>
    </QueryErrorResetBoundary>
  )
})
```

### useQueryErrorResetBoundary

Returns `&#123; reset &#125;` -- call `reset()` to refetch all errored queries in the nearest boundary. If called outside a boundary, falls back to resetting all errored queries on the `QueryClient`.

```ts
const { reset } = useQueryErrorResetBoundary()
// reset() refetches all queries where state.status === "error"
```

## Error Handling and Retry Strategies

### Per-Query Retry

```ts
const query = useQuery(() => ({
  queryKey: ['critical-data'],
  queryFn: fetchCriticalData,
  retry: 5, // Retry 5 times
  retryDelay: (
    attempt, // Exponential backoff with jitter
  ) => Math.min(1000 * 2 ** attempt, 30000) + Math.random() * 1000,
}))
```

### Conditional Retry

```ts
const query = useQuery(() => ({
  queryKey: ['api-data'],
  queryFn: fetchData,
  retry: (failureCount, error) => {
    // Don't retry on 401/403 (auth errors)
    if ((error as Response)?.status === 401) return false
    if ((error as Response)?.status === 403) return false
    // Don't retry on 404
    if ((error as Response)?.status === 404) return false
    // Retry up to 3 times for other errors
    return failureCount < 3
  },
}))
```

### Error Handling Patterns

```tsx
const DataComponent = defineComponent(() => {
  const query = useQuery(() => ({
    queryKey: ['data'],
    queryFn: fetchData,
  }))

  return () => {
    // Pattern 1: Inline error handling
    if (query.isError()) {
      const error = query.error()
      if (error instanceof NotFoundError) {
        return <NotFoundPage />
      }
      return (
        <div class="error">
          <p>Failed to load data: {String(error)}</p>
          <button onClick={() => query.refetch()}>Retry</button>
        </div>
      )
    }

    if (query.isPending()) return <Spinner />
    return <DataView data={query.data()} />
  }
})
```

## SSR with Dehydration

Prefetch queries on the server, serialize them, and hydrate on the client:

```ts
// --- server.ts ---
import { QueryClient, dehydrate } from '@pyreon/query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // Data is fresh for 1 minute
    },
  },
})

// Prefetch all the data your page needs
await Promise.all([
  queryClient.prefetchQuery({
    queryKey: ['user', 1],
    queryFn: fetchUser,
  }),
  queryClient.prefetchQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  }),
])

const dehydratedState = dehydrate(queryClient)

// Embed in HTML
const html = `
  <script>
    window.__PYREON_QUERY_STATE__ = ${JSON.stringify(dehydratedState)}
  </script>
`
```

```ts
// --- client.ts ---
import { QueryClient, hydrate } from '@pyreon/query'

const queryClient = new QueryClient()

// Hydrate the cache with server-prefetched data
const dehydratedState = (window as any).__PYREON_QUERY_STATE__
if (dehydratedState) {
  hydrate(queryClient, dehydratedState)
}

// Now mount the app -- queries will use cached data immediately
mount(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
  document.getElementById('app')!
)
```

### Custom Dehydration Predicates

```ts
const dehydratedState = dehydrate(queryClient, {
  shouldDehydrateQuery: (query) => {
    // Only dehydrate successful queries
    return query.state.status === 'success'
  },
  shouldDehydrateMutation: defaultShouldDehydrateMutation,
})
```

## TanStack Query Core Re-exports

The following are re-exported from `@tanstack/query-core` for convenience:

| Export                           | Description                               |
| -------------------------------- | ----------------------------------------- |
| `QueryClient`                    | The query client class                    |
| `QueryCache`                     | Low-level query cache                     |
| `MutationCache`                  | Low-level mutation cache                  |
| `dehydrate`                      | Serialize query cache for SSR             |
| `hydrate`                        | Restore query cache from serialized state |
| `defaultShouldDehydrateQuery`    | Default dehydration predicate             |
| `defaultShouldDehydrateMutation` | Default mutation dehydration predicate    |
| `keepPreviousData`               | Placeholder data strategy                 |
| `hashKey`                        | Hash a query key                          |
| `isCancelledError`               | Check if an error is a cancellation       |
| `CancelledError`                 | Cancellation error class                  |

Type re-exports include `QueryKey`, `QueryFilters`, `MutationFilters`, `DehydratedState`, `FetchQueryOptions`, `InvalidateQueryFilters`, `InvalidateOptions`, `RefetchQueryFilters`, `RefetchOptions`, and `QueryClientConfig`.

## Pyreon Adapter Exports

| Export                       | Description                                   |
| ---------------------------- | --------------------------------------------- |
| `QueryClientProvider`        | Context provider component                    |
| `QueryClientContext`         | The raw context object                        |
| `useQueryClient`             | Access the nearest QueryClient                |
| `useQuery`                   | Subscribe to a query                          |
| `useMutation`                | Run a mutation                                |
| `useInfiniteQuery`           | Subscribe to a paginated query                |
| `useQueries`                 | Subscribe to multiple queries in parallel     |
| `useSuspenseQuery`           | Query with non-undefined data typing          |
| `useSuspenseInfiniteQuery`   | Infinite query with non-undefined data typing |
| `QuerySuspense`              | Pyreon-native suspense boundary               |
| `useIsFetching`              | Signal tracking in-flight query count         |
| `useIsMutating`              | Signal tracking in-flight mutation count      |
| `QueryErrorResetBoundary`    | Error reset boundary component                |
| `useQueryErrorResetBoundary` | Access error reset function                   |

## WebSocket Subscriptions — `useSubscription()`

Connect a WebSocket to the query cache for realtime data updates. Auto-reconnects with exponential backoff.

```tsx
import { useSubscription } from '@pyreon/query'

function OrdersDashboard() {
  const sub = useSubscription({
    url: 'wss://api.example.com/ws',
    onMessage: (event, queryClient) => {
      const data = JSON.parse(event.data)
      if (data.type === 'order-updated') {
        queryClient.invalidateQueries({ queryKey: ['orders'] })
      }
      if (data.type === 'order-created') {
        queryClient.setQueryData(['orders', data.order.id], data.order)
      }
    },
  })

  return (
    <div>
      <p>Status: {() => sub.status()}</p>
      {/* sub.status(): 'connecting' | 'connected' | 'disconnected' | 'error' */}
    </div>
  )
}
```

### Subscription Options

| Option                 | Type                           | Default  | Description                                      |
| ---------------------- | ------------------------------ | -------- | ------------------------------------------------ |
| `url`                  | `string \| () => string`       | required | WebSocket URL (can be reactive)                  |
| `protocols`            | `string \| string[]`           | —        | WebSocket sub-protocols                          |
| `onMessage`            | `(event, queryClient) => void` | required | Message handler with query client access         |
| `onOpen`               | `(event) => void`              | —        | Connection opened callback                       |
| `onClose`              | `(event) => void`              | —        | Connection closed callback                       |
| `onError`              | `(event) => void`              | —        | Error callback                                   |
| `reconnect`            | `boolean`                      | `true`   | Auto-reconnect on disconnect                     |
| `reconnectDelay`       | `number`                       | `1000`   | Initial reconnect delay (ms), doubles each retry |
| `maxReconnectAttempts` | `number`                       | `10`     | Max reconnect attempts (0 = unlimited)           |
| `enabled`              | `boolean \| () => boolean`     | `true`   | Enable/disable the connection                    |

### Return Value

| Property    | Type                         | Description                     |
| ----------- | ---------------------------- | ------------------------------- |
| `status`    | `Signal<SubscriptionStatus>` | Current connection status       |
| `send`      | `(data) => void`             | Send data through the WebSocket |
| `close`     | `() => void`                 | Close the connection            |
| `reconnect` | `() => void`                 | Manually reconnect              |

### Reactive URL

```tsx
const channel = signal('orders')

useSubscription({
  url: () => `wss://api.example.com/ws/${channel()}`,
  onMessage: (event, qc) => {
    /* ... */
  },
})

// Changing channel automatically reconnects to the new URL
channel.set('inventory')
```

### Conditional Connection

```tsx
const isAuthenticated = computed(() => !!token())

useSubscription({
  url: 'wss://api.example.com/ws',
  enabled: () => isAuthenticated(),
  onMessage: (event, qc) => {
    /* ... */
  },
})
```

## Type Exports

| Type                             | Description                                                |
| -------------------------------- | ---------------------------------------------------------- |
| `UseQueryResult`                 | Return type of `useQuery`                                  |
| `UseMutationResult`              | Return type of `useMutation`                               |
| `UseInfiniteQueryResult`         | Return type of `useInfiniteQuery`                          |
| `UseQueriesOptions`              | Options type for `useQueries`                              |
| `UseSuspenseQueryResult`         | Return type of `useSuspenseQuery`                          |
| `UseSuspenseInfiniteQueryResult` | Return type of `useSuspenseInfiniteQuery`                  |
| `QuerySuspenseProps`             | Props for `QuerySuspense`                                  |
| `QueryClientProviderProps`       | Props for `QueryClientProvider`                            |
| `QueryErrorResetBoundaryProps`   | Props for `QueryErrorResetBoundary`                        |
| `UseSubscriptionOptions`         | Options for `useSubscription`                              |
| `UseSubscriptionResult`          | Return type of `useSubscription`                           |
| `SubscriptionStatus`             | `'connecting' \| 'connected' \| 'disconnected' \| 'error'` |
