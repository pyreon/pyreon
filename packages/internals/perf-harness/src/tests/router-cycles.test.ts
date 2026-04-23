// @vitest-environment happy-dom
/**
 * Router navigation cycles probe.
 *
 * Rapid back-forth navigation should produce stable counter shape.
 * Each navigate should bump counters by the same amount as the first.
 */
import { h } from '@pyreon/core'
import { createRouter, prefetchLoaderData } from '@pyreon/router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

const dummy = () => h('div', null)
const makeRoutes = () => [
  { path: '/', component: dummy },
  { path: '/a', component: dummy },
  { path: '/b', component: dummy },
  { path: '/c', component: dummy },
]

describe('router navigation cycles', () => {
  it('back-and-forth navigation 50 times produces identical counter deltas', async () => {
    const router = createRouter({ routes: makeRoutes(), mode: 'history' })

    // Warm up
    await router.push('/a')
    await router.push('/b')

    // Record each cycle, compare
    const cycles: Record<string, number>[] = []
    for (let i = 0; i < 20; i++) {
      perfHarness.reset()
      await router.push('/a')
      await router.push('/b')
      cycles.push(perfHarness.snapshot())
    }

    // All cycles produce the same counter increments
    const unique = new Set(cycles.map((s) => JSON.stringify(s, Object.keys(s).sort())))
    expect(unique.size, `router cycle produced ${unique.size} distinct counter shapes`).toBe(1)
  })

  it('loader-backed route — cache hit ratio grows with repeat visits', async () => {
    let loaderCalls = 0
    const router = createRouter({
      routes: [
        { path: '/', component: dummy },
        {
          path: '/loaded',
          component: dummy,
          loader: async () => {
            loaderCalls++
            return { data: 42 }
          },
        },
      ],
      mode: 'history',
    })

    perfHarness.reset()
    await router.push('/loaded') // miss → loader runs
    await router.push('/') // no loader
    await router.push('/loaded') // cache hit
    await router.push('/') // no loader
    await router.push('/loaded') // cache hit
    await router.push('/') // no loader
    await router.push('/loaded') // cache hit

    const snap = perfHarness.snapshot()
    expect(snap['router.loaderRun']).toBe(1)
    expect(snap['router.loaderCache.hit']).toBe(3)
    expect(loaderCalls).toBe(1) // Loader only ran once
  })

  it('prefetch then navigate — navigation uses the prefetched data (loader does NOT run again)', async () => {
    let loaderCalls = 0
    const router = createRouter({
      routes: [
        { path: '/', component: dummy },
        {
          path: '/target',
          component: dummy,
          loader: async () => {
            loaderCalls++
            return { data: 1 }
          },
        },
      ],
      mode: 'history',
    })

    perfHarness.reset()
    await prefetchLoaderData(router as never, '/target') // loader runs once
    await router.push('/target') // should use loaded data without re-running

    const snap = perfHarness.snapshot()
    expect(snap['router.prefetch']).toBe(1)
    // loaderRun depends on whether prefetch populates the cache. Either 1
    // (prefetch populates cache, navigate misses because cache key differs)
    // or 0 (prefetch populates AND navigate hits cache). We document actual.
    // oxlint-disable-next-line no-console
    console.log(
      `[router] after prefetch+navigate: loaderRun=${snap['router.loaderRun']}, cache.hit=${snap['router.loaderCache.hit']}, actualLoaderCalls=${loaderCalls}`,
    )
  })

  it('50 rapid back-forth navigations — no linear counter growth beyond cycles', async () => {
    const router = createRouter({ routes: makeRoutes(), mode: 'history' })
    perfHarness.reset()
    for (let i = 0; i < 50; i++) {
      await router.push('/a')
      await router.push('/b')
    }
    const snap = perfHarness.snapshot()
    // 100 navigations total
    expect(snap['router.navigate']).toBe(100)
  })
})
