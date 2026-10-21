/**
 * Regression lock — the small-k PERMUTATION fast path in `mountFor`
 * (`trySmallKPermutation`, the krausest `swap` op).
 *
 * A same-length update whose keys differ at ≤ 8 positions, where the keys at
 * those positions are the same set before and after, adds nothing and makes
 * nothing stale. The fast path recognizes that from the differing keys alone
 * and goes straight to the small-k placement, skipping the general path's two
 * full `cache.has` passes.
 *
 * The DOM it produces is identical to the general path's, so these specs assert
 * on the `runtime.mountFor.permFast` counter as well as DOM order and row
 * identity: (a) it FIRES for swaps and small rotations with rows MOVED, not
 * rebuilt, and (b) it does NOT fire when an add or removal hides among the
 * differing positions, for duplicate keys, or past 8 differing positions —
 * those must reach the general path and still render correctly.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '../index'

interface Item {
  id: number
}

const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let counts: Record<string, number>
let prevSink: typeof g.__pyreon_count__
let prevWarn: typeof console.warn

beforeEach(() => {
  counts = {}
  prevSink = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
  prevWarn = console.warn
  console.warn = () => {}
})
afterEach(() => {
  g.__pyreon_count__ = prevSink
  console.warn = prevWarn
})

const permFast = () => counts['runtime.mountFor.permFast'] ?? 0

const setup = (initialIds: number[]) => {
  const items = signal<Item[]>(initialIds.map((id) => ({ id })))
  const container = document.createElement('div')
  const cleanup = mount(
    () =>
      h(For, {
        each: () => items(),
        by: (it: Item) => it.id,
        children: (it: Item) => h('b', null, String(it.id)),
      }),
    container,
  )
  return { items, container, cleanup }
}

const domIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('b')).map((el) => Number(el.textContent))
const nodeById = (container: HTMLElement) =>
  new Map(Array.from(container.querySelectorAll('b')).map((el) => [Number(el.textContent), el]))
const setIds = (items: ReturnType<typeof signal<Item[]>>, ids: number[]) =>
  items.set(ids.map((id) => ({ id })))

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('mountFor — small-k permutation fast path', () => {
  it('swaps two rows (the krausest swap op) by moving them', () => {
    const ids = range(20)
    const { items, container, cleanup } = setup(ids)
    const before = nodeById(container)
    counts = {}
    const next = [...ids]
    ;[next[1], next[17]] = [next[17]!, next[1]!]
    setIds(items, next)
    expect(domIds(container)).toEqual(next)
    expect(permFast()).toBe(1)
    // Same nodes, moved — not rebuilt.
    const after = nodeById(container)
    for (const id of ids) expect(after.get(id)).toBe(before.get(id))
    cleanup()
  })

  it('handles a rotation of up to 8 positions, and adjacent and edge swaps', () => {
    const { items, container, cleanup } = setup(range(12))
    for (const next of [
      [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      [12, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 2],
      [12, 4, 5, 6, 7, 8, 9, 1, 3, 10, 11, 2],
    ]) {
      counts = {}
      setIds(items, next)
      expect(domIds(container)).toEqual(next)
      expect(permFast()).toBe(1)
    }
    cleanup()
  })

  it('treats an unchanged list as a no-op', () => {
    const { items, container, cleanup } = setup(range(5))
    counts = {}
    setIds(items, range(5))
    expect(domIds(container)).toEqual(range(5))
    expect(permFast()).toBe(1)
    cleanup()
  })

  it('falls through when one differing position holds a NEW key (replace one row)', () => {
    const { items, container, cleanup } = setup(range(6))
    counts = {}
    setIds(items, [1, 2, 99, 4, 5, 6])
    expect(domIds(container)).toEqual([1, 2, 99, 4, 5, 6])
    expect(permFast()).toBe(0)
    expect(container.querySelectorAll('b').length).toBe(6)
    cleanup()
  })

  it('falls through when a swap is combined with a replaced row', () => {
    const { items, container, cleanup } = setup(range(6))
    counts = {}
    setIds(items, [2, 1, 3, 4, 77, 6])
    expect(domIds(container)).toEqual([2, 1, 3, 4, 77, 6])
    expect(permFast()).toBe(0)
    cleanup()
  })

  it('falls through when a duplicate key replaces another', () => {
    const { items, cleanup } = setup([1, 2, 3, 4])
    counts = {}
    // Position 1 now repeats key 3 and key 2 is gone: {3} vs {2} at the
    // differing position, so this is not a permutation. (Duplicate keys are
    // invalid input; what the general path renders for them is not this
    // path's contract — only that it does not claim the update.)
    setIds(items, [1, 3, 3, 4])
    expect(permFast()).toBe(0)
    cleanup()
  })

  it('falls through past 8 differing positions (a reverse) and still renders', () => {
    const { items, container, cleanup } = setup(range(20))
    counts = {}
    const rev = range(20).reverse()
    setIds(items, rev)
    expect(domIds(container)).toEqual(rev)
    expect(permFast()).toBe(0)
    cleanup()
  })

  it('keeps later reconciles correct after a fast-path swap', () => {
    const { items, container, cleanup } = setup(range(8))
    setIds(items, [1, 7, 3, 4, 5, 6, 2, 8])
    setIds(items, [1, 7, 3, 4, 5, 6, 2, 8, 9])
    setIds(items, [9, 8, 2, 6, 5, 4, 3, 7, 1])
    expect(domIds(container)).toEqual([9, 8, 2, 6, 5, 4, 3, 7, 1])
    setIds(items, [9, 2, 6])
    expect(domIds(container)).toEqual([9, 2, 6])
    cleanup()
  })
})
