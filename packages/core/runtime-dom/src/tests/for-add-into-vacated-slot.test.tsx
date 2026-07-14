/**
 * Regression lock — <For> keyed reconciler: ADDING a new key into a slot
 * vacated by a REMOVAL must place the new row at its LOGICAL position, not at
 * the physical tail.
 *
 * Bug: in the GENERAL (LIS) reconciler path, `mountNewForEntries` mounts every
 * new entry before `tailMarker` (physically at the tail) but recorded its
 * `pos` as the NEW logical index `i`. `forLisReorder` reads `entry.pos` as the
 * entry's CURRENT DOM position to decide which entries stay vs. move — so a new
 * row whose logical index sat between two survivors looked "already in order"
 * (its pos slotted between the survivors' stale pos values) and was never moved
 * off the tail. Concrete: `[1,2,3,4] → [1,5,3]` (remove 2 and 4, add 5 in the
 * middle) rendered `[1,3,5]` instead of `[1,5,3]`.
 *
 * The LIS path is taken whenever the small-k reorder bails — the dominant
 * trigger here is a LENGTH change (add + remove together), which makes
 * `n !== currentKeys.length` so `trySmallKReorder` returns false.
 *
 * Fix: new entries mounted at the tail carry a `pos` that places them AFTER
 * every survivor (whose pos ∈ [0, currentKeys.length) by the post-update
 * invariant), preserving the new rows' relative mount order. The LIS then
 * correctly identifies each new row as displaced and inserts it before its
 * logical successor.
 *
 * Bisect-verified: reverting `mountNewForEntries` to pass `i` as the pos makes
 * the middle/head/multi-add/combined specs fail with the new row(s) stranded at
 * the tail; restored, all pass.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

/** Concatenated `<id>` tokens in DOM order — an unambiguous order oracle. */
const domText = (container: HTMLElement) => container.textContent
const expected = (ids: number[]) => ids.map((id) => `<${id}>`).join('')

const setup = (initial: number[]) => {
  const items = signal<number[]>(initial)
  const container = document.createElement('div')
  const cleanup = mount(
    () =>
      h(For, {
        each: () => items(),
        by: (id: number) => id,
        children: (id: number) => h('span', null, `<${id}>`),
      }),
    container,
  )
  return { items, container, cleanup }
}

describe('mountFor — add a new key into a slot vacated by a removal (LIS path)', () => {
  it('primary repro: [1,2,3,4] → [1,5,3] places 5 in the middle', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4])
    expect(domText(container)).toBe(expected([1, 2, 3, 4]))

    items.set([1, 5, 3]) // remove 2 & 4, add 5 between 1 and 3
    expect(domText(container)).toBe(expected([1, 5, 3]))
    cleanup()
  })

  it('middle insert, survivors keep straddling pos: [1,2,3,4,5] → [1,2,7,4]', () => {
    // Survivors 1(pos0),2(pos1),4(pos3); new 7 at logical index 2. Its stale
    // pos (=2) sat strictly between 1 and 3 → the broken LIS kept it → [1,2,4,7].
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5])
    items.set([1, 2, 7, 4]) // remove 3 & 5, add 7 between 2 and 4
    expect(domText(container)).toBe(expected([1, 2, 7, 4]))
    cleanup()
  })

  it('head insert with pos-shifted survivors: [1,2,3,4,5] → [7,2,4]', () => {
    // The head survivor here is 2 (pos1), so new 7 (pos0) does NOT collide at 0
    // — the broken LIS left 7 stranded at the tail → [2,4,7].
    const { items, container, cleanup } = setup([1, 2, 3, 4, 5])
    items.set([7, 2, 4]) // remove 1,3,5; add 7 at head
    expect(domText(container)).toBe(expected([7, 2, 4]))
    cleanup()
  })

  it('add into a vacated HEAD slot (pos-0 collision path): [1,2,3,4] → [5,1,3]', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4])
    items.set([5, 1, 3]) // remove 2 & 4, add 5 at head
    expect(domText(container)).toBe(expected([5, 1, 3]))
    cleanup()
  })

  it('multiple adds interleaved among survivors: [1,2,3] → [4,1,5,3,6]', () => {
    const { items, container, cleanup } = setup([1, 2, 3])
    items.set([4, 1, 5, 3, 6]) // remove 2, add 4 (head), 5 (middle), 6 (tail)
    expect(domText(container)).toBe(expected([4, 1, 5, 3, 6]))
    cleanup()
  })

  it('adds interleaved with a survivor reorder: [1,2,3,4] → [3,5,1]', () => {
    const { items, container, cleanup } = setup([1, 2, 3, 4])
    items.set([3, 5, 1]) // remove 2 & 4, add 5, and reorder survivors 1/3
    expect(domText(container)).toBe(expected([3, 5, 1]))
    cleanup()
  })

  it('consecutive new keys land adjacent at their logical slot: [1,2] → [1,3,4,2]', () => {
    const { items, container, cleanup } = setup([1, 2])
    items.set([1, 3, 4, 2]) // add 3 & 4 between the two survivors
    expect(domText(container)).toBe(expected([1, 3, 4, 2]))
    cleanup()
  })

  it('same-length add-into-vacated (small-k path) still correct: [1,2,3] → [1,4,3]', () => {
    // n === currentKeys.length keeps the small-k reorder in play — it places
    // via survivor anchors, not pos, so it was never buggy. Lock it anyway.
    const { items, container, cleanup } = setup([1, 2, 3])
    items.set([1, 4, 3]) // remove 2, add 4 in the same middle slot
    expect(domText(container)).toBe(expected([1, 4, 3]))
    cleanup()
  })

  it('large add+remove past SMALL_K forces the LIS path with new middle keys', () => {
    // 12 survivors reversed (11 displacements > SMALL_K=8) + a removal + adds,
    // so trySmallKReorder bails on the diff count too, not only on length.
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const { items, container, cleanup } = setup(base)
    // Reverse, drop 6 & 7, and inject two brand-new keys (99, 98) mid-list.
    const next = [12, 11, 10, 99, 9, 8, 5, 98, 4, 3, 2, 1]
    items.set(next)
    expect(domText(container)).toBe(expected(next))
    cleanup()
  })

  it('empty → populated → empty edges', () => {
    const { items, container, cleanup } = setup([])
    expect(domText(container)).toBe('')

    items.set([1, 2, 3])
    expect(domText(container)).toBe(expected([1, 2, 3]))

    // Now exercise add-into-vacated from a freshly-populated list.
    items.set([1, 4, 2]) // wait: keep 1&2, add 4 between → covered by small-k
    expect(domText(container)).toBe(expected([1, 4, 2]))

    items.set([])
    expect(domText(container)).toBe('')
    cleanup()
  })
})
