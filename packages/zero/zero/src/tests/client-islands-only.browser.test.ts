/**
 * Islands-only pages in real Chromium (#4371): on a page the server marked
 * `<meta name="pyreon-hydrate" content="islands">`, `startClient` /
 * `startClientLazy` hydrate the `<pyreon-island>` elements and start nothing
 * else: no router (so no `popstate` listener on `window`), no routes module
 * (the lazy loader is never called), no hydration of `#app`.
 */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createContext, h, provide, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { onHydrationMismatch } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startClient } from '../client'
import { startClientLazy } from '../client-lazy'

const Theme = createContext('none')

const Counter: ComponentFn = () => {
  const count = signal(0)
  return h(
    'button',
    { 'data-testid': 'counter', type: 'button', onClick: () => count.set(count() + 1) },
    () => `${useContext(Theme)}:${count()}`,
  )
}

function ThemeRoot(props: { children?: VNodeChild }) {
  provide(Theme, 'dark')
  return props.children ?? null
}

const registry = (loads: { n: number }) => ({
  __pyreonIslandRegistry: {
    Counter: async () => {
      loads.n++
      return { default: Counter }
    },
  },
  __pyreonIslandsEnabled: true,
})

let marker: HTMLMetaElement
let container: HTMLElement
let popstateListeners = 0
const realAdd = window.addEventListener.bind(window)

function serverPage(islandHtml: string): void {
  marker = document.createElement('meta')
  marker.name = 'pyreon-hydrate'
  marker.content = 'islands'
  document.head.appendChild(marker)
  container = document.createElement('div')
  container.id = 'app'
  container.innerHTML = `<main><h1>Static page</h1>${islandHtml}</main>`
  document.body.appendChild(container)
}

const ISLAND = (text: string) =>
  `<pyreon-island data-component="Counter" data-props="{}" data-hydrate="load"><button data-testid="counter" type="button">${text}</button></pyreon-island>`

beforeEach(() => {
  popstateListeners = 0
  vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, ...rest: unknown[]) => {
    if (type === 'popstate') popstateListeners++
    return (realAdd as (...a: unknown[]) => void)(type, ...rest)
  }) as typeof window.addEventListener)
})

afterEach(() => {
  vi.restoreAllMocks()
  container?.remove()
  marker?.remove()
})

describe('islands-only page', () => {
  it('startClientLazy hydrates the island, adopts its server HTML, and never loads the app', async () => {
    serverPage(ISLAND('dark:0'))
    const serverButton = container.querySelector('[data-testid="counter"]')
    const mismatches: unknown[] = []
    const off = onHydrationMismatch((ctx) => mismatches.push(ctx))
    const loads = { n: 0 }
    let routesLoads = 0
    const cleanup = startClientLazy({
      routes: async () => {
        routesLoads++
        return { routes: [] }
      },
      islands: registry(loads),
      islandRoot: async () => ({ default: ThemeRoot }),
    })
    try {
      const island = container.querySelector('pyreon-island')!
      await expect.poll(() => island.hasAttribute('data-island-hydrated')).toBe(true)
      const button = container.querySelector<HTMLButtonElement>('[data-testid="counter"]')!
      expect(button).toBe(serverButton)
      button.click()
      await expect.poll(() => button.textContent).toBe('dark:1')
      expect(mismatches).toEqual([])
      expect(loads.n).toBe(1)
      expect(routesLoads).toBe(0)
      expect(popstateListeners).toBe(0)
      expect(container.hasAttribute('data-pyreon-hydrated')).toBe(false)
    } finally {
      off()
      cleanup()
    }
  })

  it('startClient (static routes) does the same: islands only, no router', async () => {
    serverPage(ISLAND('none:0'))
    const loads = { n: 0 }
    let pageRenders = 0
    const cleanup = startClient({
      routes: [
        { path: window.location.pathname, component: () => (pageRenders++, h('main', null)) },
      ],
      islands: registry(loads),
    })
    try {
      const island = container.querySelector('pyreon-island')!
      await expect.poll(() => island.hasAttribute('data-island-hydrated')).toBe(true)
      const button = container.querySelector<HTMLButtonElement>('[data-testid="counter"]')!
      button.click()
      await expect.poll(() => button.textContent).toBe('none:1')
      expect(pageRenders).toBe(0)
      expect(popstateListeners).toBe(0)
    } finally {
      cleanup()
    }
  })

  it('a page with no islands loads nothing: neither the registry entries nor the root', async () => {
    serverPage('')
    const loads = { n: 0 }
    let rootLoads = 0
    const cleanup = startClientLazy({
      routes: async () => ({ routes: [] }),
      islands: registry(loads),
      islandRoot: async () => {
        rootLoads++
        return { default: ThemeRoot }
      },
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(loads.n).toBe(0)
    expect(rootLoads).toBe(0)
    expect(popstateListeners).toBe(0)
    cleanup()
  })

  it('a marked page with no islands registry says how to pass one', async () => {
    serverPage(ISLAND('none:0'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cleanup = startClient({ routes: [] })
    await expect.poll(() => error.mock.calls.length).toBeGreaterThan(0)
    expect(String(error.mock.calls[0]?.[0])).toMatch(
      /\[Pyreon\][\s\S]*virtual:pyreon\/islands-registry/,
    )
    expect(popstateListeners).toBe(0)
    cleanup()
  })

  it('an unmarked page still starts the app (startClientLazy loads the routes)', async () => {
    container = document.createElement('div')
    container.id = 'app'
    document.body.appendChild(container)
    let routesLoads = 0
    const cleanup = startClientLazy({
      routes: async () => {
        routesLoads++
        return {
          routes: [
            { path: window.location.pathname, component: () => h('p', { id: 'app-page' }, 'app') },
          ],
        }
      },
    })
    try {
      await expect.poll(() => container.querySelector('#app-page')?.textContent).toBe('app')
      expect(routesLoads).toBe(1)
      expect(popstateListeners).toBeGreaterThan(0)
    } finally {
      cleanup()
    }
  })
})
