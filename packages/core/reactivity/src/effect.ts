import { _captureCallerLocation, _rdRecordFire, _rdRegister } from './reactive-devtools'
import { getCurrentScope } from './scope'
import {
  getInnerEffectCollector,
  runCollect,
  runVerify,
  setInnerEffectCollector,
} from './tracking'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

export interface Effect {
  dispose(): void
}

export interface EffectOptions {
  /**
   * @internal — source location injected by `@pyreon/vite-plugin` at build
   * time. When present, the runtime skips the `new Error().stack` capture
   * in `_rdRegister` — saves ~2.2µs per effect creation when devtools is
   * active. Plain user code should NOT set this; the field is opaque
   * (no public type) so it's not part of the public API surface.
   *
   * Shape: `{ file: string; line: number; col: number }` matching
   * `@pyreon/reactivity`'s `SourceLocation`.
   */
  __sourceLocation?: { file: string; line: number; col: number }
}

// ─── Effect-scoped context-owner capture (DI from `@pyreon/core`) ────────────
//
// Effects re-run reactively in response to signal changes. When that re-run
// happens AFTER the synchronous mount that set the effect up, the active
// context OWNER (the `@pyreon/core` scope whose `_contexts` provide() wrote to)
// may differ from setup time — e.g. `mountReactive` swaps owners via
// `runWithContextOwner` when it mounts deferred children. Without restoring the
// owner captured at setup, signal-driven re-runs of `_bind` / `renderEffect` /
// `effect` would resolve `useContext()` through whatever owner happens to be
// current when the scheduler fires — silently breaking provider-backed APIs
// like `useMode()`, `useTheme()`, `useRouter()`, etc. on every reactive update.
//
// `@pyreon/reactivity` is below `@pyreon/core` in the dep order, so it can't
// read the context owner that core manages directly. Core registers a
// capture+restore pair via `setSnapshotCapture` at module load (backed by
// `getContextOwner` / `runWithContextOwner`). When unset (raw reactivity-only
// consumers), effects skip context handling — same behavior as before.
export interface ReactiveSnapshotCapture {
  capture: () => unknown
  /** Run `fn` with the previously-captured snapshot active. */
  restore: <T>(snap: unknown, fn: () => T) => T
}

let _snapshotCapture: ReactiveSnapshotCapture | null = null

/**
 * Register a capture/restore pair so reactivity-layer effects (`_bind`,
 * `renderEffect`, `effect`) can preserve external context (e.g. the core
 * provide/useContext stack) across signal-driven re-runs. Called by
 * `@pyreon/core`'s context module at import time. Idempotent — calling again
 * replaces the previously registered hook.
 */
export function setSnapshotCapture(hook: ReactiveSnapshotCapture | null): void {
  _snapshotCapture = hook
}

// ─── onCleanup ───────────────────────────────────────────────────────────────
// Thread-local collector for cleanup functions registered via onCleanup()
// during effect execution. LAZY: the run body only opens the WINDOW (a
// boolean); the array is allocated on the first onCleanup() call. The old
// shape pre-allocated a `collected: []` array on EVERY effect run — pure
// garbage for the overwhelming majority of effects that never call
// onCleanup. Both window + array are saved/restored around each run, so a
// NESTED effect() created inside an outer effect's body no longer clobbers
// the outer's collector (pre-fix: the inner run set the module var to null
// on exit, silently DROPPING any outer onCleanup() registered after the
// nested effect creation — regression-locked in verify-deps.test.ts).
let _cleanupCollector: (() => void)[] | null = null
let _cleanupWindowOpen = false

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
  if (_cleanupWindowOpen) {
    if (_cleanupCollector === null) _cleanupCollector = []
    _cleanupCollector.push(fn)
  }
}

// Lazy inner-effect collection window sentinel. An effect run opens the
// window by setting the module collector to THIS array; the first nested
// `effect()` created during the run swaps in a real array (see the
// registration block at the bottom of `effect()`). Nothing ever pushes into
// the sentinel itself — the swap happens before the first push by
// construction. Saves one `myInners: []` allocation on every effect run for
// the dominant no-nested-effects case.
const LAZY_INNER: unknown[] = []

