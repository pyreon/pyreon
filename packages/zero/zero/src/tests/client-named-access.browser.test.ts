import { h } from '@pyreon/core'
import { useLoaderData } from '@pyreon/router'
import { afterEach, expect, it } from 'vitest'
import { startClient } from '../client'

/**
 * Window named access (#4765), real Chromium: markup with `id="X"` makes the
 * global `X` resolve to that element when no script assigned it. Nothing is
 * assigned here; the elements alone shadow the hand-over globals, as on a page
 * whose inline scripts were not written. An element taken for
 * `__PYREON_LOADER_DATA__` used to skip the initial loader run, so the page
 * rendered without its data. happy-dom has no named access
 * (`client-named-access.test.ts` assigns the element instead).
 */
const planted: Element[] = []

afterEach(() => {
  for (const el of planted.splice(0)) el.remove()
})

it('the named-access precondition holds here', () => {
  const probe = document.createElement('div')
  probe.id = '__probe_named_access__'
  document.body.appendChild(probe)
  planted.push(probe)
  expect((window as unknown as Record<string, unknown>).__probe_named_access__).toBe(probe)
})

/** Plant `<div id>` for each name; named access does the rest. */
function shadow(names: string[]): HTMLElement {
  for (const id of names) {
    const el = document.createElement('div')
    el.id = id
    document.body.appendChild(el)
    planted.push(el)
    expect((window as unknown as Record<string, unknown>)[id]).toBe(el)
  }
  const container = document.createElement('div')
  container.id = 'app'
  document.body.appendChild(container)
  planted.push(container)
  return container
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
