---
title: "Data Fetching & Caching"
description: "How to fetch, cache, mutate, and reactively refetch server data in Pyreon with @pyreon/query — the signal-native TanStack Query adapter."
---

# Data Fetching & Caching

Fetch server data, cache it, keep it fresh, and mutate it — with `@pyreon/query`, Pyreon's adapter over TanStack Query. Every result field (`data`, `error`, `isFetching`) is an independent signal, so reading one doesn't subscribe a component to the others, and a refetch patches only the DOM that actually changed.

## When to use it

- You read data from a server/API and want caching, deduplication, background refetch, and stale-while-revalidate for free.
- You mutate server state and want the affected queries to refetch automatically.
- You need infinite/paginated lists, parallel queries, or Suspense-driven loading.

## When **not** to use it

- Purely client-side state with no server round-trip — reach for a plain `signal()` or `@pyreon/store`.
- A one-off fetch with no caching needs — `@pyreon/hooks`' `useFetch` (`{ data, error, isPending, refetch }`) is the thin option.

## Setup

Wrap your app once in a `QueryClientProvider`:

```tsx
import { QueryClient, QueryClientProvider } from '@pyreon/query'

const client = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={client}>
      <Posts />
    </QueryClientProvider>
  )
}
```

## Reading data

`useQuery` takes its options **as a function** — that is the single most important rule in this guide. The function re-runs when any signal it reads changes, so a query keyed on a signal refetches automatically:

```tsx
// @check
import { useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'

const userId = signal(1)

function User() {
  const q = useQuery(() => ({
    queryKey: ['user', userId()],          // reads the signal → refetches on change
    queryFn: () => fetch(`/api/users/${userId()}`).then((r) => r.json()),
  }))

  // Each field is its own signal — read them in reactive scopes (JSX).
  return (
    <div>
      {() => (q.isPending() ? 'Loading…' : q.data()?.name)}
    </div>
  )
}
```

Here is a live, runnable query that caches by key and refetches when the key changes:

<Example file="./examples/query/usequery-fetch-cache-by-key" />

## Mutating data

`useMutation` is the exception to the function-options rule — its options are a **plain object** (mutations are imperative, nothing to track). Use `invalidates` to refetch affected queries on success:

```tsx
import { useMutation } from '@pyreon/query'

function AddPost() {
  const create = useMutation({
    mutationFn: (title: string) =>
      fetch('/api/posts', { method: 'POST', body: JSON.stringify({ title }) }),
    invalidates: [['posts']], // refetch every query whose key starts with ['posts']
  })

  return <button onClick={() => create.mutate('Hello')}>Add</button>
}
```

## Other shapes

- **Parallel** — `useQueries(() => [...])`, or the named form `defineQueries({ user: () => opts, posts: () => opts })` for a typed object instead of an array.
- **Infinite** — `useInfiniteQuery(() => ({ queryKey, queryFn, getNextPageParam }))`.
- **Suspense** — `useSuspenseQuery` inside a `QuerySuspense` boundary; pair `QueryErrorResetBoundary` with a sibling `ErrorBoundary` so a fallback "retry" clears the errored query.
- **Imperative access** — `useQueryClient()` for the nearest client; global spinners via `useIsFetching()` / `useIsMutating()` (each returns `Signal<number>`).

## Common pitfalls

- **Passing `useQuery` options as an object literal.** `useQuery({ queryKey, queryFn })` captures the options once — the query never refetches when a key signal changes. Always wrap in a function: `useQuery(() => ({ ... }))`. (`@pyreon/lint`'s `query-options-as-function` rule and MCP `validate` both flag this.)
- **Reading a result field outside a reactive scope.** `const d = q.data()` at component-body top captures one value. Read `q.data()` inside JSX / an `effect` / a `computed` so it tracks.
- **Forgetting the provider.** `useQueryClient()` throws if no `QueryClientProvider` is mounted above.

## Related

- [Query reference](/docs/reference/query) — every export with signatures
- [Query package guide](/docs/query)
- [Reactive context](/docs/patterns/reactive-context)
- [Forms & Validation](/docs/guides/forms)
