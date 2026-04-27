import type { CleanupFn, LifecycleHooks } from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const __DEV__ = process.env.NODE_ENV !== 'production'

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
 * Extract the first stack frame that's NOT inside the framework itself.
 * Walks the stack from top, skipping:
 *   - V8/JSC internals (`at <anonymous>`, no filename)
 *   - Framework files (packages/core/core/src/lifecycle.ts, etc.)
 *   - The warning infra itself (warnOutsideSetup, the hook wrapper)
 *
 * Returns a string like "at MyComponent (src/components/Foo.tsx:42:15)"
 * — the call site a user needs to fix. Returns an empty string if no
 * user-code frame is found (unlikely in practice).
 */
function captureCallSite(): string {
  const err = new Error()
  const stack = err.stack
  if (!stack) return ''
  const lines = stack.split('\n')
  // Framework paths to skip — conservative, matches the packages that
  // contain lifecycle / provide / context internals and call these hooks.
  const skipPatterns = [
    /lifecycle\.ts/,
    /\/context\.ts/,
    /\/component\.ts/,
    /\/core\/src\//,
    /\/runtime-dom\/src\//,
    /\/runtime-server\/src\//,
    // node:internal frames
    /node:internal/,
    // chrome devtools source mappings
    /webpack-internal/,
    /<anonymous>/,
  ]
  for (const line of lines) {
    if (!line.includes('at ')) continue
    if (skipPatterns.some((p) => p.test(line))) continue
    // Strip leading "    at " and return the rest
    return line.trim()
  }
  return ''
}

function warnOutsideSetup(hookName: string): void {
  if (__DEV__ && !_current) {
    const callSite = captureCallSite()
    const location = callSite ? `\n  Called from: ${callSite}` : ''
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] ${hookName}() called outside component setup. ` +
        "Lifecycle hooks must be called synchronously during a component's setup function." +
        location +
        (hookName === 'onUnmount'
          ? '\n  Hint: `provide()` internally calls onUnmount(). If you use provide(), ensure it runs during synchronous component setup — not inside effects, callbacks, or after awaits.'
          : ''),
    )
  }
}

/**
 * Register a callback to run after the component is mounted to the DOM.
 * Optionally return a cleanup function — it will run on unmount.
 */
export function onMount(fn: () => CleanupFn | void | undefined) {
  warnOutsideSetup('onMount')
  if (_current) {
    if (_current.mount === null) _current.mount = []
    _current.mount.push(fn)
  }
}

/**
 * Register a callback to run when the component is removed from the DOM.
 */
export function onUnmount(fn: () => void) {
  warnOutsideSetup('onUnmount')
  if (_current) {
    if (_current.unmount === null) _current.unmount = []
    _current.unmount.push(fn)
  }
}

/**
 * Register a callback to run after each reactive update.
 */
export function onUpdate(fn: () => void) {
  warnOutsideSetup('onUpdate')
  if (_current) {
    if (_current.update === null) _current.update = []
    _current.update.push(fn)
  }
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
  if (_current) {
    if (_current.error === null) _current.error = []
    _current.error.push(fn)
  }
}
