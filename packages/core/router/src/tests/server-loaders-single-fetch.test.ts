/**
 * The Phase-5 single-fetch server-loader pipeline — both halves.
 *
 * `runServerLoaders` (server) runs the matched chain's `serverLoader`s and
 * keys the result; `fetchServerLoaderData` (client) fetches that payload in
 * ONE request and maps it back onto the chain. Neither had a single test, and
 * their own comments record two bugs that were found by review rather than by
 * a suite:
 *
 *   * finding C — path-keying collided a layout with its index page, so the
 *     page's data was silently overwritten by the layout's. The fix keys by
 *     MATCHED-CHAIN INDEX. Nothing checked that the two halves still agree on
 *     it, and they have to: the client maps `data[i]` back by position.
 *   * finding F — running isomorphic `loader`s on the server DOUBLE-FIRED
 *     their side effects, because they run client-side too.
 *
 * Everything here is a path where a bug is silent rather than loud: wrong
 * data on the right route, a stale response overwriting a newer one, a
 * redirect that never happens. The happy path was never the risk.
 */
import { createRouter } from '../router'
import { redirect } from '../redirect'
import type { LoaderContext, RouteRecord, RouterInstance } from '../types'

const Layout = () => null
const Page = () => null

/** A router whose data endpoint we control. */
function makeRouter(routes: RouteRecord[], url = '/', dataEndpoint?: string): RouterInstance {
  return createRouter({
    routes,
    url,
    ...(dataEndpoint ? { dataEndpoint } : {}),
  }) as RouterInstance
}

// ─── server half: runServerLoaders ───────────────────────────────────────────

describe('runServerLoaders — what the data endpoint runs', () => {
  test('runs serverLoaders and NOT isomorphic loaders (finding F: double-fire)', async () => {
    // An isomorphic `loader` runs on the client as well. Running it here too
    // fires its side effects twice — a POST sent twice, a counter double
    // incremented. The chain below has one of each.
    let isomorphicRuns = 0
    let serverRuns = 0
    const routes: RouteRecord[] = [
      {
        path: '/app',
        component: Layout,
        serverLoader: async () => {
          serverRuns++
          return 'from-server'
        },
        children: [
          {
            path: 'page',
            component: Page,
            loader: async () => {
              isomorphicRuns++
              return 'from-isomorphic'
            },
          },
        ],
      },
    ]
    const router = makeRouter(routes, '/app/page')
    const res = await router.runServerLoaders('/app/page')

    expect(serverRuns, 'the serverLoader must run').toBe(1)
    expect(isomorphicRuns, 'the isomorphic loader must NOT run on the server').toBe(0)
    expect(res.kind).toBe('data')
  })

  test('keys by chain INDEX so a layout cannot overwrite its index page (finding C)', async () => {
    // The reproduced bug: a layout at `/dash` and its index child both resolve
    // to path `/dash`, so a path-keyed record kept only one of them — and the
    // one it kept was the layout, silently blanking the page's data.
    const routes: RouteRecord[] = [
      {
        path: '/dash',
        component: Layout,
        serverLoader: async () => 'LAYOUT',
        children: [{ path: '', component: Page, serverLoader: async () => 'INDEX' }],
      },
    ]
    const router = makeRouter(routes, '/dash')
    const res = await router.runServerLoaders('/dash')

    expect(res.kind).toBe('data')
    const data = (res as { kind: 'data'; data: Record<number, unknown> }).data
    // Two DISTINCT entries — under path-keying this object had one.
    expect(Object.keys(data)).toHaveLength(2)
    expect(data[0]).toBe('LAYOUT')
    expect(data[1]).toBe('INDEX')
  })

  test('a SYNCHRONOUS redirect() throw is caught, not leaked', async () => {
    // `redirect()` throws. A synchronous throw inside the map callback escapes
    // Promise.all's rejection path unless it is wrapped — the wrap is why
    // `Promise.resolve().then(...)` is there.
    const routes: RouteRecord[] = [
      {
        path: '/private',
        component: Page,
        serverLoader: () => {
          redirect('/login', 302)
        },
      },
    ]
    const router = makeRouter(routes, '/private')
    const res = await router.runServerLoaders('/private')

    expect(res.kind).toBe('redirect')
    expect(res).toMatchObject({ to: '/login', status: 302 })
  })

  test('an ASYNCHRONOUS redirect() is caught the same way', async () => {
    const routes: RouteRecord[] = [
      {
        path: '/private',
        component: Page,
        serverLoader: async () => {
          await Promise.resolve()
          redirect('/login')
        },
      },
    ]
    const res = await makeRouter(routes, '/private').runServerLoaders('/private')
    expect(res).toMatchObject({ kind: 'redirect', to: '/login', status: 307 })
  })

  test('a NON-redirect error rethrows rather than being swallowed as a redirect', async () => {
    // The catch inspects the error; anything that is not a redirect must
    // surface, or a genuine server fault reads as a successful navigation.
    const routes: RouteRecord[] = [
      {
        path: '/boom',
        component: Page,
        serverLoader: () => {
          throw new Error('db is down')
        },
      },
    ]
    const router = makeRouter(routes, '/boom')
    await expect(router.runServerLoaders('/boom')).rejects.toThrow('db is down')
  })

  test('passes params, query and a signal to the loader, and the Request when given', async () => {
    let seen: Record<string, unknown> = {}
    const routes: RouteRecord[] = [
      {
        path: '/u/:id',
        component: Page,
        serverLoader: async (ctx: LoaderContext) => {
          seen = ctx as unknown as Record<string, unknown>
          return 'ok'
        },
      },
    ]
    const router = makeRouter(routes, '/u/7')
    const request = new Request('https://example.test/u/7?tab=posts')
    await router.runServerLoaders('/u/7?tab=posts', request)

    expect(seen.params).toEqual({ id: '7' })
    expect(seen.query).toMatchObject({ tab: 'posts' })
    expect(seen.signal).toBeInstanceOf(AbortSignal)
    expect(seen.request, 'the Request must be forwarded when supplied').toBe(request)
  })

  test('omits `request` entirely when none is supplied', async () => {
    // `exactOptionalPropertyTypes` — an explicit `request: undefined` is a
    // different shape from an absent key, and loaders branch on `in`.
    let seen: Record<string, unknown> = {}
    const routes: RouteRecord[] = [
      {
        path: '/x',
        component: Page,
        serverLoader: async (ctx: LoaderContext) => {
          seen = ctx as unknown as Record<string, unknown>
          return 1
        },
      },
    ]
    await makeRouter(routes, '/x').runServerLoaders('/x')
    expect('request' in seen).toBe(false)
  })
})

