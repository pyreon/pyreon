import { effect, signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'

// Container-registration leak — the sibling of the F3 per-item leak, but for
// the CONTAINER. `useSortable`'s `containerRef` registers three teardowns per
// element (auto-scroll + reorder drop-target + a `keydown` listener). Before
// this fix the null/re-register path was a pure no-op: `containerRef(null)`
// (fired on unmount) disposed nothing, and `containerRef(el2)` after
// `containerRef(el1)` pushed THREE MORE registrations without disposing el1's.
//
// Realistic trigger: a collapsible board whose `<ul ref={containerRef}>` sits
// behind a `<Show>` while `useSortable` lives in the parent — every expand
// mounts a fresh `<ul>` and re-fires `containerRef`, every collapse fires
// `containerRef(null)`. Pre-fix, each toggle leaked the auto-scroll + drop-
// target + keydown listener on the now-detached element until the WHOLE
// sortable unmounted.
//
// pdnd is module-mocked so each container registration returns a tracked spy;
// the keydown listener is tracked via a real `removeEventListener` spy.

const autoScrollCleanups: Array<ReturnType<typeof vi.fn>> = []
const dropTargetCleanups: Array<ReturnType<typeof vi.fn>> = []

vi.mock('@atlaskit/pragmatic-drag-and-drop/combine', () => ({
  combine: (..._fns: Array<() => void>) => () => {},
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: () => () => {},
  dropTargetForElements: () => {
    const cleanup = vi.fn()
    dropTargetCleanups.push(cleanup)
    return cleanup
  },
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({
  autoScrollForElements: () => {
    const cleanup = vi.fn()
    autoScrollCleanups.push(cleanup)
    return cleanup
  },
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge', () => ({
  attachClosestEdge: (data: unknown) => data,
  extractClosestEdge: () => null,
}))

describe('useSortable — container registration disposal (leak sibling of F3)', () => {
  it('disposes container auto-scroll + drop-target + keydown on containerRef(null)', async () => {
    const { useSortable } = await import('../use-sortable')
    autoScrollCleanups.length = 0
    dropTargetCleanups.length = 0

    const items = signal([{ id: '1' }])
    const { containerRef } = useSortable({ items, by: (i) => i.id, onReorder: () => {} })

    const el = document.createElement('ul')
    const removeSpy = vi.spyOn(el, 'removeEventListener')

    containerRef(el)
    expect(autoScrollCleanups).toHaveLength(1)
    expect(dropTargetCleanups).toHaveLength(1)
    expect(autoScrollCleanups[0]).not.toHaveBeenCalled()
    expect(dropTargetCleanups[0]).not.toHaveBeenCalled()

    // Unmount (ref(null)) MUST dispose the container's registrations + remove
    // the keydown listener. Pre-fix the null branch was a pure no-op → leak.
    containerRef(null)
    expect(autoScrollCleanups[0]).toHaveBeenCalledTimes(1)
    expect(dropTargetCleanups[0]).toHaveBeenCalledTimes(1)
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))

    removeSpy.mockRestore()
  })

  it('disposes the prior container registration when re-registered with a new element', async () => {
    const { useSortable } = await import('../use-sortable')
    autoScrollCleanups.length = 0
    dropTargetCleanups.length = 0

    const items = signal([{ id: '1' }])
    const { containerRef } = useSortable({ items, by: (i) => i.id, onReorder: () => {} })

    const el1 = document.createElement('ul')
    const remove1 = vi.spyOn(el1, 'removeEventListener')
    containerRef(el1)
    expect(autoScrollCleanups).toHaveLength(1)

    // Re-register with a NEW element — the first element's registrations must
    // be disposed (not left dangling on the detached node).
    const el2 = document.createElement('ul')
    containerRef(el2)
    expect(autoScrollCleanups).toHaveLength(2)
    expect(autoScrollCleanups[0]).toHaveBeenCalledTimes(1) // el1's disposed
    expect(dropTargetCleanups[0]).toHaveBeenCalledTimes(1)
    expect(remove1).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(autoScrollCleanups[1]).not.toHaveBeenCalled() // el2's still live

    remove1.mockRestore()
  })

  it('no accumulation under Show-toggle churn — every registration is disposed exactly once', async () => {
    const { useSortable } = await import('../use-sortable')
    autoScrollCleanups.length = 0
    dropTargetCleanups.length = 0

    const items = signal([{ id: '1' }])
    const { containerRef } = useSortable({ items, by: (i) => i.id, onReorder: () => {} })

    // 100 expand/collapse cycles: each expand registers, each collapse disposes.
    for (let i = 0; i < 100; i++) {
      containerRef(document.createElement('ul'))
      containerRef(null)
    }

    expect(autoScrollCleanups).toHaveLength(100)
    expect(dropTargetCleanups).toHaveLength(100)
    for (const c of autoScrollCleanups) expect(c).toHaveBeenCalledTimes(1)
    for (const c of dropTargetCleanups) expect(c).toHaveBeenCalledTimes(1)
  })

  it('component onCleanup drains a live container registration (no double-dispose)', async () => {
    const { useSortable } = await import('../use-sortable')
    autoScrollCleanups.length = 0
    dropTargetCleanups.length = 0

    let containerRefFn: ((el: HTMLElement | null) => void) | null = null
    const owner = effect(() => {
      const items = signal([{ id: '1' }])
      const s = useSortable({ items, by: (i) => i.id, onReorder: () => {} })
      containerRefFn = s.containerRef
    })

    containerRefFn!(document.createElement('ul'))
    expect(autoScrollCleanups[0]).not.toHaveBeenCalled()

    // Dispose the owner without a prior containerRef(null): onCleanup must
    // dispose the live container registration exactly once.
    owner.dispose()
    expect(autoScrollCleanups[0]).toHaveBeenCalledTimes(1)
    expect(dropTargetCleanups[0]).toHaveBeenCalledTimes(1)
  })
})
