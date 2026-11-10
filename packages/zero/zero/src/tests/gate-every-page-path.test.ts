/**
 * Route and app middleware gate EVERY path that serves a page or its data.
 *
 * Three shapes the 2026-11 security audit reproduced through `createServer`:
 *
 * 1. The single-fetch data endpoint's gate re-parsed `?path=` with
 *    `new URL()` (a leading `//` became a HOST), while the endpoint handed the
 *    raw string to the router (which ignores empty segments) — so the gate
 *    checked one page and the endpoint served another's serverLoader data.
 * 2. The ISR cache wrapped the page handler, middleware included, so a HIT
 *    answered without running any middleware: a page rendered for an admitted
 *    request was served to everyone.
 * 3. The OG image endpoint ran the page's loaders but was gated as
 *    `/_zero/og/...`, not as the page.
 */
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'
import { REMOTE_ADDRESS } from '@pyreon/server'
import { describe, expect, it, vi } from 'vitest'
import { createServer } from '../entry-server'
import { dataEndpointTarget } from '../data-endpoint-middleware'
import type { RouteMiddlewareEntry } from '../types'

vi.mock('../og-route-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../og-route-shared')>()),
  rasterizeOgSvg: vi.fn(async () => new TextEncoder().encode('PNG')),
}))

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init)

const adminGate: Middleware = (ctx) =>
  ctx.req.headers.get('x-admin') === 'yes' ? undefined : new Response('denied', { status: 401 })

describe('the data endpoint gates and serves ONE target', () => {
  const routes: RouteRecord[] = [
    {
      path: '/admin/report',
      component: () => h('p', null, 'r'),
      serverLoader: async () => ({ payroll: 'TOP-SECRET' }),
    } as RouteRecord,
    // A catch-all two-segment route: what `//admin/report` re-parsed as
    // `/report` would otherwise have been gated as (nothing).
    { path: '/:a/:b', component: () => h('p', null, 'x') },
  ]
  const handler = createServer({
    routes,
    routeMiddleware: [{ pattern: '/admin/report', middleware: adminGate }] as RouteMiddlewareEntry[],
    config: { mode: 'ssr' },
  })

  it.each([
    '/admin/report',
    '//admin/report',
    '///admin/report',
    '/\\admin/report',
    '/admin//report',
    '/admin/report/',
    '/./admin/report',
    '/x/../admin/report',
    '/admin/report#frag',
    '/admin/report?x=1',
    '//admin/report?x=1',
  ])('target %j never yields the gated loader data', async (target) => {
    const res = await handler(req(`/_pyreon/data?path=${encodeURIComponent(target)}`))
    expect([400, 401]).toContain(res.status)
    expect(await res.text()).not.toContain('TOP-SECRET')
  })

  it('an admitted request still gets the data, including through a doubled slash', async () => {
    for (const target of ['/admin/report', '//admin/report']) {
      const res = await handler(
        req(`/_pyreon/data?path=${encodeURIComponent(target)}`, { headers: { 'x-admin': 'yes' } }),
      )
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('TOP-SECRET')
    }
  })

  it('dataEndpointTarget is the one normaliser', () => {
    const t = (p: string) => dataEndpointTarget(new URL(`http://x/_pyreon/data?path=${encodeURIComponent(p)}`))
    expect(t('//admin//report/?q=1#h')).toBe('/admin/report/?q=1')
    expect(t('/')).toBe('/')
    expect(t('///')).toBe('/')
    expect(t('/a\\b')).toBeNull()
    expect(t('/a/../b')).toBeNull()
    expect(t('/a/\tb')).toBeNull()
    expect(t('admin')).toBeNull()
  })
})

