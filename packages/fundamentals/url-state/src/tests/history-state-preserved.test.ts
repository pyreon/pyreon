import { createRouter } from '@pyreon/router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { batchUrlUpdates } from '../sync'
import { setUrlRouter } from '../url'
import { useUrlState } from '../use-url-state'

// Without a registered router, url-state writes through the raw history API.
// A REPLACE rewrites the URL of the CURRENT entry, and that entry's
// `history.state` belongs to whoever put it there: @pyreon/router stamps
// `{ __pyreonIdx: n }` on every entry it owns, and other libraries keep their
// own per-entry state. Writing `replaceState(null, …)` erased it on the first
// filter change (#4388) — the common case is a router app that never calls
// `setUrlRouter`, such as a Zero island, which has no router instance to hand
// over. A PUSH creates a new entry, which starts with no state; the entry it
// leaves behind keeps its own.

const routes = [
  { path: '/', component: () => null },
  { path: '/products', component: () => null },
]

let dispose: (() => void) | undefined

beforeEach(() => {
  history.replaceState(null, '', '/products')
  setUrlRouter(null)
})
afterEach(() => {
  setUrlRouter(null)
  dispose?.()
  dispose = undefined
})

const OWNED = { owner: 'another-library', scrollY: 120 }

describe('a replace write keeps the entry state (raw history, no router registered)', () => {
  it('a scalar write keeps foreign state', () => {
    history.replaceState(OWNED, '', '/products')
    useUrlState('page', 1).set(2)
    expect(window.location.search).toBe('?page=2')
    expect(history.state).toEqual(OWNED)
  })

  it('a repeated-key array write keeps foreign state', () => {
    history.replaceState(OWNED, '', '/products')
    useUrlState('tags', [] as string[], { arrayFormat: 'repeat' }).set(['a', 'b'])
    expect(window.location.search).toBe('?tags=a&tags=b')
    expect(history.state).toEqual(OWNED)
  })

  it('a batched multi-param write keeps foreign state', () => {
    history.replaceState(OWNED, '', '/products')
    const { page, q } = useUrlState({ page: 1, q: '' })
    batchUrlUpdates(() => {
      page.set(3)
      q.set('shoe')
    })
    expect(new URLSearchParams(window.location.search).get('page')).toBe('3')
    expect(new URLSearchParams(window.location.search).get('q')).toBe('shoe')
    expect(history.state).toEqual(OWNED)
  })

  it('a reset that removes the param keeps foreign state', () => {
    history.replaceState(OWNED, '', '/products?page=4')
    useUrlState('page', 1).remove()
    expect(window.location.search).toBe('')
    expect(history.state).toEqual(OWNED)
  })

  it("keeps the real @pyreon/router's `__pyreonIdx` stamp when the router is not registered", () => {
    const router = createRouter({ routes, mode: 'history' })
    dispose = () => router.destroy()
    const before = history.state as { __pyreonIdx?: unknown } | null
    expect(before?.__pyreonIdx, 'the router stamps the entry it starts on').toBe(0)

    useUrlState('p', 1).set(2)

    expect(window.location.search).toBe('?p=2')
    expect(history.state).toEqual(before)
  })
})

describe('a push write starts a new entry and leaves the previous one intact', () => {
  it('the new entry has no state; Back returns to the entry with its state', async () => {
    history.replaceState(OWNED, '', '/products')
    const length = history.length
    useUrlState('page', 1, { replace: false }).set(2)

    expect(history.length).toBe(length + 1)
    expect(window.location.search).toBe('?page=2')
    expect(history.state, 'a new entry carries no state from the one it left').toBeNull()

    const popped = new Promise<void>((r) => window.addEventListener('popstate', () => r(), { once: true }))
    history.back()
    await popped
    expect(window.location.search).toBe('')
    expect(history.state).toEqual(OWNED)
  })
})
