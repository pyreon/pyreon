/**
 * Property-based fuzz gate for the keyed reconciler (mountFor via <For>) —
 * the runtime sibling of the compiler's fuzz-equivalence gate.
 *
 * Oracle properties after EVERY mutation:
 *   P1. DOM row order === source list order
 *   P2. Row count === list length
 *   P3. No duplicate DOM rows
 *   P4. Surviving keys keep ELEMENT IDENTITY (no spurious remount)
 *   P5. startMarker is first and tailMarker is LAST among the <For>'s nodes
 *       (marker-position integrity — see the moveEntryBefore bug below)
 *
 * This gate found the 2026-07 tailMarker-drag bug on first contact:
 * `moveEntryBefore`'s multi-node walk stopped only at registered anchors or
 * the move target — the tailMarker was neither, so moving the DOM-last row
 * (whose `nextSibling` IS the tailMarker) dragged the marker along with it.
 * A misplaced tailMarker silently corrupted every subsequent op: appended
 * rows landed at the marker's stranded position ("sort a table, then add a
 * row → it lands in the middle"), clearBetween missed rows outside the
 * marker pair, and the canSwap fast paths stopped applying. The function's
 * doc contract always said "stops at ... the tail marker" — the fuzz run
 * proved it never did.
 *
 * Deterministic (mulberry32, fixed seed range) — failures print seed + op
 * trace for exact reproduction.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Item {
  id: number
}

const OPS = [
  'append',
  'prepend',
  'insertMid',
  'removeOne',
  'removeMany',
  'shuffle',
  'reverse',
  'swap',
  'clear',
  'shrinkToFew',
  'growLarge',
  'replaceAll',
  'rotate',
] as const

describe('keyed reconciler property fuzz (mountFor)', () => {
  const SEEDS = 150
  const OPS_PER_SEED = 30

  it(`${SEEDS} seeds × ${OPS_PER_SEED} random ops hold all five oracle properties`, () => {
    let nextId = 0
    const mk = (): Item => ({ id: nextId++ })

    const applyOp = (op: string, list: Item[], rnd: () => number): Item[] => {
      const n = list.length
      switch (op) {
        case 'append':
          return [...list, mk()]
        case 'prepend':
          return [mk(), ...list]
        case 'insertMid': {
          const i = Math.floor(rnd() * (n + 1))
          const c = [...list]
          c.splice(i, 0, mk())
          return c
        }
        case 'removeOne': {
          if (!n) return list
          const i = Math.floor(rnd() * n)
          const c = [...list]
          c.splice(i, 1)
          return c
        }
        case 'removeMany':
          return list.filter(() => rnd() > 0.4)
        case 'shuffle': {
          const c = [...list]
          for (let i = c.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1))
            ;[c[i], c[j]] = [c[j]!, c[i]!]
          }
          return c
        }
        case 'reverse':
          return [...list].reverse()
        case 'swap': {
          if (n < 2) return list
          const c = [...list]
          const i = Math.floor(rnd() * n)
          let j = Math.floor(rnd() * n)
          if (i === j) j = (j + 1) % n
          ;[c[i], c[j]] = [c[j]!, c[i]!]
          return c
        }
        case 'clear':
          return []
        case 'shrinkToFew':
          return list.slice(0, Math.min(2, n))
        case 'growLarge': {
          const c = [...list]
          for (let i = 0; i < 40; i++) c.push(mk())
          return c
        }
        case 'replaceAll':
          return Array.from({ length: Math.max(1, Math.floor(rnd() * 20)) }, mk)
        case 'rotate': {
          if (n < 2) return list
          const k = 1 + Math.floor(rnd() * (n - 1))
          return [...list.slice(k), ...list.slice(0, k)]
        }
        default:
          return list
      }
    }

    const failures: string[] = []

    for (let seed = 1; seed <= SEEDS; seed++) {
      const rnd = mulberry32(seed)
      nextId = 0
      let list: Item[] = Array.from({ length: 1 + Math.floor(rnd() * 12) }, mk)
      const items = signal<Item[]>(list)
      const container = document.createElement('div')
      document.body.appendChild(container)
      const cleanup = mount(
        h(
          'ul',
          null,
          For({
            each: items,
            by: (t: Item) => t.id,
            children: (t: Item) => h('li', { 'data-id': String(t.id) }, `r${t.id}`),
          }),
        ),
        container,
      )
      const trace: string[] = []
      outer: for (let step = 0; step < OPS_PER_SEED; step++) {
        const op = OPS[Math.floor(rnd() * OPS.length)]!
        trace.push(op)
        const beforeEls = new Map<number, Element>()
        for (const li of Array.from(container.querySelectorAll('li'))) {
          beforeEls.set(Number(li.getAttribute('data-id')), li)
        }
        list = applyOp(op, list, rnd)
        items.set(list)

        const expected = list.map((t) => t.id)
        const actual = Array.from(container.querySelectorAll('li')).map((li) =>
          Number(li.getAttribute('data-id')),
        )
        // P1 + P2 + P3
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          failures.push(
            `seed=${seed} step=${step} op=${op} order [${actual.join(',')}] !== [${expected.join(',')}] (trace: ${trace.join('→')})`,
          )
          break
        }
        if (new Set(actual).size !== actual.length) {
          failures.push(`seed=${seed} step=${step} op=${op} duplicate rows`)
          break
        }
        // P4 — element identity stable for surviving keys
        for (const li of Array.from(container.querySelectorAll('li'))) {
          const id = Number(li.getAttribute('data-id'))
          const prev = beforeEls.get(id)
          if (prev && prev !== li) {
            failures.push(`seed=${seed} step=${step} op=${op} key=${id} remounted`)
            break outer
          }
        }
        // P5 — marker integrity: first node is a comment, last node is a comment.
        // Re-query the <ul> each step — the fast-clear / replace-all canSwap
        // paths legitimately REPLACE the element with a fresh clone.
        const ul = container.querySelector('ul')!
        if (ul.firstChild?.nodeType !== 8 || ul.lastChild?.nodeType !== 8) {
          failures.push(
            `seed=${seed} step=${step} op=${op} marker displaced (first=${ul.firstChild?.nodeType} last=${ul.lastChild?.nodeType}, trace: ${trace.join('→')})`,
          )
          break
        }
      }

      cleanup()
      container.remove()
      if (failures.length >= 5) break
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
})

describe('tailMarker-drag regression (minimal locks)', () => {
  function mountList(n: number) {
    const items = signal<Item[]>(Array.from({ length: n }, (_, i) => ({ id: i })))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const cleanup = mount(
      h(
        'ul',
        null,
        For({
          each: items,
          by: (t: Item) => t.id,
          children: (t: Item) => h('li', null, String(t.id)),
        }),
      ),
      container,
    )
    return { items, container, cleanup, ul: container.querySelector('ul')! }
  }

  it('LIS reverse keeps the tailMarker LAST (was dragged next to the moved last row)', () => {
    const { items, container, cleanup, ul } = mountList(12)
    items.set([...items()].reverse())
    expect(ul.lastChild?.nodeType, 'tailMarker must be the last node').toBe(8)
    cleanup()
    container.remove()
  })

  it('append after an LIS reverse lands at the END ("sort, then add a row")', () => {
    const { items, container, cleanup } = mountList(12)
    items.set([...items()].reverse())
    items.set([...items(), { id: 112 }])
    const texts = Array.from(container.querySelectorAll('li')).map((li) => li.textContent)
    expect(texts).toEqual(['11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0', '112'])
    cleanup()
    container.remove()
  })
})
