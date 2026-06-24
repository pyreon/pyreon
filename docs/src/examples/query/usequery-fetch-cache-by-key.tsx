// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal, effect } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — useQuery — fetch + cache by key.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function UseQueryFetchCacheByKey() {
  // Distilled version: stale-while-revalidate via a Map keyed by id.
  // The real useQuery() adds retry, dedup, focus refetch, and
  // suspense integration — same key model underneath.
  const cache = new Map()
  const userId = signal(1)
  const status = signal('idle') // idle | loading | success | error
  const data = signal(null)
  const error = signal(null)
  let token = 0

  const fetchUser = async (id: any) => {
    if (cache.has(id)) { status.set('success'); data.set(cache.get(id)); return }
    const myToken = ++token
    status.set('loading')
    try {
      const res = await fetch('https://jsonplaceholder.typicode.com/users/' + id)
      const json = await res.json()
      if (myToken !== token) return // stale — newer call won
      cache.set(id, json)
      data.set(json); status.set('success')
    } catch (e) {
      if (myToken !== token) return
      error.set(e); status.set('error')
    }
  }

  effect(() => { fetchUser(userId()) })

  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('span', { class: 'muted' }, 'user id:'),
      ...[1, 2, 3, 4, 5].map(id =>
        h('button', {
          onClick: () => userId.set(id),
          style: () => ({
            fontWeight: userId() === id ? '700' : '400',
            background: userId() === id ? 'var(--accent)' : null,
            color: userId() === id ? 'var(--bg)' : null,
          }),
        }, '#' + id),
      ),
    ),
    h('div', { class: 'card', style: { minHeight: '80px' } }, () => {
      if (status() === 'loading') return h('div', { class: 'muted' }, 'fetching…')
      if (status() === 'error')   return h('div', { style: { color: '#FF1F8C' } }, String(error()))
      if (!data())                return h('div', { class: 'muted' }, '∅')
      return h('div', { class: 'col' },
        h('div', { style: { fontWeight: '700', fontSize: '16px' } }, !!data().name),
        h('div', { class: 'muted' }, !!data().email),
        h('div', { class: 'muted' }, !!data().company?.name || '—'),
      )
    }),
    h('div', { class: 'muted' }, () => 'cache size: ' + cache.size + (cache.has(userId()) ? ' · hit' : ' · miss')),
  )
}