describe('middleware runs before an ISR cache HIT', () => {
  const ipAllowlist = (calls: { n: number }): Middleware => (ctx) => {
    calls.n++
    ctx.headers.set('x-gate', String(ctx.locals.remoteAddress))
    if (ctx.locals.remoteAddress !== '10.0.0.5') return new Response('Forbidden', { status: 403 })
    ctx.locals.who = 'insider'
  }
  const from = (ip: string, path = '/internal', init?: RequestInit) => {
    const r = req(path, init)
    ;(r as unknown as Record<symbol, unknown>)[REMOTE_ADDRESS] = ip
    return r
  }
  const Internal = () => h('p', null, 'SALARY TABLE')

  it.each([
    ['the default key', {}],
    ['a cacheKey function', { cacheKey: (r: Request) => new URL(r.url).pathname }],
  ])('an outsider is refused after an insider filled the cache (%s)', async (_label, isrExtra) => {
    const calls = { n: 0 }
    const handler = createServer({
      routes: [{ path: '/internal', component: Internal }],
      middleware: [ipAllowlist(calls)],
      config: { mode: 'isr', isr: { revalidate: 60, ...isrExtra } },
    })
    const insider = await handler(from('10.0.0.5'))
    expect(insider.status).toBe(200)
    expect(await insider.text()).toContain('SALARY')
    // Middleware ran ONCE for the miss, not again inside the render.
    expect(calls.n).toBe(1)

    const outsider = await handler(from('203.0.113.9'))
    expect(outsider.status).toBe(403)
    expect(await outsider.text()).not.toContain('SALARY')

    // A second insider is a HIT — and the gate ran for it, with its own headers.
    const again = await handler(from('10.0.0.5'))
    expect(again.headers.get('x-isr-cache')).toBe('HIT')
    expect(again.headers.get('x-gate')).toBe('10.0.0.5')
    expect(calls.n).toBe(3)
  })

  it('route middleware gates a per-route ISR page inside an SSR app', async () => {
    const handler = createServer({
      routes: [
        { path: '/', component: Internal },
        { path: '/admin', component: Internal, meta: { renderMode: 'isr' } } as RouteRecord,
      ],
      routeMiddleware: [{ pattern: '/admin', middleware: adminGate }],
      config: { mode: 'ssr', isr: { revalidate: 60, cacheKey: (r: Request) => new URL(r.url).pathname } },
    })
    expect((await handler(req('/admin', { headers: { 'x-admin': 'yes' } }))).status).toBe(200)
    const hit = await handler(req('/admin', { headers: { 'x-admin': 'yes' } }))
    expect(hit.headers.get('x-isr-cache')).toBe('HIT')
    const denied = await handler(req('/admin'))
    expect(denied.status).toBe(401)
    expect(await denied.text()).not.toContain('SALARY')
  })

  it('a per-route SPA shell is served only after the middleware passes', async () => {
    const template =
      '<html><head><!--pyreon-head--></head><body><div id="app"><!--pyreon-app--></div><!--pyreon-scripts--></body></html>'
    const handler = createServer({
      routes: [
        { path: '/', component: Internal },
        { path: '/dash', component: Internal, meta: { renderMode: 'spa' } } as RouteRecord,
      ],
      routeMiddleware: [{ pattern: '/dash', middleware: adminGate }],
      config: { mode: 'ssr' },
      template,
      clientEntry: false,
    })
    expect((await handler(req('/dash'))).status).toBe(401)
    const shell = await handler(req('/dash', { headers: { 'x-admin': 'yes' } }))
    expect(shell.status).toBe(200)
    expect(await shell.text()).toContain('<div id="app"></div>')
  })

  it('a background revalidation re-renders as the original requester (address included)', async () => {
    const calls = { n: 0 }
    let renders = 0
    const Counting = () => {
      renders++
      return h('p', null, `SALARY ${renders}`)
    }
    const handler = createServer({
      routes: [{ path: '/internal', component: Counting }],
      middleware: [ipAllowlist(calls)],
      config: { mode: 'isr', isr: { revalidate: 0.001 } },
    })
    await handler(from('10.0.0.5'))
    await new Promise((r) => setTimeout(r, 10))
    const stale = await handler(from('10.0.0.5'))
    expect(stale.headers.get('x-isr-cache')).toBe('STALE')
    await vi.waitFor(() => expect(renders).toBe(2))
    // Settle the revalidation's store write, then read the refreshed entry.
    await new Promise((r) => setTimeout(r, 10))
    const fresh = await handler(from('10.0.0.5'))
    expect(await fresh.text()).toContain('SALARY 2')
  })
})

describe('the OG endpoint is gated as its page', () => {
  const loader = vi.fn(async () => ({ title: 'Q3 layoffs' }))
  const card = ({ data }: { data?: { title: string } }) =>
    h('svg', { width: 10, height: 10 }, h('text', null, data?.title ?? ''))
  const routes: RouteRecord[] = [
    {
      path: '/admin/report',
      component: () => h('p', null, 'r'),
      loader,
      og: async () => card,
    } as unknown as RouteRecord,
    { path: '/public', component: () => h('p', null, 'p'), og: async () => card } as unknown as RouteRecord,
  ]
  const handler = createServer({
    routes,
    routeMiddleware: [{ pattern: '/admin/report', middleware: adminGate }],
    config: { mode: 'ssr' },
  })

  it('refuses the image (and never runs the loader) without the page access', async () => {
    loader.mockClear()
    const res = await handler(req('/_zero/og/admin/report.png'))
    expect(res.status).toBe(401)
    expect(loader).not.toHaveBeenCalled()
  })

  it('an admitted image is private; a public page image stays CDN-cacheable', async () => {
    const admitted = await handler(req('/_zero/og/admin/report.png', { headers: { 'x-admin': 'yes' } }))
    expect(admitted.status).toBe(200)
    expect(admitted.headers.get('cache-control')).toBe('private, no-store')
    const pub = await handler(req('/_zero/og/public.png'))
    expect(pub.status).toBe(200)
    expect(pub.headers.get('cache-control')).toContain('public')
  })
})
