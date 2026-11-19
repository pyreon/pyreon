// In-memory history — `createRouter({ mode: 'memory' })` (#4372).
//
// The location lives in an entry stack inside the router: push / replace /
// back / forward / go move through it with the FULL navigation pipeline, no
// window listener is attached, and nothing is read from or written to
// `window.history` / `location`. Real-Chromium coverage (two routers on one
// page, `history.length`) lives in memory-history.browser.test.tsx; the
// no-`window` server case in memory-history-ssr.test.ts.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterLink, RouterProvider, RouterView, useBlocker } from '../index'
import { createRouter, setActiveRouter } from '../router'
import type { RouteRecord, Router, RouterInstance, RouterTab } from '../types'

const flush = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Wait until the router has settled (no navigation in flight). */
async function settle(router: Router): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await flush()
    if (!router.loading()) return
  }
  throw new Error('router did not settle')
}

const page = (name: string) => () => h('p', { 'data-page': name }, name)

const routes = (): RouteRecord[] => [
  { path: '/', component: page('home') },
  { path: '/a', component: page('a') },
  { path: '/b', component: page('b') },
  { path: '/c', component: page('c') },
  { path: '/user/:id', component: page('user') },
]

const created: Router[] = []

function make(extra: Partial<Parameters<typeof createRouter>[0] & object> = {}): Router {
  const r = createRouter({ routes: routes(), mode: 'memory', ...extra })
  created.push(r)
  return r
}

const path = (r: Router): string => r.currentRoute().path

beforeEach(() => {
  window.history.replaceState(null, '', '/host-page')
})

afterEach(() => {
  for (const r of created.splice(0)) r.destroy()
  setActiveRouter(null)
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('memory mode — initial location', () => {
  it('starts at "/" and ignores the page URL', () => {
    window.history.replaceState(null, '', '/a#/b')
    const r = make()
    expect(r.mode).toBe('memory')
    expect(path(r)).toBe('/')
  })

  it('starts at the LAST of initialEntries by default', () => {
    const r = make({ initialEntries: ['/', '/a', '/b'] })
    expect(path(r)).toBe('/b')
  })

  it('initialIndex picks the starting entry, and the entries around it are reachable', async () => {
    const r = make({ initialEntries: ['/', '/a', '/b'], initialIndex: 1 })
    expect(path(r)).toBe('/a')
    r.forward()
    await settle(r)
    expect(path(r)).toBe('/b')
    r.go(-2)
    await settle(r)
    expect(path(r)).toBe('/')
  })

  it('falls back to `url` when there are no initialEntries (the server option)', () => {
    expect(path(make({ url: '/c' }))).toBe('/c')
  })

  it('normalizes the entries with the trailingSlash strategy', () => {
    expect(path(make({ initialEntries: ['/a/'] }))).toBe('/a')
  })

  it('clamps an out-of-range initialIndex and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = make({ initialEntries: ['/', '/a'], initialIndex: 5 })
    expect(path(r)).toBe('/a')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('initialIndex'))
  })
})

describe('memory mode — never touches the page', () => {
  it('push / replace / back / forward write nothing to window.history or location', async () => {
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    const go = vi.spyOn(window.history, 'go')
    const back = vi.spyOn(window.history, 'back')
    const href = window.location.href
    const r = make()
    await r.push('/a')
    await r.push('/b')
    await r.replace('/c')
    r.back()
    await settle(r)
    r.forward()
    await settle(r)
    expect(path(r)).toBe('/c')
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
    expect(window.location.href).toBe(href)
  })

  it('attaches no window or document listener', () => {
    const win = vi.spyOn(window, 'addEventListener')
    const doc = vi.spyOn(document, 'addEventListener')
    make()
    expect(win.mock.calls.map((c) => c[0])).toEqual([])
    expect(doc.mock.calls.map((c) => c[0])).toEqual([])
  })

  it("does not follow the page's own hashchange / popstate", async () => {
    const r = make()
    await r.push('/a')
    window.location.hash = '#/b'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    window.history.replaceState(null, '', '/c')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flush(10)
    expect(path(r)).toBe('/a')
  })

  it('does not write document.title from route meta', async () => {
    document.title = 'Host page'
    const r = createRouter({
      mode: 'memory',
      routes: [
        { path: '/', component: page('home') },
        { path: '/t', component: page('t'), meta: { title: 'Demo page' } },
      ],
    })
    created.push(r)
    await r.push('/t')
    expect(document.title).toBe('Host page')
  })

  it('refuses an external redirect instead of leaving the page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = make()
    r.beforeEach((to) => (to.path === '/a' ? 'https://example.com/' : undefined))
    const href = window.location.href
    expect(await r.push('/a')).toBe('cancelled')
    expect(path(r)).toBe('/')
    expect(window.location.href).toBe(href)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('memory'))
  })
})

