/**
 * Regression lock — the pure-contiguous-insertion fast path in `mountFor` AND
 * its keyed-array sibling in `mountKeyedList`.
 *
 * `tryContiguousInsertion` (and `tryContiguousInsertionKeyed`) diff the old key
 * order against the new one with a common-prefix + common-suffix `===` scan —
 * the mirror of `tryContiguousRemoval`. When the new keys are exactly the old
 * keys with ONE contiguous run of new keys inserted — no removals, no survivor
 * reorder — mounting the run at its slot IS the whole update: `p + s === oldLen`
 * proves no key can be stale, so the O(n) `cache.has` pre-pass, the newKey-Set
 * build + full-cache stale scan, and the O(n) LIS walk are all skipped. This is
 * the krausest `append` op (1,000 rows onto 10,000), plus prepend and
 * middle-insert.
 *
 * The fast path produces DOM byte-identical to the general reconciler, so a
 * plain DOM assertion can't tell whether it fired. These tests install a local
 * `__pyreon_count__` sink and assert on `runtime.mountFor.insertFast` so they
 * are bisect-load-bearing: they prove the fast path (a) FIRES for contiguous
 * insertions AND produces correct DOM with LIVE reactivity, and (b) does NOT
 * fire for removals, reorders, scattered inserts, or insert-plus-remove combos
 * — which must fall through to the general path.
 *
 * Bisect-verified: making `tryContiguousInsertion` a no-op stub
 * (`return false`) flips every `insertFast === 1` spec (counter stays 0);
 * making it return `true` WITHOUT mounting the run leaves the inserted rows out
 * of the DOM → the correctness specs fail. Restored → all pass.
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

const insertFast = () => counts['runtime.mountFor.insertFast'] ?? 0
const lisOps = () => counts['runtime.mountFor.lisOps'] ?? 0

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

/** Splice `newIds` in at `at`, set, and return the new id order. */
const insertAt = (items: ReturnType<typeof signal<Item[]>>, at: number, newIds: number[]) => {
  const next = [...items()]
  next.splice(at, 0, ...newIds.map((id) => ({ id })))
  items.set(next)
  return next.map((r) => r.id)
}

