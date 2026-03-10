import { getCurrentScope } from "./scope"
import { cleanupEffect, setDepsCollector, withTracking } from "./tracking"

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

export function effect(fn: () => void): Effect {
  // Capture the scope at creation time — remains correct during future re-runs
  // even after setCurrentScope(null) has been called post-setup.
  const scope = getCurrentScope()
  let disposed = false
  let isFirstRun = true

  const run = () => {
    if (disposed) return
    // Clean up previous subscriptions before re-running (dynamic dep tracking)
    cleanupEffect(run)
    try {
      withTracking(run, fn)
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
export function renderEffect(fn: () => void): () => void {
  const deps: Array<Set<() => void>> = []
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
