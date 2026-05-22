import { defineCrossModuleState } from '@pyreon/reactivity'
import type { CleanupFn, LifecycleHooks } from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const __DEV__ = process.env.NODE_ENV !== 'production'

// Currently-executing component's hook storage, hosted on globalThis via
// `defineCrossModuleState` so duplicate `@pyreon/core` module instances
// share state — see the helper's JSDoc for the full module-duplication
// rationale (was 5× inlined Symbol.for blocks in PR #855; now consolidated
// to one helper call per state var).
const _state = defineCrossModuleState<{ current: LifecycleHooks | null }>(
  'pyreon-core/lifecycle-state',
  () => ({ current: null }),
)

export function setCurrentHooks(hooks: LifecycleHooks | null) {
  _state.current = hooks
}

export function getCurrentHooks(): LifecycleHooks | null {
  return _state.current
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
  // Framework / infra paths + function names to skip. Match BOTH source
  // form (`packages/X/src/...` — workspace consumers via the `bun`
  // condition) AND published-bundle form (`node_modules/@pyreon/X/lib/...`
  // — npm consumers). Pre-fix only the source paths were covered, so
  // every published-package consumer (i.e. almost everyone in production
  // dev) saw the warning's "Called from:" line point at the framework's
  // own bundle code, defeating the user-actionable hint. Function-name
  // patterns (`captureCallSite`, `warnOutsideSetup`) cover the case where
  // bundling rewrites the source path but the symbol name survives.
  const skipPatterns = [
    // ── Source form (workspace / `bun` condition) ──────────────────────
    /\/lifecycle\.[tj]s/,
    /\/context\.[tj]s/,
    /\/component\.[tj]s/,
    // ── Function-name match (works through bundling / minification when
    //    symbol names survive) ─────────────────────────────────────────
    /\bcaptureCallSite\b/,
    /\bwarnOutsideSetup\b/,
    // ── Source-tree paths for every framework package that internally
    //    calls lifecycle hooks (HeadProvider, RouterProvider, ThemeProvider,
    //    PyreonUI, etc.). Without each, a published-package consumer with
    //    `useHead()` or `provide()` would see the "Called from:" line
    //    point at the LIBRARY's source, not their own component. ───────
    /\/(core|reactivity|runtime-dom|runtime-server|router|head|ui-core|styler|unistyle|rocketstyle|attrs|elements|kinetic)\/src\//,
    // ── Published-bundle form (npm consumers): bundles always at
    //    `node_modules/@pyreon/<name>/lib/...`. The blanket
    //    `@pyreon/[a-z-]+/lib/` catches every package without per-name
    //    maintenance. ────────────────────────────────────────────────────
    /node_modules\/@pyreon\/[^/]+\/lib\//,
    /@pyreon\/[a-z-]+\/lib\//,
    // ── Runtime / engine internals ─────────────────────────────────────
    /node:internal/,
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
  if (__DEV__ && !_state.current) {
    const callSite = captureCallSite()
    // Local name must NOT shadow the `location` browser global (poor
    // hygiene + trips SSR static analysis into a false positive).
    const callSiteSuffix = callSite ? `\n  Called from: ${callSite}` : ''
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] ${hookName}() called outside component setup. ` +
        "Lifecycle hooks must be called synchronously during a component's setup function." +
        callSiteSuffix +
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
  if (_state.current) {
    if (_state.current.mount === null) _state.current.mount = []
    _state.current.mount.push(fn)
  }
}

/**
 * Register a callback to run when the component is removed from the DOM.
 */
export function onUnmount(fn: () => void) {
  warnOutsideSetup('onUnmount')
  if (_state.current) {
    if (_state.current.unmount === null) _state.current.unmount = []
    _state.current.unmount.push(fn)
  }
}

/**
 * Register a callback to run after each reactive update.
 */
export function onUpdate(fn: () => void) {
  warnOutsideSetup('onUpdate')
  if (_state.current) {
    if (_state.current.update === null) _state.current.update = []
    _state.current.update.push(fn)
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
  if (_state.current) {
    if (_state.current.error === null) _state.current.error = []
    _state.current.error.push(fn)
  }
}
