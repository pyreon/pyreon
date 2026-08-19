import { _captureCallerLocation, _rdRecordFire, _rdRegister } from './reactive-devtools'
import { getCurrentScope } from './scope'
import {
  getInnerEffectCollector,
  removeSubscriber,
  runCollect,
  runVerify,
  setInnerEffectCollector,
  type SubscriberHost,
} from './tracking'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

export interface Effect {
  dispose(): void
}

export interface EffectOptions {
  /**
   * @internal Source location injected by `@pyreon/vite-plugin` at build time.
   * When present the runtime skips the `new Error().stack` capture in
   * `_rdRegister` — saves ~2.2us per effect creation when devtools is active.
   * User code should NOT set this.
   */
  __sourceLocation?: { file: string; line: number; col: number }
}

// ─── Effect-scoped context-owner capture (DI from `@pyreon/core`) ────────────
// A re-run happens after the synchronous mount, when the active context OWNER
// may differ from setup time (mountReactive swaps owners for deferred children).
// Without restoring the setup-time owner, `useContext()` resolves through
// whatever owner is current when the scheduler fires — silently breaking
// useMode/useTheme/useRouter on every update. reactivity sits below core, so
// core registers the capture/restore pair via `setSnapshotCapture`; when unset,
// effects skip context handling entirely.
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
// Thread-local collector for cleanups registered during effect execution. LAZY:
// the run opens only a boolean WINDOW; the array is allocated on first use.
// Window and array are saved/restored per run, or a NESTED effect() would null
// the module var on exit and silently DROP outer cleanups registered after it.
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

// Lazy inner-effect window sentinel: a run opens the window by setting the
// module collector to THIS array, and the first nested `effect()` swaps in a real
// one. Nothing ever pushes into the sentinel, so the dominant
// no-nested-effects case allocates nothing.
const LAZY_INNER: unknown[] = []

// Inner-effect collector state lives in tracking.ts so `runUntracked` can
// suspend it in lock-step with `activeEffect`.

// Global handler for unhandled errors thrown inside effects; defaults to
// console.error so failures are never silently swallowed. Two surfaces fire on
// every error: the legacy `setErrorHandler` handler, and a globalThis bridge
// `__pyreon_report_error__` that `@pyreon/core` installs so effect errors reach
// the same telemetry pipeline as component errors. globalThis-based to avoid an
// upward import. New consumers should prefer core's `registerErrorHandler`.

interface PyreonErrorBridge {
  __pyreon_report_error__?: (err: unknown, phase: 'effect') => void
}
const _errorBridge = globalThis as PyreonErrorBridge

function _defaultErrorHandler(err: unknown): void {
  // Last-resort reporter — MUST fire in production too. Silently swallowing an
  // uncaught effect error is a serious bug; React/Vue/Solid all log in prod.
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
function cleanupLocalDeps(deps: SubscriberHost[], fn: () => void): void {
  if (deps.length === 1) {
    removeSubscriber(deps[0] as SubscriberHost, fn)
    deps.length = 0
  } else if (deps.length > 1) {
    for (let i = 0; i < deps.length; i++) removeSubscriber(deps[i] as SubscriberHost, fn)
    deps.length = 0
  }
}

export function effect(
  fn: () => (() => void) | void,
  options?: EffectOptions,
): Effect {
  // Async effect callbacks: the tracking context is the synchronous frame around
  // fn's top half, so reads after the first `await` are never tracked. The
  // constructor-name check catches it at registration without invoking anything.
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
  // Capture the context owner + hook at SETUP; re-runs restore it before
  // invoking fn (see the module header).
  const cap = _snapshotCapture
  const snapshot = cap ? cap.capture() : null
  // Pre-build the restore wrapper ONCE at setup instead of allocating a
  // `() => restore(...)` closure on every non-first run.
  const fnToRunReplay: () => void =
    snapshot !== null && cap ? () => cap.restore(snapshot, fn) : fn
  let disposed = false
  let isFirstRun = true
  let cleanup: (() => void) | undefined
  // Local deps array — avoids WeakMap overhead (like renderEffect)
  const deps: SubscriberHost[] = []

  let cleanups: (() => void)[] | undefined
  // Inner effects created during this effect's body — disposed on outer re-run
  // and on outer dispose, else they leak across outer lifecycle boundaries.
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
    runCleanup()
    // Open LAZY inner-effect + onCleanup windows (nothing allocated until
    // actually used), saved/restored so nested runs can't clobber this one.
    const outerCollector = getInnerEffectCollector()
    setInnerEffectCollector(LAZY_INNER)
    const prevCleanupWindow = _cleanupWindowOpen
    const prevCleanupCollector = _cleanupCollector
    _cleanupWindowOpen = true
    _cleanupCollector = null
    try {
      // First run COLLECTS deps; re-runs VERIFY them positionally (zero Set ops
      // in the steady state). The first run is inside the synchronous mount where
      // the context stack is still intact, so it calls fn directly; re-runs happen
      // after mountReactive truncated the stack and need it restored.
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

  // Dev-only: mirror the reactive-graph node id onto the returned Effect handle
  // so `@pyreon/testing`'s `expectEffect(e)` can target this effect's fire count
  // (the internal `run` closure carries `__pxRdId` but isn't returned).
  if (process.env.NODE_ENV !== 'production') {
    Object.defineProperty(e, '__pxRdId', {
      value: _effectId,
      enumerable: false,
      configurable: true,
    })
  }

  // If we're inside another effect's run, register with it so the outer disposes
  // this inner automatically. The collector is `null` inside `runUntracked`, so
  // work that explicitly opted out of the outer reactive context falls through
  // to scope.add — that's what keeps child component effects mounted inside
  // `mountFor`'s `runUntracked` wrap alive across the For's next re-run.
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
  const deps: SubscriberHost[] = []
  let disposed = false

  // Capture the snapshot AND the hook reference at SETUP, so re-runs dispatch
  // directly instead of re-checking the module-level hook. `cap` is a stable
  // closure capture for this binding's lifetime — a later
  // `setSnapshotCapture(null)` doesn't disturb it, matching setup-time
  // semantics (the provider chain is fixed at setup).
  const cap = _snapshotCapture
  const snapshot = cap ? cap.capture() : null

  // Pre-pick the run body at setup so re-runs do a disposed-check + direct
  // dispatch only, with no per-fire branch. The `if (disposed) return` guard
  // covers the narrow window where a sibling disposes this effect during the
  // same flush (dispose normally removes the notify before its run).
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
    for (const h of deps) removeSubscriber(h, run)
    deps.length = 0
  }

  // Auto-register with scope so template bindings are disposed during teardown
  getCurrentScope()?.add({ dispose })

  return dispose
}

/**
 * Lightweight effect for DOM render bindings.
 *
 * Differences from `effect()`: no error handler (errors propagate naturally),
 * no onUpdate notification, no onCleanup collection, no inner-effect window.
 * Re-runs use the same verify-mode dep reuse but skip that ceremony entirely.
 *
 * It DOES auto-register its disposer with the current `EffectScope`, so
 * template bindings tear down with the owning component. Returns a dispose
 * function rather than an Effect object — saves one allocation.
 */
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

  const deps: SubscriberHost[] = []
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
      removeSubscriber(deps[0] as SubscriberHost, run)
    } else {
      for (const h of deps) removeSubscriber(h, run)
    }
    deps.length = 0
  }

  // Auto-register with scope so render effects are disposed during teardown
  getCurrentScope()?.add({ dispose })

  return dispose
}
