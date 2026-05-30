/**
 * Deferred-setup race guard for `useDroppable` — parallel of `useDraggable`'s
 * race test. Same Class-D shape: pdnd registration deferred to a
 * `queueMicrotask(setup)`; if the hook unmounts before the microtask fires,
 * `setup()` must bail or the registration leaks for the page lifetime.
 *
 * Also covers the normal-mount-then-unmount path so the `onCleanup` body
 * (`disposed = true; if (cleanup) cleanup()`) runs against a real `cleanup`.
 */
import { effect } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'

let dropTargetCalls = 0
let lastDropTargetCleanup: (() => void) | null = null
let cleanupCalled = 0
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: () => () => {},
  dropTargetForElements: () => {
    dropTargetCalls++
    const cleanup = () => {
      cleanupCalled++
    }
    lastDropTargetCleanup = cleanup
    return cleanup
  },
}))

const flush = () => Promise.resolve().then(() => Promise.resolve())

describe('useDroppable — deferred setup bails after unmount (Class D race guard)', () => {
  it('does NOT register pdnd when disposed before the deferred setup runs', async () => {
    const { useDroppable } = await import('../use-droppable')
    dropTargetCalls = 0
    cleanupCalled = 0

    const e = effect(() => {
      useDroppable({
        element: () => document.createElement('div'),
        canDrop: () => true,
      })
    })
    e.dispose()
    await flush()

    expect(dropTargetCalls).toBe(0)
    expect(cleanupCalled).toBe(0)
  })

  it('DOES register pdnd on a normal mount + runs cleanup on dispose', async () => {
    const { useDroppable } = await import('../use-droppable')
    dropTargetCalls = 0
    cleanupCalled = 0
    lastDropTargetCleanup = null

    const e = effect(() => {
      useDroppable({
        element: () => document.createElement('div'),
        canDrop: () => true,
      })
    })
    await flush()
    expect(dropTargetCalls).toBe(1)
    expect(lastDropTargetCleanup).not.toBeNull()

    // Dispose after setup → onCleanup body runs `disposed = true` AND
    // `if (cleanup) cleanup()`. Pre-cleanup-branch coverage was missing.
    e.dispose()
    expect(cleanupCalled).toBe(1)
  })
})
