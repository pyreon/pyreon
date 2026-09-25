/**
 * The production request pipeline, end to end through `createServer`.
 *
 * Every spec here is a shape the 2026-09 audit reproduced against a real
 * built app: route middleware (zero's documented auth hook) was bypassed by a
 * query string and by the single-fetch data endpoint; app-wide middleware ran
 * AFTER API routes, actions and the data endpoint; ISR cached API JSON; and
 * `zero({...})` config never reached the generated server entry.
 */
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiRouteEntry } from '../api-routes'
import { createServer, mergeServerConfig, routingPathname } from '../entry-server'
import type { RouteMiddlewareEntry } from '../types'

const Page = () => h('p', null, 'page')

const requireAuth: Middleware = (ctx) => {
  if (ctx.req.headers.get('authorization') !== 'ok') {
    return new Response('Unauthorized', { status: 401 })
  }
}

function routes(): RouteRecord[] {
  return [
    { path: '/', component: Page },
    {
      path: '/admin',
      component: Page,
      serverLoader: async () => ({ secret: 'TOP-SECRET' }),
    } as RouteRecord,
  ]
}

const adminMiddleware: RouteMiddlewareEntry[] = [{ pattern: '/admin', middleware: requireAuth }]

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init)

describe('route middleware cannot be bypassed', () => {
  const handler = createServer({ routes: routes(), routeMiddleware: adminMiddleware })

  it.each([
    ['the page', '/admin'],
    ['the page with a query string', '/admin?x=1'],
    ['the data endpoint for the page', '/_pyreon/data?path=/admin'],
    ['the data endpoint with a query in the target', `/_pyreon/data?path=${encodeURIComponent('/admin?x=1')}`],
  ])('%s is gated (%s)', async (_label, path) => {
    const res = await handler(req(path))
    expect(res.status).toBe(401)
    expect(await res.text()).not.toContain('TOP-SECRET')
  })

  it('an authorized request still gets the data', async () => {
    const res = await handler(req('/_pyreon/data?path=/admin', { headers: { authorization: 'ok' } }))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('TOP-SECRET')
  })

  it('is gated under a base path and under an i18n locale prefix', async () => {
    const based = createServer({
      routes: routes(),
      routeMiddleware: adminMiddleware,
      config: { base: '/app/' },
    })
    expect((await based(req('/app/admin'))).status).toBe(401)

    const localized = createServer({
      routes: routes(),
      routeMiddleware: adminMiddleware,
      config: { i18n: { locales: ['en', 'de'], defaultLocale: 'en' } },
    })
    expect((await localized(req('/de/admin'))).status).toBe(401)
  })
})

describe('layout middleware (one entry, many patterns)', () => {
  it('runs once for a request matching several of its patterns', async () => {
    let runs = 0
    const counting: Middleware = () => {
      runs++
    }
    const handler = createServer({
      routes: [
        { path: '/users/new', component: Page },
        { path: '/users/:id', component: Page },
      ],
      routeMiddleware: [
        { pattern: '/users/new', patterns: ['/users/new', '/users/:id'], middleware: counting },
      ],
    })
    await handler(req('/users/new'))
    expect(runs).toBe(1)
    await handler(req('/users/7'))
    expect(runs).toBe(2)
  })
})

describe('app-wide middleware runs before every framework endpoint', () => {
  const api: ApiRouteEntry[] = [
    { pattern: '/api/users', module: { GET: () => Response.json([{ email: 'a@b.c' }]) } },
  ]
  const handler = createServer({ routes: routes(), apiRoutes: api, middleware: [requireAuth] })

  it.each([
    ['an API route', '/api/users', 'GET'],
    ['the data endpoint', '/_pyreon/data?path=/', 'GET'],
    ['a server action', '/_zero/actions/anything', 'POST'],
    ['an island fragment', '/_pyreon/fragment/x', 'GET'],
  ])('%s', async (_label, path, method) => {
    const res = await handler(req(path, { method }))
    expect(res.status).toBe(401)
  })
})

describe('API routes', () => {
  it('match with a query string, and parameters exclude it', async () => {
    const seen: Record<string, string>[] = []
    const api: ApiRouteEntry[] = [
      { pattern: '/api/posts', module: { GET: () => Response.json('list') } },
      {
        pattern: '/api/posts/:id',
        module: {
          GET: (ctx) => {
            seen.push(ctx.params)
            return Response.json(ctx.params.id)
          },
        },
      },
    ]
    const handler = createServer({ routes: routes(), apiRoutes: api })
    expect(await (await handler(req('/api/posts?page=2'))).json()).toBe('list')
    expect(await (await handler(req('/api/posts/42?x=1'))).json()).toBe('42')
    expect(seen[0]).toEqual({ id: '42' })
  })

  it('HEAD is served by the GET handler instead of a 405', async () => {
    const api: ApiRouteEntry[] = [{ pattern: '/api/h', module: { GET: () => new Response('ok') } }]
    const handler = createServer({ routes: routes(), apiRoutes: api })
    expect((await handler(req('/api/h', { method: 'HEAD' }))).status).toBe(200)
  })

  it('are never ISR-cached, and keep their content type', async () => {
    let n = 0
    const api: ApiRouteEntry[] = [
      { pattern: '/api/counter', module: { GET: () => Response.json({ n: ++n }) } },
    ]
    const handler = createServer({
      routes: routes(),
      apiRoutes: api,
      config: { mode: 'isr', isr: { revalidate: 60 } },
    })
    const a = await handler(req('/api/counter'))
    const b = await handler(req('/api/counter'))
    expect(a.headers.get('content-type')).toContain('application/json')
    expect(b.headers.get('x-isr-cache')).toBeNull()
    expect(await b.json()).toEqual({ n: 2 })
    // Pages are still cached.
    await handler(req('/'))
    expect((await handler(req('/'))).headers.get('x-isr-cache')).toBe('HIT')
  })
})

