/**
 * @vitest-environment happy-dom
 *
 * Island id namespaces, client half. The server wrote `data-id-prefix` on the marker (see island-ids.test.ts);
 * hydrating the island must restore that namespace so a component's `createUniqueId()` returns the id the server
 * rendered. The page's own counter cannot do it: an island hydrates later, as a separate root, and the page's
 * hydration walk never reaches its subtree.
 */
import type { VNodeChild } from '@pyreon/core'
import { createUniqueId, h } from '@pyreon/core'
import { disableHydrationWarnings } from '@pyreon/runtime-dom'
import { hydrateIslands } from '../client'

const captured: string[] = []
const Field = (): VNodeChild => {
  const id = createUniqueId()
  captured.push(id)
  return h('div', null, h('label', { for: id }, 'x'), h('input', { id }))
}

/** The marker exactly as the server emits it for an island whose component is `Field`. */
const marker = (prefix: string | null) =>
  `<pyreon-island data-component="Field" data-props="{}" data-hydrate="load"${prefix === null ? '' : ` data-id-prefix="${prefix}"`}>` +
  `<div><label for="${prefix ?? 'pyreon-'}1">x</label><input id="${prefix ?? 'pyreon-'}1"></div></pyreon-island>`

const settle = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 10))
}

describe('island hydration restores the id namespace', () => {
  beforeAll(() => disableHydrationWarnings())
  beforeEach(() => {
    captured.length = 0
    document.body.innerHTML = ''
  })

  it('a component in an island gets the id the server rendered, whatever the page counter holds', async () => {
    // The page has already run other components on the client, so a shared counter would be well past 1 by now.
    createUniqueId()
    createUniqueId()
    createUniqueId()
    document.body.innerHTML = marker('pyreon-i2-')
    const stop = hydrateIslands({ Field: async () => ({ default: Field }) })
    await settle(() => captured.length > 0)
    expect(captured).toEqual(['pyreon-i2-1'])
    // The adopted DOM still pairs the label and the input under that id.
    expect(document.querySelector('input')!.id).toBe('pyreon-i2-1')
    expect(document.querySelector('label')!.getAttribute('for')).toBe('pyreon-i2-1')
    stop()
  })

  it('two islands each hydrate in their own namespace', async () => {
    document.body.innerHTML = marker('pyreon-i1-') + marker('pyreon-i2-')
    const stop = hydrateIslands({ Field: async () => ({ default: Field }) })
    await settle(() => captured.length >= 2)
    expect([...captured].sort()).toEqual(['pyreon-i1-1', 'pyreon-i2-1'])
    stop()
  })

  it('a marker without a prefix hydrates exactly as before (no namespace wrapper)', async () => {
    document.body.innerHTML = marker(null)
    const stop = hydrateIslands({ Field: async () => ({ default: Field }) })
    await settle(() => captured.length > 0)
    expect(captured).toHaveLength(1)
    expect(captured[0]).toMatch(/^pyreon-\d+$/)
    stop()
  })
})
