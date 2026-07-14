/**
 * Regression lock — the pure-contiguous-removal fast path in `mountFor`.
 *
 * `tryContiguousRemoval` diffs `currentKeys` against `newKeys` with a
 * common-prefix + common-suffix `===` scan (mirroring Solid's `mapArray` fast
 * path). When `newKeys` is exactly `currentKeys` with a single contiguous run
 * deleted — no adds, no survivor reorder — it unmounts just the removed rows and
 * skips the general path's per-key `cache.has` probe, full-cache stale `Set`
 * scan, and all-stay LIS entirely. This is the krausest `remove` op (delete one
 * middle row from a full list).
 *
 * The fast path produces DOM byte-identical to the general reconciler, so a
 * plain DOM assertion can't tell whether it fired. These tests install a local
 * `__pyreon_count__` sink and assert on `runtime.mountFor.removeFast` so they
 * are bisect-load-bearing: they prove the fast path (a) FIRES for contiguous
 * removals AND produces correct DOM, and (b) does NOT fire for reorders, adds,
 * or scattered removals — which must fall through to the general path.
 *
 * Bisect-verified: making `tryContiguousRemoval` a no-op stub (`return false`)
 * flips every `removeFast === 1` spec (counter stays 0) — the fast path is dead;
 * making it return `true` WITHOUT removing the run leaves the deleted row in the
 * DOM → the correctness specs fail. Restored → all pass.
 */
import { defineComponent, For, Fragment, h, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '../index'

interface Item {
  id: number
}

// ─── Local counter sink (no @pyreon/perf-harness dep) ────────────────────────
const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let counts: Record<string, number>
let prevSink: typeof g.__pyreon_count__

beforeEach(() => {
  counts = {}
  prevSink = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
})
afterEach(() => {
  g.__pyreon_count__ = prevSink
})

const removeFast = () => counts['runtime.mountFor.removeFast'] ?? 0
const lisOps = () => counts['runtime.mountFor.lisOps'] ?? 0
const cleanupCount = () => counts['runtime.cleanup'] ?? 0

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

/** Ids rendered in DOM order. */
const domIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('b')).map((el) => Number(el.textContent))

/** Splice `count` items starting at `at`, set, and return the new id order. */
const removeAt = (items: ReturnType<typeof signal<Item[]>>, at: number, count = 1) => {
  const next = [...items()]
  next.splice(at, count)
  items.set(next)
  return next.map((r) => r.id)
}