describe('mountFor — pure contiguous insertion fast path', () => {
  it('APPENDS a run (the krausest append op) via the fast path, zero LIS probes', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5])
    counts = {}
    const expected = insertAt(items, 5, [6, 7, 8])
    expect(domIds(container)).toEqual(expected)
    expect(domIds(container)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(insertFast()).toBe(1)
    expect(lisOps()).toBe(0) // LIS entirely skipped
    cleanup()
  })

  it('PREPENDS a run via the fast path', () => {
    const { items, container, cleanup } = setup([4, 5, 6])
    counts = {}
    const expected = insertAt(items, 0, [1, 2, 3])
    expect(domIds(container)).toEqual(expected)
    expect(domIds(container)).toEqual([1, 2, 3, 4, 5, 6])
    expect(insertFast()).toBe(1)
    expect(lisOps()).toBe(0)
    cleanup()
  })

  it('inserts a run in the MIDDLE via the fast path', () => {
    const { items, container, cleanup } = setup([1, 2, 7, 8])
    counts = {}
    const expected = insertAt(items, 2, [3, 4, 5, 6])
    expect(domIds(container)).toEqual(expected)
    expect(domIds(container)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(insertFast()).toBe(1)
    cleanup()
  })

  it('inserts a SINGLE row via the fast path', () => {
    const { items, container, cleanup } = setup([1, 3])
    counts = {}
    const expected = insertAt(items, 1, [2])
    expect(domIds(container)).toEqual(expected)
    expect(domIds(container)).toEqual([1, 2, 3])
    expect(insertFast()).toBe(1)
    cleanup()
  })

  it('preserves survivor DOM-node identity (no re-mount, no move)', () => {
    const { items, container, cleanup } = setup([1, 2, 5, 6])
    const before = new Map(
      Array.from(container.querySelectorAll('b')).map((el) => [Number(el.textContent), el]),
    )
    counts = {}
    insertAt(items, 2, [3, 4])
    const after = new Map(
      Array.from(container.querySelectorAll('b')).map((el) => [Number(el.textContent), el]),
    )
    for (const id of [1, 2, 5, 6]) {
      expect(after.get(id)).toBe(before.get(id)) // same node object — never recreated/moved
    }
    expect(insertFast()).toBe(1)
    cleanup()
  })

  it('keeps reactivity LIVE on rows mounted through the fragment path', () => {
    // The run mounts into a DocumentFragment then moves — the mount-loop closure
    // hazard class. A signal flip on an inserted row must still patch its DOM.
    type Row = { id: number; label: ReturnType<typeof signal<string>> }
    const items = signal<Row[]>([
      { id: 1, label: signal('one') },
      { id: 2, label: signal('two') },
    ])
    const container = document.createElement('div')
    const cleanup = mount(
      () =>
        h(For, {
          each: () => items(),
          by: (r: Row) => r.id,
          children: (r: Row) => h('b', null, () => r.label()),
        }),
      container,
    )
    counts = {}
    const three = { id: 3, label: signal('three') }
    items.set([...items(), three])
    expect(insertFast()).toBe(1)
    expect(container.textContent).toBe('onetwothree')

    // Inserted row stays reactive after the fragment move…
    three.label.set('THREE')
    expect(container.textContent).toBe('onetwoTHREE')
    // …and so do the survivors.
    items()[0]!.label.set('ONE')
    expect(container.textContent).toBe('ONEtwoTHREE')
    cleanup()
  })

  it('handles multi-node (Fragment) SUFFIX anchors — run lands before the suffix first node', () => {
    const items = signal<Item[]>([1, 4].map((id) => ({ id })))
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
    next.splice(1, 0, { id: 2 }, { id: 3 }) // insert before the multi-node id-4 entry
    items.set(next)
    expect(container.textContent).toBe('s1e1s2e2s3e3s4e4')
    expect(insertFast()).toBe(1)
    cleanup()
  })

  it('refreshes pos so a SUBSEQUENT reorder after a fast-path insert is correct', () => {
    const { items, container, cleanup } = setup([1, 2, 5, 6])
    counts = {}
    insertAt(items, 2, [3, 4]) // middle insert via fast path
    expect(domIds(container)).toEqual([1, 2, 3, 4, 5, 6])
    expect(insertFast()).toBe(1)

    // Now reverse — the LIS reorder must see coherent pos values.
    counts = {}
    items.set([...items()].reverse())
    expect(domIds(container)).toEqual([6, 5, 4, 3, 2, 1])
    expect(insertFast()).toBe(0) // reorder is not an insertion
    cleanup()
  })

  it('composes with the removal fast path: insert → remove → insert, correct each time', () => {
    const { items, container, cleanup } = setup([1, 2, 3])
    counts = {}
    insertAt(items, 3, [4, 5]) // append via insertFast
    expect(domIds(container)).toEqual([1, 2, 3, 4, 5])
    const afterRemove = [...items()]
    afterRemove.splice(1, 1) // drop id 2 via removeFast
    items.set(afterRemove)
    expect(domIds(container)).toEqual([1, 3, 4, 5])
    insertAt(items, 0, [0]) // prepend via insertFast
    expect(domIds(container)).toEqual([0, 1, 3, 4, 5])
    expect(insertFast()).toBe(2)
    expect(counts['runtime.mountFor.removeFast'] ?? 0).toBe(1)
    cleanup()
  })

  it('fires onUnmount for NOTHING — no survivor or inserted row is disposed', () => {
    const unmounts: number[] = []
    const Row = defineComponent((props: { id: number }) => {
      onUnmount(() => unmounts.push(props.id))
      return h('b', null, String(props.id))
    })
    const items = signal<Item[]>([1, 2].map((id) => ({ id })))
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
    items.set([...items(), { id: 3 }])
    expect(insertFast()).toBe(1)
    expect(unmounts).toEqual([])
    cleanup()
  })
})

