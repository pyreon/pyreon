/**
 * The route gate runs for what the router actually resolves, and for the
 * route that DECLARES a server action.
 *
 * Two shapes the 2026-11 security audit reproduced through `createServer`:
 *
 * 1. Server actions ran without their route's middleware. Route middleware
 *    is matched on the request path, and `/_zero/actions/<id>` matches no
 *    page; a form post `POST /<public page>?_action=<id>` ran the PUBLIC
 *    page's middleware and then an action declared on `/admin`. Action ids
 *    are deterministic and ship in the client bundle.
 * 2. A URL under a guarded directory that matches no page
 *    (`/admin/<unknown>`, with an `admin/_404`) renders the router's
 *    not-found chain `[...ancestor layouts, <404 leaf>]`, so the `/admin`
 *    layout's loaders ran — and their data was serialised into the 404 HTML
 *    and served by `/_pyreon/data` — without the layout's middleware, whose
 *    entry lists only page patterns.
 */
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { RouterView } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { _defineActionWithId, _registerActionRoutes } from '../actions'
import { createServer } from '../entry-server'
import { ROUTE_GATE_TAG } from '../route-gate'
import type { RouteMiddlewareEntry } from '../types'

const TAG = Symbol.for(ROUTE_GATE_TAG)
const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init)
const ADMIN = { headers: { 'x-admin': 'yes' } }

const adminGate: Middleware = (ctx) =>
  ctx.req.headers.get('x-admin') === 'yes' ? undefined : new Response('denied', { status: 401 })
const accountGate: Middleware = (ctx) =>
  ctx.req.headers.get('x-user') ? undefined : Response.redirect('http://localhost/login?next=account', 302)

let layoutLoads = 0
const runs: string[] = []

// The shape fs-router generates: each guarded `_layout` RECORD carries the
// gate id that its middleware entry carries too (`generateRouteModule` /
// `generateMiddlewareModule`; both pinned in fs-router.test.ts).
const routes: RouteRecord[] = [
  {
    path: '/',
    component: () => h('div', null, h(RouterView, null)),
    children: [
      { path: '/', component: () => h('p', null, 'home') },
      { path: '/public', component: () => h('p', null, 'public') },
      {
        path: '/admin',
        component: () => h('section', null, 'admin-layout', h(RouterView, null)),
        [TAG]: 'gadmin',
        serverLoader: async () => {
          layoutLoads++
          return { secret: 'ADMIN-LAYOUT-SECRET' }
        },
        notFoundComponent: () => h('p', null, 'admin-404'),
        children: [
          { path: '/admin', component: () => h('p', null, 'admin-index') },
          { path: '/admin/users/:id', component: () => h('p', null, 'user') },
        ],
      } as RouteRecord,
      {
        path: '/account',
        component: () => h('section', null, 'account-layout', h(RouterView, null)),
        [TAG]: 'gaccount',
        serverLoader: async () => ({ secret: 'ACCOUNT-LAYOUT-SECRET' }),
        notFoundComponent: () => h('p', null, 'account-404'),
        children: [{ path: '/account', component: () => h('p', null, 'account-index') }],
      } as RouteRecord,
    ],
  },
]

const routeMiddleware: RouteMiddlewareEntry[] = [
  { pattern: '/admin', patterns: ['/admin', '/admin/users/:id'], gate: 'gadmin', middleware: adminGate },
  { pattern: '/account', patterns: ['/account'], gate: 'gaccount', middleware: accountGate },
]

beforeAll(() => {
  _defineActionWithId('gate_admin_action', async () => {
    runs.push('admin')
    return { done: 'ADMIN-ACTION-RAN' }
  })
  _defineActionWithId('gate_user_action', async () => {
    runs.push('user')
    return { done: 'USER-ACTION-RAN' }
  })
  _defineActionWithId('gate_account_action', async () => {
    runs.push('account')
    return { done: 'ACCOUNT-ACTION-RAN' }
  })
  _defineActionWithId('gate_public_action', async () => {
    runs.push('public')
    return { done: 'PUBLIC-ACTION-RAN' }
  })
  _defineActionWithId('gate_shared_action', async () => {
    runs.push('shared')
    return { done: 'SHARED-ACTION-RAN' }
  })
  _registerActionRoutes({
    gate_admin_action: '/admin',
    gate_user_action: '/admin/users/:id',
    gate_account_action: '/account',
    gate_public_action: '/public',
  })
})

afterEach(() => {
  runs.length = 0
  layoutLoads = 0
})

const handler = createServer({ routes, routeMiddleware, config: { mode: 'ssr' } })

const callAction = (id: string, init: RequestInit = {}) =>
  handler(
    req(`/_zero/actions/${id}`, {
      method: 'POST',
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string>) },
      body: '{}',
    }),
  )

