import { getCurrentScope } from "./scope"
import {
  _restoreActiveEffect,
  _setActiveEffect,
  cleanupEffect,
  setDepsCollector,
  withTracking,
} from "./tracking"

export interface Effect {
  dispose(): void
}

// Global error handler — called for unhandled errors thrown inside effects.
// Defaults to console.error so silent failures are never swallowed.
let _errorHandler: (err: unknown) => void = (err) => {
  console.error("[pyreon] Unhandled effect error:", err)
}

export function setErrorHandler(fn: (err: unknown) => void): void {
  _errorHandler = fn
}

// biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — callbacks that return nothing must be assignable
export function effect(fn: () => (() => void) | void): Effect {
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
      cleanup = withTracking(run, fn) || undefined
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

  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const s of deps) s.delete(run)
    deps.length = 0
  }

  // Auto-register with scope so template bindings are disposed during teardown
  getCurrentScope()?.add({ dispose })

  return dispose
}

export function renderEffect(fn: () => void): () => void {
  const deps: Set<() => void>[] = []
  let disposed = false

  const run = () => {
    if (disposed) return
    // Single-dep fast path — most render effects track exactly 1 signal.
    // Avoids for-of iterator creation + deps.length check on every re-run.
    if (deps.length === 1) {
      ;(deps[0] as Set<() => void>).delete(run)
      deps.length = 0
    } else if (deps.length > 1) {
      for (const s of deps) s.delete(run)
      deps.length = 0
    }
    // Inline tracking setup — avoids setDepsCollector + withTracking function call overhead
    setDepsCollector(deps)
    _setActiveEffect(run)
    try {
      fn()
    } finally {
      _restoreActiveEffect()
      setDepsCollector(null)
    }
  }

  run()

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (deps.length === 1) {
      ;(deps[0] as Set<() => void>).delete(run)
    } else {
      for (const s of deps) s.delete(run)
    }
    deps.length = 0
  }

  // Auto-register with scope so render effects are disposed during teardown
  getCurrentScope()?.add({ dispose })

  return dispose
}
