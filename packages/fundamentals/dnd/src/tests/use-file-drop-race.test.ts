/**
 * Deferred-setup race guard for `useFileDrop` — parallel of `useDraggable`'s
 * race test. Same Class-D shape: pdnd external-adapter registration deferred
 * to a `queueMicrotask(setup)`; if the hook unmounts before the microtask
 * fires, `setup()` must bail or the registration leaks.
 *
 * Also exercises the normal-mount-then-unmount path so the cleanup loop
 * (`for (const fn of cleanups) fn()`) AND the `onCleanup` body
 * (`disposed = true; if (cleanup) cleanup()`) run against real registrations.
 */
import { effect } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'

let dropTargetCalls = 0
let monitorCalls = 0
let cleanupCalled = 0
vi.mock('@atlaskit/pragmatic-drag-and-drop/external/adapter', () => ({
  dropTargetForExternal: () => {
    dropTargetCalls++
    return () => {
      cleanupCalled++
    }
  },
  monitorForExternal: () => {
    monitorCalls++
    return () => {
      cleanupCalled++
    }
  },
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/external/file', () => ({
  containsFiles: () => true,
  getFiles: () => [],
}))

const flush = () => Promise.resolve().then(() => Promise.resolve())

describe('useFileDrop — deferred setup bails after unmount (Class D race guard)', () => {
  it('does NOT register pdnd when disposed before the deferred setup runs', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    dropTargetCalls = 0
    monitorCalls = 0
    cleanupCalled = 0

    const e = effect(() => {
      useFileDrop({
        element: () => document.createElement('div'),
        onDrop: () => {},
      })
    })
    e.dispose()
    await flush()

    expect(dropTargetCalls).toBe(0)
    expect(monitorCalls).toBe(0)
    expect(cleanupCalled).toBe(0)
  })

  it('DOES register pdnd on a normal mount + runs cleanup loop on dispose', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    dropTargetCalls = 0
    monitorCalls = 0
    cleanupCalled = 0

    const e = effect(() => {
      useFileDrop({
        element: () => document.createElement('div'),
        onDrop: () => {},
      })
    })
    await flush()
    expect(dropTargetCalls).toBe(1)
    expect(monitorCalls).toBe(1)

    e.dispose()
    // Both the dropTarget cleanup AND the monitor cleanup ran via the
    // `for (const fn of cleanups) fn()` loop — pre-test, that loop body
    // was uncovered.
    expect(cleanupCalled).toBe(2)
  })
})