const postForm = (page: string, id: string, init: RequestInit = {}) =>
  handler(
    req(`${page}?_action=${id}`, {
      method: 'POST',
      ...init,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-zero-action': '1',
        ...(init.headers as Record<string, string>),
      },
      body: 'a=1',
    }),
  )

describe('a server action is gated as the route that declares it', () => {
  it('its own endpoint refuses a denied requester before the action body runs', async () => {
    const res = await callAction('gate_admin_action')
    expect(res.status).toBe(401)
    expect(await res.text()).not.toContain('ADMIN-ACTION-RAN')
    expect(runs).toEqual([])
  })

  it('its own endpoint runs it for an allowed requester', async () => {
    const res = await callAction('gate_admin_action', ADMIN)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('ADMIN-ACTION-RAN')
    expect(runs).toEqual(['admin'])
  })

  it('a dynamic declaring route is gated by its layout', async () => {
    expect((await callAction('gate_user_action')).status).toBe(401)
    expect((await callAction('gate_user_action', ADMIN)).status).toBe(200)
    expect(runs).toEqual(['user'])
  })

  it('posting it to a PUBLIC page through ?_action= does not replace its gate', async () => {
    for (const page of ['/', '/public']) {
      const res = await postForm(page, 'gate_admin_action')
      expect(res.status).toBe(401)
      expect(await res.text()).not.toContain('ADMIN-ACTION-RAN')
    }
    expect(runs).toEqual([])
    const ok = await postForm('/public', 'gate_admin_action', ADMIN)
    expect(ok.status).toBe(200)
    expect(await ok.text()).toContain('ADMIN-ACTION-RAN')
    expect(runs).toEqual(['admin'])
  })

  it('a redirect from the declaring route middleware is honoured', async () => {
    for (const res of [await callAction('gate_account_action'), await postForm('/public', 'gate_account_action')]) {
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('http://localhost/login?next=account')
    }
    expect(runs).toEqual([])
    expect((await callAction('gate_account_action', { headers: { 'x-user': 'u1' } })).status).toBe(200)
  })

  it('an action declared on a public page still works, from either path', async () => {
    expect((await callAction('gate_public_action')).status).toBe(200)
    expect((await postForm('/', 'gate_public_action')).status).toBe(200)
    expect(runs).toEqual(['public', 'public'])
  })

  it('an action with no declaring route is refused (403), never run ungated', async () => {
    const res = await callAction('gate_shared_action', ADMIN)
    expect(res.status).toBe(403)
    const form = await postForm('/public', 'gate_shared_action', ADMIN)
    expect(form.status).toBe(403)
    expect(runs).toEqual([])
  })

  it('an unknown id still gets the endpoint not-found answer, running nothing', async () => {
    const res = await callAction('no_such_action')
    expect(res.status).toBe(404)
    expect(runs).toEqual([])
  })
})

describe('a not-found page under a guarded folder runs the folder gate first', () => {
  it('the 404 HTML: denied before the layout loader runs; allowed renders it', async () => {
    const denied = await handler(req('/admin/nope'))
    expect(denied.status).toBe(401)
    expect(await denied.text()).not.toContain('ADMIN-LAYOUT-SECRET')
    expect(layoutLoads).toBe(0)

    const allowed = await handler(req('/admin/nope', ADMIN))
    expect(allowed.status).toBe(404)
    const html = await allowed.text()
    expect(html).toContain('admin-404')
    expect(html).toContain('ADMIN-LAYOUT-SECRET')
  })

  it('the data endpoint: denied; allowed gets the layout data', async () => {
    const path = `/_pyreon/data?path=${encodeURIComponent('/admin/nope')}`
    const denied = await handler(req(path))
    expect(denied.status).toBe(401)
    expect(await denied.text()).not.toContain('ADMIN-LAYOUT-SECRET')
    expect(layoutLoads).toBe(0)

    const allowed = await handler(req(path, ADMIN))
    expect(allowed.status).toBe(200)
    expect(await allowed.text()).toContain('ADMIN-LAYOUT-SECRET')
  })

  it('a redirecting folder gate redirects its not-found pages too', async () => {
    const res = await handler(req('/account/missing/deeper'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost/login?next=account')
  })

  it('a not-found page outside any guarded folder is unaffected', async () => {
    const res = await handler(req('/nowhere'))
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(302)
  })

  it('a guarded page runs its folder gate once, not twice', async () => {
    const gate = vi.fn(adminGate)
    const once = createServer({
      routes,
      routeMiddleware: [{ ...routeMiddleware[0]!, middleware: gate }],
      config: { mode: 'ssr' },
    })
    await once(req('/admin', ADMIN))
    expect(gate).toHaveBeenCalledTimes(1)
  })
})
