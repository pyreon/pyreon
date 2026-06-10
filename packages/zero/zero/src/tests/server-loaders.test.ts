// @vitest-environment node
/**
 * Phase 5 — server loaders. Three contracts:
 *
 *  1. fs-router: `.server.{ts,js}` siblings are DETECTED (and excluded
 *     from route scanning), the generator emits the dual shape (function
 *     import for SSR builds, serializable marker for client builds), and
 *     loader+serverLoader on one route is a BUILD ERROR naming the fix.
 *  2. The `/_pyreon/data` endpoint: runs the chain's serverLoaders with
 *     the real request, returns `{ data }` keyed by record path with
 *     no-store; redirect throws → `{ redirect }` envelope; loader throws
 *     → 500 JSON.
 *  3. The router's client-side single-fetch: records with only the
 *     `hasServerLoader` marker get their data from ONE endpoint fetch per
 *     navigation; redirect envelopes navigate.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { MiddlewareContext } from '@pyreon/server'
import type { RouteRecord } from '@pyreon/router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDataEndpointMiddleware } from '../data-endpoint-middleware'
import {
  generateRouteModuleFromRoutes,
  scanRouteFilesWithExports,
} from '../fs-router'

const C: ComponentFn = () => h('div', null, 'x')

// ─── 1. fs-router scanning + emission ────────────────────────────────────────

describe('fs-router — .server.ts siblings', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function routesDir(files: Record<string, string>): string {
    dir = mkdtempSync(join(tmpdir(), 'pyreon-sl-'))
    for (const [rel, content] of Object.entries(files)) {
      const full = join(dir, rel)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, content)
    }
    return dir
  }

  it('detects the sibling, excludes it from routes, and emits the dual shape', async () => {
    const rd = routesDir({
      'dash.tsx': 'export default function D() { return null }\n',
      'dash.server.ts': 'export async function serverLoader() { return { secret: 1 } }\n',
    })
    const routes = await scanRouteFilesWithExports(rd)
    // The sibling is NOT a route.
    expect(routes.map((r) => r.urlPath)).toEqual(['/dash'])
    expect(routes[0]?.exports?.serverLoaderFile).toBe('dash.server.ts')

    // SSR build: real function import. Client build: marker only.
    const ssr = generateRouteModuleFromRoutes(routes, rd, { serverLoaders: true })
    expect(ssr).toContain('hasServerLoader: true')
    expect(ssr).toContain('.serverLoader')
    expect(ssr).toContain('dash.server.ts')

    const client = generateRouteModuleFromRoutes(routes, rd, { serverLoaders: false })
    expect(client).toContain('hasServerLoader: true')
    expect(client).not.toContain('.serverLoader')
    expect(client).not.toContain('dash.server.ts') // structurally unreachable
  })

  it('loader export + server-loader sibling on one route is a BUILD ERROR', async () => {
    const rd = routesDir({
      'both.tsx':
        'export default function B() { return null }\nexport async function loader() { return 1 }\n',
      'both.server.ts': 'export async function serverLoader() { return 2 }\n',
    })
    await expect(scanRouteFilesWithExports(rd)).rejects.toThrow(
      /\[Pyreon\].*loader.*AND.*server-loader sibling/s,
    )
  })
})

// ─── 2. the data endpoint ────────────────────────────────────────────────────

function ctxFor(url: string, method = 'GET'): MiddlewareContext {
  const req = new Request(url, { method, headers: { cookie: 'session=tok123' } })
  const u = new URL(url)
  return { req, url: u, path: u.pathname + u.search, headers: new Headers(), locals: {} }
}

describe('/_pyreon/data endpoint', () => {
  it('runs serverLoaders with the REQUEST and returns { data } keyed by record path', async () => {
    const routes: RouteRecord[] = [
      {
        path: '/dash',
        component: C,
        serverLoader: async (ctx) => ({
          // The endpoint must forward the request — cookies flow.
          session: ctx.request?.headers.get('cookie') ?? 'none',
        }),
        hasServerLoader: true,
      } as RouteRecord,
    ]
    const mw = createDataEndpointMiddleware(routes)
    const res = (await mw(ctxFor('http://x/_pyreon/data?path=%2Fdash'))) as Response
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as { data: Record<string, { session: string }> }
    expect(body.data['/dash']?.session).toBe('session=tok123')
  })

  it('redirect() from a server loader → { redirect } envelope at HTTP 200', async () => {
    const { redirect } = await import('@pyreon/router')
    const routes: RouteRecord[] = [
      {
        path: '/admin',
        component: C,
        serverLoader: async () => {
          redirect('/login', 302)
        },
        hasServerLoader: true,
      } as RouteRecord,
    ]
    const mw = createDataEndpointMiddleware(routes)
    const res = (await mw(ctxFor('http://x/_pyreon/data?path=%2Fadmin'))) as Response
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ redirect: { to: '/login', status: 302 } })
  })

  it('loader throws → 500 JSON; bad path → 400; non-GET → 405; other paths fall through', async () => {
    const routes: RouteRecord[] = [
      {
        path: '/boom',
        component: C,
        serverLoader: async () => {
          throw new Error('db down')
        },
        hasServerLoader: true,
      } as RouteRecord,
    ]
    const mw = createDataEndpointMiddleware(routes)
    expect(((await mw(ctxFor('http://x/_pyreon/data?path=%2Fboom'))) as Response).status).toBe(500)
    expect(((await mw(ctxFor('http://x/_pyreon/data?path=relative'))) as Response).status).toBe(400)
    expect(((await mw(ctxFor('http://x/_pyreon/data?path=%2Fboom', 'POST'))) as Response).status).toBe(405)
    expect(await mw(ctxFor('http://x/other'))).toBeUndefined()
  })
})

// ─── 3. router client-side single-fetch ──────────────────────────────────────

describe('router — client single-fetch for hasServerLoader records', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ONE fetch per navigation; data lands per record; component reads it', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url))
        return new Response(JSON.stringify({ data: { '/dash': { n: 42 } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )
    const { createRouter } = await import('@pyreon/router')
    const routes: RouteRecord[] = [
      { path: '/', component: C } as RouteRecord,
      { path: '/dash', component: C, hasServerLoader: true } as RouteRecord,
    ]
    const router = createRouter({ routes, mode: 'history', url: '/' })
    await router.push('/dash')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/_pyreon/data?path=%2Fdash')
    const rec = routes[1] as RouteRecord
    expect((router as unknown as { _loaderData: Map<RouteRecord, unknown> })._loaderData.get(rec)).toEqual({ n: 42 })
  })

  it('a { redirect } envelope becomes a client-side navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ redirect: { to: '/login', status: 302 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })),
    )
    const { createRouter } = await import('@pyreon/router')
    const routes: RouteRecord[] = [
      { path: '/', component: C } as RouteRecord,
      { path: '/admin', component: C, hasServerLoader: true } as RouteRecord,
      { path: '/login', component: C } as RouteRecord,
    ]
    const router = createRouter({ routes, mode: 'history', url: '/' })
    await router.push('/admin')
    expect(router.currentRoute().path).toBe('/login')
  })
})
