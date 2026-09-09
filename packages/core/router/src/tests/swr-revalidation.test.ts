/**
 * Stale-while-revalidate background refresh.
 *
 * A `staleWhileRevalidate` route commits immediately with cached data and
 * refreshes in the background. Three things have to hold, and all three fail
 * quietly:
 *
 *   * the fresh data must actually LAND — in `_loaderData`, in the cache, and
 *     with the loading signal bumped so mounted routes re-render. Miss the
 *     bump and the data is correct in memory and stale on screen, which is the
 *     hardest version of this bug to see;
 *   * an ABORTED revalidation must not write. It belongs to a navigation the
 *     user has already left, so its response is stale by definition — writing
 *     it puts the previous page's data under the current one;
 *   * a FAILED revalidation must not cancel the settled navigation, but must
 *     still be reported. The source says why: "an empty catch is the
 *     silent-failure anti-pattern: a persistently-failing revalidation loader
 *     (auth expiry, API outage) would produce ZERO signal while the developer
 *     stares at permanently stale data."
 *
 * None of it had a test.
 */
import { createRouter, setActiveRouter } from '../router'
import type { RouteRecord, RouterInstance } from '../types'

const Page = () => null
const tick = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms))

afterEach(() => {
  setActiveRouter(null)
  vi.restoreAllMocks()
})

/**
 * A deferred loader, so the background refresh genuinely happens AFTER the
 * navigation settles. An instantly-resolving one lands inside the same
 * microtask drain as `push()`, which makes "the commit serves stale data
 * first" untestable — and would let a synchronous, non-background
 * implementation pass every spec here.
 */
function deferredLoader(): { loader: () => Promise<string>; resolve: (v: string) => void; reject: (e: Error) => void } {
  let resolve!: (v: string) => void
  let reject!: (e: Error) => void
  const p = new Promise<string>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { loader: () => p, resolve, reject }
}

/** A router whose `/swr` route is already cached, so a visit revalidates. */
function swrRouter(loader: () => Promise<string>): {
  router: RouterInstance
  record: RouteRecord
} {
  const record: RouteRecord = {
    path: '/swr',
    component: Page,
    loader,
    staleWhileRevalidate: true,
  }
  const routes: RouteRecord[] = [{ path: '/', component: Page }, record]
  const router = createRouter({ routes, url: '/' }) as unknown as RouterInstance
  // Pre-existing (stale) data is what puts the route on the SWR path at all —
  // without it the loader is a blocking one.
  router._loaderData.set(record, 'STALE')
  return { router, record }
}

describe('SWR — the refresh lands', () => {
  test('the navigation commits on STALE data and only later goes fresh', async () => {
    // Both halves matter: committing on stale data is what makes SWR fast, and
    // the later swap is what makes it correct.
    const d = deferredLoader()
    const { router, record } = swrRouter(d.loader)
    await router.push('/swr')
    expect(router._loaderData.get(record), 'the commit serves stale data first').toBe('STALE')

    d.resolve('FRESH')
    await tick()
    expect(router._loaderData.get(record), 'the background refresh replaces it').toBe('FRESH')
  })

  test('the refresh also updates the CACHE, not just the live value', async () => {
    // Otherwise the next visit re-serves the stale entry and revalidates
    // again — the data is fresh on screen and never fresh in the cache.
    const d = deferredLoader()
    const { router } = swrRouter(d.loader)
    await router.push('/swr')
    d.resolve('FRESH')
    await tick()
    // Cache entries are wrapped records, not bare values.
    const cached = [...router._loaderCache.values()].map((e) =>
      e && typeof e === 'object' && 'data' in e ? (e as { data: unknown }).data : e,
    )
    expect(cached, 'the fresh value must be written back to the cache').toContain('FRESH')
  })

  test('the loading signal is bumped so mounted routes re-render', async () => {
    // The subtle one. Without the bump the new data sits in `_loaderData`
    // unread: correct in memory, stale on screen, and nothing to see in a test
    // that only inspects the map.
    const d = deferredLoader()
    const { router } = swrRouter(d.loader)
    let notifications = 0
    const stop = router._loadingSignal.subscribe(() => notifications++)
    await router.push('/swr')
    const beforeRefresh = notifications
    d.resolve('FRESH')
    await tick()
    expect(
      notifications,
      'the refresh must notify, or the UI never shows the fresh data',
    ).toBeGreaterThan(beforeRefresh)
    stop()
  })
})

describe('SWR — a refresh that should not be applied', () => {
  test('an aborted revalidation does not write its result', async () => {
    // The response belongs to a navigation the user has left. Writing it puts
    // the previous page's data under the current one — the leak-class-F shape.
    let release!: (v: string) => void
    const { router, record } = swrRouter(
      () =>
        new Promise<string>((res) => {
          release = res
        }),
    )
    await router.push('/swr')
    // Leaving aborts the controller the revalidation is riding on.
    await router.push('/')
    release('TOO-LATE')
    await tick()
    expect(
      router._loaderData.get(record),
      'an aborted refresh must not overwrite anything',
    ).toBe('STALE')
  })
})

describe('SWR — a refresh that fails', () => {
  test('does not cancel or redirect the already-settled navigation', async () => {
    // The navigation committed on stale data and is done. A background failure
    // must not retroactively undo it.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { router } = swrRouter(() => Promise.reject(new Error('API down')))
    await router.push('/swr')
    await tick()
    expect(router.currentRoute().path, 'the settled navigation stands').toBe('/swr')
  })

  test('leaves the stale data in place rather than blanking it', async () => {
    // Stale data is still useful; clearing it turns a refresh failure into an
    // empty page.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { router, record } = swrRouter(() => Promise.reject(new Error('API down')))
    await router.push('/swr')
    await tick()
    expect(router._loaderData.get(record)).toBe('STALE')
  })

  test('REPORTS the failure instead of swallowing it', async () => {
    // The anti-pattern the source names by hand. A persistently-failing
    // revalidation with an empty catch produces zero signal while the
    // developer stares at data that never updates.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { router } = swrRouter(() => Promise.reject(new Error('API down')))
    await router.push('/swr')
    await tick()
    expect(warn, 'a silent background failure is the bug').toHaveBeenCalled()
    const msg = warn.mock.calls.map((c) => String(c[0])).join(' ')
    expect(msg, 'the report names the route').toContain('/swr')
    expect(msg, 'and says the data on screen is stale').toMatch(/stale/i)
  })
})
