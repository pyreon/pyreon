import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getParam, setUrlRouter, type UrlRouter } from '../url'
import { useUrlState } from '../use-url-state'

// Which part of the URL is the ROUTE is the router's answer, not url-state's.
// url-state used to assume `location.pathname` + `location.search` in every
// case, which is wrong for the router's own DEFAULT mode (hash), wrong for a
// sub-path deploy (the router re-prefixes `base`), and lossy for a fragment.

/**
 * A hash router whose URL write is `router.ts:syncBrowserUrl` verbatim —
 * `const url = mode === 'history' ? `${base}${path}` : `#${path}``. The bug is
 * entirely about what url-state hands that line, so the shim reproduces the
 * line rather than the router around it.
 */
function hashRouterShim(): { calls: string[]; router: UrlRouter } {
  const calls: string[] = []
  const router: UrlRouter = {
    mode: 'hash',
    replace: (path) => {
      calls.push(`replace:${path}`)
      history.replaceState(null, '', `#${path}`)
    },
    push: (path) => {
      calls.push(`push:${path}`)
      history.pushState(null, '', `#${path}`)
    },
  }
  return { calls, router }
}

beforeEach(() => {
  history.replaceState(null, '', '/')
  setUrlRouter(null)
})
afterEach(() => {
  setUrlRouter(null)
})

describe('hash mode — the query lives in the fragment, beside the route', () => {
  it('keeps the app on its route instead of navigating to `#/?page=3`', () => {
    // The shipped shape: a write built `/?page=3` from `location.pathname`, the
    // router wrote it as `#/?page=3`, and the app left `#/products` on the
    // first filter change — a full route change, from a param update.
    history.replaceState(null, '', '#/products')
    const { calls, router } = hashRouterShim()
    setUrlRouter(router)

    useUrlState('page', 1).set(3)

    expect(calls).toEqual(['replace:/products?page=3'])
    expect(window.location.hash).toBe('#/products?page=3')
  })

  it('reads the value back — `location.search` is empty in hash mode', () => {
    history.replaceState(null, '', '#/products?page=3')
    setUrlRouter(hashRouterShim().router)

    expect(window.location.search, 'precondition: nothing lives in location.search').toBe('')
    expect(getParam('page')).toBe('3')
    expect(useUrlState('page', 1)()).toBe(3)
  })

  it('round-trips a write through a fresh read', () => {
    history.replaceState(null, '', '#/products?sort=name')
    setUrlRouter(hashRouterShim().router)

    useUrlState('page', 1).set(2)

    // Both params survive: the write merged into the hash's OWN query, not a
    // separate one it invented on `location.search`.
    expect(window.location.hash).toBe('#/products?sort=name&page=2')
    expect(useUrlState('page', 1)()).toBe(2)
    expect(useUrlState('sort', '')()).toBe('name')
  })

  it('honours `replace: false` through the hash push path too', () => {
    history.replaceState(null, '', '#/products')
    const { calls, router } = hashRouterShim()
    setUrlRouter(router)

    useUrlState('page', 1, { replace: false }).set(4)

    expect(calls).toEqual(['push:/products?page=4'])
    expect(window.location.hash).toBe('#/products?page=4')
  })

  it('clearing the last param leaves the route path alone', () => {
    history.replaceState(null, '', '#/products?page=3')
    const { calls, router } = hashRouterShim()
    setUrlRouter(router)

    useUrlState('page', 1).set(1) // back to the default → param removed

    expect(calls).toEqual(['replace:/products'])
    expect(window.location.hash).toBe('#/products')
  })

  it('treats an empty hash as the root route, not as an empty path', () => {
    history.replaceState(null, '', '/')
    const { calls, router } = hashRouterShim()
    setUrlRouter(router)

    useUrlState('page', 1).set(2)

    // `replace:''` would write a bare `#`, which the router reads back as `/`
    // only by accident; spell the root route the way the router spells it.
    expect(calls).toEqual(['replace:/?page=2'])
  })
})

describe('history mode — the fragment is not url-state`s to drop', () => {
  it('carries the fragment through a router write', () => {
    // `/docs#installation` became `/docs?page=2`: the reader jumped back to the
    // top of the page on every filter change.
    history.replaceState(null, '', '/docs#installation')
    const { calls, router } = hashRouterShim()
    router.mode = 'history'
    setUrlRouter(router)

    useUrlState('page', 1).set(2)

    expect(calls).toEqual(['replace:/docs?page=2#installation'])
  })

  it('carries the fragment through a RAW history write (no router)', () => {
    history.replaceState(null, '', '/docs#installation')

    useUrlState('page', 1).set(2)

    expect(window.location.pathname + window.location.search).toBe('/docs?page=2')
    expect(window.location.hash).toBe('#installation')
  })

  it('keeps the fragment when the last param is removed', () => {
    history.replaceState(null, '', '/docs?page=2#installation')

    useUrlState('page', 1).set(1) // default → param dropped

    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#installation')
  })

  it('hands the router a BASE-RELATIVE path on a sub-path deploy', () => {
    // The router prepends `base` itself, so passing `location.pathname` (which
    // already contains it) produced `/app/app/products?page=2`.
    history.replaceState(null, '', '/app/products')
    const calls: string[] = []
    setUrlRouter({
      mode: 'history',
      _base: '/app',
      replace: (path) => {
        calls.push(path)
        history.replaceState(null, '', `/app${path}`)
      },
    })

    useUrlState('page', 1).set(2)

    expect(calls).toEqual(['/products?page=2'])
    expect(window.location.pathname).toBe('/app/products')
  })

  it('maps the base itself to the root route', () => {
    history.replaceState(null, '', '/app')
    const calls: string[] = []
    setUrlRouter({ mode: 'history', _base: '/app', replace: (p) => void calls.push(p) })

    useUrlState('page', 1).set(2)

    expect(calls).toEqual(['/?page=2'])
  })

  it('leaves an unrelated pathname alone rather than mangling a prefix match', () => {
    // `/application` starts with `/app` as a STRING but is not under that base.
    history.replaceState(null, '', '/application')
    const calls: string[] = []
    setUrlRouter({ mode: 'history', _base: '/app', replace: (p) => void calls.push(p) })

    useUrlState('page', 1).set(2)

    expect(calls).toEqual(['/application?page=2'])
  })

  it('a router with no `mode` still means history — unchanged for hand-rolled routers', () => {
    history.replaceState(null, '', '/products')
    const calls: string[] = []
    setUrlRouter({ replace: (p) => void calls.push(p) })

    useUrlState('page', 1).set(3)

    expect(calls).toEqual(['/products?page=3'])
  })
})

describe('hash mode — a fragment carrying no query', () => {
  it('reads as the route with an EMPTY query, not as a query string', () => {
    // `#/products` has no `?`, the branch a fragment WITH a query never takes.
    // Reading a param here must answer null rather than mis-parsing the path.
    const { router } = hashRouterShim()
    setUrlRouter(router)
    history.replaceState(null, '', '#/products')
    expect(getParam('page')).toBeNull()
    history.replaceState(null, '', '#/products?page=3')
    expect(getParam('page')).toBe('3')
  })
})
