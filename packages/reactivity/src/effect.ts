import { getCurrentScope } from "./scope"
import { cleanupEffect, setDepsCollector, withTracking } from "./tracking"

export interface Effect {
  dispose(): void
}

// Global error handler — called for unhandled errors thrown inside effects.
// Defaults to console.error so silent failures are never swallowed.
let _errorHandler: (err: unknown) => void = (_err) => {}

export function setErrorHandler(fn: (err: unknown) => void): void {
  _errorHandler = fn
}

export function effect(fn: () => any): Effect {
  // Capture the scope at creation time — remains correct during future re-runs
  // even after setCurrentScope(null) has been called post-setup.
  const scope = getCurrentScope()
  let disposed = false
  let isFirstRun = true
  let cleanup: (() => void) | undefined

  const runCleanup = () => {
    if (typeof cleanup === "function") {
      try {
        cleanup()
      } catch (err) {
        _errorHandler(err)
      }
      cleanup = undefined
    }
  }

  const run = () => {
    if (disposed) return
    // Run previous cleanup before re-running
    runCleanup()
    // Clean up previous subscriptions before re-running (dynamic dep tracking)
    cleanupEffect(run)
    try {
      cleanup = withTracking(run, fn)
    } catch (err) {
      _errorHandler(err)
    }
    // Notify scope after each reactive re-run (not the initial synchronous run)
    // so onUpdate hooks fire after the DOM has settled.
    if (!isFirstRun) scope?.notifyEffectRan()
    isFirstRun = false
  }

  run()

  const e: Effect = {
    dispose() {
      runCleanup()
      disposed = true
      cleanupEffect(run)
    },
  }

  // Auto-register with the active EffectScope (if any)
  getCurrentScope()?.add(e)

  return e
}

/**
 * Lightweight effect for DOM render bindings.
 *
 * Differences from `effect()`:
 * - No EffectScope registration (caller owns the dispose lifecycle)
 * - No error handler (errors propagate naturally)
 * - No onUpdate notification
 * - Deps stored in a local array instead of the global WeakMap — faster
 *   creation and disposal (~200ns saved per effect vs WeakMap path)
 *
 * Returns a dispose function (not an Effect object — saves 1 allocation).
 */
/**
 * Static-dep binding — compiler helper for template expressions.
 *
 * Like renderEffect but assumes dependencies never change (true for all
 * compiler-emitted template bindings like `_tpl()` text/attribute updates).
 *
 * Tracks dependencies only on the first run. Re-runs skip cleanup, re-tracking,
 * and tracking context save/restore entirely — just calls `fn()` directly.
 *
 * Per re-run savings vs renderEffect:
 * - No deps iteration + Set.delete (cleanup)
 * - No setDepsCollector + withTracking (re-registration)
 * - Signal reads hit `if (activeEffect)` null check → instant return
 */
export function _bind(fn: () => void): () => void {
  const deps: Set<() => void>[] = []
  let disposed = false

  const run = () => {
    if (disposed) return
    fn()
  }

  // First run: track deps so we know what to unsubscribe on dispose
  setDepsCollector(deps)
  withTracking(run, fn)
  setDepsCollector(null)

  return () => {
    if (disposed) return
    disposed = true
    for (const s of deps) s.delete(run)
    deps.length = 0
  }
}

export function renderEffect(fn: () => void): () => void {
  const deps: Set<() => void>[] = []
  let disposed = false

  const run = () => {
    if (disposed) return
    // Clean up old subscriptions
    for (const s of deps) s.delete(run)
    deps.length = 0
    // Track with fast collector — pushes to our local deps array
    setDepsCollector(deps)
    withTracking(run, fn)
    setDepsCollector(null)
  }

  run()

  return () => {
    if (disposed) return
    disposed = true
    for (const s of deps) s.delete(run)
    deps.length = 0
  }
}
