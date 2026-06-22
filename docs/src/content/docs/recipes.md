---
title: "Recipes"
description: "Copy-paste solutions to common Pyreon tasks — auth gates, optimistic UI, infinite scroll, dark mode, debounced search, persisted state, server-side form errors, and polling."
---

# Recipes

Short, copy-paste solutions to the tasks that come up in every app. Each composes Pyreon primitives covered in depth in the [guides](/docs/guides/reactivity-in-depth) — here they're just the answer.

## Auth-gated route

Redirect anonymous users **before** the layout renders, using a loader (never an `onMount` push, which briefly leaks the gated UI):

```tsx
import { redirect } from '@pyreon/router'

export const loader = async ({ request }) => {
  const user = await getUser(request) // reads cookies/headers server-side
  if (!user) throw redirect('/login')
  return { user }
}
```

`throw redirect(...)` in a loader returns a real 302/307 on the server and a `router.replace` on the client.

## Optimistic UI

Update the cache immediately, roll back on error:

```tsx
import { useMutation, useQueryClient } from '@pyreon/query'

function ToggleLike(props: { id: string }) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => fetch(`/api/like/${props.id}`, { method: 'POST' }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['post', props.id] })
      const prev = qc.getQueryData(['post', props.id])
      qc.setQueryData(['post', props.id], (p: any) => ({ ...p, liked: !p.liked }))
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(['post', props.id], ctx?.prev),
    invalidates: [['post', props.id]],
  })
  return <button onClick={() => m.mutate()}>♥</button>
}
```

## Infinite scroll

Pair `useInfiniteQuery` with the `useInfiniteScroll` hook:

```tsx
import { useInfiniteQuery } from '@pyreon/query'
import { useInfiniteScroll } from '@pyreon/hooks'

function Feed() {
  const q = useInfiniteQuery(() => ({
    queryKey: ['feed'],
    queryFn: ({ pageParam = 0 }) => fetchPage(pageParam),
    getNextPageParam: (last) => last.nextCursor,
  }))
  const sentinel = useInfiniteScroll(() => { if (q.hasNextPage()) q.fetchNextPage() })
  return (
    <div>
      <For each={() => q.data()?.pages.flatMap((p) => p.items) ?? []} by={(i) => i.id}>
        {(item) => <Row item={item} />}
      </For>
      <div ref={sentinel} />
    </div>
  )
}
```

## Dark-mode toggle (persisted)

`PyreonUI` owns the mode; `useStorage` persists the choice across reloads:

```tsx
import { PyreonUI, useMode } from '@pyreon/ui-core'
import { useStorage } from '@pyreon/storage'

function App() {
  const mode = useStorage<'light' | 'dark'>('mode', 'light')
  return (
    <PyreonUI theme={theme} mode={mode}>
      <button onClick={() => mode.set(mode() === 'dark' ? 'light' : 'dark')}>
        {() => (mode() === 'dark' ? '🌙' : '☀️')}
      </button>
    </PyreonUI>
  )
}
```

## Debounced search

Debounce the input, key the query on the debounced value so it refetches reactively:

```tsx
import { signal } from '@pyreon/reactivity'
import { useDebouncedValue } from '@pyreon/hooks'
import { useQuery } from '@pyreon/query'

function Search() {
  const text = signal('')
  const debounced = useDebouncedValue(text, 300)
  const results = useQuery(() => ({
    queryKey: ['search', debounced()],
    queryFn: () => fetch(`/api/search?q=${debounced()}`).then((r) => r.json()),
    enabled: debounced().length > 0,
  }))
  return <input value={text} onInput={(e) => text.set(e.currentTarget.value)} />
}
```

## Persist any signal to localStorage

```tsx
import { useStorage } from '@pyreon/storage'

const draft = useStorage('draft', '')   // reads + writes localStorage, cross-tab synced
draft.set('hello')                       // persisted immediately
draft.remove()                           // clears the key
```

## Server-side form errors

Map a 422 response onto fields — errors show immediately (they don't wait for blur):

```tsx
const form = useForm({
  fields: [email, password],
  onSubmit: async (values) => {
    const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify(values) })
    if (res.status === 422) {
      const { errors } = await res.json()        // { email: 'Taken' }
      form.setErrors(errors)
    }
  },
})
```

## Polling / auto-refetch

```tsx
const status = useQuery(() => ({
  queryKey: ['job', jobId()],
  queryFn: () => fetch(`/api/jobs/${jobId()}`).then((r) => r.json()),
  refetchInterval: 2000,   // poll every 2s until you clear it
}))
```

## Related

- [Data Fetching guide](/docs/guides/data-fetching) · [Forms guide](/docs/guides/forms)
- [Routing guide](/docs/guides/routing) · [Examples gallery](/docs/examples)
