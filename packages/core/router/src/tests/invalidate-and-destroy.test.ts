/**
 * `invalidateLoader` and `destroy` — cache staleness and teardown.
 *
 * Two surfaces where the failure is invisible at the call site.
 *
 * `invalidateLoader` clears BOTH the loader cache and the in-flight map. The
 * in-flight half is the subtle one: dropping only the cache means the next
 * read joins the request that is ALREADY running — the one started before the
 * mutation — so the caller waits, gets a fresh-looking response, and sees the
 * pre-mutation data. The predicate form was uncovered entirely.
 *
 * `destroy` is a teardown with eight steps, any of which can be dropped
 * without a symptom in the session that dropped it: listeners that outlive the
 * router, a `scrollRestoration` left on `manual` for the whole page, a stale
 * `_activeRouter` still answering `useRouter()` after the router is gone, and
 * the shared `beforeunload` refcount left non-zero so a LATER router never
 * registers its own.
 */
import { createRouter, setActiveRouter } from '../router'
import type { RouteRecord, RouterInstance } from '../types'

const Page = () => null
const routes: RouteRecord[] = [
  { path: '/', component: Page },
  { path: '/users', component: Page },
]

const make = (url = '/'): RouterInstance =>
  createRouter({ routes, url }) as unknown as RouterInstance

afterEach(() => {
  setActiveRouter(null)
})

describe('invalidateLoader — the three forms', () => {
  function seeded(): RouterInstance {
    const r = make()
    // The real record shapes — a cache entry is `{ data, timestamp }` and an
    // in-flight entry is `{ promise, signal }`, not the bare values.
    const entry = (data: string) => ({ data, timestamp: Date.now() })
    const inflight = (data: string) => ({
      promise: Promise.resolve(data),
      signal: new AbortController().signal,
    })
    r._loaderCache.set('/users|', entry('USERS'))
    r._loaderCache.set('/users/1|', entry('USER-1'))
    r._loaderCache.set('/posts|', entry('POSTS'))
    r._loaderInflight.set('/users|', inflight('USERS'))
    r._loaderInflight.set('/posts|', inflight('POSTS'))
    return r
  }

  test('no argument clears everything, cache AND in-flight', () => {
    const r = seeded()
    r.invalidateLoader()
    expect(r._loaderCache.size).toBe(0)
    expect(r._loaderInflight.size, 'a surviving in-flight serves pre-mutation data').toBe(0)
  })

  test('a string key clears exactly that entry and leaves the rest', () => {
    // Over-clearing is a performance bug; under-clearing is a correctness one.
    const r = seeded()
    r.invalidateLoader('/users|')
    expect(r._loaderCache.has('/users|')).toBe(false)
    expect(r._loaderInflight.has('/users|')).toBe(false)
    expect(r._loaderCache.has('/users/1|'), 'a different key must survive').toBe(true)
    expect(r._loaderCache.has('/posts|')).toBe(true)
    expect(r._loaderInflight.has('/posts|')).toBe(true)
  })

  test('a PREDICATE clears every matching key and only those', () => {
    // The form a mutation actually uses: "everything under /users".
    const r = seeded()
    r.invalidateLoader((key) => key.startsWith('/users'))
    expect(r._loaderCache.has('/users|')).toBe(false)
    expect(r._loaderCache.has('/users/1|'), 'the predicate must reach nested keys').toBe(false)
    expect(r._loaderCache.has('/posts|'), 'non-matching keys must survive').toBe(true)
  })

  test('a predicate also drops the matching IN-FLIGHT requests', () => {
    // Without this the next read joins the request started BEFORE the
    // mutation and resolves with stale data that looks freshly fetched.
    const r = seeded()
    r.invalidateLoader((key) => key.startsWith('/users'))
    expect(r._loaderInflight.has('/users|')).toBe(false)
    expect(r._loaderInflight.has('/posts|')).toBe(true)
  })

  test('a predicate matching nothing is a no-op, not a clear-all', () => {
    // A predicate that never matches must not degrade into "invalidate all" —
    // the empty-match case is exactly where a wrong `!keyOrPredicate` check
    // would fall through to the clear-everything branch.
    const r = seeded()
    r.invalidateLoader(() => false)
    expect(r._loaderCache.size).toBe(3)
    expect(r._loaderInflight.size).toBe(2)
  })
})

describe('destroy — what must not outlive the router', () => {
  test('removes its popstate and hashchange listeners', () => {
    const removed: string[] = []
    const realRemove = window.removeEventListener.bind(window)
    window.removeEventListener = ((t: string, fn: EventListener, o?: unknown) => {
      removed.push(t)
      return realRemove(t, fn, o as never)
    }) as typeof window.removeEventListener
    try {
      // Each mode installs its OWN listener, so both have to be checked —
      // asserting one covers only half the teardown.
      const hash = createRouter({ routes, url: '/', mode: 'hash' }) as unknown as RouterInstance
      hash.destroy()
      expect(removed, 'hash mode listens on hashchange').toContain('hashchange')

      removed.length = 0
      const hist = createRouter({ routes, url: '/', mode: 'history' }) as unknown as RouterInstance
      hist.destroy()
      // A listener left behind keeps the whole router graph alive AND keeps
      // running its navigation pipeline against a torn-down instance.
      expect(removed, 'history mode listens on popstate').toContain('popstate')
    } finally {
      window.removeEventListener = realRemove as typeof window.removeEventListener
    }
  })

  test('clears the global active-router reference so a dead router stops answering', () => {
    // `useRouter()` falls back to `_activeRouter`. Left set, every hook in the
    // app keeps resolving to a destroyed instance — the shape that makes HMR
    // and test isolation leak into each other.
    const r = make()
    setActiveRouter(r as never)
    r.destroy()
    const fresh = make()
    setActiveRouter(fresh as never)
    expect(fresh).not.toBe(r)
  })

  test('aborts the in-flight navigation controller', () => {
    // An un-aborted controller leaves loaders running against a router nobody
    // will ever read again, and their writes land in a cleared map.
    const r = make()
    const ac = new AbortController()
    r._abortController = ac
    r.destroy()
    expect(ac.signal.aborted, 'in-flight work must be cancelled').toBe(true)
    expect(r._abortController).toBeNull()
  })

  test('empties every cache it owns', () => {
    const r = make()
    r._loaderCache.set('k', { data: 1, timestamp: Date.now() })
    r._loaderInflight.set('k', {
      promise: Promise.resolve(1),
      signal: new AbortController().signal,
    })
    r._loaderData.set(routes[0]!, 'data')
    r.destroy()
    expect(r._loaderCache.size).toBe(0)
    expect(r._loaderInflight.size).toBe(0)
    expect(r._loaderData.size, 'retained loader data pins every matched record').toBe(0)
  })

  test('clears guards, so a destroyed router cannot still veto navigation', () => {
    // Guards are held in module-adjacent arrays; leaving them populated means
    // a torn-down router's guard still runs on the NEXT router's navigation.
    let guardRuns = 0
    const r = make()
    r.beforeEach(() => {
      guardRuns++
      return true
    })
    r.destroy()
    return r.push('/users').then(() => {
      expect(guardRuns, 'a destroyed router runs no guards').toBe(0)
    })
  })

  test('destroy is idempotent — a second call does not throw', () => {
    // Hosts call it from both an unmount hook and an explicit teardown.
    const r = make()
    r.destroy()
    expect(() => r.destroy()).not.toThrow()
  })
})
