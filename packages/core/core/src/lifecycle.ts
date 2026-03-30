import type { CleanupFn, LifecycleHooks } from './types'

const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

// The currently-executing component's hook storage, set by the renderer
// before calling the component function, cleared immediately after.
let _current: LifecycleHooks | null = null

export function setCurrentHooks(hooks: LifecycleHooks | null) {
  _current = hooks
}

export function getCurrentHooks(): LifecycleHooks | null {
  return _current
}

function warnOutsideSetup(hookName: string): void {
  if (__DEV__ && !_current) {
    // biome-ignore lint/suspicious/noConsole: dev-only warning
    console.warn(
      `[Pyreon] ${hookName}() called outside component setup. ` +
        "Lifecycle hooks must be called synchronously during a component's setup function.",
    )
  }
}

/**
 * Register a callback to run after the component is mounted to the DOM.
 * Optionally return a cleanup function — it will run on unmount.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void allows callbacks that return nothing
export function onMount(fn: () => CleanupFn | void | undefined) {
  warnOutsideSetup('onMount')
  _current?.mount.push(fn)
}

/**
 * Register a callback to run when the component is removed from the DOM.
 */
export function onUnmount(fn: () => void) {
  warnOutsideSetup('onUnmount')
  _current?.unmount.push(fn)
}

/**
 * Register a callback to run after each reactive update.
 */
export function onUpdate(fn: () => void) {
  warnOutsideSetup('onUpdate')
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
  warnOutsideSetup('onErrorCaptured')
  _current?.error.push(fn)
}
