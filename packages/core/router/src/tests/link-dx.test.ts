/**
 * Link-DX regression tests (PZ-07 + PZ-06).
 *
 * PZ-07 — `<RouterLink>` without a resolvable router:
 *   - resolves its router with the SAME `context ?? activeRouter` fallback
 *     every router hook uses (pre-fix it read the context BARE, ignoring
 *     `setActiveRouter`),
 *   - with NO router at all it degrades to a NATIVE anchor — plain-path
 *     `href` (pre-fix: surprising `#/path` hash fallback) and NO
 *     `preventDefault` on click (pre-fix: the click was swallowed → dead
 *     link),
 *   - and warns once per `to` in dev (client only).
 *
 * PZ-06 — dev-mode document-level warning when a plain internal `<a href>`
 * click is about to trigger a full page reload. RouterLink/zero-Link
 * preventDefault() their internal clicks, so `e.defaultPrevented` at the
 * document bubble phase uniquely discriminates framework-handled anchors.
 *
 * NOTE ON TEST ORDER: the no-provider specs run FIRST in this file (before
 * any RouterProvider mount) and additionally clear the active router + any
 * leaked context frames — same defensive shape as the existing
 * "RouterLink edge cases" specs in router.test.ts.
 */
import { h, popContext } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createRouter, RouterLink, RouterProvider } from '../index'
import { setActiveRouter } from '../router'
import type { RouteRecord, Router } from '../types'

const Home = () => null
const Settings = () => null

const routes: RouteRecord[] = [
  { path: '/', component: Home },
  { path: '/settings', component: Settings },
]

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

/** Clear the module-level active router + any leaked provider context frames. */
function clearRouterEnv(): void {
  setActiveRouter(null)
  for (let i = 0; i < 50; i++) popContext()
}

// Routers created via this helper are destroyed after each test so their
// document-level dev listeners (PZ-06) never leak across specs.
let createdRouters: Router[] = []
function makeRouter(opts: Parameters<typeof createRouter>[0]): Router {
  const router = createRouter(opts)
  createdRouters.push(router)
  return router
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  for (const r of createdRouters) r.destroy()
  createdRouters = []
  setActiveRouter(null)
  warnSpy.mockRestore()
})

/** Count console.warn calls whose first arg contains `needle`. */
function warnsContaining(needle: string): number {
  return warnSpy.mock.calls.filter(
    (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes(needle),
  ).length
}

// ─── PZ-07: no-provider degradation ──────────────────────────────────────────

describe('RouterLink without any router (PZ-07 no-provider degradation)', () => {
  test('href is the PLAIN path (native anchor), not a hash fallback', () => {
    clearRouterEnv()
    const el = container()
    mount(h(RouterLink, { to: '/settings' }, 'Settings'), el)
    const anchor = el.querySelector('a')
    expect(anchor).not.toBeNull()
    // Pre-fix this rendered `#/settings` — wrong for history-mode apps (the
    // dominant mode, zero's default) and a dead destination without a router.
    expect(anchor?.getAttribute('href')).toBe('/settings')
  })

  test('click does NOT preventDefault — the link degrades to a full-load native anchor', () => {
    clearRouterEnv()
    const el = container()
    mount(h(RouterLink, { to: '/pz07-click' }, 'Go'), el)
    const anchor = el.querySelector('a')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    expect(() => anchor?.dispatchEvent(event)).not.toThrow()
    // Pre-fix handleClick called e.preventDefault() BEFORE the no-router
    // bail — swallowing the click entirely (inert link, no navigation at all).
    expect(event.defaultPrevented).toBe(false)
  })

  test('warns once per `to` in dev — and not again for a second instance with the same `to`', () => {
    clearRouterEnv()
    const el = container()
    mount(h(RouterLink, { to: '/pz07-warn-dedupe' }, 'A'), el)
    expect(warnsContaining('/pz07-warn-dedupe')).toBe(1)
    expect(warnsContaining('without a RouterProvider')).toBeGreaterThanOrEqual(1)
    // Second mount with the SAME `to` → deduped (once per process per path).
    const el2 = container()
    mount(h(RouterLink, { to: '/pz07-warn-dedupe' }, 'B'), el2)
    expect(warnsContaining('/pz07-warn-dedupe')).toBe(1)
  })
})

// ─── PZ-07: hook-parity router resolution ────────────────────────────────────

describe('RouterLink router resolution parity with hooks (PZ-07)', () => {
  test('setActiveRouter-only (no provider component) resolves the active router — history href', () => {
    clearRouterEnv()
    const router = makeRouter({ routes, mode: 'history', url: '/' })
    setActiveRouter(router as never)
    const el = container()
    mount(h(RouterLink, { to: '/settings' }, 'Settings'), el)
    const anchor = el.querySelector('a')
    // Pre-fix RouterLink read the context BARE (no `?? _activeRouter`
    // fallback, unlike every hook in router.ts) → rendered `#/settings`.
    expect(anchor?.getAttribute('href')).toBe('/settings')
    // No "without a RouterProvider" warning — a router IS resolvable.
    expect(warnsContaining('without a RouterProvider')).toBe(0)
  })

  test('setActiveRouter-only click navigates client-side (preventDefault + push)', async () => {
    clearRouterEnv()
    const router = makeRouter({ routes, mode: 'history', url: '/' })
    setActiveRouter(router as never)
    const el = container()
    mount(h(RouterLink, { to: '/settings' }, 'Settings'), el)
    const anchor = el.querySelector('a')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(router.currentRoute().path).toBe('/settings')
  })

  test('provider cases unchanged — history mode renders /settings', () => {
    clearRouterEnv()
    const router = makeRouter({ routes, mode: 'history', url: '/' })
    const el = container()
    mount(h(RouterProvider, { router }, h(RouterLink, { to: '/settings' }, 'S')), el)
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/settings')
    expect(warnsContaining('without a RouterProvider')).toBe(0)
  })

  test('provider cases unchanged — hash mode renders #/settings', () => {
    clearRouterEnv()
    const router = makeRouter({ routes, url: '/' })
    const el = container()
    mount(h(RouterProvider, { router }, h(RouterLink, { to: '/settings' }, 'S')), el)
    expect(el.querySelector('a')?.getAttribute('href')).toBe('#/settings')
    expect(warnsContaining('without a RouterProvider')).toBe(0)
  })
})

// ─── PZ-06: internal <a href> full-reload dev warning ────────────────────────

const RELOAD_MSG = 'triggers a full page reload'

function plainAnchor(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement('a')
  a.setAttribute('href', href)
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v)
  a.textContent = href
  document.body.appendChild(a)
  return a
}

