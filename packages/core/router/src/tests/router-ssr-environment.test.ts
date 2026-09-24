// @vitest-environment node
/**
 * The router on the SERVER — every `isServer` / `isClient` branch.
 *
 * The rest of this package's suite runs in happy-dom, where `document` always
 * exists, so `isClient` is permanently true and the SSR arms are unreachable
 * BY CONSTRUCTION. `.claude/rules/test-environment-parity.md` names this
 * exactly: code branching on the environment "must have a happy-dom test AND a
 * Node-only test (the latter explicitly verifies the SSR fallback path)". The
 * Node half did not exist.
 *
 * These are not cosmetic branches. Each one stands between a server render and
 * a `ReferenceError: window is not defined` — and an SSR crash is not a
 * degraded page, it is a 500 for every visitor. The guards are cheap and the
 * failure is total, which is the combination that makes them worth pinning.
 *
 * `isServer` is computed at module load from `typeof document`, so this file
 * declares the `node` environment in its docblock; importing the router from a
 * happy-dom file would evaluate the other half.
 */
import { announceRouteChange } from '../announcer'
import { createRouter } from '../router'
import { isServer } from '@pyreon/reactivity'
import type { RouteRecord, RouterInstance } from '../types'

const Page = () => null
const routes: RouteRecord[] = [
  { path: '/', component: Page },
  { path: '/about', component: Page },
  { path: '/users/:id', component: Page },
]

describe('the environment really is the server', () => {
  test('isServer is true and there is no document', () => {
    // The premise every other spec here depends on. Without it a
    // misconfigured environment would make the whole file vacuous — it would
    // pass by testing the client paths a second time.
    expect(isServer).toBe(true)
    expect(typeof document).toBe('undefined')
    expect(typeof window).toBe('undefined')
  })
})

describe('route announcer on the server', () => {
  test('is a no-op instead of reaching for document', () => {
    // The announcer creates a live region lazily. Un-guarded, this single call
    // takes down the render — there is no DOM to create it in.
    expect(() => announceRouteChange('Some page')).not.toThrow()
  })
})

describe('createRouter on the server', () => {
  test('uses the explicitly provided url as the initial location', () => {
    // There is no `window.location` to read, so SSR passes the request URL in.
    const r = createRouter({ routes, url: '/about' }) as unknown as RouterInstance
    expect(r.currentRoute().path).toBe('/about')
  })

  test('falls back to "/" when no url is given', () => {
    // A host that forgets to pass one must render the root, not crash.
    const r = createRouter({ routes }) as unknown as RouterInstance
    expect(r.currentRoute().path).toBe('/')
  })

  test('resolves params from the provided url', () => {
    const r = createRouter({ routes, url: '/users/42' }) as unknown as RouterInstance
    expect(r.currentRoute().params).toEqual({ id: '42' })
  })

  test('strips the configured base from the initial url (history mode)', () => {
    // Subpath deploys pass the full request path; the router works in
    // base-relative terms. Server-side this is the ONLY way the base can be
    // applied — there is no `window.location.pathname` to strip it from.
    const r = createRouter({
      routes,
      url: '/app/about',
      base: '/app',
      mode: 'history',
    }) as unknown as RouterInstance
    expect(r.currentRoute().path).toBe('/about')
  })

  test('base is a history-mode concept and is ignored in hash mode', () => {
    // `base` is resolved as `mode === 'history' ? normalizeBase(...) : ''`, so
    // a hash-mode router leaves the path alone. Worth pinning: passing `base`
    // to a hash router silently does nothing, and a test that omitted `mode`
    // would otherwise look like a stripping bug.
    const r = createRouter({
      routes,
      url: '/app/about',
      base: '/app',
      mode: 'hash',
    }) as unknown as RouterInstance
    expect(r.currentRoute().path).toBe('/app/about')
  })

  test('does not install history listeners it cannot install', () => {
    // Both modes reach `window.addEventListener` on the client. Constructing
    // either on the server must simply skip that.
    expect(() => createRouter({ routes, url: '/', mode: 'history' })).not.toThrow()
    expect(() => createRouter({ routes, url: '/', mode: 'hash' })).not.toThrow()
  })
})

describe('navigation on the server', () => {
  test('push resolves and updates the current route without touching history', () => {
    // SSR redirects go through the same `push` the client uses; it must not
    // reach for `window.history`.
    const r = createRouter({ routes, url: '/' }) as unknown as RouterInstance
    return r.push('/about').then(() => {
      expect(r.currentRoute().path).toBe('/about')
    })
  })

  test('replace works the same way', () => {
    const r = createRouter({ routes, url: '/' }) as unknown as RouterInstance
    return r.replace('/about').then(() => {
      expect(r.currentRoute().path).toBe('/about')
    })
  })
})

describe('teardown on the server', () => {
  test('destroy does not try to remove listeners that were never added', () => {
    // `destroy` removes popstate/hashchange and restores scrollRestoration —
    // all `window` reads. A request-scoped router is destroyed per request, so
    // an unguarded one would throw on every single request.
    const r = createRouter({ routes, url: '/' }) as unknown as RouterInstance
    expect(() => r.destroy()).not.toThrow()
  })

  test('a blocker registered server-side neither adds nor removes a listener', () => {
    // `retainBeforeUnload` / `releaseBeforeUnload` both early-return on the
    // server. The refcount must stay balanced across that, or the first
    // CLIENT blocker after hydration sees a non-zero count and never registers.
    const r = createRouter({ routes, url: '/' }) as unknown as RouterInstance
    r._blockers.add(() => true)
    expect(() => r.destroy()).not.toThrow()
  })
})
