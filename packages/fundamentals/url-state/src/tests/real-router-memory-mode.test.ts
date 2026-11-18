import { createRouter } from '@pyreon/router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setUrlRouter } from '../url'
import { useUrlState } from '../use-url-state'

// `@pyreon/router`'s `mode: 'memory'` (#4372) keeps the route — query included —
// inside the router, not in the page URL. Registered through
// `setUrlRouter(useRouter())`, url-state must read and write THAT location: the
// page's own `location.search` belongs to the host page.

const routes = [
  { path: '/', component: () => null },
  { path: '/products', component: () => null },
]

let dispose: (() => void) | undefined

beforeEach(() => {
  history.replaceState(null, '', '/host?page=9#top')
  setUrlRouter(null)
})

afterEach(() => {
  setUrlRouter(null)
  dispose?.()
  dispose = undefined
})

const settle = () => new Promise<void>((r) => setTimeout(r, 0))

describe('the real @pyreon/router in memory mode', () => {
  it("reads the router's query, not the page's", () => {
    const router = createRouter({ routes, mode: 'memory', initialEntries: ['/products?page=2'] })
    dispose = () => router.destroy()
    setUrlRouter(router)
    expect(useUrlState('page', 1)()).toBe(2)
  })

  it('a write navigates the memory router and leaves the page URL alone', async () => {
    const router = createRouter({ routes, mode: 'memory', initialEntries: ['/products'] })
    dispose = () => router.destroy()
    setUrlRouter(router)
    const href = window.location.href

    const page = useUrlState('page', 1)
    page.set(3)
    await settle()

    expect(router.currentRoute().path).toBe('/products')
    expect(router.currentRoute().query).toEqual({ page: '3' })
    expect(window.location.href).toBe(href)
    expect(useUrlState('page', 1)()).toBe(3)
  })

  it("keeps the route's own fragment and leaves an empty path at the root", async () => {
    const router = createRouter({ routes, mode: 'memory', initialEntries: ['/products?page=2#reviews'] })
    dispose = () => router.destroy()
    setUrlRouter(router)
    useUrlState('page', 1).set(5)
    await settle()
    expect(router.currentRoute().path).toBe('/products')
    expect(router.currentRoute().query).toEqual({ page: '5' })
    expect(router.currentRoute().hash).toBe('reviews')
  })

  it('a hand-rolled memory router without `_currentPath` reads as the root', async () => {
    const written: string[] = []
    setUrlRouter({ mode: 'memory', replace: (p) => void written.push(p) })
    expect(useUrlState('page', 1)()).toBe(1)
    useUrlState('q', '').set('x')
    await settle()
    expect(written).toEqual(['/?q=x'])
  })

  it('a push-intent write adds a memory entry that back() undoes', async () => {
    const router = createRouter({ routes, mode: 'memory', initialEntries: ['/products'] })
    dispose = () => router.destroy()
    setUrlRouter(router)

    useUrlState('page', 1, { replace: false }).set(4)
    await settle()
    expect(router.currentRoute().query).toEqual({ page: '4' })
    router.back()
    await settle()
    await settle()
    expect(router.currentRoute().query).toEqual({})
  })
})
