/**
 * Regression test for the CI flake where `flow.layout()` would throw
 * `ReferenceError: requestAnimationFrame is not defined` after vitest
 * teardown stripped the global. The async `await computeLayout(...)`
 * inside `layout()` lets the test resolve before the rAF call site is
 * reached, so by the time `requestAnimationFrame` is needed, the
 * environment is gone.
 *
 * Fix: `_raf` / `_caf` wrappers in `flow.ts` no-op when the globals are
 * absent. This test simulates that condition by stashing + deleting the
 * globals, calling layout / animateViewport, and asserting nothing
 * throws. Bisect-verified — without the wrappers this test fails with
 * the same `ReferenceError` seen in CI.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFlow } from '../flow'

describe('rAF teardown safety', () => {
  let savedRaf: typeof globalThis.requestAnimationFrame | undefined
  let savedCaf: typeof globalThis.cancelAnimationFrame | undefined

  beforeEach(() => {
    savedRaf = globalThis.requestAnimationFrame
    savedCaf = globalThis.cancelAnimationFrame
  })

  afterEach(() => {
    if (savedRaf !== undefined) globalThis.requestAnimationFrame = savedRaf
    if (savedCaf !== undefined) globalThis.cancelAnimationFrame = savedCaf
  })

  it('flow.layout() does not throw when requestAnimationFrame is absent', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 100, y: 100 }, data: {} },
      ],
      edges: [{ id: 'a-b', source: 'a', target: 'b' }],
    })

    // Simulate post-teardown: kill the globals after layout starts
    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame
    delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame

    // The animated path schedules rAF. Without the guard this throws.
    await expect(flow.layout('layered')).resolves.toBeUndefined()

    flow.dispose()
  })

  it('flow.animateViewport() does not throw when requestAnimationFrame is absent', () => {
    const flow = createFlow({ nodes: [], edges: [] })

    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame
    delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame

    // Synchronous — schedules the first rAF at the bottom of the function.
    expect(() => flow.animateViewport({ x: 100, y: 100, zoom: 2 })).not.toThrow()

    flow.dispose()
  })

  it('flow.dispose() does not throw when cancelAnimationFrame is absent (mid-animation teardown)', async () => {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', position: { x: 100, y: 100 }, data: {} },
      ],
      edges: [{ id: 'a-b', source: 'a', target: 'b' }],
    })

    // Start an animation so dispose has a frame ID to cancel
    await flow.layout('layered')

    delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame

    expect(() => flow.dispose()).not.toThrow()
  })
})
