/**
 * The REQUEST-time half of per-route OG images: the `/_zero/og/*.png`
 * endpoint and the `<meta property="og:image">` injection into SSR HTML.
 * The rasterizer (sharp, an optional peer) is stubbed — what is under test
 * is routing, status codes, headers and the streaming head injection.
 */
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import type { MiddlewareContext } from '@pyreon/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../og-route-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../og-route-shared')>()),
  rasterizeOgSvg: vi.fn(async (svg: string) => new TextEncoder().encode(`PNG:${svg.length}`)),
}))

const { createOgImageMiddleware, renderRouteOgSvg, routeHasOg, withRouteOgMeta } = await import('../og-route')

const Page = () => h('p', null, 'x')
const card = ({ params }: { params: { id: string } }) => h('svg', { width: 10, height: 10 }, h('text', null, params.id))
const routes: RouteRecord[] = [
  { path: '/posts/:id', component: Page, og: async () => card } as unknown as RouteRecord,
  { path: '/plain', component: Page } as RouteRecord,
]

const ctx = (url: string, method = 'GET') =>
  ({ req: new Request(url, { method }), url: new URL(url), locals: {}, headers: new Headers() }) as unknown as MiddlewareContext

describe('routeHasOg / renderRouteOgSvg', () => {
  it('only a matched leaf with an og export has one', () => {
    expect(routeHasOg(routes, '/posts/1')).toBe(true)
    expect(routeHasOg(routes, '/plain')).toBe(false)
    expect(routeHasOg(routes, '/nope')).toBe(false)
  })

  it('renders the leaf og component for a path, null when there is none', async () => {
    expect(await renderRouteOgSvg(routes, '/posts/42')).toContain('42')
    expect(await renderRouteOgSvg(routes, '/plain')).toBeNull()
  })

  it('keeps an xmlns the author already wrote', async () => {
    const own = () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 1, height: 1 })
    const svg = await renderRouteOgSvg([{ path: '/x', component: Page, og: async () => own } as unknown as RouteRecord], '/x')
    expect(svg!.match(/xmlns=/g)).toHaveLength(1)
  })
})

describe('createOgImageMiddleware', () => {
  const mw = createOgImageMiddleware(routes, { revalidate: 60 })

  it('ignores URLs outside the og endpoint', async () => {
    expect(await mw(ctx('http://h/posts/1'))).toBeUndefined()
  })

  it('answers 405 for a non-GET/HEAD method', async () => {
    const res = (await mw(ctx('http://h/_zero/og/posts/1.png', 'POST'))) as Response
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, HEAD')
  })

  it('answers 404 for a page without an og export', async () => {
    const res = (await mw(ctx('http://h/_zero/og/plain.png'))) as Response
    expect(res.status).toBe(404)
  })

  it('serves the PNG with CDN revalidation headers; HEAD has no body', async () => {
    const res = (await mw(ctx('http://h/_zero/og/posts/1.png'))) as Response
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=60')
    expect(await res.text()).toMatch(/^PNG:\d+$/)
    const head = (await mw(ctx('http://h/_zero/og/posts/1.png', 'HEAD'))) as Response
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })
})

describe('withRouteOgMeta', () => {
  function chunked(parts: string[], type = 'text/html; charset=utf-8'): Response {
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(enc.encode(p))
        c.close()
      },
    })
    return new Response(body, { status: 200, headers: { 'Content-Type': type, 'Content-Length': '999' } })
  }

  it('injects the og meta into <head>, even when </head> spans chunks', async () => {
    const handler = withRouteOgMeta(async () => chunked(['<html><head><title>x</ti', 'tle></he', 'ad><body>b', '</body></html>']), routes)
    const res = await handler(new Request('http://site.test/posts/9'))
    const html = await res.text()
    expect(html).toContain('<meta property="og:image" content="http://site.test/_zero/og/posts/9.png">')
    expect(html.indexOf('og:image')).toBeLessThan(html.indexOf('</head>'))
    expect(html.endsWith('<body>b</body></html>')).toBe(true)
    expect(res.headers.get('content-length')).toBeNull()
  })

  it('passes through non-HTML, routes without og, and a document without </head>', async () => {
    const json = withRouteOgMeta(async () => Response.json({ a: 1 }), routes)
    expect(await (await json(new Request('http://s/posts/1'))).json()).toEqual({ a: 1 })

    const plain = withRouteOgMeta(async () => chunked(['<head></head>']), routes)
    expect(await (await plain(new Request('http://s/plain'))).text()).toBe('<head></head>')

    const headless = withRouteOgMeta(async () => chunked(['<p>no head', '</p>']), routes)
    expect(await (await headless(new Request('http://s/posts/1'))).text()).toBe('<p>no head</p>')
  })
})
