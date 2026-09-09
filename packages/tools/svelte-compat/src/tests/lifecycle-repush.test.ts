/**
 * `onMount` / `onDestroy` survive a parent re-render.
 *
 * The wrapper resets `ctx.unmountCallbacks = []` on every render of a
 * preserved child, which DROPS the cleanup a previous render registered. Both
 * hooks re-push their stored callback on the re-render path for that reason —
 * the sibling of the #739 `writable.subscribe` fix — and neither re-push arm
 * had a test.
 *
 * The failure is a leak that only appears on components whose parent
 * re-renders: the destroy callback is silently gone, so a subscription, timer
 * or listener registered in setup is never torn down. The component still
 * works, and the leak scales with how often the parent's state moves.
 *
 * The `includes()` guard is the other half: re-pushing on every render without
 * it means the callback runs once per render at unmount, so anything
 * non-idempotent (a decrement, a close, a refcount release) is applied N times.
 */
import { onDestroy } from '../index'
import { beginRender, endRender, type RenderContext } from '../jsx-runtime'

function makeCtx(): RenderContext {
  return {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
    unmountCallbacks: [],
  }
}

/**
 * Render `fn` in `ctx`, modelling what the wrapper does to a PRESERVED child:
 * it clears `unmountCallbacks` before re-running the component
 * (jsx-runtime.ts), which is precisely what the re-push arms exist to undo.
 */
function rerender(ctx: RenderContext, fn: () => void): void {
  ctx.unmountCallbacks = []
  beginRender(ctx)
  fn()
  endRender()
}

describe('onDestroy survives a parent re-render', () => {
  test('the callback is re-pushed, so it still fires at unmount', () => {
    let destroyed = 0
    const setup = () => onDestroy(() => destroyed++)

    const ctx = makeCtx()
    beginRender(ctx)
    setup()
    endRender()
    expect(ctx.unmountCallbacks.length, 'registered on the first render').toBe(1)

    rerender(ctx, setup)
    expect(
      ctx.unmountCallbacks.length,
      'the re-render cleared the list — the hook must put it back',
    ).toBe(1)

    for (const cb of ctx.unmountCallbacks) cb()
    expect(destroyed, 'the cleanup must still run after a parent re-render').toBe(1)
  })

  test('re-rendering TWICE does not queue the callback twice', () => {
    // The `includes()` guard. Without it, unmount runs the callback once per
    // render — and anything non-idempotent is applied that many times.
    let destroyed = 0
    const setup = () => onDestroy(() => destroyed++)

    const ctx = makeCtx()
    beginRender(ctx)
    setup()
    endRender()
    rerender(ctx, setup)
    rerender(ctx, setup)

    expect(ctx.unmountCallbacks.length, 'exactly one registration').toBe(1)
    for (const cb of ctx.unmountCallbacks) cb()
    expect(destroyed).toBe(1)
  })
})
