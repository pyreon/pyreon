import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { afterEach, expect, it } from 'vitest'
import { startClient } from '../client'

/**
 * Window named access (#4765), real Chromium: markup with `id="X"` makes the
 * global `X` resolve to that element when no script assigned it. Nothing is
 * assigned here (no `@pyreon/store` bridge, no inline state scripts); the
 * elements alone shadow the hand-over globals. The store bridge used to be
 * called because it was truthy: "hydrateStores is not a function". happy-dom
 * has no named access (`client.test.ts` assigns the elements instead).
 */
const ids = ['__PYREON_LOADER_DATA__', '__PYREON_HYDRATE_STORES__', '__PYREON_STORE_STATE__']
const planted: Element[] = []

afterEach(() => {
  for (const el of planted.splice(0)) el.remove()
})

it('page markup that shadows the hand-over globals does not break startClient', () => {
  for (const id of ids) {
    const el = document.createElement('div')
    el.id = id
    document.body.appendChild(el)
    planted.push(el)
  }
  expect((window as unknown as Record<string, unknown>).__PYREON_HYDRATE_STORES__).toBeInstanceOf(HTMLDivElement)
  const container = document.createElement('div')
  container.id = 'app'
  document.body.appendChild(container)
  planted.push(container)
  const App: ComponentFn = () => h('p', null, 'app')
  let cleanup: (() => void) | undefined
  expect(() => {
    cleanup = startClient({ App, routes: [{ path: window.location.pathname, component: App }] })
  }).not.toThrow()
  expect(container.textContent).toBe('app')
  cleanup?.()
})