describe('a throwing middleware costs one request, not the process', () => {
  it('returns a 500 and keeps serving', async () => {
    const boom: Middleware = (ctx) => {
      if (ctx.url.pathname === '/boom') throw new Error('exploded')
    }
    const handler = createServer({ routes: routes(), middleware: [boom] })
    expect((await handler(req('/boom'))).status).toBe(500)
    expect((await handler(req('/'))).status).toBe(200)
  })
})

describe('zero() config reaches the production server', () => {
  const g = globalThis as { __ZERO_SERVER_CONFIG__?: unknown }
  afterEach(() => {
    delete g.__ZERO_SERVER_CONFIG__
  })

  it('the build-injected config applies when the entry passes none', async () => {
    g.__ZERO_SERVER_CONFIG__ = { mode: 'isr', isr: { revalidate: 60 } }
    const handler = createServer({ routes: routes() })
    await handler(req('/'))
    expect((await handler(req('/'))).headers.get('x-isr-cache')).toBe('HIT')
  })

  it("the entry's own config wins key by key", () => {
    expect(
      mergeServerConfig(
        { mode: 'isr', isr: { revalidate: 60 }, base: '/a/' },
        { mode: 'ssr', isr: { revalidate: 5 } },
      ),
    ).toEqual({ mode: 'ssr', isr: { revalidate: 5 }, base: '/a/' })
  })
})

describe('per-route render modes under a base path', () => {
  it('a spa route is served its shell at the base-prefixed URL', async () => {
    const template =
      '<html><head><!--pyreon-head--></head><body><div id="app"><!--pyreon-app--></div><!--pyreon-scripts--></body></html>'
    const handler = createServer({
      routes: [
        { path: '/', component: Page },
        { path: '/dash', component: Page, meta: { renderMode: 'spa' } } as RouteRecord,
      ],
      config: { mode: 'ssr', base: '/app/' },
      template,
      clientEntry: false,
    })
    const html = await (await handler(req('/app/dash'))).text()
    expect(html).toContain('<div id="app"></div>')
  })
})

describe('routingPathname', () => {
  it('uses the pathname, the data-endpoint target, and strips base and locale', () => {
    const cfg = { base: '/app/', i18n: { locales: ['en', 'de'], defaultLocale: 'en' } }
    expect(routingPathname(new URL('http://x/app/de/admin?y=1'), cfg)).toBe('/admin')
    expect(
      routingPathname(new URL(`http://x/_pyreon/data?path=${encodeURIComponent('/admin?y=1')}`), {}),
    ).toBe('/admin')
    expect(routingPathname(new URL('http://x/app'), cfg)).toBe('/')
  })
})

describe('under a base path, the framework endpoints live under it too', () => {
  const api: ApiRouteEntry[] = [
    { pattern: '/api/ping', module: { GET: () => Response.json({ pong: true }) } },
  ]
  const based = () =>
    createServer({ routes: routes(), routeMiddleware: adminMiddleware, apiRoutes: api, config: { base: '/app/' } })

  it('the base-prefixed data endpoint still runs the TARGET page middleware', async () => {
    // The data-endpoint check ran before the base strip, so `/app/_pyreon/data`
    // was matched as a plain path and the target's middleware never ran.
    const res = await based()(req('/app/_pyreon/data?path=/admin'))
    expect(res.status).toBe(401)
    expect(await res.text()).not.toContain('TOP-SECRET')
    expect(routingPathname(new URL('http://x/app/_pyreon/data?path=/admin'), { base: '/app/' })).toBe('/admin')
  })

  it('serves the data endpoint and API routes at their base-prefixed URLs', async () => {
    const data = await based()(req('/app/_pyreon/data?path=/admin', { headers: { authorization: 'ok' } }))
    expect(data.status).toBe(200)
    expect(await data.text()).toContain('TOP-SECRET')
    const ping = await based()(req('/app/api/ping'))
    expect(ping.status).toBe(200)
    expect(await ping.json()).toEqual({ pong: true })
  })

  it('renders pages at their base-prefixed URLs', async () => {
    const res = await based()(req('/app/'))
    expect(res.status).toBe(200)
  })
})
