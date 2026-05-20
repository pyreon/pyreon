/**
 * REPRODUCTION + REGRESSION — `writable.subscribe()` from a child
 * component's body, combined with the parent-re-render
 * ChildInstance-preservation in `jsx-runtime.ts:170-173`, leaked one
 * store subscriber per parent re-render cycle.
 *
 * Pre-fix flow:
 * 1. First render: `subscribe(handler)` pushes its unsub into
 *    `ctx.unmountCallbacks` and caches `{unsub}` at `ctx.hooks[idx]`.
 * 2. Parent re-renders → wrapper sees the cached ChildInstance →
 *    `ctx.unmountCallbacks = []` RESETS the array (the wrapper's
 *    cycle-N callbacks are stale and need to be dropped before
 *    cycle-N+1 begins).
 * 3. Child re-runs → `subscribe(handler)` hits the cached fast path
 *    `if (cached) { run(v); return cached.unsub }` → **does NOT
 *    re-push the cached unsub** into the new (empty) unmountCallbacks.
 * 4. Component eventually unmounts → unmountCallbacks loop runs over
 *    an array missing the original unsub → the store's internal
 *    `subs.Set` keeps the subscriber forever.
 *
 * Class D event-listener pile-up shape (the subscriber set IS the
 * listener set). Linear growth per parent re-render cycle.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RenderContext } from '../jsx-runtime'
import { beginRender, endRender } from '../jsx-runtime'
import { writable } from '../index'

describe('svelte-compat — writable.subscribe survives ChildInstance preservation', () => {
  let ctx: RenderContext

  beforeEach(() => {
    ctx = {
      hooks: [],
      scheduleRerender: () => {},
      pendingEffects: [],
      pendingLayoutEffects: [],
      unmounted: false,
      unmountCallbacks: [],
    }
  })
  afterEach(() => {
    // Make sure no test leaves a render in progress that could leak
    // into the next test's ctx.
    try {
      endRender()
    } catch {
      // already ended
    }
  })

  it('REGRESSION: cached subscribe re-attaches its unsub after unmountCallbacks reset', () => {
    const store = writable(0)
    // Reach into the store's internal subscriber set via a probe
    // subscriber that we can count after teardown.
    const observed: number[] = []

    // First render — calls subscribe(handler) once, registers in
    // unmountCallbacks.
    beginRender(ctx)
    store.subscribe((v) => observed.push(v))
    endRender()
    expect(ctx.unmountCallbacks.length).toBe(1)

    // Parent re-render — wrapper resets unmountCallbacks to []
    // (mirroring jsx-runtime.ts:172). The cached hook at index 0
    // still has the unsub.
    ctx.unmountCallbacks = []

    // Child re-runs subscribe(handler) — hits the cached path.
    beginRender(ctx)
    store.subscribe((v) => observed.push(v))
    endRender()

    // The critical assertion: the cached unsub MUST be back in
    // unmountCallbacks after the cached fast path fires. Pre-fix the
    // array stays empty.
    expect(ctx.unmountCallbacks.length).toBe(1)

    // Simulate unmount — the unmountCallbacks loop runs.
    for (const cb of ctx.unmountCallbacks) cb()

    // Post-unmount, the store should have no remaining subscribers.
    // Write to the store — if the subscription survived the unmount,
    // observed.length would increment.
    const beforeCount = observed.length
    store.set(42)
    expect(observed.length).toBe(beforeCount)
  })

  it('REGRESSION: 10 parent re-render cycles do NOT accumulate subscribers', () => {
    const store = writable(0)
    const observed: number[] = []

    // First render registers the subscription.
    beginRender(ctx)
    store.subscribe((v) => observed.push(v))
    endRender()

    // 10 parent re-render cycles. Each one resets unmountCallbacks
    // then runs the child's subscribe call again (cached path).
    for (let i = 0; i < 10; i++) {
      ctx.unmountCallbacks = []
      beginRender(ctx)
      store.subscribe((v) => observed.push(v))
      endRender()
    }

    // After 10 cycles the unmountCallbacks array should still have
    // exactly ONE entry (the same unsub from the first registration).
    // Pre-fix it has 0 (every cycle reset, none re-pushed) so the
    // unmount cleanup never fires.
    expect(ctx.unmountCallbacks.length).toBe(1)

    // Unmount cleans up.
    for (const cb of ctx.unmountCallbacks) cb()

    const beforeCount = observed.length
    store.set(99)
    // Post-unmount the subscriber must be gone — no further writes.
    expect(observed.length).toBe(beforeCount)
  })
})