// Inner-effect collector state is owned by tracking.ts (see
// `getInnerEffectCollector` / `setInnerEffectCollector`) so `runUntracked`
// can suspend it in lock-step with `activeEffect`. effect.ts only manipulates
// it through the imported getter/setter — keeps the auto-cleanup chain
// disconnected from work that explicitly opted out of the outer reactive
// context (W23 from kanban audit).

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
  // Last-resort unhandled-effect-error reporter — MUST fire in
  // production (silently swallowing uncaught effect errors is a
  // serious bug; React/Vue/Solid all log uncaught errors in prod).
  // Deliberately not __DEV__-gated.
  // pyreon-lint-disable-next-line pyreon/dev-guard-warnings
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

export function effect(
  fn: () => (() => void) | void,
  options?: EffectOptions,
): Effect {
  // Dev-mode warning for async effect callbacks. The
  // tracking context is the synchronous frame around `fn()`'s top half;
  // anything after the first `await` runs detached, so signal reads on
  // the back side aren't tracked and the effect won't re-run when those
  // signals change. The fix at the call site is either to read all
  // tracked signals BEFORE the first await, or split the work into two
  // effects (or use `watch` for async-in-callback). Surfacing the warn
  // at registration is the cheapest catch we can offer: an
  // `AsyncFunction.prototype.constructor.name === 'AsyncFunction'`
  // check is true at function-definition time without invoking anything.
  if (process.env.NODE_ENV !== 'production') {
    if (fn.constructor && fn.constructor.name === 'AsyncFunction') {
      // oxlint-disable-next-line no-console
      console.warn(
        '[pyreon] effect() received an async function. Signal reads after the first `await` are NOT tracked — only the synchronous prefix is. ' +
          'Read every tracked signal BEFORE any await, or split into separate effects, or use `watch(source, asyncCb)` for async-in-callback patterns.',
      )
    }
  }

  // Capture the scope at creation time — remains correct during future re-runs
  // even after setCurrentScope(null) has been called post-setup.
  const scope = getCurrentScope()
  // Capture the external (core-context) owner AND the hook reference at SETUP.
  // Reactive re-runs restore it before invoking fn, so provider lookups stay
  // correct even when the active context owner differs at re-run time
  // (mountReactive swaps owners via runWithContextOwner). See `_bind` for the
  // full rationale. `cap` is a stable closure capture for the lifetime of
  // this effect (matches setup-time semantics; runtime hook null-out doesn't
  // affect already-set-up effects).
  const cap = _snapshotCapture
  const snapshot = cap ? cap.capture() : null
  // Pre-build the restore-wrapping closure ONCE at setup (mirrors
  // `renderEffect`'s `trackedFn`). The previous per-re-run `() => restore(...)`
  // allocation fired on every non-first effect run; this reuses one closure.
  // When no snapshot (or no hook), re-runs use `fn` directly — no wrapper.
  const fnToRunReplay: () => void =
    snapshot !== null && cap ? () => cap.restore(snapshot, fn) : fn
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
    if (process.env.NODE_ENV !== 'production') {
      _countSink.__pyreon_count__?.('reactivity.effectRun')
      _rdRecordFire(run)
    }
    // Run previous cleanup before re-running
    runCleanup()
    // Open a LAZY inner-effect collection window (sentinel — no array
    // allocation unless a nested effect() is actually created; see
    // LAZY_INNER) and a LAZY onCleanup window (boolean — array allocated on
    // first onCleanup call). Both saved/restored so nested effect runs
    // can't clobber this run's collection state.
    const outerCollector = getInnerEffectCollector()
    setInnerEffectCollector(LAZY_INNER)
    const prevCleanupWindow = _cleanupWindowOpen
    const prevCleanupCollector = _cleanupCollector
    _cleanupWindowOpen = true
    _cleanupCollector = null
    try {
      // First run COLLECTS deps into the persistent array; re-runs VERIFY
      // them positionally (zero Set ops in the steady state — see
      // tracking.ts verify-mode docs). No per-re-run teardown: the old
      // `cleanupLocalDeps + re-collect` pair is what verify mode replaces.
      //
      // First run also executes inside the synchronous mount where the
      // context stack is still intact — call fn directly to avoid pushing
      // the captured snapshot a redundant second time. Subsequent re-runs
      // happen AFTER mountReactive's cleanup has truncated the stack, so
      // they need the snapshot restored — use the cached `fnToRunReplay`
      // closure built once at setup (no per-re-run allocation).
      cleanup =
        (isFirstRun ? runCollect(run, deps, fn) : runVerify(run, deps, fnToRunReplay)) ||
        undefined
      if (_cleanupCollector !== null) cleanups = _cleanupCollector
    } catch (err) {
      _errorHandler(err)
    } finally {
      _cleanupWindowOpen = prevCleanupWindow
      _cleanupCollector = prevCleanupCollector
      const mine = getInnerEffectCollector()
      if (mine !== LAZY_INNER && mine !== null) innerEffects = mine as Effect[]
      setInnerEffectCollector(outerCollector)
    }
    // Notify scope after each reactive re-run (not the initial synchronous run)
    // so onUpdate hooks fire after the DOM has settled.
    if (!isFirstRun) scope?.notifyEffectRan()
    isFirstRun = false
  }

  let _effectId: number | undefined
  if (process.env.NODE_ENV !== 'production')
    // skipFrames=1: skip the `effect()` / `renderEffect()` frame, capture the user's call site.
    // Prefer build-time-injected location over the ~2.2µs stack-capture
    // fallback. @pyreon/vite-plugin's `injectSignalNames` rewrites
    // `effect(() => …)` to `effect(() => …, { __sourceLocation: {…} })`.
    _effectId = _rdRegister(
      run,
      'effect',
      null,
      run,
      undefined,
      options?.__sourceLocation ?? _captureCallerLocation(1),
    )

  run()

  const e: Effect = {
    dispose() {
      runCleanup()
      disposed = true
      cleanupLocalDeps(deps, run)
    },
  }

  // Dev-only: stash the reactive-graph node id on the returned Effect handle
  // so `@pyreon/testing`'s `expectEffect(e)` can target this effect's fire
  // count. The internal `run` closure carries `__pxRdId` (from `_rdRegister`)
  // but is not returned — the Effect handle is the user-facing one. Mirror
  // the id onto it. Tree-shaken in production with the rest of the dev gate.
  // (`_effectId` is always the number from the dev-gated `_rdRegister` above
  // in this branch; a stray `undefined` would make `_rdNodeId` return
  // undefined, so no defensive check — which would be an uncoverable arm.)
  if (process.env.NODE_ENV !== 'production') {
    Object.defineProperty(e, '__pxRdId', {
      value: _effectId,
      enumerable: false,
      configurable: true,
    })
  }

  // If we're inside another effect's run, register with it so the outer
  // disposes this inner automatically. The collector is `null` inside
  // `runUntracked` (see tracking.ts) — work that explicitly opted out of
  // the outer reactive context falls through to scope.add instead, so
  // child component effects mounted inside `mountFor`'s `runUntracked`
  // wrap aren't auto-disposed on the For's next re-run (W23).
  const collector = getInnerEffectCollector()
  if (collector !== null) {
    if (collector === LAZY_INNER) {
      // First nested effect of the enclosing run — materialize the real
      // array now (the lazy-window swap; the sentinel itself is never
      // mutated).
      setInnerEffectCollector([e])
    } else {
      ;(collector as Effect[]).push(e)
    }
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
 * - No error handler (errors propagate naturally)
 * - No onUpdate notification, no onCleanup collection, no inner-effect window
 * - Re-runs use the same verify-mode dep reuse as `effect()` but skip the
 *   cleanup/inner-effect ceremony entirely
 *
 * It DOES auto-register its disposer with the current `EffectScope` (same as
 * `effect()`), so template bindings tear down with the owning component.
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
 * - No tracking frame at all (renderEffect re-runs enter a `runVerify`
 *   frame — cheap, but still a save/restore + one compare per read)
 * - Signal reads hit `if (activeEffect)` null check → instant return
 */
export function _bind(fn: () => void): () => void {
  const deps: Set<() => void>[] = []
  let disposed = false

  // Capture the snapshot AND the hook reference at SETUP. Re-runs use the
  // captured `cap` const, not the module-level `_snapshotCapture` — same shape
  // as `renderEffect` (line 434-437): the per-re-run dual check collapses to a
  // single direct dispatch. `cap` is a stable closure capture for the lifetime
  // of this binding; runtime `setSnapshotCapture(null)` (a test-only / extreme-
  // edge scenario) doesn't disturb it, matching setup-time semantics (the
  // binding's provider chain is fixed at setup, not re-evaluated every fire).
  const cap = _snapshotCapture
  const snapshot = cap ? cap.capture() : null

  // Pre-pick the run body at setup so re-runs do disposed-check + direct
  // dispatch only — no per-fire branch on `snapshot !== null && _snapshotCapture`.
  // The `if (disposed) return` in each closure is a defensive disposed-mid-
  // flush guard — dispose normally removes the effect's notify from the
  // pending queue before its run, so the guard fires only in the narrow
  // window where a sibling disposes this effect during the same flush.
  const run: () => void =
    snapshot !== null && cap
      ? () => {
          /* v8 ignore next */
          if (disposed) return
          cap.restore(snapshot, fn)
        }
      : () => {
          /* v8 ignore next */
          if (disposed) return
          fn()
        }

  // First run: track deps so we know what to unsubscribe on dispose. We
  // intentionally call `fn` directly (not `run`) here — the synchronous
  // mount stack is already intact at this point, so restoring the captured
  // snapshot would just push the same frames again redundantly.
  runCollect(run, deps, fn)

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
  // Same dev warning as `effect()` — signal reads after the first
  // await aren't tracked. See effect()'s docstring for full reasoning.
  if (process.env.NODE_ENV !== 'production') {
    if (fn.constructor && fn.constructor.name === 'AsyncFunction') {
      // oxlint-disable-next-line no-console
      console.warn(
        '[pyreon] renderEffect() received an async function. Signal reads after the first `await` are NOT tracked — only the synchronous prefix is. ' +
          'Read every tracked signal BEFORE any await, or split into separate effects, or use `watch(source, asyncCb)` for async-in-callback patterns.',
      )
    }
  }

  const deps: Set<() => void>[] = []
  let disposed = false
  let isFirstRun = true

  // Same rationale as `_bind`: capture the external context snapshot at
  // SETUP and restore it on signal-driven re-runs so provider lookups stay
  // correct even after `mountReactive`'s cleanup truncates the global stack.
  const snapshot = _snapshotCapture ? _snapshotCapture.capture() : null

  const trackedFn =
    snapshot !== null && _snapshotCapture
      ? () => (_snapshotCapture as ReactiveSnapshotCapture).restore(snapshot, fn)
      : fn

  const run = () => {
    if (disposed) return
    if (isFirstRun) {
      isFirstRun = false
      // First run: stack is still intact (we're inside the synchronous
      // mount), so call fn directly to avoid pushing the snapshot frames
      // a second time.
      runCollect(run, deps, fn)
    } else {
      // Re-run: VERIFY the previous dep list positionally (zero Set ops in
      // the steady state) instead of the old cleanup-all + re-track pair.
      runVerify(run, deps, trackedFn)
    }
  }

  if (process.env.NODE_ENV !== 'production')
    // skipFrames=1: skip the `effect()` / `renderEffect()` frame, capture the user's call site.
    _rdRegister(run, 'effect', null, run, undefined, _captureCallerLocation(1))

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
