// @vitest-environment node
/**
 * Phase 5 — server loaders. Three contracts:
 *
 *  1. fs-router: `.server.{ts,js}` siblings are DETECTED (and excluded
 *     from route scanning), the generator emits the dual shape (function
 *     import for SSR builds, serializable marker for client builds), and
 *     loader+serverLoader on one route is a BUILD ERROR naming the fix.
 *  2. The `/_pyreon/data` endpoint: runs the chain's serverLoaders with
 *     the real request, returns `{ data }` keyed by MATCHED-CHAIN INDEX
 *     with no-store; redirect throws → `{ redirect }` envelope; loader throws
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

  it('B-REGRESSION: a `.server.tsx` sibling is EXCLUDED from routes (not shipped to client)', async () => {
    // Pre-fix the exclusion regex matched only `.server.[jt]s$`, so a
    // `.server.tsx`/`.jsx` sibling became a real client route — silently
    // violating the "never reaches the client bundle" guarantee.
    const rd = routesDir({
      'admin.tsx': 'export default function A() { return null }\n',
      'admin.server.tsx': 'export async function serverLoader() { return { x: 1 } }\n',
    })
    const routes = await scanRouteFilesWithExports(rd)
    // The .server.tsx must NOT be a route, AND must be picked up as the sibling.
    expect(routes.map((r) => r.urlPath)).toEqual(['/admin'])
    expect(routes[0]?.exports?.serverLoaderFile).toBe('admin.server.tsx')
    // A normal route that merely CONTAINS '.server.' mid-name stays a route.
    const rd2 = routesDir({
      'users.server.handler.tsx': 'export default function U() { return null }\n',
    })
    const routes2 = await scanRouteFilesWithExports(rd2)
    expect(routes2.map((r) => r.urlPath)).toContain('/users.server.handler')
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
  it('runs serverLoaders with the REQUEST and returns { data } keyed by MATCHED INDEX', async () => {
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
    // Matched-chain index keying (review fix C): the only matched record is
    // at index 0. (Pre-fix this was keyed by record.path, which collided for
    // layout+index-at-same-path chains.)
    expect(body.data['0']?.session).toBe('session=tok123')
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

  it('C-REGRESSION: layout loader + page serverLoader at SAME path do NOT collide', async () => {
    // The canonical auth-layout + server-data-page pattern. Pre-fix both
    // records keyed by path '/dash' collided and the page data was lost
    // (timing-dependent). Index-keying makes the page serverLoader land at
    // its own index, and the isomorphic layout loader does NOT run here.
    const routes: RouteRecord[] = [
      {
        path: '/dash',
        component: C,
        // SLOW isomorphic layout loader — pre-fix would overwrite the page.
        loader: async () => {
          await new Promise((r) => setTimeout(r, 20))
          return { who: 'LAYOUT-AUTH' }
        },
        children: [
          {
            path: '/dash',
            component: C,
            serverLoader: async () => ({ who: 'PAGE-DATA' }),
            hasServerLoader: true,
          } as RouteRecord,
        ],
      } as RouteRecord,
    ]
    const mw = createDataEndpointMiddleware(routes)
    const res = (await mw(ctxFor('http://x/_pyreon/data?path=%2Fdash'))) as Response
    const body = (await res.json()) as { data: Record<string, { who: string }> }
    // The page's serverLoader data survives at its matched index (1).
    expect(body.data['1']).toEqual({ who: 'PAGE-DATA' })
    // F: the isomorphic layout loader did NOT run on the endpoint (no
    // double-fire — it runs client-side).
    expect(JSON.stringify(body.data)).not.toContain('LAYOUT-AUTH')
  })

  it('F-REGRESSION: the endpoint runs ONLY serverLoaders, never isomorphic loaders', async () => {
    let isoRan = 0
    const routes: RouteRecord[] = [
      {
        path: '/x',
        component: C,
        loader: async () => {
          isoRan++
          return { iso: true }
        },
        children: [
          {
            path: '/x',
            component: C,
            serverLoader: async () => ({ server: true }),
            hasServerLoader: true,
          } as RouteRecord,
        ],
      } as RouteRecord,
    ]
    const mw = createDataEndpointMiddleware(routes)
    await mw(ctxFor('http://x/_pyreon/data?path=%2Fx'))
    expect(isoRan).toBe(0) // isomorphic loader never fired on the endpoint
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
        // Index-keyed payload: /dash is the leaf at matched index 1 (root '/'
        // is index 0). The client maps data[index] -> its remote record.
        return new Response(JSON.stringify({ data: { '1': { n: 42 } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )
    const { createRouter } = await import('@pyreon/router')
    // Layout '/' (index 0) wrapping '/dash' (index 1) — the canonical chain
    // where index-keying matters.
    const dashPage = { path: '/dash', component: C, hasServerLoader: true } as RouteRecord
    const routes: RouteRecord[] = [
      { path: '/', component: C, children: [dashPage] } as RouteRecord,
    ]
    const router = createRouter({ routes, mode: 'history', url: '/' })
    await router.push('/dash')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/_pyreon/data?path=%2Fdash')
    expect((router as unknown as { _loaderData: Map<RouteRecord, unknown> })._loaderData.get(dashPage)).toEqual({ n: 42 })
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
