import type { CleanupFn, LifecycleHooks } from "./types"

// The currently-executing component's hook storage, set by the renderer
// before calling the component function, cleared immediately after.
let _current: LifecycleHooks | null = null

export function setCurrentHooks(hooks: LifecycleHooks | null) {
  _current = hooks
}

export function getCurrentHooks(): LifecycleHooks | null {
  return _current
}

/**
 * Register a callback to run after the component is mounted to the DOM.
 * Optionally return a cleanup function — it will run on unmount.
 */
export function onMount(fn: () => CleanupFn | undefined) {
  _current?.mount.push(fn)
}

/**
 * Register a callback to run when the component is removed from the DOM.
 */
export function onUnmount(fn: () => void) {
  _current?.unmount.push(fn)
}

/**
 * Register a callback to run after each reactive update.
 */
export function onUpdate(fn: () => void) {
  _current?.update.push(fn)
}

/**
 * Register an error handler for this component subtree.
 *
 * When an error is thrown during rendering or in a child component,
 * the nearest `onErrorCaptured` handler is called with the error.
 * Return `true` to mark the error as handled and stop propagation.
 *
 * @example
 * onErrorCaptured((err) => {
 *   setError(String(err))
 *   return true // handled — don't propagate
 * })
 */
export function onErrorCaptured(fn: (err: unknown) => boolean | undefined) {
  _current?.error.push(fn)
}
