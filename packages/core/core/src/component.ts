import { setCurrentHooks } from './lifecycle'
import type { ComponentFn, LifecycleHooks, Props, VNodeChild } from './types'

/**
 * Identity wrapper — marks a function as a Pyreon component and preserves its type.
 * Useful for IDE tooling and future compiler optimisations.
 */
export function defineComponent<P extends Props>(fn: ComponentFn<P>): ComponentFn<P> {
  return fn
}

/**
 * Run a component function in a tracked context so that lifecycle hooks
 * registered inside it (onMount, onUnmount, onErrorCaptured, etc.) are captured.
 *
 * Called by the renderer — not intended for user code.
 */
export function runWithHooks<P extends Props>(
  fn: ComponentFn<P>,
  props: P,
): { vnode: VNodeChild; hooks: LifecycleHooks } {
  const hooks: LifecycleHooks = { mount: null, unmount: null, update: null, error: null }
  setCurrentHooks(hooks)
  let vnode: VNodeChild = null
  try {
    vnode = fn(props)
  } finally {
    setCurrentHooks(null)
  }
  return { vnode, hooks }
}

/**
 * Walk up error handlers collected during component rendering.
 * Returns true if any handler marked the error as handled.
 */
export function propagateError(err: unknown, hooks: LifecycleHooks): boolean {
  if (!hooks.error) return false
  for (const handler of hooks.error) {
    if (handler(err) === true) return true
  }
  return false
}

// ─── Error boundary stack ────────────────────────────────────────────────────
// Module-level stack of active ErrorBoundary handlers (innermost last).
// ErrorBoundary pushes during its own setup (before children mount) so that
// any child mountComponent error can dispatch up to the nearest boundary.
//
// Mutation contract: removal is IDENTITY-based (`lastIndexOf + splice`), not
// position-based (`pop`). Sibling boundaries unmount in an order that's
// driven by the renderer (keyed `<For>` reconciliation, `<Show>` flips,
// route nav), NOT in strict LIFO push order. A position-based `pop()` would
// remove the wrong frame whenever the unmount order diverges from the push
// order — the first boundary's `onUnmount` would pop the last boundary's
// handler, orphaning the first boundary's handler on the stack and removing
// the surviving boundary's handler from it. Subsequent errors would then
// route to the orphan (whose owning boundary's signal is already disposed,
// so the error vanishes silently) and the surviving boundary's children's
// errors would fall through to whichever boundary happens to sit at
// `stack[length-1]`. Same root-cause shape as the `popContext()` bug
// fixed in #725 for `provide()` — see
// `.claude/rules/anti-patterns.md` "Position-based pop for stack frames
// that may be pushed by reactive boundaries".

// Cross-module-instance shared stack — see `lifecycle.ts:_state` JSDoc for
// the full module-duplication rationale. ErrorBoundary push/pop must reach
// the same array regardless of which `@pyreon/core` instance the
// `pushErrorBoundary` and `dispatchToErrorBoundary` callers were resolved to.
interface ErrorBoundaryState {
  stack: ((err: unknown) => boolean)[]
}
const _EB_KEY = Symbol.for('pyreon-core/error-boundary-state')
const _gEbHost = globalThis as Record<symbol, unknown>
const _ebState: ErrorBoundaryState = (_gEbHost[_EB_KEY] as ErrorBoundaryState | undefined) ?? {
  stack: [],
}
if (!_gEbHost[_EB_KEY]) _gEbHost[_EB_KEY] = _ebState

export function pushErrorBoundary(handler: (err: unknown) => boolean): void {
  _ebState.stack.push(handler)
}

/**
 * Remove a SPECIFIC handler from the error-boundary stack by reference
 * identity. Each `ErrorBoundary` registers `onUnmount(() => popErrorBoundary(handler))`
 * with its OWN handler — so unmount in any order (LIFO, FIFO, middle-out)
 * correctly removes the right handler.
 */
export function popErrorBoundary(handler?: (err: unknown) => boolean): void {
  if (handler === undefined) {
    // Back-compat: legacy callers that don't pass a handler get the old
    // pop-last behaviour. Internal `ErrorBoundary` setup always passes
    // its handler now; any external direct callers (tests, advanced
    // consumers) keep working with no-arg form.
    _ebState.stack.pop()
    return
  }
  const idx = _ebState.stack.lastIndexOf(handler)
  if (idx !== -1) _ebState.stack.splice(idx, 1)
}

/**
 * Dispatch an error to the nearest active ErrorBoundary.
 * Returns true if the boundary handled it, false if none was registered.
 */
export function dispatchToErrorBoundary(err: unknown): boolean {
  const handler = _ebState.stack[_ebState.stack.length - 1]
  return handler ? handler(err) : false
}
