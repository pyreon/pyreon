import { _enterCleanupFrame, _exitCleanupFrame } from '@pyreon/reactivity/internal'
import { createContext, useContext } from './context'
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
 *
 * @internal
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
 *
 * @internal
 */
export function propagateError(err: unknown, hooks: LifecycleHooks): boolean {
  if (!hooks.error) return false
  for (const handler of hooks.error) {
    if (handler(err) === true) return true
  }
  return false
}

// ─── Error boundaries ────────────────────────────────────────────────────────
// The nearest `<ErrorBoundary>` is resolved through the CONTEXT OWNER CHAIN,
// which mirrors the component tree: each boundary `provide()`s its handler, and
// a throw dispatches to `useContext(ErrorBoundaryContext)` from the throwing
// component's parent owner. This replaced a module-level stack whose top was
// read at dispatch time. A boundary stays on such a stack until it UNMOUNTS, so
// the top was simply the last boundary mounted: a component throwing NEXT TO a
// mounted boundary (not inside it) rendered that sibling's fallback, and a
// throw that happened after mount (a rejected `<Defer>` chunk, an async
// component) went to whichever boundary mounted last (#4831).

/** A boundary's handler: returns true when it took the error. */
export type ErrorBoundaryHandler = (err: unknown) => boolean

/** @internal The nearest enclosing `<ErrorBoundary>`'s handler (owner-chain scoped). */
export const ErrorBoundaryContext = createContext<ErrorBoundaryHandler | null>(null)

// Legacy hand-pushed handlers (`pushErrorBoundary`) for direct callers outside
// a component tree. `<ErrorBoundary>` itself no longer pushes here. Removal is
// IDENTITY-based (`lastIndexOf + splice`), never position-based.
const _ebStack: ErrorBoundaryHandler[] = []

/**
 * Push a handler that catches errors when no `<ErrorBoundary>` encloses the
 * throw. Prefer `<ErrorBoundary>`, which scopes its handler to its subtree.
 */
export function pushErrorBoundary(handler: ErrorBoundaryHandler): void {
  _ebStack.push(handler)
}

/**
 * Remove a SPECIFIC handler pushed with `pushErrorBoundary` by reference
 * identity, so removal in any order removes the right one. The no-arg form
 * pops the last handler.
 */
export function popErrorBoundary(handler?: ErrorBoundaryHandler): void {
  if (handler === undefined) {
    _ebStack.pop()
    return
  }
  const idx = _ebStack.lastIndexOf(handler)
  if (idx !== -1) _ebStack.splice(idx, 1)
}

/**
 * The handler of the `<ErrorBoundary>` enclosing the current component (call it
 * during setup, or under the owner the throw belongs to), else the last
 * hand-pushed handler, else `null`. Code that fails LATER (a promise rejection)
 * captures it during setup and calls it then.
 */
export function nearestErrorBoundary(): ErrorBoundaryHandler | null {
  return useContext(ErrorBoundaryContext) ?? _ebStack[_ebStack.length - 1] ?? null
}

/**
 * Dispatch an error to the nearest `<ErrorBoundary>` of the current owner.
 * Returns true if a boundary handled it, false if none did.
 *
 * @internal
 */
export function dispatchToErrorBoundary(err: unknown): boolean {
  const handler = nearestErrorBoundary()
  return handler ? handler(err) : false
}
