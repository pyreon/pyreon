/**
 * Regression lock — the owns-parent bulk CLEAR and full-REPLACE branches in
 * `mountFor` (`handleFastClear` / `handleReplaceAll`) and the clear branch's
 * keyed-array sibling in `mountKeyedList`.
 *
 * When the For's markers are the parent's FIRST and LAST children, the For
 * owns every child of that parent, so a clear / full-replace wipes the block
 * IN PLACE with ONE native `replaceChildren(...)` call instead of a per-node
 * walk. The branch previously used a cloneNode(false) + replaceChild parent
 * SWAP — measured ~20µs/1000-rows faster on-CPU in real Chromium (2026-08-17,
 * bench-clearprofile.ts interleaved A/B) but it REPLACED the parent element,
 * silently dropping the parent's expando-delegated handlers (`__ev_*`), refs,
 * and direct listeners (cloneNode copies none of those). Correctness wins;
 * the delta sits inside the fair bench's 100µs timer quantum.
 *
 * These specs lock BOTH halves:
 *   (a) branch selection via the `runtime.mountFor.clearFast` /
 *       `runtime.mountFor.replaceFast` counters (the DOM is byte-identical
 *       across branches, so only the counter proves which one ran), and
 *   (b) the NEW parent-identity guarantee — the parent element (and its
 *       listeners/expandos) survives a clear and a full replace.
 *
 * Bisect-verified: reverting handleFastClear/handleReplaceAll to the
 * cloneNode+replaceChild swap fails every parent-identity spec (the parent is
 * a different node afterwards, and its direct listener is gone) AND the
 * counter specs (counters never fire); restored → all pass.
 */
import { For, h } from '@pyreon/core'
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

const clearFast = () => counts['runtime.mountFor.clearFast'] ?? 0
const replaceFast = () => counts['runtime.mountFor.replaceFast'] ?? 0
const cleanupFires = () => counts['runtime.cleanup'] ?? 0

/** For as the SOLE child of a <ul> — the owns-parent shape. */
const setupOwned = (initialIds: number[]) => {
  const items = signal<Item[]>(initialIds.map((id) => ({ id })))
  const container = document.createElement('div')
  const cleanup = mount(
    () =>
      h(
        'ul',
        null,
        h(For, {
          each: () => items(),
          by: (it: Item) => it.id,
          children: (it: Item) => h('li', null, String(it.id)),
        }),
      ),
    container,
  )
  const ul = container.querySelector('ul') as HTMLUListElement
  return { items, container, cleanup, ul }
}

/** For sharing its parent with a static sibling — owns-parent is FALSE. */
const setupShared = (initialIds: number[]) => {
  const items = signal<Item[]>(initialIds.map((id) => ({ id })))
  const container = document.createElement('div')
  const cleanup = mount(
    () =>
      h(
        'ul',
        null,
        h('li', { class: 'static' }, 'header'),
        h(For, {
          each: () => items(),
          by: (it: Item) => it.id,
          children: (it: Item) => h('li', null, String(it.id)),
        }),
      ),
    container,
  )
  const ul = container.querySelector('ul') as HTMLUListElement
  return { items, container, cleanup, ul }
}

const domIds = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('li:not(.static)')).map((el) => Number(el.textContent))

describe('mountFor — owns-parent bulk clear (handleFastClear)', () => {
  it('CLEAR fires the fast branch, empties the DOM, and tears every row down', () => {
    const { items, container, cleanup, ul } = setupOwned([1, 2, 3, 4, 5])
    expect(domIds(container)).toEqual([1, 2, 3, 4, 5])
    counts = {}
    items.set([])
    expect(domIds(container)).toEqual([])
    expect(clearFast()).toBe(1)
    expect(cleanupFires()).toBe(5) // every row's cleanup ran (leak-class B guard)
    // Markers survived in place: a subsequent render lands inside the same <ul>.
    items.set([7, 8].map((id) => ({ id })))
    expect(domIds(container)).toEqual([7, 8])
    expect(container.querySelector('ul')).toBe(ul)
    cleanup()
  })

  it('CLEAR preserves the parent element IDENTITY, its listeners and expandos', () => {
    const { items, container, cleanup, ul } = setupOwned([1, 2, 3])
    let clicks = 0
    ul.addEventListener('click', () => clicks++)
    ;(ul as HTMLUListElement & { __expando?: string }).__expando = 'kept'
    counts = {}
    items.set([])
    const after = container.querySelector('ul') as HTMLUListElement
    expect(after).toBe(ul) // the swap-based branch replaced the node — this is the fix
    expect((after as HTMLUListElement & { __expando?: string }).__expando).toBe('kept')
    after.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicks).toBe(1)
    expect(clearFast()).toBe(1)
    cleanup()
  })

  it('CLEAR with a sibling in the parent falls back (no counter) and keeps the sibling', () => {
    const { items, container, cleanup, ul } = setupShared([1, 2, 3])
    counts = {}
    items.set([])
    expect(domIds(container)).toEqual([])
    expect(ul.querySelector('li.static')?.textContent).toBe('header')
    expect(clearFast()).toBe(0)
    cleanup()
  })

  it('unmount after a fast clear removes the markers cleanly', () => {
    const { items, cleanup, ul } = setupOwned([1, 2])
    items.set([])
    cleanup() // unmounts the whole tree — the <ul> detaches with it
    expect(ul.childNodes.length).toBe(0) // both markers removed by the For dispose
  })
})

