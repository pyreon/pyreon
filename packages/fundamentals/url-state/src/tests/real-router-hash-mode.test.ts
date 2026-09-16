import { createRouter } from '@pyreon/router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setUrlRouter } from '../url'
import { useUrlState } from '../use-url-state'

// The shim spec next door reproduces `router.ts:syncBrowserUrl` by hand. This
// one wires the REAL `@pyreon/router` through the documented
// `setUrlRouter(useRouter())` bridge, because the bug WAS a disagreement
// between what url-state imagined a router does with a path and what this one
// actually does — a hand-written stand-in can agree with the wrong model.

const routes = [
  { path: '/', component: () => null },
  { path: '/products', component: () => null },
]

let dispose: (() => void) | undefined

beforeEach(() => {
  history.replaceState(null, '', '/')
  setUrlRouter(null)
})
afterEach(() => {
  setUrlRouter(null)
  dispose?.()
  dispose = undefined
})

/** Let the router's async navigate pipeline commit its URL write. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0))

describe('the real @pyreon/router, in its DEFAULT mode', () => {
  it('defaults to hash — the premise the whole fix rests on', () => {
    const router = createRouter({ routes })
    dispose = () => router.destroy()
    expect(router.mode).toBe('hash')
  })

  it('a param write keeps the app on `#/products` and reads back', async () => {
    history.replaceState(null, '', '#/products')
    const router = createRouter({ routes })
    dispose = () => router.destroy()
    setUrlRouter(router)

    const page = useUrlState('page', 1)
    page.set(3)
    await settle()

    expect(window.location.hash).toBe('#/products?page=3')
    expect(window.location.search, 'hash mode leaves location.search empty').toBe('')
    // A freshly-created signal re-reads from the URL — the round trip the
    // pre-fix code could not make, since it wrote the hash and read the search.
    expect(useUrlState('page', 1)()).toBe(3)
    expect(router.currentRoute().path, 'the filter change navigated the app away').toBe('/products')
  })
})
