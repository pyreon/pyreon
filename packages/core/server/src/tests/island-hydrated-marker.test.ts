/**
 * @vitest-environment happy-dom
 */

import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { hydrateIslands } from '../client'

// A hydrated island carries `data-island-hydrated` so tests and devtools can
// wait for "this island is live" (a static page never sets
// `data-pyreon-hydrated`). Failed islands carry `data-island-error` instead
// and must NOT carry the hydrated marker.

/** Poll until the island settles (hydrated or errored), up to 1s. */
async function settle(el: HTMLElement): Promise<void> {
  const deadline = Date.now() + 1000
  while (
    !el.hasAttribute('data-island-hydrated') &&
    !el.hasAttribute('data-island-error') &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('hydrateIslands — data-island-hydrated marker', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    delete (window as unknown as Record<string, unknown>).__pyreon_island_hydrate_active__
  })

  test('a successfully hydrated island carries data-island-hydrated', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Marked" data-hydrate="load" data-props="{}"></pyreon-island>'
    const el = query(document, 'pyreon-island')

    const Comp: ComponentFn = () => h('button', null, 'live')
    const cleanup = hydrateIslands({
      Marked: () => Promise.resolve({ default: Comp }),
    })
    await settle(el)
    expect(el.hasAttribute('data-island-error')).toBe(false)
    expect(el.hasAttribute('data-island-hydrated')).toBe(true)
    cleanup()
  })

  test('a failing island (loader rejects) does NOT carry data-island-hydrated and carries data-island-error', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Broken" data-hydrate="load" data-props="{}"></pyreon-island>'
    const el = query(document, 'pyreon-island')

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cleanup = hydrateIslands({
      Broken: () => Promise.reject(new Error('boom')),
    })
    await settle(el)
    expect(el.getAttribute('data-island-error')).toBe('hydration-failed')
    expect(el.hasAttribute('data-island-hydrated')).toBe(false)
    errorSpy.mockRestore()
    cleanup()
  })
})
