import { getCurrentHooks, setCurrentHooks } from './lifecycle'
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
  // This per-component allocation is NOT an optimization target — measured +
  // rejected (2026-08). Making it lazy (allocate on the first onMount/onUnmount/
  // onUpdate/onErrorCaptured, hand back a shared frozen sentinel otherwise) was
  // implemented and benchmarked against the 2,047-component deep-tree mount:
  // −0.07%, i.e. nothing. The ceiling was measured directly and independently by
  // ADDING a second per-component hooks object AND a second per-component
  // `EffectScope` — a probe that, unlike removing them, cannot bias the run by
  // breaking disposal — which cost only +0.59%. In the same interleaved session
  // the `context → 1,024 consumers` op, which mounts nothing and therefore
  // cannot be affected by any of these arms, moved ±2%, so every one of those
  // deltas sits inside the instrument's own noise floor.
  //
  // The reading: a young-generation object allocation here is a pointer bump,
  // and any bookkeeping added to avoid it (a frame flag, a depth counter, a
  // nullish-coalesce on the return, and the polymorphic property access a shared
  // sentinel introduces at `hooks.mount` / `.unmount` / `.update`) costs at
  // least as much as the allocation. The same conclusion applies to the
  // per-component `EffectScope` in `@pyreon/runtime-dom`'s mountComponent — see
  // the note there. Re-open only with a measurement that clears ±2% on this
  // benchmark.
  const hooks: LifecycleHooks = { mount: null, unmount: null, update: null, error: null }
  // RESTORE the caller's frame, never reset to a constant: component setup
  // NESTS (a `_mountSlot` inside a parent's compiled `_tpl(...)` call mounts a
  // child component while the parent's frame is open), so `setCurrentHooks(null)`
  // on the inner exit closed the OUTER frame and silently dropped every hook the
  // parent registered afterwards.
  const prevHooks = getCurrentHooks()
  setCurrentHooks(hooks)
  let vnode: VNodeChild = null
  try {
    vnode = fn(props)
  } finally {
    setCurrentHooks(prevHooks)
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
// ErrorBoundary pushes during its own setup, before children mount, so any child
// mountComponent error dispatches up to the nearest boundary.
//
// Mutation contract: removal is IDENTITY-based (`lastIndexOf + splice`), never
// position-based (`pop`). Sibling boundaries unmount in renderer-driven order
// (keyed `<For>` reconciliation, `<Show>` flips, route nav), NOT strict LIFO, so
// a `pop()` would remove the WRONG frame — orphaning one boundary's handler on
// the stack while dropping the surviving boundary's. Errors would then route to
// the orphan, whose signal is already disposed, and vanish silently. Same shape
// as the `popContext()` bug — see anti-patterns "Position-based pop for stack
// frames that may be pushed by reactive boundaries".

// Plain module-scope stack. The duplicate-instance bug class is prevented at the
// bundler layer (`@pyreon/vite-plugin` injects `resolve.dedupe`) and detected at
// the runtime layer (every package calls `registerSingleton` at module load).
const _ebStack: ((err: unknown) => boolean)[] = []

export function pushErrorBoundary(handler: (err: unknown) => boolean): void {
  _ebStack.push(handler)
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
    _ebStack.pop()
    return
  }
  const idx = _ebStack.lastIndexOf(handler)
  if (idx !== -1) _ebStack.splice(idx, 1)
}

/**
 * Dispatch an error to the nearest active ErrorBoundary.
 * Returns true if the boundary handled it, false if none was registered.
 */
export function dispatchToErrorBoundary(err: unknown): boolean {
  const handler = _ebStack[_ebStack.length - 1]
  return handler ? handler(err) : false
}
