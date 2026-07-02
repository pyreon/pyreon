/**
 * Regression lock — entry-range moves for MULTI-NODE list entries.
 *
 * `moveEntryBefore` moves an entry's exact `[anchor..end]` node range using
 * the `end` node captured at mount (ForEntry.end / KeyedEntry.end). This
 * replaced the module-level `WeakSet<Node>` anchor registries whose grown
 * backing tables were retained forever (the entire retained-heap delta vs
 * Solid on the 10k-row bench — V8 never shrinks a WeakSet's table).
 *
 * The load-bearing behavior: an entry whose content is MULTIPLE root nodes
 * (fragment / multi-root component) must move ALL of its nodes together on
 * reorder — both through the small-k path (≤8 displacements) and the LIS
 * path (large reorders). A broken range walk moves only the anchor and
 * interleaves the survivors.
 *
 * Bisect-verified: reverting `moveEntryBefore`'s multi-node branch to a
 * single-node insertBefore makes every reorder spec here fail with
 * interleaved pair content; restored, all pass.
 */
import { For, Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

interface Item {
  id: number
}

/** Concatenated text of `container` children in DOM order. */
const domText = (container: HTMLElement) => container.textContent

/** Assert each id's span+em pair is adjacent and in list order. */
const expectedText = (ids: number[]) => ids.map((id) => `s${id}e${id}`).join('')

describe('mountFor — multi-node entry range moves', () => {
  const setup = (initial: Item[]) => {
    const items = signal<Item[]>(initial)
    const container = document.createElement('div')
    const cleanup = mount(
      () =>
        h(For, { each: () => items(), by: (it: Item) => it.id }, (it: Item) =>
          h(Fragment, null, h('span', null, `s${it.id}`), h('em', null, `e${it.id}`)),
        ),
      container,
    )
    return { items, container, cleanup }
  }

  it('swap (small-k path) keeps each entry’s node pair together', () => {
    const ids = [1, 2, 3, 4, 5]
    const { items, container, cleanup } = setup(ids.map((id) => ({ id })))
    expect(domText(container)).toBe(expectedText(ids))

    // krausest-style swap: exchange positions 1 and 3 (2 displacements → small-k)
    const swapped = [1, 4, 3, 2, 5]
    items.set(swapped.map((id) => ({ id })))
    expect(domText(container)).toBe(expectedText(swapped))
    cleanup()
  })

  it('full reverse (LIS path) keeps each entry’s node pair together', () => {
    // 24 rows → 23 displacements on reverse, well past SMALL_K (8)
    const ids = Array.from({ length: 24 }, (_, i) => i + 1)
    const { items, container, cleanup } = setup(ids.map((id) => ({ id })))
    expect(domText(container)).toBe(expectedText(ids))

    const reversed = [...ids].reverse()
    items.set(reversed.map((id) => ({ id })))
    expect(domText(container)).toBe(expectedText(reversed))
    cleanup()
  })

  it('mixed single-node and multi-node entries reorder correctly', () => {
    const items = signal<Item[]>([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
    const container = document.createElement('div')
    // Odd ids render ONE node (end === null fast path), even ids render TWO.
    const cleanup = mount(
      () =>
        h(For, { each: () => items(), by: (it: Item) => it.id }, (it: Item) =>
          it.id % 2 === 1
            ? h('b', null, `s${it.id}e${it.id}`)
            : h(Fragment, null, h('span', null, `s${it.id}`), h('em', null, `e${it.id}`)),
        ),
      container,
    )
    expect(domText(container)).toBe(expectedText([1, 2, 3, 4]))

    items.set([{ id: 4 }, { id: 3 }, { id: 2 }, { id: 1 }])
    expect(domText(container)).toBe(expectedText([4, 3, 2, 1]))
    cleanup()
  })

  it('reorder after an incremental append still moves full ranges', () => {
    const { items, container, cleanup } = setup([{ id: 1 }, { id: 2 }])
    // Append (new entries mount through handleIncrementalUpdate → renderInto)
    items.set([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
    expect(domText(container)).toBe(expectedText([1, 2, 3, 4]))
    // Then reorder — the appended entries' `end` capture must be correct too
    items.set([{ id: 3 }, { id: 1 }, { id: 4 }, { id: 2 }])
    expect(domText(container)).toBe(expectedText([3, 1, 4, 2]))
    cleanup()
  })
})

describe('mountKeyedList — multi-node entry range moves', () => {
  it('keyed VNode[] entries with fragment content keep their nodes together on reorder', () => {
    const ids = signal([1, 2, 3, 4, 5])
    const container = document.createElement('div')
    // A reactive accessor returning keyed vnodes routes through mountKeyedList.
    const cleanup = mount(
      () => () =>
        ids().map((id) =>
          h(Fragment, { key: id } as never, h('span', null, `s${id}`), h('em', null, `e${id}`)),
        ),
      container,
    )
    expect(domText(container)).toBe(expectedText([1, 2, 3, 4, 5]))

    ids.set([5, 4, 3, 2, 1])
    expect(domText(container)).toBe(expectedText([5, 4, 3, 2, 1]))

    ids.set([3, 5, 1, 4, 2])
    expect(domText(container)).toBe(expectedText([3, 5, 1, 4, 2]))
    cleanup()
  })
})
