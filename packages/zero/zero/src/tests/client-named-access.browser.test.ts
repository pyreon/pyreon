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
 * rendered without its data. A cross-origin frame with a matching `name`
 * passed a null-prototype check, then threw SecurityError on the first key
 * read, so the app never started. happy-dom has no named access
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

/**
 * Plant `<iframe name>` with an opaque origin (sandboxed `srcdoc`), so the
 * global of that name is a CROSS-ORIGIN WindowProxy: its prototype reads as
 * `null`, and reading any other key throws SecurityError.
 */
async function crossOriginFrame(name: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.name = name
  frame.setAttribute('sandbox', '')
  frame.srcdoc = '<p>other origin</p>'
  const loaded = new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }))
  document.body.appendChild(frame)
  planted.push(frame)
  await loaded
  const proxy = (window as unknown as Record<string, unknown>)[name] as Record<string, unknown>
  expect(proxy).toBe(frame.contentWindow)
  expect(Object.getPrototypeOf(proxy), 'the precondition: an opaque prototype').toBeNull()
  expect(() => proxy.anyKey, 'the precondition: key reads throw').toThrow()
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

it('runs the loaders when a cross-origin frame named __PYREON_LOADER_DATA__ shadows the global', async () => {
  await crossOriginFrame('__PYREON_LOADER_DATA__')
  const container = shadow([])
  const { stop, loads } = startWithLoader()
  try {
    await expect.poll(() => container.querySelector('h1')?.textContent).toBe('From the loader')
    expect(loads()).toBe(1)
  } finally {
    stop()
  }
})

it('does not hand a cross-origin frame named __PYREON_STORE_STATE__ to the store bridge', async () => {
  await crossOriginFrame('__PYREON_STORE_STATE__')
  const seen: unknown[] = []
  const g = globalThis as Record<string, unknown>
  g.__PYREON_HYDRATE_STORES__ = (d: unknown) => seen.push(d)
  try {
    const container = shadow([])
    const { stop } = startWithLoader()
    try {
      await expect.poll(() => container.querySelector('h1')?.textContent).toBe('From the loader')
      expect(seen).toEqual([])
    } finally {
      stop()
    }
  } finally {
    delete g.__PYREON_HYDRATE_STORES__
  }
})
