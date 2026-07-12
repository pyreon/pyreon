// ─── Repro: hover-prefetch + click double-fetch ───────────────────────────────
//
// Pre-fix `prefetchLoaderData` called `record.loader()` RAW — it never wrote
// `_loaderCache` and never registered in `_loaderInflight`, so the navigation
// that follows a hover/viewport prefetch ran the loader a SECOND time:
//   - prefetch settled first → nav's cache lookup missed (nothing cached) →
//     loader re-ran;
//   - prefetch still in flight → nav's dedup missed (nothing registered) →
//     two concurrent runs of the same loader.
// The fix routes prefetch through `router._executeLoader` — the same
// cache+dedup path navigations take.
import { describe, expect, it } from 'vitest'
import { prefetchLoaderData } from '../loader'
import { createRouter } from '../router'
import type { RouteRecord, RouterInstance } from '../types'

const Noop = () => null

describe('prefetch shares one loader run with the navigation that follows', () => {
  it('prefetch settled → navigation is a cache hit (no second run)', async () => {
    let runs = 0
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      {
        path: '/posts',
        component: Noop,
        loader: async () => {
          runs++
          return ['a']
        },
      },
    ]
    const router = createRouter({ routes, url: '/' }) as unknown as RouterInstance

    await prefetchLoaderData(router, '/posts') // hover
    expect(runs).toBe(1)

    await router.push('/posts') // click
    expect(runs).toBe(1) // pre-fix: 2
    router.destroy()
  })

  it('prefetch in flight → navigation dedups onto the same promise', async () => {
    let runs = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      {
        path: '/slow',
        component: Noop,
        loader: async () => {
          runs++
          await gate
          return 'data'
        },
      },
    ]
    const router = createRouter({ routes, url: '/' }) as unknown as RouterInstance

    const prefetch = prefetchLoaderData(router, '/slow') // hover (slow loader)
    const nav = router.push('/slow') // click before prefetch settles
    await new Promise((r) => setTimeout(r, 10))
    release()
    await Promise.all([prefetch, nav])

    expect(runs).toBe(1) // pre-fix: 2 concurrent runs
    expect(router.currentRoute().path).toBe('/slow')
    router.destroy()
  })

  it('gcTime: 0 (caching disabled) still dedups in-flight but re-runs after settle', async () => {
    let runs = 0
    const routes: RouteRecord[] = [
      { path: '/', component: Noop },
      {
        path: '/nocache',
        component: Noop,
        loader: async () => {
          runs++
          return 'x'
        },
        gcTime: 0,
      },
    ]
    const router = createRouter({ routes, url: '/' }) as unknown as RouterInstance
    await prefetchLoaderData(router, '/nocache')
    expect(runs).toBe(1)
    await router.push('/nocache')
    // gcTime 0 opts OUT of the cache — the navigation re-runs by contract.
    expect(runs).toBe(2)
    router.destroy()
  })
})
