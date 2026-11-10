// @vitest-environment node
import { isServer } from '@pyreon/reactivity'
import { getRedirectInfo } from '../redirect'
import { createRouter } from '../router'
import type { RouteRecord, RouterInstance } from '../types'

// Server half of the initial-navigation guard contract: an SSR host calls
// `router.preload(url)` before rendering, so a guard decision there must reach
// the response — a redirect is thrown as the same `redirect()` a loader throws.
const Page = () => null
const routes = (enter?: RouteRecord['beforeEnter']): RouteRecord[] => [
  { path: '/', component: Page },
  { path: '/login', component: Page },
  { path: '/admin', component: Page, ...(enter ? { beforeEnter: enter } : {}) },
]

describe('initial navigation guards on the server', () => {
  it('runs in a real server environment', () => {
    expect(isServer).toBe(true)
  })

  it('a guard redirect becomes a thrown redirect() from preload', async () => {
    const router = createRouter({ routes: routes(() => '/login'), url: '/admin', mode: 'history' })
    const err = await router.preload('/admin').then(() => null, (e: unknown) => e)
    expect(getRedirectInfo(err)?.url).toBe('/login')
  })

  it('a cancelling guard hides the route from the render', async () => {
    const router = createRouter({ routes: routes(), url: '/admin', beforeEach: [(to) => to.path !== '/admin'] })
    await router.preload('/admin')
    expect((router as unknown as RouterInstance)._initialGate()).toBe(true)
  })

  it('a guard that THROWS on the server (browser-only state) defers to the client', async () => {
    const router = createRouter({
      routes: routes(() => {
        // A guard reading browser-only state: `localStorage` is not defined in Node.
        return (globalThis as unknown as { localStorage: Storage }).localStorage.getItem('a') === '1'
      }),
      url: '/admin',
      mode: 'history',
    })
    await expect(router.preload('/admin')).resolves.toBeUndefined()
    expect((router as unknown as RouterInstance)._initialGate()).toBe(false)
  })
  it('middleware that THROWS on the server defers to the client too, and later guards still run', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      let guardRan = false
      const router = createRouter({
        url: '/admin',
        mode: 'history',
        routes: [
          { path: '/', component: Page },
          {
            path: '/admin',
            component: Page,
            middleware: () => {
              throw new Error('reads document.cookie')
            },
            beforeEnter: () => {
              guardRan = true
              return true
            },
          },
        ],
      })
      await expect(router.preload('/admin')).resolves.toBeUndefined()
      expect(guardRan).toBe(true)
      expect((router as unknown as RouterInstance)._initialGate()).toBe(false)
      expect(warn.mock.calls.some((c) => String(c[0]).includes('Route middleware threw during SSR'))).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })
})