describe('memory mode — the entry stack', () => {
  it('back / forward / go move through the entries', async () => {
    const r = make()
    await r.push('/a')
    await r.push('/b')
    await r.push('/c')
    r.back()
    await settle(r)
    expect(path(r)).toBe('/b')
    r.go(-2)
    await settle(r)
    expect(path(r)).toBe('/')
    r.go(3)
    await settle(r)
    expect(path(r)).toBe('/c')
  })

  it('replace overwrites the current entry instead of adding one', async () => {
    const r = make()
    await r.push('/a')
    await r.replace('/b')
    r.back()
    await settle(r)
    expect(path(r)).toBe('/')
  })

  it('a push after back drops the forward entries', async () => {
    const r = make()
    await r.push('/a')
    await r.push('/b')
    r.back()
    await settle(r)
    await r.push('/c')
    const guard = vi.fn(() => true)
    r.beforeEach(guard)
    r.forward()
    await settle(r)
    expect(path(r)).toBe('/c')
    expect(guard).not.toHaveBeenCalled()
  })

  it('going past either end is a no-op that runs no guard', async () => {
    const r = make()
    await r.push('/a')
    const guard = vi.fn(() => true)
    r.beforeEach(guard)
    expect(r.back()).toBeUndefined()
    await settle(r)
    expect(path(r)).toBe('/')
    expect(r.back()).toBeUndefined()
    expect(r.go(-5)).toBeUndefined()
    expect(r.go(2)).toBeUndefined()
    expect(r.go(0)).toBeUndefined()
    await settle(r)
    expect(path(r)).toBe('/')
    // Only the one real traversal ran the pipeline.
    expect(guard).toHaveBeenCalledTimes(1)
  })
})

describe('memory mode — traversals run the full pipeline', () => {
  it('back re-runs guards with the right to / from', async () => {
    const r = make()
    await r.push('/a')
    await r.push('/b')
    const seen: string[] = []
    r.beforeEach((to, from) => {
      seen.push(`${from.path}->${to.path}`)
    })
    r.back()
    await settle(r)
    expect(seen).toEqual(['/b->/a'])
  })

  it('a guard that cancels a traversal leaves the stack index where it was', async () => {
    const r = make()
    await r.push('/a')
    await r.push('/b')
    let block = true
    r.beforeEach((to) => !(block && to.path === '/a'))
    r.back()
    await settle(r)
    expect(path(r)).toBe('/b')
    // Index still on /b: the next Back targets /a again (not '/'), and
    // forward has nowhere to go.
    r.forward()
    await settle(r)
    expect(path(r)).toBe('/b')
    block = false
    r.back()
    await settle(r)
    expect(path(r)).toBe('/a')
  })

  it('a blocker cancels a traversal too', async () => {
    const r = make()
    await r.push('/a')
    let dirty = true
    const Page = () => {
      useBlocker(() => dirty)
      return null
    }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const unmount = mount(h(RouterProvider, { router: r }, h(Page, null)), root)
    r.back()
    await settle(r)
    expect(path(r)).toBe('/a')
    dirty = false
    r.back()
    await settle(r)
    expect(path(r)).toBe('/')
    unmount()
  })

  it('back re-runs the loader and fires afterEach', async () => {
    let runs = 0
    const r = createRouter({
      mode: 'memory',
      routes: [
        { path: '/', component: page('home') },
        { path: '/posts', component: page('posts'), gcTime: 0, loader: async () => ++runs },
        { path: '/about', component: page('about') },
      ],
    })
    created.push(r)
    const after: string[] = []
    r.afterEach((to) => {
      after.push(to.path)
    })
    await r.push('/posts')
    await r.push('/about')
    r.back()
    await settle(r)
    expect(path(r)).toBe('/posts')
    expect(runs).toBe(2)
    expect((r as RouterInstance)._loaderData.size).toBe(1)
    expect(after).toEqual(['/posts', '/about', '/posts'])
  })

  it('a guard redirect during a traversal replaces the entry it landed on', async () => {
    const r = make()
    await r.push('/a')
    await r.push('/b')
    r.beforeEach((to) => (to.path === '/a' ? '/c' : undefined))
    r.back()
    await settle(r)
    expect(path(r)).toBe('/c')
    // /a's entry became /c; forward still reaches /b, and back reaches '/'.
    r.forward()
    await settle(r)
    expect(path(r)).toBe('/b')
    r.go(-2)
    await settle(r)
    expect(path(r)).toBe('/')
  })

  it('push resolves with the NavigationResult like any other mode', async () => {
    const r = make()
    r.beforeEach((to) => to.path !== '/b')
    expect(await r.push('/a')).toBe('committed')
    expect(await r.push('/b')).toBe('cancelled')
    expect(path(r)).toBe('/a')
  })
})

