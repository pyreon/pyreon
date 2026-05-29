/**
 * REPRODUCTION + REGRESSION — `onMount`-returned cleanup + `onDestroy`
 * callbacks survive ChildInstance preservation across a parent re-render.
 *
 * The lifecycle sibling of the #739 `writable.subscribe` re-push bug:
 *
 * 1. First render: `onMount`/`onDestroy` push their cleanup into
 *    `ctx.unmountCallbacks` AND store it at `ctx.hooks[idx]` (hook-indexed,
 *    once).
 * 2. Parent re-render preserves the ChildInstance and the wrapper resets
 *    `ctx.unmountCallbacks = []` (jsx-runtime.ts:172) to drop stale callbacks.
 * 3. Child re-runs `onMount`/`onDestroy` → the `idx < hooks.length` (cached)
 *    path. Pre-fix this path did NOTHING, so the cleanup was never re-pushed.
 * 4. Final unmount runs the (now-empty) `unmountCallbacks` → the `onMount`
 *    cleanup never runs and `onDestroy` never fires — a leaked resource per
 *    surviving child instance.
 *
 * The fix re-pushes the stored cleanup on the cached path (the same shape as
 * the store-path #739 fix). This test drives a manual render context through
 * first-render → reset → re-render and asserts the callbacks are restored and
 * actually fire on unmount. Bisect: revert the `else`-branch re-push in
 * index.ts onMount/onDestroy → the post-reset assertions fail.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RenderContext } from '../jsx-runtime'
import { beginRender, endRender } from '../jsx-runtime'
import { onDestroy, onMount } from '../index'

describe('svelte-compat — onMount/onDestroy cleanup survives ChildInstance preservation', () => {
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
    try {
      endRender()
    } catch {
      // already ended
    }
  })

  it('REGRESSION: onMount-cleanup + onDestroy re-attach after unmountCallbacks reset', () => {
    let destroyRan = false

    // First render — registers onMount cleanup (idx 0) + onDestroy (idx 1).
    beginRender(ctx)
    onMount(() => () => {})
    onDestroy(() => {
      destroyRan = true
    })
    endRender()
    expect(ctx.unmountCallbacks.length).toBe(2)

    // Parent re-render — wrapper resets unmountCallbacks to [] (jsx-runtime.ts:172).
    // The cached hooks at idx 0/1 still hold the cleanup callbacks.
    ctx.unmountCallbacks = []

    // Child re-runs the lifecycle hooks — hits the cached (idx < length) path.
    beginRender(ctx)
    onMount(() => () => {})
    onDestroy(() => {
      destroyRan = true
    })
    endRender()

    // Critical assertion: both cleanups MUST be back in unmountCallbacks after
    // the cached path. Pre-fix the array stays empty (cleanups orphaned).
    expect(ctx.unmountCallbacks.length).toBe(2)

    // Simulate final unmount — the loop runs; onDestroy must fire.
    for (const cb of ctx.unmountCallbacks) cb()
    expect(destroyRan).toBe(true)
  })
})
