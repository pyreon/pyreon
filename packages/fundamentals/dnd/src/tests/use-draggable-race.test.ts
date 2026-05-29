/**
 * Deferred-setup race guard — `useDraggable` / `useDroppable` / `useFileDrop`.
 *
 * These hooks defer their pdnd registration to a `queueMicrotask(setup)` (so
 * the element ref is populated). `onCleanup` is registered synchronously at
 * call time. If the hook unmounts BEFORE the microtask runs (fast `<Show>` /
 * conditional toggle, keyed-list churn), `onCleanup` fired with `cleanup`
 * still undefined (a no-op) — then the microtask ran `setup()` and registered
 * pdnd anyway. That registration is created AFTER cleanup already ran, so it
 * (and its document-level listeners) leaks for the page lifetime.
 *
 * The fix: a `disposed` flag set in `onCleanup`; `setup()` bails if disposed.
 *
 * Harness: `onCleanup` binds to the active effect's cleanup collector, so the
 * hook is run inside `effect(() => …)`. `effect.dispose()` synchronously runs
 * that collector (→ `disposed = true`) BEFORE the queued microtask, giving a
 * deterministic "unmount before deferred setup" reproduction. Bisect: revert
 * the `if (disposed) return` guard → `setup()` registers pdnd post-dispose
 * (`draggableCalls` 1 instead of 0).
 *
 * pdnd is module-mocked (own file — vi.mock is global) so the registration is
 * a deterministic, version-agnostic spy.
 */
import { effect } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'

let draggableCalls = 0
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: () => {
    draggableCalls++
    return () => {}
  },
  dropTargetForElements: () => () => {},
}))

const flush = () => Promise.resolve().then(() => Promise.resolve())

describe('useDraggable — deferred setup bails after unmount (Class D race guard)', () => {
  it('does NOT register pdnd when disposed before the deferred setup runs', async () => {
    const { useDraggable } = await import('../use-draggable')
    draggableCalls = 0

    const e = effect(() => {
      useDraggable({
        element: () => document.createElement('div'),
        data: { id: '1', type: 'card' },
      })
    })
    // Dispose synchronously — runs onCleanup (sets `disposed`) BEFORE the
    // queueMicrotask(setup) fires.
    e.dispose()
    await flush()

    // Post-fix: setup() saw `disposed` and bailed → pdnd never registered.
    // Pre-fix: setup() ran post-dispose → draggable registered + leaked.
    expect(draggableCalls).toBe(0)
  })

  it('DOES register pdnd on a normal mount (guard does not over-suppress)', async () => {
    const { useDraggable } = await import('../use-draggable')
    draggableCalls = 0

    const e = effect(() => {
      useDraggable({
        element: () => document.createElement('div'),
        data: { id: '2', type: 'card' },
      })
    })
    // Let the deferred setup run while still live.
    await flush()
    expect(draggableCalls).toBe(1)
    e.dispose()
  })
})
