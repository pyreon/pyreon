// @vitest-environment node
/**
 * Server-island fragments render only for a marker the server signed, and
 * the page that declared the island gates its fragment.
 *
 * Before: `GET /_pyreon/fragment/<name>?props=…` rendered any registered
 * island with caller-chosen props, and none of the declaring page's route
 * middleware ran — an island declared on a gated page answered anyone.
 * Now the page render signs each marker (name + page + props + expiry), the
 * endpoint verifies before decoding or rendering, and `routingPathname` gates
 * the request as the signed page. All through the real `createServer`.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'
import { _resetServerIslands, serverIsland } from '@pyreon/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from '../entry-server'
import {
  createIslandSigner,
  ISLAND_EXPIRES_HEADER,
  ISLAND_SECRET_ENV,
  islandSignaturesExpiring,
  prerenderServerIslandLocals,
} from '../server-island-token'
import type { RouteMiddlewareEntry } from '../types'

const SECRET = 's'.repeat(32)
const ORIGIN = 'http://localhost'
const req = (path: string, headers?: Record<string, string>) =>
  new Request(`${ORIGIN}${path}`, headers ? { headers } : undefined)

const adminGate: Middleware = (ctx) =>
  ctx.req.headers.get('x-admin') === 'yes' ? undefined : new Response('denied', { status: 401 })

interface Marker {
  name: string
  props: string
  page: string
  sig: string
}

const unescape = (v: string) =>
  v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

function markersOf(html: string): Marker[] {
  const out: Marker[] = []
  for (const m of html.matchAll(/<pyreon-server-island([^>]*)>/g)) {
    const attr = (n: string) => {
      const hit = new RegExp(`${n}="([^"]*)"`).exec(m[1]!)
      return hit ? unescape(hit[1]!) : ''
    }
    out.push({ name: attr('data-name'), props: attr('data-props'), page: attr('data-page'), sig: attr('data-sig') })
  }
  return out
}

function fragmentPath(m: Partial<Marker> & { name: string }): string {
  const q: string[] = []
  if (m.props) q.push(`props=${encodeURIComponent(m.props)}`)
  if (m.page !== undefined) q.push(`page=${encodeURIComponent(m.page)}`)
  if (m.sig !== undefined) q.push(`sig=${encodeURIComponent(m.sig)}`)
  return `/_pyreon/fragment/${encodeURIComponent(m.name)}${q.length ? `?${q.join('&')}` : ''}`
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetServerIslands()
})

function gatedApp(mode: 'ssr' | 'isr' = 'ssr', maxAge?: number) {
  const Revenue = serverIsland(
    async () => ((p: { account: string }) => h('b', null, `Revenue for ${p.account}`)) as ComponentFn,
    { name: 'AdminRevenue', cache: 'public, max-age=60' },
  )
  const Hello = serverIsland(async () => (() => h('i', null, 'hello')) as ComponentFn, { name: 'PublicHello' })
  const routes: RouteRecord[] = [
    { path: '/admin/report', component: () => h('div', null, h(Revenue as ComponentFn, { account: 'acme' })) },
    { path: '/public', component: () => h('div', null, h(Hello as ComponentFn, {})) },
  ]
  return createServer({
    routes,
    routeMiddleware: [{ pattern: '/admin/report', patterns: ['/admin/report', '/admin/*'], middleware: adminGate }] as RouteMiddlewareEntry[],
    config: mode === 'isr' ? { mode: 'isr', isr: { revalidate: 60 } } : { mode: 'ssr' },
    serverIslands: { secret: SECRET, ...(maxAge ? { maxAge } : {}) },
  })
}

async function adminMarker(handler: (r: Request) => Promise<Response>): Promise<Marker> {
  const page = await handler(req('/admin/report', { 'x-admin': 'yes' }))
  expect(page.status).toBe(200)
  const [marker] = markersOf(await page.text())
  expect(marker).toBeDefined()
  return marker!
}

describe('server-island fragments are signed and gated as their page', () => {
  it('the page render signs its marker; the signed fragment renders for an admitted request', async () => {
    const handler = gatedApp()
    const m = await adminMarker(handler)
    expect(m).toMatchObject({ name: 'AdminRevenue', page: '/admin/report' })
    expect(m.sig).toMatch(/^\d+\.[\w-]{43}$/)
    const res = await handler(req(fragmentPath(m), { 'x-admin': 'yes' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<b>Revenue for acme</b>')
    // Gated: never shared-cacheable, whatever the island's own `cache` says.
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it("the declaring page's route middleware refuses an unauthenticated fragment request", async () => {
    const handler = gatedApp()
    const m = await adminMarker(handler)
    const res = await handler(req(fragmentPath(m)))
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('denied')
  })

  it('missing signature → 403 (the unsigned, caller-chosen-props request)', async () => {
    const handler = gatedApp()
    const props = JSON.stringify({ account: 'competitor-co' })
    for (const path of [
      fragmentPath({ name: 'AdminRevenue', props }),
      fragmentPath({ name: 'AdminRevenue', props, page: '/admin/report' }),
      fragmentPath({ name: 'AdminRevenue', props, page: '/admin/report', sig: '' }),
    ]) {
      const res = await handler(req(path, { 'x-admin': 'yes' }))
      expect(res.status, path).toBe(403)
      expect(await res.text()).not.toContain('Revenue')
    }
  })

  it.each([
    ['props', (m: Marker) => ({ ...m, props: JSON.stringify({ account: 'competitor-co' }) })],
    ['page (an ungated page — the gate passes, the signature does not)', (m: Marker) => ({ ...m, page: '/public' })],
    ['name', (m: Marker) => ({ ...m, name: 'PublicHello' })],
    ['expiry', (m: Marker) => ({ ...m, sig: `${Number(m.sig.split('.')[0]) + 1000}.${m.sig.split('.')[1]}` })],
    ['MAC', (m: Marker) => ({ ...m, sig: `${m.sig.split('.')[0]}.${'A'.repeat(43)}` })],
  ])('tampered %s → 403, nothing renders', async (_label, tamper) => {
    const handler = gatedApp()
    const m = await adminMarker(handler)
    const res = await handler(req(fragmentPath(tamper(m)), { 'x-admin': 'yes' }))
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Forbidden')
  })

  it('an expired signature → 403', async () => {
    const handler = gatedApp('ssr', 60)
    const m = await adminMarker(handler)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 61_000)
    const res = await handler(req(fragmentPath(m), { 'x-admin': 'yes' }))
    expect(res.status).toBe(403)
  })

  it('a signature from another secret → 403', async () => {
    const handler = gatedApp()
    const m = await adminMarker(handler)
    const other = createIslandSigner({ secret: 'o'.repeat(32) })
    const sig = await other.sign(m.name, m.page, m.props, Date.now() + 60_000)
    const res = await handler(req(fragmentPath({ ...m, sig }), { 'x-admin': 'yes' }))
    expect(res.status).toBe(403)
  })
})

describe('ISR: a cached page keeps working fragments for its cached lifetime', () => {
  it('a HIT serves the cached signatures, and they verify', async () => {
    const handler = gatedApp('isr')
    const first = await handler(req('/public'))
    expect(first.headers.get('x-isr-cache')).toBe('MISS')
    const hit = await handler(req('/public'))
    expect(hit.headers.get('x-isr-cache')).toBe('HIT')
    expect(Number(hit.headers.get(ISLAND_EXPIRES_HEADER))).toBeGreaterThan(Date.now())
    const [m] = markersOf(await hit.text())
    expect(m).toMatchObject({ name: 'PublicHello', page: '/public' })
    const res = await handler(req(fragmentPath(m!)))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<i>hello</i>')
  })

  it('past half the signature lifetime the entry is re-rendered (fresh signatures), never served', async () => {
    const handler = gatedApp('isr', 3600)
    await handler(req('/public'))
    const [old] = markersOf(await (await handler(req('/public'))).text())
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 1801_000)
    const again = await handler(req('/public'))
    expect(again.headers.get('x-isr-cache')).toBe('MISS')
    const [fresh] = markersOf(await again.text())
    expect(fresh!.sig).not.toBe(old!.sig)
    expect((await handler(req(fragmentPath(fresh!)))).status).toBe(200)
  })

  it('islandSignaturesExpiring: half-life rule, absent header = never', () => {
    const stored = 1_000_000
    const headers = { [ISLAND_EXPIRES_HEADER]: String(stored + 100_000) }
    expect(islandSignaturesExpiring(headers, stored, stored + 49_000)).toBe(false)
    expect(islandSignaturesExpiring(headers, stored, stored + 51_000)).toBe(true)
    expect(islandSignaturesExpiring({}, stored, stored + 10 ** 12)).toBe(false)
  })
})

describe('prerendered pages', () => {
  it('sign without expiry with the shared secret, which the server verifies', async () => {
    vi.stubEnv(ISLAND_SECRET_ENV, SECRET)
    try {
      const locals = prerenderServerIslandLocals('/docs?x=1', '/app/')
      const mint = locals['pyreon:serverIslandMint'] as (n: string, p: string) => Promise<{ page: string; sig: string }>
      const signed = await mint('PublicHello', '')
      expect(signed.page).toBe('/app/docs')
      expect(signed.sig.startsWith('0.')).toBe(true)
      const signer = createIslandSigner()
      expect(await signer.verify('PublicHello', '/app/docs', '', signed.sig)).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('without a shared secret, markers stay unsigned and the build warns', async () => {
    vi.stubEnv(ISLAND_SECRET_ENV, '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const mint = prerenderServerIslandLocals('/docs')['pyreon:serverIslandMint'] as (n: string, p: string) => Promise<unknown>
      expect(await mint('PublicHello', '')).toBeNull()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(ISLAND_SECRET_ENV))
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
