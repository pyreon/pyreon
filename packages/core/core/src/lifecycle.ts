import type { CleanupFn, LifecycleHooks } from './types'

// Dev-mode gate: bundler-agnostic. Every modern bundler auto-replaces
// `process.env.NODE_ENV` at consumer build time and tree-shakes the
// dev branch in production.
// Currently-executing component's hook storage. Plain module-scope state
// — the duplicate-instance bug class is now prevented at the bundler
// layer (`@pyreon/vite-plugin` injects `resolve.dedupe`) and detected at
// the runtime layer (every package calls `registerSingleton` at module
// load).
let _current: LifecycleHooks | null = null

/**
 * The hooks of a component that registered none — shared by every such
 * component instead of one `{ mount, unmount, update, error }` object each
 * (28 B retained per instance, for the lifetime of the component). Frozen, so
 * a write that skipped `_writableHooks()` throws instead of leaking across
 * components.
 */
export const EMPTY_HOOKS: LifecycleHooks = /* @__PURE__ */ Object.freeze({ mount: null, unmount: null, update: null, error: null }) as LifecycleHooks

/**
 * "Inside a component setup, no hook registered yet". A setup frame starts
 * here, and the first registration swaps in a real object
 * (`_writableHooks`), so a component that registers nothing never allocates
 * one. Truthy, so "is a component rendering?" checks still see it.
 */
export const PENDING_HOOKS: LifecycleHooks = /* @__PURE__ */ Object.freeze({ mount: null, unmount: null, update: null, error: null }) as LifecycleHooks

export function setCurrentHooks(hooks: LifecycleHooks | null) {
  _current = hooks
}

/** The current frame's hooks for WRITING — materialises a pending frame. */
function _writableHooks(): LifecycleHooks | null {
  if (_current === PENDING_HOOKS) _current = { mount: null, unmount: null, update: null, error: null }
  return _current
}

/** The current frame's hooks, materialised (callers may write to them). */
export function getCurrentHooks(): LifecycleHooks | null {
  return _writableHooks()
}

/** Raw read of the current frame, `PENDING_HOOKS` included (no allocation). */
export function _peekCurrentHooks(): LifecycleHooks | null {
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
  // `.stack` is always present in V8/JSC — defensive fallback only.
  /* v8 ignore next */
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
  if (process.env.NODE_ENV !== 'production' && !_current) {
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
  const _h = _writableHooks()
  if (_h) {
    if (_h.mount === null) _h.mount = []
    _h.mount.push(fn)
  }
}

/**
 * Register a callback to run when the component is removed from the DOM.
 */
export function onUnmount(fn: () => void) {
  warnOutsideSetup('onUnmount')
  const _h = _writableHooks()
  if (_h) {
    if (_h.unmount === null) _h.unmount = []
    _h.unmount.push(fn)
  }
}

/**
 * Register a callback to run after each reactive update.
 */
export function onUpdate(fn: () => void) {
  warnOutsideSetup('onUpdate')
  const _h = _writableHooks()
  if (_h) {
    if (_h.update === null) _h.update = []
    _h.update.push(fn)
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
  const _h = _writableHooks()
  if (_h) {
    if (_h.error === null) _h.error = []
    _h.error.push(fn)
  }
}