// ─── client half: fetchServerLoaderData ──────────────────────────────────────

/** Install a fetch stub; returns the calls it saw. */
function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response): {
  urls: string[]
  restore: () => void
} {
  const urls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = ((url: string, init: RequestInit) => {
    urls.push(String(url))
    return Promise.resolve(impl(String(url), init))
  }) as typeof fetch
  return { urls, restore: () => void (globalThis.fetch = original) }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('fetchServerLoaderData — the client half', () => {
  test('maps payload data back onto the chain BY INDEX', async () => {
    // The other side of finding C. The server keys by position; the client
    // must resolve the same path to the same chain and map back by position.
    const routes: RouteRecord[] = [
      {
        path: '/dash',
        component: Layout,
        hasServerLoader: true,
        children: [{ path: '', component: Page, hasServerLoader: true }],
      },
    ]
    const router = makeRouter(routes, '/')
    const f = stubFetch(() => json({ data: { 0: 'LAYOUT', 1: 'INDEX' } }))
    try {
      await router.push('/dash')
      const matched = router.currentRoute().matched
      expect(router._loaderData.get(matched[0]!)).toBe('LAYOUT')
      expect(router._loaderData.get(matched[1]!)).toBe('INDEX')
    } finally {
      f.restore()
    }
  })

  test('sends path, query and hash-free target to the endpoint, URL-encoded', async () => {
    const routes: RouteRecord[] = [{ path: '/search', component: Page, hasServerLoader: true }]
    const router = makeRouter(routes, '/')
    const f = stubFetch(() => json({ data: {} }))
    try {
      await router.push('/search?q=a%20b&tag=x%2Fy')
      expect(f.urls).toHaveLength(1)
      const sent = new URL(f.urls[0]!, 'https://h.test')
      const target = sent.searchParams.get('path')!
      // Round-trips through decode: the reserved characters must survive.
      expect(target).toContain('/search')
      expect(target).toContain('q=a%20b')
      expect(target).toContain('tag=x%2Fy')
    } finally {
      f.restore()
    }
  })

  test('a non-OK response THROWS naming the status rather than continuing blank', async () => {
    // Silently continuing would render the route with no data, which looks
    // like an empty result rather than a failed fetch.
    const routes: RouteRecord[] = [{ path: '/x', component: Page, hasServerLoader: true }]
    const router = makeRouter(routes, '/')
    const f = stubFetch(() => json({}, 503))
    try {
      await expect(router.push('/x')).rejects.toThrow(/HTTP 503/)
    } finally {
      f.restore()
    }
  })

  test('a payload redirect becomes a client navigation', async () => {
    const routes: RouteRecord[] = [
      { path: '/private', component: Page, hasServerLoader: true },
      { path: '/login', component: Page },
    ]
    const router = makeRouter(routes, '/')
    const f = stubFetch(() => json({ redirect: { to: '/login', status: 302 } }))
    try {
      await router.push('/private')
      expect(router.currentRoute().path).toBe('/login')
    } finally {
      f.restore()
    }
  })

  test('applies data ONLY to records flagged hasServerLoader', async () => {
    // A payload naming an index the client did not mark remote must not be
    // written: the endpoint and the client can disagree after a deploy, and
    // writing blind would put server data on an isomorphic route.
    const routes: RouteRecord[] = [
      {
        path: '/mix',
        component: Layout,
        children: [{ path: '', component: Page, hasServerLoader: true }],
      },
    ]
    const router = makeRouter(routes, '/')
    const f = stubFetch(() => json({ data: { 0: 'SHOULD-NOT-LAND', 1: 'ok' } }))
    try {
      await router.push('/mix')
      const matched = router.currentRoute().matched
      expect(router._loaderData.has(matched[0]!), 'unflagged record must stay empty').toBe(false)
      expect(router._loaderData.get(matched[1]!)).toBe('ok')
    } finally {
      f.restore()
    }
  })

  test('an absent `data` key is treated as empty, not as a crash', async () => {
    const routes: RouteRecord[] = [{ path: '/x', component: Page, hasServerLoader: true }]
    const router = makeRouter(routes, '/')
    const f = stubFetch(() => json({}))
    try {
      await expect(router.push('/x')).resolves.toBeDefined()
    } finally {
      f.restore()
    }
  })

  test('a SUPERSEDED navigation does not write its stale data', async () => {
    // The leak-class-F shape: a slow first fetch resolving after a newer
    // navigation has committed must not clobber it. Three generation checks
    // exist for this; without them the user sees the previous page's data.
    const routes: RouteRecord[] = [
      { path: '/slow', component: Page, hasServerLoader: true },
      { path: '/fast', component: Page, hasServerLoader: true },
    ]
    const router = makeRouter(routes, '/')
    let releaseSlow: (r: Response) => void = () => {}
    const f = stubFetch((url) => {
      if (url.includes('slow')) {
        return new Promise<Response>((res) => {
          releaseSlow = res
        })
      }
      return json({ data: { 0: 'FAST' } })
    })
    try {
      const slow = router.push('/slow')
      const fast = router.push('/fast')
      await fast
      // The newer navigation has committed; now let the old one land.
      releaseSlow(json({ data: { 0: 'STALE' } }))
      await slow

      expect(router.currentRoute().path, 'the newer navigation owns the URL').toBe('/fast')
      const matched = router.currentRoute().matched
      expect(
        router._loaderData.get(matched[0]!),
        'the stale response must not overwrite the committed one',
      ).toBe('FAST')
    } finally {
      f.restore()
    }
  })

  test('an aborted fetch cancels quietly instead of surfacing as a route error', async () => {
    // An abort is a navigation being superseded, not a fault — surfacing it
    // would flash the route error boundary on every fast double-click.
    const routes: RouteRecord[] = [{ path: '/x', component: Page, hasServerLoader: true }]
    const router = makeRouter(routes, '/')
    const f = stubFetch((_url, init) => {
      const signal = (init as { signal?: AbortSignal }).signal
      return new Promise<Response>((_res, rej) => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        if (signal?.aborted) rej(err)
        else signal?.addEventListener('abort', () => rej(err))
      })
    })
    try {
      const first = router.push('/x')
      // A second navigation aborts the first's controller.
      await router.push('/')
      await expect(first).resolves.toBeDefined()
    } finally {
      f.restore()
    }
  })
})