describe('memory mode — RouterLink', () => {
  it('renders the plain route path as href and navigates the memory router on click', async () => {
    const r = make()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const href = window.location.href
    const unmount = mount(
      h(
        RouterProvider,
        { router: r },
        h(RouterLink, { to: '/user/7', id: 'l' }, 'user'),
        h(RouterView, null),
      ),
      root,
    )
    const a = root.querySelector<HTMLAnchorElement>('#l')
    expect(a?.getAttribute('href')).toBe('/user/7')
    a?.click()
    await settle(r)
    expect(path(r)).toBe('/user/7')
    expect(root.querySelector('[data-page]')?.textContent).toBe('user')
    expect(window.location.href).toBe(href)
    unmount()
  })
})

describe('memory mode — tabs', () => {
  const tabs: RouterTab[] = [
    { name: 'a', root: '/a' },
    { name: 'b', root: '/b' },
  ]

  it('back restores the tab and its stack', async () => {
    const r = createRouter({
      mode: 'memory',
      initialEntries: ['/a'],
      tabs,
      routes: [...routes(), { path: '/a/x', component: page('ax') }],
    })
    created.push(r)
    await r.push('/a/x')
    await r.selectTab('b')
    expect(r.activeTab()).toBe('b')
    r.back()
    await settle(r)
    expect(r.activeTab()).toBe('a')
    expect(r.tabStack('a')).toEqual(['/a', '/a/x'])
    expect(path(r)).toBe('/a/x')
  })
})

describe('memory mode — beside a browser router', () => {
  it('never takes over restoring the page URL from the browser router', async () => {
    window.history.replaceState(null, '', '/')
    const page1 = createRouter({ routes: routes(), mode: 'history' })
    created.push(page1)
    await page1.push('/a')
    // A memory router created AFTER the page's router.
    const demo = make()
    await demo.push('/b')
    // The page router blocks a Back; it must still put the URL back itself.
    page1.beforeEach(() => false)
    window.history.replaceState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await settle(page1)
    expect(path(page1)).toBe('/a')
    expect(window.location.pathname).toBe('/a')
    // And the memory router is untouched by the page's traversal.
    expect(path(demo)).toBe('/b')
  })

  it("destroying a memory router leaves the browser router's ownership alone", async () => {
    window.history.replaceState(null, '', '/')
    const page1 = createRouter({ routes: routes(), mode: 'history' })
    created.push(page1)
    await page1.push('/a')
    const demo = createRouter({ routes: routes(), mode: 'memory' })
    demo.destroy()
    page1.beforeEach(() => false)
    window.history.replaceState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await settle(page1)
    expect(window.location.pathname).toBe('/a')
  })
})

describe('memory mode — destroy', () => {
  it('releases the entries: traversal after destroy is a no-op, and nothing was attached to remove', async () => {
    const r = createRouter({ routes: routes(), mode: 'memory' })
    await r.push('/a')
    await r.push('/b')
    const removeWin = vi.spyOn(window, 'removeEventListener')
    const removeDoc = vi.spyOn(document, 'removeEventListener')
    r.destroy()
    expect(removeWin).not.toHaveBeenCalled()
    expect(removeDoc).not.toHaveBeenCalled()
    r.back()
    await flush(10)
    expect(path(r)).toBe('/b')
    expect(r.loading()).toBe(false)
  })
})