describe('mountFor — owns-parent full replace (handleReplaceAll)', () => {
  it('REPLACE (no surviving key) fires the fast branch with correct DOM + teardown', () => {
    const { items, container, cleanup } = setupOwned([1, 2, 3])
    counts = {}
    items.set([10, 11, 12, 13].map((id) => ({ id })))
    expect(domIds(container)).toEqual([10, 11, 12, 13])
    expect(replaceFast()).toBe(1)
    expect(cleanupFires()).toBe(3) // the 3 old rows tore down
    cleanup()
  })

  it('REPLACE preserves the parent element identity and its listeners', () => {
    const { items, container, cleanup, ul } = setupOwned([1, 2, 3])
    let clicks = 0
    ul.addEventListener('click', () => clicks++)
    counts = {}
    items.set([10, 11].map((id) => ({ id })))
    const after = container.querySelector('ul') as HTMLUListElement
    expect(after).toBe(ul)
    after.dispatchEvent(new Event('click', { bubbles: true }))
    expect(clicks).toBe(1)
    expect(replaceFast()).toBe(1)
    cleanup()
  })

  it('REPLACE with a sibling falls back (no counter), sibling intact', () => {
    const { items, container, cleanup, ul } = setupShared([1, 2])
    counts = {}
    items.set([10, 11].map((id) => ({ id })))
    expect(domIds(container)).toEqual([10, 11])
    expect(ul.querySelector('li.static')?.textContent).toBe('header')
    expect(replaceFast()).toBe(0)
    cleanup()
  })

  it('REPLACE does not fire when ANY key survives (incremental path owns it)', () => {
    const { items, container, cleanup } = setupOwned([1, 2, 3])
    counts = {}
    items.set([3, 10, 11].map((id) => ({ id })))
    expect(domIds(container)).toEqual([3, 10, 11])
    expect(replaceFast()).toBe(0)
    cleanup()
  })

  it('incremental updates keep working after a fast replace (pos bookkeeping intact)', () => {
    const { items, container, cleanup } = setupOwned([1, 2, 3])
    items.set([10, 11, 12, 13].map((id) => ({ id })))
    // contiguous removal on the REPLACED list — exercises entry.pos recorded by
    // the fast replace's renderInto
    items.set([10, 12, 13].map((id) => ({ id })))
    expect(domIds(container)).toEqual([10, 12, 13])
    // and a reorder
    items.set([13, 12, 10].map((id) => ({ id })))
    expect(domIds(container)).toEqual([13, 12, 10])
    cleanup()
  })
})

describe('mountKeyedList — owns-parent bulk clear (keyed-array sibling)', () => {
  const setupKeyed = (initialIds: number[]) => {
    const items = signal<Item[]>(initialIds.map((id) => ({ id })))
    const container = document.createElement('div')
    const cleanup = mount(
      h('div', null, () => items().map((it) => h('b', { key: it.id }, String(it.id)))),
      container,
    )
    const host = container.querySelector('div') as HTMLDivElement
    return { items, container, cleanup, host }
  }

  const keyedIds = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('b')).map((el) => Number(el.textContent))

  it('CLEAR fires the fast branch, empties the DOM, parent identity preserved', () => {
    const { items, container, cleanup, host } = setupKeyed([1, 2, 3])
    expect(keyedIds(container)).toEqual([1, 2, 3])
    counts = {}
    items.set([])
    expect(keyedIds(container)).toEqual([])
    expect(clearFast()).toBe(1)
    expect(container.querySelector('div')).toBe(host)
    // list is functional after the clear
    items.set([5, 6].map((id) => ({ id })))
    expect(keyedIds(container)).toEqual([5, 6])
    cleanup()
  })
})
