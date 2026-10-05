import { h } from '@pyreon/core'
import { QueryClient, QueryClientProvider, useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import usersUrl from './users.json?url&no-inline'

interface User {
  id: number
  name: string
  email: string
  company?: { name: string }
}

/**
 * The live counterpart to the "useQuery" basic-usage snippet on the Query
 * docs page — a REAL `@pyreon/query` observer, not a hand-rolled Map cache.
 *
 * `options` is a FUNCTION so the reactive `userId()` read inside `queryKey`
 * is tracked: changing `userId` gives `useQuery` a new key, so it refetches
 * automatically and reuses whatever it already cached for a key it's seen
 * before (switch back to a user you already loaded — no request, no
 * "fetching…" flash). `data` / `error` / `isPending` / `isError` /
 * `isFetching` are each an independent signal, so only the bindings that
 * read the field that changed re-run.
 */
function UserPanel() {
  const userId = signal(1)

  const query = useQuery<User>(() => ({
    queryKey: ['user', userId()],
    // A real same-origin request to a bundled fixture: works on static hosts
    // and under a deployment base without relying on a third-party API.
    queryFn: async ({ signal: requestSignal, queryKey }) => {
      const response = await fetch(usersUrl, { signal: requestSignal })
      if (!response.ok) throw new Error(`Users request failed (${response.status})`)
      const users = (await response.json()) as User[]
      const user = users.find((candidate) => candidate.id === queryKey[1])
      if (!user) throw new Error('User not found')
      return user
    },
    // Explicitly keep visited keys fresh so switching back demonstrates a
    // cache hit, rather than the default stale-data background refetch.
    staleTime: Infinity,
  }))

  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'muted' }, 'user id:'),
      ...[1, 2, 3, 4, 5].map((id) =>
        h(
          'button',
          {
            onClick: () => userId.set(id),
            style: () => ({
              fontWeight: userId() === id ? '700' : '400',
              background: userId() === id ? 'var(--accent)' : null,
              color: userId() === id ? 'var(--bg)' : null,
            }),
          },
          '#' + id,
        ),
      ),
    ),
    h('div', { class: 'card', style: { minHeight: '80px' } }, () => {
      if (query.isPending()) return h('div', { class: 'muted' }, 'fetching…')
      if (query.isError()) return h('div', { style: { color: '#FF1F8C' } }, String(query.error()))
      const user = query.data()
      if (user === undefined) return h('div', { class: 'muted' }, '∅')
      return h(
        'div',
        { class: 'col' },
        h('div', { style: { fontWeight: '700', fontSize: '16px' } }, user.name),
        h('div', { class: 'muted' }, user.email),
        h('div', { class: 'muted' }, user.company?.name ?? '—'),
      )
    }),
    h('div', { class: 'muted' }, () =>
      query.isFetching() ? 'refetching…' : 'idle · cached by TanStack Query',
    ),
  )
}

export default function UseQueryFetchCacheByKey() {
  const queryClient = new QueryClient()
  return h(QueryClientProvider, { client: queryClient }, h(UserPanel, {}))
}
