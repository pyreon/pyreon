/**
 * Regression lock — a hydrating `<For>` block is scanned ONCE.
 *
 * The ForSymbol branch used to walk the block's sibling chain twice: once to
 * find the matching `<!--/pyreon-for-->`, then again to parse the rows off the
 * `<!--k:KEY-->` markers. It then paid two MORE sibling reads per row —
 * `.nextSibling` for the row's first node and `.previousSibling` for its last —
 * even though a single ordered walk already holds both values. On a 1000-row
 * table that is 6 sibling-getter reads per row where 2 suffice.
 *
 * The fused walk is behaviour-preserving, so no DOM assertion can see it — the
 * observable is the traversal itself. These specs instrument `Node.prototype`'s
 * sibling getters and assert the per-row budget directly, which is the only
 * thing that distinguishes one pass from two.
 *
 * The counts are asserted as a CEILING with headroom, not a fixed number: the
 * point is "one pass, not two", and pinning an exact total would make every
 * unrelated hydration change edit this file. `previousSibling` is asserted at
 * exactly ZERO because the fused walk carries `prev` and must never re-derive
 * it — that is the sharpest single signal that the second pass is gone.
 *
 * Bisect-verified against `origin/main`'s two-pass parse: `scans the block
 * once` fails with `expected 1204 to be less than 800` and `never re-derives a
 * row's last node` fails with `expected 200 to be +0`. Restored, all four
 * pass (604 and 0). The behavioural specs in
 * `hydrate-for-adoption.test.tsx` (identity, keys, bail paths) are unchanged
 * and stay green throughout — which is why this file exists: they cannot see
 * the difference.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hydrateRoot } from '../index'

// ─── Sibling-getter census ───────────────────────────────────────────────────
// Patched on the prototype so it observes the runtime's own reads. Counting is
// gated by `on` so only the hydrate call is measured, and the descriptors are
// restored in afterEach — a leaked patch would tax every later suite.
type Getter = () => unknown
const PATCHED = ['nextSibling', 'previousSibling'] as const
let counts: Record<string, number> = {}
let on = false
let originals: { name: string; desc: PropertyDescriptor }[] = []

beforeEach(() => {
  counts = {}
  on = false
  originals = []
  const proto = Node.prototype as unknown as object
  for (const name of PATCHED) {
    const desc = Object.getOwnPropertyDescriptor(proto, name)
    if (!desc?.get) continue
    originals.push({ name, desc })
    const orig = desc.get as Getter
    Object.defineProperty(proto, name, {
      configurable: true,
      get(this: unknown) {
        if (on) counts[name] = (counts[name] ?? 0) + 1
        return orig.call(this)
      },
    })
  }
})
afterEach(() => {
  for (const { name, desc } of originals) {
    Object.defineProperty(Node.prototype as unknown as object, name, desc)
  }
  document.body.innerHTML = ''
})

interface Row {
  id: number
  label: ReturnType<typeof signal<string>>
}
const mk = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, label: signal(`L${i + 1}`) }))

const app = (rows: () => Row[]) =>
  h(
    'div',
    null,
    h(For, {
      each: () => rows(),
      by: (r: Row) => r.id,
      children: (r: Row) => h('b', null, () => r.label()),
    }),
  )

const ROWS = 200

async function hydrateRows(rows: Row[]): Promise<{ host: HTMLElement }> {
  const html = await renderToString(app(() => rows))
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  on = true
  hydrateRoot(host, app(() => rows))
  on = false
  return { host }
}

describe('hydrating <For> — the block is parsed in a single pass', () => {
  it('scans the block once, not twice', async () => {
    const { host } = await hydrateRows(mk(ROWS))
    expect(host.querySelectorAll('b').length).toBe(ROWS)
    // Measured on this fixture: 1204 (6.0/row) with the two-pass parse, 604
    // (3.0/row) with the fused one. 4/row sits between them with headroom on
    // both sides — tight enough that a reintroduced second pass cannot fit,
    // loose enough that an unrelated per-row read does not have to edit it.
    expect(counts['nextSibling'] ?? 0).toBeLessThan(ROWS * 4)
  })

  it('never re-derives a row’s last node with previousSibling', async () => {
    await hydrateRows(mk(ROWS))
    expect(counts['previousSibling'] ?? 0).toBe(0)
  })

  it('adopts every row — the fused walk did not cost adoption', async () => {
    const rows = mk(ROWS)
    const html = await renderToString(app(() => rows))
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const first = host.querySelector('b') as Element
    const all = host.querySelectorAll('b')
    const last = all[all.length - 1] as Element
    hydrateRoot(host, app(() => rows))
    // Node IDENTITY is the adoption proof: a swap would replace these.
    expect(host.querySelector('b')).toBe(first)
    const after = host.querySelectorAll('b')
    expect(after[after.length - 1]).toBe(last)
    expect(after.length).toBe(ROWS)
    rows[5]?.label.set('live')
    expect((host.querySelectorAll('b')[5] as Element).textContent).toBe('live')
  })

  it('still bails on an EMPTY row range rather than adopting a bad block', async () => {
    const rows = mk(3)
    const html = await renderToString(app(() => rows))
    // Splice out one row's content, leaving its k: marker adjacent to the next
    // marker — the empty-row shape the parse must reject. The fused walk sets
    // parseOk=false and keeps scanning for `end`; bailing early there would
    // lose the block entirely instead of falling back to the swap.
    const broken = html.replace(/<!--k:2--><b>[^<]*<\/b>/, '<!--k:2-->')
    const host = document.createElement('div')
    host.innerHTML = broken
    document.body.appendChild(host)
    hydrateRoot(host, app(() => rows))
    // Swap semantics: a correct 3-row list is still rendered.
    expect(host.querySelectorAll('b').length).toBe(3)
    expect(host.querySelectorAll('b')[2]?.textContent).toBe('L3')
  })
})
