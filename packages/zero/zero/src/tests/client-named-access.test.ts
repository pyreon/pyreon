/**
 * @vitest-environment happy-dom
 *
 * Window named access (#4765). In a browser, markup with `id="X"` makes the
 * global `X` resolve to that element when no script assigned it. On a page
 * whose inline `__PYREON_LOADER_DATA__` script was not written (an SPA shell, a
 * page with no loaders), an element with that id was taken for server loader
 * data: `startClient` skipped the initial loader run and the page rendered
 * without its data.
 *
 * happy-dom has no named access, so the global gets what a browser's would
 * return. `client-named-access.browser.test.ts` is the real-Chromium proof.
 * Real router and real `hydrateLoaderData`: no mocks.
 */
import { h } from '@pyreon/core'
import { useLoaderData } from '@pyreon/router'
import { afterEach, expect, it } from 'vitest'
import { startClient } from '../client'

const ids = ['__PYREON_LOADER_DATA__', '__PYREON_HYDRATE_STORES__', '__PYREON_STORE_STATE__']
const g = globalThis as Record<string, unknown>

afterEach(() => {
  for (const id of ids) delete g[id]
  document.body.innerHTML = ''
})

/** Plant `<div id>` for each name, and give the global what named access would. */
function shadow(names: string[]): HTMLElement {
  document.body.innerHTML = `<div id="app"></div>${names.map((id) => `<div id="${id}"></div>`).join('')}`
  for (const id of names) g[id] = document.getElementById(id)
  return document.getElementById('app')!
}

function startWithLoader(): { stop: () => void; loads: () => number } {
  let loads = 0
  const stop = startClient({
    routes: [
      {
        path: window.location.pathname,
        loader: async () => {
          loads++
          return { title: 'From the loader' }
        },
        component: () => h('h1', null, () => useLoaderData<{ title: string }>()()?.title ?? 'Loading'),
      },
    ],
  })
  return { stop, loads: () => loads }
}

it('runs the loaders when page markup shadows __PYREON_LOADER_DATA__ with an element', async () => {
  const container = shadow(['__PYREON_LOADER_DATA__'])
  const { stop, loads } = startWithLoader()
  try {
    await expect.poll(() => container.querySelector('h1')?.textContent).toBe('From the loader')
    expect(loads()).toBe(1)
  } finally {
    stop()
  }
})

it('does not call a store bridge that page markup shadows', async () => {
  const container = shadow(['__PYREON_HYDRATE_STORES__', '__PYREON_STORE_STATE__'])
  const { stop } = startWithLoader()
  try {
    await expect.poll(() => container.querySelector('h1')?.textContent).toBe('From the loader')
  } finally {
    stop()
  }
})
