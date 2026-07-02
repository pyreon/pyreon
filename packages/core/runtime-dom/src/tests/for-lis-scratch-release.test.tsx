/**
 * Regression lock — mountFor's LIS scratch must RELEASE ForEntry references
 * after each reorder (Class-H retention, leak-class audit 2026-07).
 *
 * The bug shape: `forLisReorder` fills the per-<For> `lis.entries[0..n)`
 * scratch with ForEntry references (each pinning its `anchor` DOM subtree +
 * `cleanup` closure → disposer → signal subscriber links). The scratch was
 * never cleared, and later reorders only overwrite `[0..newN)` — so a large
 * reorder followed by a SHRINK (10k rows filtered down to 50) left the stale
 * tail pinning every removed row's DOM for the <For>'s remaining lifetime.
 *
 * Invisible to the heap-slope leak-sweep: its shuffle journeys run at
 * CONSTANT list size, so the scratch is fully overwritten every pass. The
 * failure mode needs reorder-at-large-N → shrink → stay mounted.
 *
 * GC-observable proof: WeakRefs on removed rows' DOM elements must clear
 * after the shrink. Requires `--expose-gc` (wired via the package vitest
 * config's overrides); skips when unavailable rather than flaking.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

const hasGc = typeof globalThis.gc === 'function'

async function collectGarbage(): Promise<void> {
  // Two passes with a macrotask between them — finalization of DOM-shaped
  // object graphs can need a second sweep after the first pass clears the
  // retaining edges.
  globalThis.gc!()
  await new Promise((r) => setTimeout(r, 0))
  globalThis.gc!()
}

describe.skipIf(!hasGc)('mountFor LIS scratch release (Class-H retention)', () => {
  it('removed rows become GC-eligible after reorder-then-shrink while the <For> stays mounted', async () => {
    interface Item {
      id: number
    }
    const N = 64 // must exceed SMALL_K (8) displacements so the LIS path runs
    const items = signal<Item[]>(Array.from({ length: N }, (_, i) => ({ id: i })))

    const container = document.createElement('div')
    document.body.appendChild(container)
    const cleanup = mount(
      h(
        'ul',
        null,
        For({
          each: items,
          by: (t: Item) => t.id,
          children: (t: Item) => h('li', { 'data-id': String(t.id) }, `row-${t.id}`),
        }),
      ),
      container,
    )

    expect(container.querySelectorAll('li').length).toBe(N)

    // 1. Large reorder (full reverse — every position displaced) → the LIS
    //    path fills lis.entries[0..N) with ForEntry refs.
    items.update((list) => [...list].reverse())
    expect(container.querySelectorAll('li').length).toBe(N)

    // 2. WeakRefs on rows that the shrink will REMOVE (ids 2..N-1).
    const refs: WeakRef<Element>[] = []
    for (const li of Array.from(container.querySelectorAll('li'))) {
      const id = Number(li.getAttribute('data-id'))
      if (id >= 2) refs.push(new WeakRef(li))
    }
    expect(refs.length).toBe(N - 2)

    // 3. Shrink to 2 rows — the <For> stays mounted.
    items.set([{ id: 0 }, { id: 1 }])
    expect(container.querySelectorAll('li').length).toBe(2)

    // 4. The removed rows must be collectable. Pre-fix, the stale scratch
    //    tail [2..N) pinned every one of them (deref() stayed live).
    await collectGarbage()
    const alive = refs.filter((r) => r.deref() !== undefined).length
    expect(alive, `${alive}/${refs.length} removed rows still pinned by the LIS scratch`).toBe(0)

    cleanup()
    container.remove()
  })

  it('control: rows removed WITHOUT a prior large reorder are GC-eligible (no-scratch path)', async () => {
    interface Item {
      id: number
    }
    const items = signal<Item[]>(Array.from({ length: 16 }, (_, i) => ({ id: i })))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const cleanup = mount(
      h(
        'ul',
        null,
        For({
          each: items,
          by: (t: Item) => t.id,
          children: (t: Item) => h('li', null, `row-${t.id}`),
        }),
      ),
      container,
    )

    const refs = Array.from(container.querySelectorAll('li'))
      .slice(2)
      .map((li) => new WeakRef(li))
    items.set([{ id: 0 }, { id: 1 }])
    await collectGarbage()
    expect(refs.filter((r) => r.deref() !== undefined).length).toBe(0)

    cleanup()
    container.remove()
  })
})
