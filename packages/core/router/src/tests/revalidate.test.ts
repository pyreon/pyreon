// ─── router.revalidate() — in-place refresh of the current route's loaders ───
//
// Closes the documented `invalidateLoader` limitation ("forces loaders to
// re-run on NEXT navigation"): mutation-then-refresh flows needed a fake
// navigation to see fresh data. `revalidate()` re-runs the CURRENT chain's
// loaders and re-renders the affected components in place.
import { describe, expect, it } from 'vitest'
import { redirect } from '../redirect'
import { createRouter } from '../router'
import type { RouteRecord, RouterInstance } from '../types'

const Noop = () => null

describe('router.revalidate()', () => {
  it('re-runs the current chain loaders and updates _loaderData in place', async () => {
    let version = 0
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      {
        path: '/posts',
        component: Noop,
        loader: async () => {
          version++
          return { version }
        },
      },
    ]
    const router = createRouter({ routes, url: '/' }) as unknown as RouterInstance
    await router.push('/posts')
    expect(version).toBe(1)
    const rec = routes[1]!
    expect(router._loaderData.get(rec)).toEqual({ version: 1 })

    await router.revalidate()
    expect(version).toBe(2)
    expect(router._loaderData.get(rec)).toEqual({ version: 2 })
    // Route unchanged — in place, no navigation
    expect(router.currentRoute().path).toBe('/posts')
    router.destroy()
  })

  it('bypasses a fresh loader cache (the point of revalidate over invalidateLoader)', async () => {
    let runs = 0
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      {
        path: '/cached',
        component: Noop,
        loader: async () => {
          runs++
          return runs
        },
        gcTime: 60_000, // long cache — a plain re-navigation would cache-hit
      },
    ]
    const router = createRouter({ routes, url: '/' }) as unknown as RouterInstance
    await router.push('/cached')
    expect(runs).toBe(1)
    await router.revalidate()
    expect(runs).toBe(2)
    router.destroy()
  })

  it('a loader throwing redirect() during revalidate navigates (replace)', async () => {
    let expired = false
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      { path: '/login', component: Noop },
      {
        path: '/dash',
        component: Noop,
        loader: async () => {
          if (expired) redirect('/login')
          return 'ok'
        },
        gcTime: 0,
      },
    ]
    const router = createRouter({ routes, url: '/' }) as unknown as RouterInstance
    await router.push('/dash')
    expect(router.currentRoute().path).toBe('/dash')
    expired = true
    await router.revalidate()
    expect(router.currentRoute().path).toBe('/login')
    router.destroy()
  })

  it('no-ops safely with no matched route or no loaders', async () => {
    const routes: RouteRecord[] = [{ path: '/', component: Noop }]
    const router = createRouter({ routes, url: '/' }) as unknown as RouterInstance
    await expect(router.revalidate()).resolves.toBeUndefined()
    router.destroy()
  })
})
