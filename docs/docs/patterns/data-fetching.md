---
title: "Data fetching — useQuery + useMutation"
summary: "Options-as-function so signal reads track. useMutation with invalidates for cache management."
seeAlso: [signal-writes, form-fields]
---

# Data fetching — useQuery + useMutation

## The pattern

Pass query options as a **function** (not an object) so signal reads inside track automatically:

```tsx
import { useQuery, useMutation, QueryClientProvider, QueryClient } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'

const queryClient = new QueryClient()

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  )
}

function UserCard() {
  const userId = signal('alice')
  // Options function — signal reads track, so changing userId refetches.
  const user = useQuery(() => ({
    queryKey: ['user', userId()],
    queryFn: () => api.fetchUser(userId()),
    staleTime: 30_000,
  }))

  return (
    <div>
      {() => user.isLoading() && <Spinner />}
      {() => user.data() && <h1>{user.data()!.name}</h1>}
      <button onClick={() => userId.set('bob')}>Load Bob</button>
    </div>
  )
}
```

Mutations use an object (mutations are imperative — no tracking needed) + `invalidates` to clear matching queries on success:

```tsx
function DeleteButton(props: { id: string }) {
  const deleteUser = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    invalidates: [['users']],   // all queries with this prefix invalidate on success
  })

  return (
    <button
      disabled={() => deleteUser.isPending()}
      onClick={() => deleteUser.mutate(props.id)}
    >
      Delete
    </button>
  )
}
```

## Key differences from TanStack Query

- `useQuery` / `useInfiniteQuery` / `useQueries` / `useSuspenseQuery` take options as a **function** — changing a tracked signal re-runs the observer options and refetches.
- `useMutation` options are a plain **object** — mutations fire imperatively via `.mutate(...)`, so there's nothing to track.
- Every query field is a fine-grained `Signal<T>` — reading `user.data()` does not subscribe to `user.error()` or `user.isFetching()`.
- `useMutation({ invalidates: [...] })` auto-invalidates keys on success, preserving user `onSuccess`.
- `defineQueries({ user: () => opts, posts: () => opts })` — named parallel queries returning a typed object, cleaner than the array form.

## Why

Pyreon components run once, so a plain options object would bake the initial values in forever. Wrapping in a function lets Pyreon's reactivity system re-invoke the options and drive the TanStack Query observer on each change — the TanStack primitive stays pure, the adapter handles tracking.

## Anti-pattern

```tsx
// BROKEN — options object evaluated ONCE at component setup,
// user.data() never updates even though userId changes.
const user = useQuery({
  queryKey: ['user', userId()],  // read at setup, captures 'alice' forever
  queryFn: () => api.fetchUser(userId()),
})
```

```tsx
// BROKEN — mutate() fires immediately on render (the call happens
// during prop evaluation; the handler prop gets the return value,
// not a function)
const Broken = () => <button onClick={deleteUser.mutate(id)}>Delete</button>

// Correct — wrap in an arrow so onClick receives a callable
const Correct = () => <button onClick={() => deleteUser.mutate(id)}>Delete</button>
```

## Related

- Reference API: `useQuery`, `useMutation`, `useSubscription`, `useSSE` — `get_api({ package: "query", symbol: "..." })`
- Related: WebSocket subscription via `useSubscription({ url, enabled })` uses the same options-as-function pattern