function click(target: EventTarget, init: MouseEventInit = {}): MouseEvent {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(ev)
  return ev
}

describe('internal <a href> full-reload dev warning (PZ-06)', () => {
  test('plain internal anchor click warns with RouterLink guidance', () => {
    clearRouterEnv()
    makeRouter({ routes, mode: 'history', url: '/' })
    const a = plainAnchor('/pz06-plain')
    click(a)
    expect(warnsContaining(RELOAD_MSG)).toBe(1)
    expect(warnsContaining('<RouterLink to="/pz06-plain">')).toBe(1)
    // The opt-out is named in the message.
    expect(warnsContaining('data-allow-reload')).toBe(1)
  })

  test('clicking a RouterLink does NOT warn (defaultPrevented discriminator)', async () => {
    clearRouterEnv()
    const router = makeRouter({ routes, mode: 'history', url: '/' })
    const el = container()
    mount(h(RouterProvider, { router }, h(RouterLink, { to: '/settings' }, 'S')), el)
    const anchor = el.querySelector('a')
    const ev = click(anchor as Element)
    expect(ev.defaultPrevented).toBe(true) // sanity: RouterLink handled it
    expect(warnsContaining(RELOAD_MSG)).toBe(0)
    await new Promise<void>((r) => setTimeout(r, 10))
  })

  test('external href does not warn', () => {
    clearRouterEnv()
    makeRouter({ routes, mode: 'history', url: '/' })
    click(plainAnchor('https://example.com/x'))
    click(plainAnchor('mailto:hi@example.com'))
    click(plainAnchor('#section'))
    expect(warnsContaining(RELOAD_MSG)).toBe(0)
  })

  test('data-allow-reload opt-out does not warn', () => {
    clearRouterEnv()
    makeRouter({ routes, mode: 'history', url: '/' })
    click(plainAnchor('/pz06-optout', { 'data-allow-reload': '' }))
    expect(warnsContaining(RELOAD_MSG)).toBe(0)
  })

  test('target / download attributes do not warn (deliberate full-load links)', () => {
    clearRouterEnv()
    makeRouter({ routes, mode: 'history', url: '/' })
    click(plainAnchor('/pz06-target', { target: '_blank' }))
    click(plainAnchor('/pz06-download', { download: '' }))
    expect(warnsContaining(RELOAD_MSG)).toBe(0)
  })

  test('modifier / non-primary clicks do not warn (new-tab intent)', () => {
    clearRouterEnv()
    makeRouter({ routes, mode: 'history', url: '/' })
    const a = plainAnchor('/pz06-modifier')
    click(a, { metaKey: true })
    click(a, { ctrlKey: true })
    click(a, { button: 1 })
    expect(warnsContaining(RELOAD_MSG)).toBe(0)
  })

  test('hash-mode router: valid `#/x` hrefs are skipped, path-style hrefs warn', () => {
    clearRouterEnv()
    makeRouter({ routes, url: '/' }) // default hash mode
    click(plainAnchor('#/settings'))
    expect(warnsContaining(RELOAD_MSG)).toBe(0)
    click(plainAnchor('/pz06-hashmode-path'))
    // A path-style href full-reloads a hash-mode app too.
    expect(warnsContaining(RELOAD_MSG)).toBe(1)
  })

  test('click dispatched on a text-node target does not throw and does not warn', () => {
    clearRouterEnv()
    makeRouter({ routes, mode: 'history', url: '/' })
    const a = plainAnchor('/pz06-textnode')
    const text = document.createTextNode('inner')
    a.appendChild(text)
    // Programmatic dispatch on a Text node — no `.closest`; the listener must
    // skip gracefully (real browser clicks always target an Element).
    expect(() => click(text)).not.toThrow()
    expect(warnsContaining(RELOAD_MSG)).toBe(0)
  })

  test('SVG <a> is classified via getAttribute (no SVGAnimatedString crash)', () => {
    clearRouterEnv()
    makeRouter({ routes, mode: 'history', url: '/' })
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const svgA = document.createElementNS('http://www.w3.org/2000/svg', 'a')
    svgA.setAttribute('href', '/pz06-svg')
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    svgA.appendChild(rect)
    svg.appendChild(svgA)
    document.body.appendChild(svg)
    expect(() => click(rect)).not.toThrow()
    expect(warnsContaining('<RouterLink to="/pz06-svg">')).toBe(1)
  })

  test('destroy() removes the listener (identity-based cleanup — leak class D)', () => {
    clearRouterEnv()
    const router = makeRouter({ routes, mode: 'history', url: '/' })
    const a = plainAnchor('/pz06-destroy')
    click(a)
    expect(warnsContaining(RELOAD_MSG)).toBe(1)
    router.destroy()
    click(a)
    expect(warnsContaining(RELOAD_MSG)).toBe(1) // unchanged — listener removed
  })
})
