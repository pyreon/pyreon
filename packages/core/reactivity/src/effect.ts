import { getCurrentScope } from './scope'
import { _restoreActiveEffect, _setActiveEffect, setDepsCollector, withTracking } from './tracking'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

export interface Effect {
  dispose(): void
}

// ─── onCleanup ───────────────────────────────────────────────────────────────
// Thread-local collector for cleanup functions registered via onCleanup()
// during effect execution. Pushed/popped around the user callback in effect().
let _cleanupCollector: (() => void)[] | null = null

/**
 * Register a cleanup function inside an effect. The cleanup runs:
 * - Before the effect re-runs (when dependencies change)
 * - When the effect is disposed
 *
 * Can be called multiple times — all cleanups run in registration order.
 * Must be called synchronously during effect setup (like onMount/onUnmount).
 *
 * @example
 * effect(() => {
 *   const controller = new AbortController()
 *   onCleanup(() => controller.abort())
 *   fetch(`/api/user/${userId()}`, { signal: controller.signal })
 *     .then(r => r.json())
 *     .then(data => user.set(data))
 * })
 */
export function onCleanup(fn: () => void): void {
  if (_cleanupCollector) {
    _cleanupCollector.push(fn)
  }
}

// Thread-local collector for nested effects — captures effect() calls made
// inside another effect's fn() body so the parent can dispose them on
// re-run / disposal. Without this, inner effects leak across outer
// lifecycle boundaries (caught by cleanup-nested.test.ts).
let _innerEffectCollector: Effect[] | null = null

// Global error handler — called for unhandled errors thrown inside effects.
// Defaults to console.error so silent failures are never swallowed.
//
// Two-layer model:
//   1. The user-overridable single handler set via `setErrorHandler` (legacy
//      direct API).
//   2. A globalThis bridge `__pyreon_report_error__` that `@pyreon/core`
//      installs in `registerErrorHandler` to forward effect errors into the
//      same telemetry pipeline as component / mount / render errors.
//      Pre-fix the two surfaces were disconnected — Sentry/Datadog wiring via
//      core's `registerErrorHandler` silently missed effect-thrown errors.
//      Globalthis-based to avoid an upward import (core depends on
//      reactivity, not the reverse). Same shape as the perf-harness counter
//      sink — zero cost when no consumer is installed.
//
// Both surfaces fire on every effect error. The legacy handler stays for
// backward compat; new consumers should prefer `@pyreon/core`'s
// `registerErrorHandler`.

interface PyreonErrorBridge {
  __pyreon_report_error__?: (err: unknown, phase: 'effect') => void
}
const _errorBridge = globalThis as PyreonErrorBridge

function _defaultErrorHandler(err: unknown): void {
  console.error('[pyreon] Unhandled effect error:', err)
}

let _userErrorHandler: ((err: unknown) => void) | undefined

export const _errorHandler: (err: unknown) => void = (err) => {
  // 1. User-set or default direct handler.
  ;(_userErrorHandler ?? _defaultErrorHandler)(err)
  // 2. Global telemetry bridge (installed by @pyreon/core's
  //    registerErrorHandler). Forwards effect errors into reportError so
  //    Sentry/Datadog wiring captures them alongside component errors.
  _errorBridge.__pyreon_report_error__?.(err, 'effect')
}

export function setErrorHandler(fn: (err: unknown) => void): void {
  _userErrorHandler = fn
}

/** Remove an effect from all dependency subscriber sets (local deps array). */
function cleanupLocalDeps(deps: Set<() => void>[], fn: () => void): void {
  if (deps.length === 1) {
    ;(deps[0] as Set<() => void>).delete(fn)
    deps.length = 0
  } else if (deps.length > 1) {
    for (let i = 0; i < deps.length; i++) (deps[i] as Set<() => void>).delete(fn)
    deps.length = 0
  }
}

export function effect(fn: () => (() => void) | void): Effect {
  // Capture the scope at creation time — remains correct during future re-runs
  // even after setCurrentScope(null) has been called post-setup.
  const scope = getCurrentScope()
  let disposed = false
  let isFirstRun = true
  let cleanup: (() => void) | undefined
  // Local deps array — avoids WeakMap overhead (like renderEffect)
  const deps: Set<() => void>[] = []

  let cleanups: (() => void)[] | undefined
  // Inner effects created during this effect's fn() body. Disposed on
  // outer re-run (before the next fn()) and on outer dispose(). Without
  // this, nested effects leak across outer lifecycle boundaries.
  let innerEffects: Effect[] | null = null

  const runCleanup = () => {
    if (innerEffects) {
      for (const ie of innerEffects) {
        try {
          ie.dispose()
        } catch (err) {
          _errorHandler(err)
        }
      }
      innerEffects = null
    }
    if (cleanups) {
      for (const c of cleanups) {
        try {
          c()
        } catch (err) {
          _errorHandler(err)
        }
      }
      cleanups = undefined
    }
    if (typeof cleanup === 'function') {
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
    if (process.env.NODE_ENV !== 'production')
      _countSink.__pyreon_count__?.('reactivity.effectRun')
    // Run previous cleanup before re-running
    runCleanup()
    // Start a new inner-effect collection window. Effects created during
    // fn() will push themselves into this array and be disposed on the
    // next re-run or on dispose.
    const outerCollector = _innerEffectCollector
    const myInners: Effect[] = []
    _innerEffectCollector = myInners
    try {
      cleanupLocalDeps(deps, run)
      setDepsCollector(deps)
      // Collect onCleanup() registrations during execution
      const collected: (() => void)[] = []
      _cleanupCollector = collected
      cleanup = withTracking(run, fn) || undefined
      _cleanupCollector = null
      if (collected.length > 0) cleanups = collected
      setDepsCollector(null)
    } catch (err) {
      _cleanupCollector = null
      setDepsCollector(null)
      _errorHandler(err)
    } finally {
      _innerEffectCollector = outerCollector
    }
    if (myInners.length > 0) innerEffects = myInners
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
      cleanupLocalDeps(deps, run)
    },
  }

  // If we're inside another effect's run, register with it so the outer
  // disposes this inner automatically.
  if (_innerEffectCollector !== null) {
    _innerEffectCollector.push(e)
  } else {
    // Otherwise auto-register with the active EffectScope (if any)
    getCurrentScope()?.add(e)
  }

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

/** Full re-track path for renderEffect: cleanup old deps, evaluate with tracking. */
function renderEffectFullTrack(deps: Set<() => void>[], run: () => void, fn: () => void): void {
  if (deps.length === 1) {
    ;(deps[0] as Set<() => void>).delete(run)
    deps.length = 0
  } else if (deps.length > 1) {
    for (const s of deps) s.delete(run)
    deps.length = 0
  }
  setDepsCollector(deps)
  _setActiveEffect(run)
  try {
    fn()
  } finally {
    _restoreActiveEffect()
    setDepsCollector(null)
  }
}

export function renderEffect(fn: () => void): () => void {
  const deps: Set<() => void>[] = []
  let disposed = false
  let isFirstRun = true

  const run = () => {
    if (disposed) return
    // After first run, if deps haven't changed structure, we can skip
    // the full cleanup+retrack path. However, renderEffect deps CAN
    // change (unlike _bind), so we always do the full track.
    // Optimization: skip cleanup on first run (deps are empty).
    if (isFirstRun) {
      isFirstRun = false
      setDepsCollector(deps)
      _setActiveEffect(run)
      try {
        fn()
      } finally {
        _restoreActiveEffect()
        setDepsCollector(null)
      }
    } else {
      renderEffectFullTrack(deps, run, fn)
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
