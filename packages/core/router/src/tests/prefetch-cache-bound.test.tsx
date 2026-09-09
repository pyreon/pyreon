/**
 * Two bounds that keep the router honest when nothing goes wrong.
 *
 * `prefetchRoute` remembers which paths it has already warmed, so hovering a
 * link twice issues one request. That memory is per-router and grows with
 * every distinct path a user hovers — leak class C, an unbounded cache — so it
 * is capped at 50 with oldest-first eviction. The cap had no test, and an
 * unbounded cache does not fail: it grows quietly for the whole session.
 *
 * The cache is module-private, so these drive it the way an app does — hover a
 * `RouterLink` — and observe the only thing it changes: whether a second hover
 * re-issues the prefetch. `invalidateLoader()` between phases clears the
 * LOADER cache, which is a different cache; without that the loader cache
 * would dedup the call and the test would pass no matter what the prefetch set
 * did.
 *
 * `classifyHref` decides whether a link is internal, and on the server there
 * is no `location` to compare origins against. A throw there fails the whole
 * render because one link was absolute.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { classifyHref } from '../typed-routes'
import { createRouter, setActiveRouter } from '../router'
import { RouterLink, RouterProvider } from '../index'
import type { RouteRecord, RouterInstance } from '../types'

const Page = () => null
const MAX = 50

afterEach(() => {
  setActiveRouter(null)
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('the prefetch cache is bounded and evicts oldest-first', () => {
  /** A router whose loader counts how many times each path was fetched. */
  function harness(): {
    router: RouterInstance
    hover: (path: string) => void
    runs: () => number
  } {
    let count = 0
    const routes: RouteRecord[] = [
      { path: '/p/:id', component: Page, loader: async () => ((count++), 'x') },
    ]
    const router = createRouter({ routes, url: '/' }) as unknown as RouterInstance
    setActiveRouter(router as never)
    const hover = (path: string): void => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      mount(h(RouterProvider, { router }, h(RouterLink, { to: path, prefetch: 'hover' }, 'x')), el)
      el.querySelector('a')!.dispatchEvent(new MouseEvent('mouseenter'))
    }
    return { router, hover, runs: () => count }
  }

  test('a repeated hover does not re-issue the prefetch', async () => {
    // The cache's whole purpose, and the control for the eviction spec below:
    // if this failed, "it re-fetched after eviction" would prove nothing.
    const { router, hover, runs } = harness()
    hover('/p/a')
    await new Promise<void>((r) => setTimeout(r, 10))
    const afterFirst = runs()
    expect(afterFirst, 'the first hover fetches').toBeGreaterThan(0)

    router.invalidateLoader() // clear the LOADER cache, keep the prefetch set
    hover('/p/a')
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(runs(), 'a remembered path is not re-fetched').toBe(afterFirst)
  })

  test('a path evicted by the cap IS re-fetched on a later hover', async () => {
    // The eviction itself, observed rather than inspected. `/p/a` goes in
    // first, then enough distinct paths to push it out; hovering it again must
    // fetch, because the cache no longer remembers it.
    const { router, hover, runs } = harness()
    hover('/p/a')
    await new Promise<void>((r) => setTimeout(r, 10))

    for (let i = 0; i < MAX + 2; i++) hover(`/p/fill-${i}`)
    await new Promise<void>((r) => setTimeout(r, 30))

    router.invalidateLoader()
    const before = runs()
    hover('/p/a')
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(runs(), 'an evicted path must be fetchable again').toBeGreaterThan(before)
  })

  test('a RECENT path survives the same eviction pressure', async () => {
    // Oldest-first, not newest-first. Evicting the most recent entry would
    // mean the link the user is looking at is re-prefetched on every hover.
    const { router, hover, runs } = harness()
    for (let i = 0; i < MAX - 1; i++) hover(`/p/fill-${i}`)
    hover('/p/recent')
    await new Promise<void>((r) => setTimeout(r, 30))

    router.invalidateLoader()
    const before = runs()
    hover('/p/recent')
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(runs(), 'the newest entry is still remembered').toBe(before)
  })
})

describe('classifyHref without a location (SSR)', () => {
  test('does not throw when `location` is undefined', () => {
    // `currentOrigin()` guards the read. A throw here fails the whole server
    // render because one link happened to be absolute.
    vi.stubGlobal('location', undefined)
    expect(() => classifyHref('https://example.test/x')).not.toThrow()
  })

  test('treats a same-origin-undecidable absolute as EXTERNAL, not internal', () => {
    // The documented fallback, and the safe direction: routing an absolute URL
    // through the client router when we cannot prove it is same-origin would
    // match a foreign URL against local routes.
    vi.stubGlobal('location', undefined)
    expect(classifyHref('https://example.test/x')).toBe('external')
  })

  test('still classifies the other kinds correctly with no location', () => {
    // The origin comparison is reached only for absolute http(s) URLs; the
    // other kinds must be unaffected by its absence.
    vi.stubGlobal('location', undefined)
    expect(classifyHref('/about')).toBe('internal')
    expect(classifyHref('#section')).toBe('hash')
    expect(classifyHref('mailto:a@b.test')).toBe('protocol')
  })
})
