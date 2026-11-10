import { _enterCleanupFrame, _exitCleanupFrame } from '@pyreon/reactivity'
import { _peekCurrentHooks, EMPTY_HOOKS, PENDING_HOOKS, setCurrentHooks } from './lifecycle'
import type { ComponentFn, LifecycleHooks, VNodeChild } from './types'

/**
 * Identity wrapper — marks a function as a Pyreon component and preserves its type.
 * Useful for IDE tooling and future compiler optimisations.
 */
export function defineComponent<P extends object>(fn: ComponentFn<P>): ComponentFn<P> {
  return fn
}

/**
 * Run a component function in a tracked context so that lifecycle hooks
 * registered inside it (onMount, onUnmount, onErrorCaptured, etc.) are captured.
 *
 * Called by the renderer — not intended for user code.
 */
export function runWithHooks<P extends object>(
  fn: ComponentFn<P>,
  props: P,
): { vnode: VNodeChild; hooks: LifecycleHooks } {
  const vnode = _runHooked(fn, props)
  return { vnode, hooks: _takeHooks() }
}

/** The hooks `_runHooked` collected for the component it just ran. */
let _lastHooks: LifecycleHooks = EMPTY_HOOKS

/**
 * `runWithHooks` without the `{ vnode, hooks }` result object: returns the
 * vnode and leaves the hooks for `_takeHooks()`, which the caller reads right
 * after the call, before running any other component.
 *
 * Hooks are allocated LAZILY. The frame starts as the shared `PENDING_HOOKS`
 * and the first `onMount` / `onUnmount` / `onUpdate` / `onErrorCaptured` (or a
 * setup-time `onCleanup`) materialises a real object; a component that
 * registers nothing gets the shared frozen `EMPTY_HOOKS`. History: this was
 * built and rejected in 2026-08 as a SPEED lever (−0.07% on the 2,047-component
 * deep-tree mount, inside noise). It is kept for RETAINED HEAP: the per-instance
 * object lives as long as the component (28 B each), and the deep tree's
 * components register no hook.
 *
 * RESTORE the caller's frame, never reset it to a constant: component setup
 * NESTS (a `_mountSlot` inside a parent's compiled `_tpl(...)` call mounts a
 * child component while the parent's frame is open), so resetting on the inner
 * exit would close the OUTER frame and drop every hook the parent registered
 * afterwards. `onCleanup()` in a component body belongs to THIS component: it
 * is collected in a fresh window and run on unmount.
 * @internal
 */
export function _runHooked<P extends object>(fn: ComponentFn<P>, props: P): VNodeChild {
  const prevHooks = _peekCurrentHooks()
  setCurrentHooks(PENDING_HOOKS)
  const cleanupToken = _enterCleanupFrame()
  let vnode: VNodeChild = null
  let hooks: LifecycleHooks = EMPTY_HOOKS
  try {
    vnode = fn(props)
  } finally {
    const mine = _peekCurrentHooks()
    setCurrentHooks(prevHooks)
    if (mine !== PENDING_HOOKS && mine !== null) hooks = mine
    const collected = _exitCleanupFrame(cleanupToken)
    if (collected !== null) {
      if (hooks === EMPTY_HOOKS) hooks = { mount: null, unmount: collected, update: null, error: null }
      else if (hooks.unmount === null) hooks.unmount = collected
      else for (const c of collected) hooks.unmount.push(c)
    }
  }
  // Only on success: a throwing setup must not leave its hooks parked in this
  // module slot (nothing would read and release them).
  _lastHooks = hooks
  return vnode
}

/** The hooks of the component `_runHooked` last ran (`EMPTY_HOOKS` when none). @internal */
export function _takeHooks(): LifecycleHooks {
  const h = _lastHooks
  _lastHooks = EMPTY_HOOKS
  return h
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
