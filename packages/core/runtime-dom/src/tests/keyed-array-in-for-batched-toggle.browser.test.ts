import { For, h } from '@pyreon/core'
import type { ForProps, VNode } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

// Regression — same closure-captured-parent bug class as the For-of-Show
// fix in #776, but exercising the SIBLING reactive entry point
// `mountKeyedList` (the inline reactive keyed array shape).
//
// **Bug class (recap from #776):** any reactive mount loop that captures
// `parent` in its setup closure breaks when a containing reconciler
// creates the subtree in a `DocumentFragment` and then moves it via
// `liveParent.insertBefore(frag, tailMarker)`. The markers move with
// the fragment contents; the captured `parent` becomes a stale
// reference to the now-empty fragment. Next signal flip → throw +
// child-loss.
//
// **`mountKeyedList`'s exposure**: three sites in `nodes.ts:mountKeyedList`
// use closure-captured `parent`:
//   1. `parent.insertBefore(anchor, tailMarker)` in mountNewEntries
//   2. `mountVNode(vnode, parent, tailMarker)` immediately after
//   3. `keyedListReorder(..., parent, tailMarker)` → applyKeyedMoves
//      → moveEntryBefore → `parent.insertBefore(node, before)`
//
// All three run inside the `effect(() => ...)` body, so any post-setup
// move of the markers (via a containing mountFor's frag-then-move) plus
// a subsequent signal-driven re-run (mount new entries OR reorder)
// throws NotFoundError.
//
// **Trigger requires the keyed array to land DIRECTLY in the For's
// fragment** (no wrapping Element). The cleanest shape: For children
// returns a function `(i) => () => signal().map(...)` — mountFor's
// renderInto calls `mountChild(fn, frag, before)`, mountChild's
// function branch samples the result, sees a keyed array, and creates
// `mountKeyedList(fn, frag, before, ...)`. Now `parent === frag` in
// the closure, and the bug fires identically to the For-of-Show case.
// A `<div>`-wrapped keyed array would NOT trigger the bug — the div
// is the element parent, isolating mountKeyedList from the frag move.

describe('mountKeyedList: inline keyed array as direct For child under batched signal additions', () => {
  it('sanity: top-level inline keyed array handles add/reorder cycles correctly', async () => {
    // No For wrapper — mountKeyedList is the top-level reconciler.
    // Should always work — no frag-then-move pressure on the captured parent.
    const items = signal<{ id: number }[]>([{ id: 0 }])
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { id: 'root' },
        () => items().map((v) => h('span', { key: v.id, 'data-id': String(v.id) }, String(v.id))),
      ),
    )
    await flush()
    expect(container.querySelectorAll('span[data-id]')).toHaveLength(1)

    items.set([{ id: 0 }, { id: 1 }, { id: 2 }])
    await flush()
    expect(container.querySelectorAll('span[data-id]')).toHaveLength(3)

    // Reorder — exercises mountKeyedList's keyedListReorder path
    items.set([{ id: 2 }, { id: 0 }, { id: 1 }])
    await flush()
    expect(container.querySelectorAll('span[data-id]')).toHaveLength(3)

    items.set([])
    await flush()
    expect(container.querySelectorAll('span[data-id]')).toHaveLength(0)
    unmount()
  })

  it('CONTRACT: <For> + DIRECT keyed-array function child does not throw NotFoundError or lose children', async () => {
    // 10 For rows. Each row's children function returns a FUNCTION
    // `() => signal().map(...)` directly — NOT wrapped in a `<div>`.
    // mountFor's renderInto then calls `mountChild(fn, frag, before)`,
    // mountChild creates `mountKeyedList(fn, frag, before, ...)` —
    // capturing the For's DocumentFragment as `parent`. Once the frag
    // moves to the live parent, the closure-captured `parent` is stale.
    //
    // The initial signal value MUST be a non-empty keyed array for
    // `isKeyedArray(sample)` (mount.ts) to route into mountKeyedList;
    // an empty initial array would route into mountReactive instead
    // (already covered by the For-of-Show fix in #776). Each row starts
    // with one item so we land on mountKeyedList, then we grow each
    // row's array — mountKeyedList's mountNewEntries calls
    // `parent.insertBefore(anchor, tailMarker)` which throws against
    // the stale frag unless the live-parent fix is applied.
    const itemSignals = Array.from({ length: 10 }, (_, rowIdx) =>
      signal<{ id: number }[]>([{ id: rowIdx * 100 }]),
    )
    const indices = Array.from({ length: 10 }, (_, i) => i)

    // Cast: ForProps.children narrows to `(item: T) => VNode | NativeItem`,
    // but the runtime ALSO accepts a function return (mount.ts's mountChild
    // function branch handles it). This shape is exactly what triggers
    // mountKeyedList with frag-as-parent — the public type doesn't expose
    // it, so we cast through an explicit ForProps<number> shape.
    const forProps: ForProps<number> = {
      each: indices,
      by: (i: number) => i,
      // children returns a FUNCTION (not a VNode). That function returns
      // a keyed array — mountChild's function branch routes it to
      // mountKeyedList with frag as parent.
      children: ((rowIdx: number) =>
        () =>
          (itemSignals[rowIdx] as ReturnType<typeof signal<{ id: number }[]>>)().map((v) =>
            h('span', { key: v.id, 'data-rowitem': `${rowIdx}-${v.id}` }, String(v.id)),
          )) as unknown as (item: number) => VNode,
    }
    const { container, unmount } = mountInBrowser(
      h('div', { id: 'root' }, For(forProps)),
    )
    await flush()
    try {
      // Sanity: one item per row at mount, 10 total.
      expect(container.querySelectorAll('span[data-rowitem]')).toHaveLength(10)

      // Grow every row's array to 5 items each — 10 rows × 5 = 50.
      // Bug fires HERE on EVERY row: mountKeyedList's mountNewEntries
      // calls `parent.insertBefore(anchor, tailMarker)` against the
      // stale frag captured at the For's initial mount.
      for (let r = 0; r < 10; r++) {
        const s = itemSignals[r] as ReturnType<typeof signal<{ id: number }[]>>
        s.set([0, 1, 2, 3, 4].map((id) => ({ id: r * 100 + id })))
      }
      await flush()

      expect(container.querySelectorAll('span[data-rowitem]')).toHaveLength(50)

      // Reorder one row — exercises mountKeyedList's reorder path
      // (keyedListReorder → applyKeyedMoves → moveEntryBefore → stale
      // `parent.insertBefore(startNode, before)`). All items must remain.
      const s0 = itemSignals[0] as ReturnType<typeof signal<{ id: number }[]>>
      s0.set([4, 0, 2, 1, 3].map((id) => ({ id: id })))
      await flush()
      expect(container.querySelectorAll('span[data-rowitem]')).toHaveLength(50)
    } finally {
      unmount()
    }
  })
})