describe('mountFor — pure contiguous removal fast path', () => {
  it('removes one MIDDLE row (the krausest remove op) via the fast path', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    counts = {}
    const expected = removeAt(items, 4) // drop id 5
    expect(domIds(container)).toEqual(expected)
    expect(domIds(container)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10])
    expect(removeFast()).toBe(1)
    expect(lisOps()).toBe(0) // LIS entirely skipped
    cleanup()
  })

  it('removes the FIRST row via the fast path', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5])
    counts = {}
    const expected = removeAt(items, 0)
    expect(domIds(container)).toEqual(expected)
    expect(domIds(container)).toEqual([2, 3, 4, 5])
    expect(removeFast()).toBe(1)
    cleanup()
  })

  it('removes the LAST row via the fast path', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5])
    counts = {}
    const expected = removeAt(items, 4)
    expect(domIds(container)).toEqual(expected)
    expect(domIds(container)).toEqual([1, 2, 3, 4])
    expect(removeFast()).toBe(1)
    cleanup()
  })

  it('removes a contiguous BLOCK of adjacent rows via the fast path', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    counts = {}
    const expected = removeAt(items, 3, 4) // drop ids 4,5,6,7
    expect(domIds(container)).toEqual(expected)
    expect(domIds(container)).toEqual([1, 2, 3, 8, 9, 10])
    expect(removeFast()).toBe(1)
    cleanup()
  })

  it('preserves survivor DOM-node identity (no re-mount, no move)', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5])
    const before = new Map(
      Array.from(container.querySelectorAll('b')).map((el) => [Number(el.textContent), el]),
    )
    counts = {}
    removeAt(items, 2) // drop id 3
    const after = new Map(
      Array.from(container.querySelectorAll('b')).map((el) => [Number(el.textContent), el]),
    )
    for (const id of [1, 2, 4, 5]) {
      expect(after.get(id)).toBe(before.get(id)) // same node object — never recreated/moved
    }
    expect(removeFast()).toBe(1)
    cleanup()
  })

  it('fires cleanup EXACTLY once for the removed row, zero for survivors', () => {
    const unmounts: number[] = []
    // A defineComponent row establishes a setup scope so onUnmount is honored
    // (a bare For-child callback is not a component setup frame).
    const Row = defineComponent((props: { id: number }) => {
      onUnmount(() => unmounts.push(props.id))
      return h('b', null, String(props.id))
    })
    const items = signal<Item[]>([1, 2, 3, 4, 5].map((id) => ({ id })))
    const container = document.createElement('div')
    const cleanup = mount(
      () =>
        h(For, {
          each: () => items(),
          by: (it: Item) => it.id,
          children: (it: Item) => h(Row, { id: it.id }),
        }),
      container,
    )
    counts = {}
    removeAt(items, 2) // drop id 3
    expect(unmounts).toEqual([3]) // only the removed row's scope is disposed
    expect(cleanupCount()).toBe(1) // one runtime.cleanup for the removed row
    expect(removeFast()).toBe(1)
    cleanup()
  })

  it('handles multi-node (Fragment) entries — the whole range is removed', () => {
    const items = signal<Item[]>([1, 2, 3, 4].map((id) => ({ id })))
    const container = document.createElement('div')
    const cleanup = mount(
      () =>
        h(For, {
          each: () => items(),
          by: (it: Item) => it.id,
          children: (it: Item) =>
            h(Fragment, null, h('span', null, `s${it.id}`), h('em', null, `e${it.id}`)),
        }),
      container,
    )
    counts = {}
    const next = [...items()]
    next.splice(1, 1) // drop id 2 (a 2-node entry)
    items.set(next)
    expect(container.textContent).toBe('s1e1s3e3s4e4')
    expect(removeFast()).toBe(1)
    cleanup()
  })

  it('refreshes pos so a SUBSEQUENT reorder after a fast-path removal is correct', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5, 6, 7, 8])
    counts = {}
    removeAt(items, 4) // drop id 5 → [1,2,3,4,6,7,8] via fast path
    expect(domIds(container)).toEqual([1, 2, 3, 4, 6, 7, 8])
    expect(removeFast()).toBe(1)

    // Now reverse the survivors — the LIS reorder must see coherent pos values.
    counts = {}
    const reversed = [...items()].reverse()
    items.set(reversed)
    expect(domIds(container)).toEqual([8, 7, 6, 4, 3, 2, 1])
    expect(removeFast()).toBe(0) // reorder is not a removal
    cleanup()
  })

  it('handles repeated sequential removals, staying correct each time', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5, 6])
    counts = {}
    removeAt(items, 2) // drop 3 → [1,2,4,5,6]
    expect(domIds(container)).toEqual([1, 2, 4, 5, 6])
    removeAt(items, 0) // drop 1 → [2,4,5,6]
    expect(domIds(container)).toEqual([2, 4, 5, 6])
    removeAt(items, 3) // drop 6 → [2,4,5]
    expect(domIds(container)).toEqual([2, 4, 5])
    expect(removeFast()).toBe(3) // all three took the fast path
    cleanup()
  })
})

describe('mountFor — removal fast path does NOT fire (fall-through gate)', () => {
  it('does NOT fire on a pure reorder (swap)', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5])
    counts = {}
    const next = [...items()]
    ;[next[1], next[3]] = [next[3]!, next[1]!] // swap positions 1 and 3
    items.set(next)
    expect(domIds(container)).toEqual([1, 4, 3, 2, 5])
    expect(removeFast()).toBe(0)
    cleanup()
  })

  it('does NOT fire on a remove-plus-ADD (same length, key set changed)', () => {
    const { items, container, cleanup } = setup([1, 2, 3])
    counts = {}
    items.set([{ id: 1 }, { id: 3 }, { id: 4 }]) // drop 2, append 4
    expect(domIds(container)).toEqual([1, 3, 4])
    expect(removeFast()).toBe(0)
    cleanup()
  })

  it('does NOT fire on a shrink that also ADDS (net removal but new key present)', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4])
    counts = {}
    items.set([{ id: 1 }, { id: 3 }, { id: 5 }]) // drop 2 and 4, append 5
    expect(domIds(container)).toEqual([1, 3, 5])
    expect(removeFast()).toBe(0)
    cleanup()
  })

  it('does NOT fire on a SCATTERED (non-contiguous) removal', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5, 6])
    counts = {}
    items.set([{ id: 1 }, { id: 3 }, { id: 4 }, { id: 6 }]) // drop 2 and 5
    expect(domIds(container)).toEqual([1, 3, 4, 6])
    expect(removeFast()).toBe(0)
    cleanup()
  })

  it('does NOT fire on a remove-plus-REORDER of survivors', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4])
    counts = {}
    // drop id 2, and reverse the tail 3,4 → survivors are NOT in old order
    items.set([{ id: 1 }, { id: 4 }, { id: 3 }])
    expect(domIds(container)).toEqual([1, 4, 3])
    expect(removeFast()).toBe(0)
    cleanup()
  })
})