describe('mountFor — insertion fast path does NOT fire (fall-through gate)', () => {
  it('does NOT fire on a pure reorder (swap)', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4])
    counts = {}
    const next = [...items()]
    ;[next[1], next[2]] = [next[2]!, next[1]!]
    items.set(next)
    expect(domIds(container)).toEqual([1, 3, 2, 4])
    expect(insertFast()).toBe(0)
    cleanup()
  })

  it('does NOT fire on an insert-plus-REMOVE (grow with a dropped key)', () => {
    const { items, container, cleanup } = setup([1, 2, 3])
    counts = {}
    items.set([{ id: 1 }, { id: 3 }, { id: 4 }, { id: 5 }]) // drop 2, append 4,5
    expect(domIds(container)).toEqual([1, 3, 4, 5])
    expect(insertFast()).toBe(0)
    cleanup()
  })

  it('does NOT fire on a SCATTERED (non-contiguous) insert', () => {
    const { items, container, cleanup } = setup([1, 3, 5])
    counts = {}
    items.set([1, 2, 3, 4, 5].map((id) => ({ id }))) // inserts at TWO gaps
    expect(domIds(container)).toEqual([1, 2, 3, 4, 5])
    expect(insertFast()).toBe(0)
    cleanup()
  })

  it('does NOT fire on an insert-plus-survivor-REORDER', () => {
    const { items, container, cleanup } = setup([1, 2, 3])
    counts = {}
    items.set([{ id: 2 }, { id: 1 }, { id: 3 }, { id: 4 }]) // append 4 AND swap 1,2
    expect(domIds(container)).toEqual([2, 1, 3, 4])
    expect(insertFast()).toBe(0)
    cleanup()
  })

  it('does NOT fire on a removal (the sibling fast path owns shrinks)', () => {
    const { items, container, cleanup } = setup([1, 2, 3])
    counts = {}
    const next = [...items()]
    next.splice(1, 1)
    items.set(next)
    expect(domIds(container)).toEqual([1, 3])
    expect(insertFast()).toBe(0)
    cleanup()
  })

  it('DUPLICATE key in the run: first-wins, DOM stays uncorrupted', () => {
    // Run key duplicating a survivor is SKIPPED (mountNewForEntries semantics).
    // The dev duplicate warning fires from collectNewKeys; silence it locally.
    const warnSpy: string[] = []
    const origWarn = console.warn
    console.warn = (msg: string) => warnSpy.push(String(msg))
    try {
      const { items, container, cleanup } = setup([1, 2])
      counts = {}
      items.set([{ id: 1 }, { id: 1 }, { id: 2 }]) // dup of survivor 1 in the run
      // First occurrence wins; no double-mount, no node loss.
      expect(domIds(container)).toEqual([1, 2])
      cleanup()
    } finally {
      console.warn = origWarn
    }
  })
})

describe('mountKeyedList — keyed-array sibling fast path', () => {
  // For children returning a keyed VNode ARRAY route through mountKeyedList,
  // not mountFor — the sibling reconciler with the same inserted-run class.
  const setupKeyed = (initialIds: number[]) => {
    const items = signal<Item[]>(initialIds.map((id) => ({ id })))
    const container = document.createElement('div')
    const cleanup = mount(
      h('div', null, () => items().map((it) => h('b', { key: it.id }, String(it.id)))),
      container,
    )
    return { items, container, cleanup }
  }

  it('APPEND fires the fast path with correct DOM', () => {
    const { items, container, cleanup } = setupKeyed([1, 2, 3])
    counts = {}
    insertAt(items, 3, [4, 5])
    expect(domIds(container)).toEqual([1, 2, 3, 4, 5])
    expect(insertFast()).toBe(1)
    expect(lisOps()).toBe(0)
    cleanup()
  })

  it('PREPEND and MIDDLE insert fire the fast path with correct DOM', () => {
    const { items, container, cleanup } = setupKeyed([3, 6])
    counts = {}
    insertAt(items, 0, [1, 2]) // prepend
    expect(domIds(container)).toEqual([1, 2, 3, 6])
    insertAt(items, 3, [4, 5]) // middle
    expect(domIds(container)).toEqual([1, 2, 3, 4, 5, 6])
    expect(insertFast()).toBe(2)
    cleanup()
  })

  it('preserves survivor node identity and a SUBSEQUENT reorder stays correct', () => {
    const { items, container, cleanup } = setupKeyed([1, 4])
    const before = new Map(
      Array.from(container.querySelectorAll('b')).map((el) => [Number(el.textContent), el]),
    )
    counts = {}
    insertAt(items, 1, [2, 3])
    expect(domIds(container)).toEqual([1, 2, 3, 4])
    const after = new Map(
      Array.from(container.querySelectorAll('b')).map((el) => [Number(el.textContent), el]),
    )
    expect(after.get(1)).toBe(before.get(1))
    expect(after.get(4)).toBe(before.get(4))
    expect(insertFast()).toBe(1)

    // curPos must be coherent for the next reorder (the shared tail rebuilt it).
    items.set([...items()].reverse())
    expect(domIds(container)).toEqual([4, 3, 2, 1])
    cleanup()
  })

  it('does NOT fire on insert-plus-remove or reorder', () => {
    const { items, container, cleanup } = setupKeyed([1, 2, 3])
    counts = {}
    items.set([{ id: 3 }, { id: 1 }, { id: 2 }]) // rotate
    expect(domIds(container)).toEqual([3, 1, 2])
    items.set([{ id: 3 }, { id: 2 }, { id: 4 }, { id: 5 }]) // drop 1, append 4,5
    expect(domIds(container)).toEqual([3, 2, 4, 5])
    expect(insertFast()).toBe(0)
    cleanup()
  })
})
