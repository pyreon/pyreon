// @vitest-environment happy-dom
/**
 * The islands-only client dispatch (#4371) under the unit runner:
 * `startClientLazy`, `startIslandsOnlyPage` and `startIslands`.
 *
 * `client-islands-only.browser.test.ts` proves the end-to-end story in real
 * Chromium (adoption of the server HTML, no `popstate` listener). This file
 * pins the dispatch decisions themselves, which need no layout or real
 * events: which loader each kind of page calls, that a cleanup called before
 * the code arrives cancels the start, that a load failure is reported, and
 * that store state reaches the islands before they mount.
 *
 * The app client (`../client`) is replaced by a recording `startClient`: what
 * `startClientLazy` owes it is the options it forwards and the stop it calls,
 * and `client.test.ts` covers `startClient` itself. The islands runtime is the
 * real one (`client-islands` → `@pyreon/server/client`).
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { RouteRecord } from '@pyreon/router'
import { ISLANDS_ONLY_MARKER } from '@pyreon/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startClientLazy } from '../client-lazy'
import { startIslandsOnlyPage } from '../client-marker'

const appStop = vi.fn()
const startClientMock = vi.fn((_options: Record<string, unknown>) => appStop)

vi.mock('../client', () => ({ startClient: startClientMock }))

const Counter: ComponentFn = () => {
  const count = signal(0)
  return h(
    'button',
    { 'data-testid': 'counter', type: 'button', onClick: () => count.set(count() + 1) },
    () => `count:${count()}`,
  )
}

const registry = (loads: { n: number }) => ({
  __pyreonIslandRegistry: {
    Counter: async () => {
      loads.n++
      return { default: Counter }
    },
  },
  __pyreonIslandsEnabled: true as const,
})

const ISLAND =
  '<pyreon-island data-component="Counter" data-props="{}" data-hydrate="load"><button data-testid="counter" type="button">count:0</button></pyreon-island>'

function serverPage(islandHtml: string, marked = true): void {
  document.head.innerHTML = marked ? ISLANDS_ONLY_MARKER : ''
  document.body.innerHTML = `<div id="app"><main><h1>Static page</h1>${islandHtml}</main></div>`
}

const g = globalThis as Record<string, unknown>

beforeEach(() => {
  startClientMock.mockClear()
  appStop.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  delete g.__ZERO_APP_PAGES__
  delete g.__PYREON_HYDRATE_STORES__
  delete g.__PYREON_STORE_STATE__
})

const routesLoader = (routes: RouteRecord[] = []) => {
  const loader = vi.fn(async () => ({ routes }))
  return loader
}

describe('startClientLazy on an islands-only page', () => {
  it('hydrates the island from the registry and never loads the routes or the app', async () => {
    serverPage(ISLAND)
    const loads = { n: 0 }
    const routes = routesLoader()
    const cleanup = startClientLazy({ routes, islands: registry(loads) })
    try {
      const island = document.querySelector('pyreon-island')!
      await vi.waitFor(() => expect(island.hasAttribute('data-island-hydrated')).toBe(true))
      expect(loads.n).toBe(1)
      const button = document.querySelector<HTMLButtonElement>('[data-testid="counter"]')!
      button.click()
      await vi.waitFor(() => expect(button.textContent).toBe('count:1'))
      expect(routes).not.toHaveBeenCalled()
      expect(startClientMock).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it('takes the islands path without reading the page when the build says no page starts the app', async () => {
    // `__ZERO_APP_PAGES__ === false` (every page islands-only): the app path is
    // compiled out, so even an UNMARKED page goes to the islands runtime.
    g.__ZERO_APP_PAGES__ = false
    serverPage(ISLAND, false)
    const loads = { n: 0 }
    const routes = routesLoader()
    const cleanup = startClientLazy({ routes, islands: registry(loads) })
    try {
      const island = document.querySelector('pyreon-island')!
      await vi.waitFor(() => expect(island.hasAttribute('data-island-hydrated')).toBe(true))
      expect(routes).not.toHaveBeenCalled()
      expect(startClientMock).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it('seeds the server-rendered store state before any island mounts', async () => {
    serverPage(ISLAND)
    const order: string[] = []
    const state = { cart: { items: 2 } }
    const hydrateStores = vi.fn(() => order.push('stores'))
    g.__PYREON_HYDRATE_STORES__ = hydrateStores
    g.__PYREON_STORE_STATE__ = state
    const islands = {
      __pyreonIslandRegistry: {
        Counter: async () => {
          order.push('island')
          return { default: Counter }
        },
      },
      __pyreonIslandsEnabled: true as const,
    }
    const cleanup = startClientLazy({ routes: routesLoader(), islands })
    try {
      await vi.waitFor(() => expect(order).toContain('island'))
      expect(hydrateStores).toHaveBeenCalledWith(state)
      expect(order).toEqual(['stores', 'island'])
    } finally {
      cleanup()
    }
  })

  // Window named access (#4765): without @pyreon/store on the page, markup with
  // `id="__PYREON_HYDRATE_STORES__"` makes the bridge an element (happy-dom has
  // no named access, so it is assigned). It used to be called because it was
  // truthy, and the islands runtime threw before hydrating any island.
  it('a bridge shadowed by page markup is not called, and the islands still hydrate', async () => {
    serverPage(`${ISLAND}<div id="__PYREON_HYDRATE_STORES__"></div>`)
    g.__PYREON_HYDRATE_STORES__ = document.getElementById('__PYREON_HYDRATE_STORES__')
    g.__PYREON_STORE_STATE__ = { cart: { items: 2 } }
    const cleanup = startClientLazy({ routes: routesLoader(), islands: registry({ n: 0 }) })
    try {
      const island = document.querySelector('pyreon-island')!
      await vi.waitFor(() => expect(island.hasAttribute('data-island-hydrated')).toBe(true))
    } finally {
      cleanup()
    }
  })

  it('wraps the island in islandRoot when one is given', async () => {
    serverPage(ISLAND)
    let rootLoads = 0
    const Root = (props: { children?: unknown }) => props.children as never
    const cleanup = startClientLazy({
      routes: routesLoader(),
      islands: registry({ n: 0 }),
      islandRoot: async () => {
        rootLoads++
        return { default: Root as ComponentFn }
      },
    })
    try {
      const island = document.querySelector('pyreon-island')!
      await vi.waitFor(() => expect(island.hasAttribute('data-island-hydrated')).toBe(true))
      expect(rootLoads).toBe(1)
    } finally {
      cleanup()
    }
  })

  it('a page with no islands loads nothing, not even the islands runtime', async () => {
    serverPage('')
    // The islands runtime seeds stores first thing (`startIslands`): never
    // called means it never ran.
    const hydrateStores = vi.fn()
    g.__PYREON_HYDRATE_STORES__ = hydrateStores
    g.__PYREON_STORE_STATE__ = { cart: {} }
    const loads = { n: 0 }
    let rootLoads = 0
    const cleanup = startClientLazy({
      routes: routesLoader(),
      islands: registry(loads),
      islandRoot: async () => {
        rootLoads++
        return { default: Counter }
      },
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(loads.n).toBe(0)
    expect(rootLoads).toBe(0)
    expect(hydrateStores).not.toHaveBeenCalled()
    expect(startClientMock).not.toHaveBeenCalled()
    cleanup()
  })

  it('a marked page started without the registry says how to pass one and hydrates nothing', () => {
    serverPage(ISLAND)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cleanup = startClientLazy({ routes: routesLoader() })
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0]?.[0])).toMatch(
      /^\[Pyreon\][\s\S]*islands-only[\s\S]*virtual:pyreon\/islands-registry/,
    )
    expect(document.querySelector('pyreon-island')!.hasAttribute('data-island-hydrated')).toBe(
      false,
    )
    cleanup()
  })

  // A server island outside every client island: nothing mounts it on an
  // islands-only page (no router, no app), so it stayed on its fallback
  // forever. The islands runtime now activates it, under the base the server
  // stamped on it. One inside a client island is left to that island.
  it('activates a top-level server island under the build base, even with no client island or registry', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url)
      return Promise.resolve({ ok: true, status: 200, text: async () => '<b>live</b>' } as Response)
    })
    serverPage(
      // A `data-base` on the marker is ignored: the base comes from the build.
      '<pyreon-server-island data-name="Stamp" data-base="//evil.example" data-page="/sub/" data-sig="s"><i>fallback</i></pyreon-server-island>',
    )
    ;(globalThis as Record<string, unknown>).__ZERO_BASE__ = '/sub/'
    // The client-island runtime seeds stores first thing; never called means
    // only the small server-islands activator loaded.
    const hydrateStores = vi.fn()
    g.__PYREON_HYDRATE_STORES__ = hydrateStores
    g.__PYREON_STORE_STATE__ = { cart: {} }
    const cleanup = startClientLazy({ routes: routesLoader() })
    try {
      const marker = document.querySelector('pyreon-server-island')!
      await vi.waitFor(() => expect(marker.innerHTML).toBe('<b>live</b>'))
      expect(urls).toEqual(['/sub/_pyreon/fragment/Stamp?page=%2Fsub%2F&sig=s'])
      expect(startClientMock).not.toHaveBeenCalled()
      expect(hydrateStores).not.toHaveBeenCalled()
    } finally {
      cleanup()
      vi.unstubAllGlobals()
      delete (globalThis as Record<string, unknown>).__ZERO_BASE__
    }
  })

  it('leaves a server island INSIDE a client island to that island', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url)
      return Promise.resolve({ ok: true, status: 200, text: async () => '<b>live</b>' } as Response)
    })
    serverPage(
      '<pyreon-island data-component="Missing" data-props="{}" data-hydrate="never"><pyreon-server-island data-name="Inner"><i>f</i></pyreon-server-island></pyreon-island>',
    )
    const cleanup = startClientLazy({ routes: routesLoader(), islands: registry({ n: 0 }) })
    try {
      await new Promise((r) => setTimeout(r, 30))
      expect(urls).toEqual([])
    } finally {
      cleanup()
      vi.unstubAllGlobals()
    }
  })

  it('a cleanup called before the islands runtime arrives cancels the start', async () => {
    serverPage(ISLAND)
    const loads = { n: 0 }
    const cleanup = startClientLazy({ routes: routesLoader(), islands: registry(loads) })
    cleanup()
    await new Promise((r) => setTimeout(r, 30))
    expect(loads.n).toBe(0)
    expect(document.querySelector('pyreon-island')!.hasAttribute('data-island-hydrated')).toBe(
      false,
    )
  })
})

describe('startIslandsOnlyPage', () => {
  it('is a no-op outside a document', () => {
    const doc = globalThis.document
    vi.stubGlobal('document', undefined)
    try {
      const cleanup = startIslandsOnlyPage({ islands: registry({ n: 0 }) })
      expect(typeof cleanup).toBe('function')
      cleanup()
    } finally {
      vi.stubGlobal('document', doc)
      vi.unstubAllGlobals()
    }
  })
})

describe('startClientLazy on an app page', () => {
  it('loads the routes and the app, then starts it with every option it was given', async () => {
    serverPage('', false)
    const routes: RouteRecord[] = [{ path: '/', component: (() => null) as ComponentFn }]
    const loader = routesLoader(routes)
    const layout = (() => null) as ComponentFn
    const islands = registry({ n: 0 })
    const islandRoot = async () => ({ default: Counter })
    const cleanup = startClientLazy({ routes: loader, layout, islands, islandRoot })
    await vi.waitFor(() => expect(startClientMock).toHaveBeenCalledTimes(1))
    expect(loader).toHaveBeenCalledTimes(1)
    expect(startClientMock.mock.calls[0]![0]).toEqual({ routes, layout, islands, islandRoot })
    expect(appStop).not.toHaveBeenCalled()
    cleanup()
    expect(appStop).toHaveBeenCalledTimes(1)
  })

  it('forwards no option it was not given (exactOptionalPropertyTypes callers)', async () => {
    serverPage('', false)
    const cleanup = startClientLazy({ routes: routesLoader() })
    await vi.waitFor(() => expect(startClientMock).toHaveBeenCalledTimes(1))
    expect(Object.keys(startClientMock.mock.calls[0]![0])).toEqual(['routes'])
    cleanup()
  })

  it('a cleanup called before the app has loaded cancels the start', async () => {
    serverPage('', false)
    const loader = routesLoader()
    const cleanup = startClientLazy({ routes: loader })
    cleanup()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(startClientMock).not.toHaveBeenCalled()
    expect(appStop).not.toHaveBeenCalled()
  })

  it('reports a routes module that fails to load, and starts nothing', async () => {
    serverPage('', false)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('chunk 404')
    startClientLazy({ routes: () => Promise.reject(failure) })
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1))
    expect(error.mock.calls[0]).toEqual(['[Pyreon] Could not load the app for this page:', failure])
    expect(startClientMock).not.toHaveBeenCalled()
  })
})
