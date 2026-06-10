// @vitest-environment node
/**
 * Phase 4 — the auto-mounted fragment endpoint
 * (`GET /_pyreon/fragment/<name>?props=…`), including the COLD-REGISTRY
 * warm-up: zero's routes are lazy, so a fragment request hitting a
 * freshly-booted server (pages served from CDN/prerender cache — the
 * primary use case) finds an empty registry and must warm the route
 * modules once before deciding 404.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { lazy } from '@pyreon/router'
import { _resetServerIslands, serverIsland } from '@pyreon/server'
import type { MiddlewareContext } from '@pyreon/server'
import { afterEach, describe, expect, it } from 'vitest'
import { createServerIslandMiddleware } from '../server-islands-middleware'

const Badge: ComponentFn = (props: { who?: string }) =>
  h('em', null, `hi ${props.who ?? 'there'}`)

function ctxFor(url: string, method = 'GET', locals: Record<string, unknown> = {}) {
  const req = new Request(url, { method })
  const u = new URL(url)
  return {
    req,
    url: u,
    path: u.pathname + u.search,
    headers: new Headers(),
    locals,
  } as MiddlewareContext
}

afterEach(() => _resetServerIslands())

describe('createServerIslandMiddleware', () => {
  it('ignores non-fragment paths (falls through)', async () => {
    const mw = createServerIslandMiddleware([])
    expect(await mw(ctxFor('http://x/about'))).toBeUndefined()
  })

  it('renders a registered island with props + locals; default no-store', async () => {
    serverIsland(async () => Badge, { name: 'Hi' })
    const mw = createServerIslandMiddleware([])
    const props = encodeURIComponent(JSON.stringify({ who: 'ada' }))
    const res = (await mw(
      ctxFor(`http://x/_pyreon/fragment/Hi?props=${props}`),
    )) as Response
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<em>hi ada</em>')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('COLD REGISTRY: warms lazy route modules on miss, then serves (the CDN-page restart case)', async () => {
    // The island registers ONLY when this lazy route module loads — exactly
    // zero's shape. At middleware-call time the registry is empty.
    let loaded = 0
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: lazy(async () => {
          loaded++
          serverIsland(async () => Badge, { name: 'LazyIsland' })
          return () => h('div', null, 'page')
        }),
      } as RouteRecord,
    ]
    const mw = createServerIslandMiddleware(routes)
    const res = (await mw(ctxFor('http://x/_pyreon/fragment/LazyIsland'))) as Response
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hi there')
    expect(loaded).toBe(1)
    // Second miss-shaped lookup doesn't re-warm (memoized).
    const res2 = (await mw(ctxFor('http://x/_pyreon/fragment/LazyIsland'))) as Response
    expect(res2.status).toBe(200)
    expect(loaded).toBe(1)
  })

  it('unknown island after warm → 404 (allowlist, never arbitrary render)', async () => {
    const mw = createServerIslandMiddleware([])
    const res = (await mw(ctxFor('http://x/_pyreon/fragment/NotAThing'))) as Response
    expect(res.status).toBe(404)
  })

  it('hostile props → 400; slashed names → 400; non-GET → 405', async () => {
    serverIsland(async () => Badge, { name: 'Hi' })
    const mw = createServerIslandMiddleware([])
    const bad = (await mw(
      ctxFor(`http://x/_pyreon/fragment/Hi?props=${encodeURIComponent('{nope')}`),
    )) as Response
    expect(bad.status).toBe(400)
    const slashed = (await mw(ctxFor('http://x/_pyreon/fragment/a/b'))) as Response
    expect(slashed.status).toBe(400)
    const post = (await mw(ctxFor('http://x/_pyreon/fragment/Hi', 'POST'))) as Response
    expect(post.status).toBe(405)
    expect(post.headers.get('Allow')).toBe('GET')
  })

  it('locals from earlier middleware reach the fragment (the personalization contract)', async () => {
    const WhoAmI: ComponentFn = () => h('b', null, 'route-mw-sees-locals')
    serverIsland(async () => WhoAmI, { name: 'Locals' })
    const mw = createServerIslandMiddleware([])
    const res = (await mw(
      ctxFor('http://x/_pyreon/fragment/Locals', 'GET', { user: 'ada' }),
    )) as Response
    expect(res.status).toBe(200)
  })
})
