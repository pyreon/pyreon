/**
 * Island id namespaces, server half.
 *
 * An island's subtree is hydrated later as a SEPARATE root, so it cannot take its ids from the page's counter and
 * still agree with the client: the page's walk never reaches it. Each island therefore renders inside an id
 * namespace of its own (`pyreon-iK-…`), written to `data-id-prefix` so the client can restore the same one.
 */
import type { VNodeChild } from '@pyreon/core'
import { createUniqueId, h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { island } from '../island'

const Field = (): VNodeChild => {
  const id = createUniqueId()
  return h('div', null, h('label', { for: id }, 'x'), h('input', { id }))
}
const makeIsland = (name: string) => island(async () => ({ default: Field }), { name, hydrate: 'load' })
const idsIn = (html: string) => [...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]!)

describe('island() id namespaces (server)', () => {
  it('numbers islands in document order, each in its own namespace', async () => {
    const A = makeIsland('A')
    const B = makeIsland('B')
    const html = await renderToString(h('main', null, h(A, null), h(B, null)))
    expect(html).toContain('data-id-prefix="pyreon-i1-"')
    expect(html).toContain('data-id-prefix="pyreon-i2-"')
    expect(idsIn(html)).toEqual(['pyreon-i1-1', 'pyreon-i2-1'])
  })

  it('does not advance the page counter, and ids stay unique across namespaces', async () => {
    const A = makeIsland('A')
    const html = await renderToString(h('main', null, h(Field, null), h(A, null), h(Field, null)))
    // The page's own fields count 1, 2 — the island between them took none of the page's numbers.
    expect(idsIn(html)).toEqual(['pyreon-1', 'pyreon-i1-1', 'pyreon-2'])
    expect(new Set(idsIn(html)).size).toBe(3)
  })

  it('takes the ordinal in document order even when a later chunk resolves first', async () => {
    const slow = island(
      () => new Promise<{ default: typeof Field }>((r) => setTimeout(() => r({ default: Field }), 25)),
      { name: 'Slow', hydrate: 'load' },
    )
    const fast = makeIsland('Fast')
    const html = await renderToString(h('main', null, h(slow, null), h(fast, null)))
    expect(html.indexOf('data-component="Slow"')).toBeLessThan(html.indexOf('data-component="Fast"'))
    // Slow comes first in the document, so it is island 1 even though Fast's chunk resolved earlier.
    expect(html).toMatch(/data-component="Slow"[^>]*data-id-prefix="pyreon-i1-"/)
    expect(html).toMatch(/data-component="Fast"[^>]*data-id-prefix="pyreon-i2-"/)
  })

  it('every request starts its islands at 1 again', async () => {
    const A = makeIsland('A')
    const first = await renderToString(h(A, null))
    const second = await renderToString(h(A, null))
    expect(second).toBe(first)
    expect(second).toContain('data-id-prefix="pyreon-i1-"')
  })
})
