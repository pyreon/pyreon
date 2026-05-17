import { signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'

// F3 — useSortable per-item registration leak.
//
// pdnd is mocked here so the test isolates ONE thing: that useSortable
// disposes each item's `combine(...)` cleanup on unmount (ref called with
// `null`) and on re-register of the same key — instead of pushing every
// registration onto a shared array drained only when the WHOLE sortable
// unmounts. The real pdnd uses document-level listeners + a registry, so
// there is no robust per-element DOM observable; mocking `combine` to
// return a tracked spy is the deterministic, version-agnostic proxy.
//
// Scoped to its own file: vi.mock is module-global, and the rest of the
// dnd suite needs the real pdnd.

const combineCleanups: Array<ReturnType<typeof vi.fn>> = []

vi.mock('@atlaskit/pragmatic-drag-and-drop/combine', () => ({
  combine: (..._fns: Array<() => void>) => {
    const cleanup = vi.fn()
    combineCleanups.push(cleanup)
    return cleanup
  },
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: () => () => {},
  dropTargetForElements: () => () => {},
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({
  autoScrollForElements: () => () => {},
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge', () => ({
  attachClosestEdge: (data: unknown) => data,
  extractClosestEdge: () => null,
}))

describe('useSortable — per-item registration disposal (F3 leak)', () => {
  it('disposes the item cleanup on unmount and on re-register; no accumulation under churn', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal([{ id: '1' }])
    const { itemRef } = useSortable({ items, by: (i) => i.id, onReorder: () => {} })

    combineCleanups.length = 0

    const ref = itemRef('1')
    ref(document.createElement('div'))
    expect(combineCleanups).toHaveLength(1)
    expect(combineCleanups[0]).not.toHaveBeenCalled()

    // Unmount (ref(null)) MUST run that registration's cleanup. Pre-fix
    // the null branch was a no-op → cleanup never ran → leak.
    ref(null)
    expect(combineCleanups[0]).toHaveBeenCalledTimes(1)

    // Re-register the SAME key with a new element: a fresh registration,
    // and the prior one stays disposed (not double-registered).
    itemRef('1')(document.createElement('div'))
    expect(combineCleanups).toHaveLength(2)
    expect(combineCleanups[1]).not.toHaveBeenCalled()
    ;(itemRef('1') as (el: HTMLElement | null) => void)(null)
    expect(combineCleanups[1]).toHaveBeenCalledTimes(1)

    // Churn: 200 register/unmount cycles. Every registration's cleanup
    // must have been called exactly once — the live set never
    // accumulates dead registrations.
    const base = combineCleanups.length
    for (let i = 0; i < 200; i++) {
      const r = itemRef(`k${i}`)
      r(document.createElement('div'))
      r(null)
    }
    const churned = combineCleanups.slice(base)
    expect(churned).toHaveLength(200)
    for (const c of churned) expect(c).toHaveBeenCalledTimes(1)
  })
})
