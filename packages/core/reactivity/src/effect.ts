import {
  _captureCallerLocation,
  _rdCloseBindingFrame,
  _rdOpenBindingFrame,
  _rdRecordFire,
  _rdRegister,
  _rdRegisterBinding,
  _rdTagHandle,
} from './reactive-devtools'
import { _errorHandler, setErrorHandler } from './errors'
import {
  F_DIRTY,
  F_DISPOSED,
  F_PENDING,
  F_RUNNING,
  F_STATIC,
  type Link,
  type WatcherNode,
  _b,
  _t,
  checkDirty,
  endBatch,
  purgeDeps,
  settleFirstRun,
  settleUnread,
  unconfirmed,
  unlinkAllDeps,
} from './graph'
import { type EffectScope, getCurrentScope } from './scope'

export { _errorHandler, setErrorHandler }

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

/**
 * Register a capture/restore pair so reactivity-layer effects (`_bind`,
 * `renderEffect`, `effect`) can preserve external context (e.g. the core
 * provide/useContext stack) across signal-driven re-runs. Called by
 * `@pyreon/core`'s context module at import time. Idempotent — calling again
 * replaces the previously registered hook.
 */
export function setSnapshotCapture(hook: ReactiveSnapshotCapture | null): void {
  _c.s = hook
}

// ─── onCleanup ───────────────────────────────────────────────────────────────
// Thread-local collector for cleanups registered during effect execution. LAZY:
// the run opens only a boolean WINDOW; the array is allocated on first use.
// Window and array are saved/restored per run, or a NESTED effect() would null
// the module var on exit and silently DROP outer cleanups registered after it.
// Held as fields of one `const` object rather than module-level `let`s — see the
// V8 measurement on `TrackingFrame` in tracking.ts.
interface CleanupFrame {
  c: (() => void)[] | null
  o: boolean
  /** Context snapshot hook registered by `@pyreon/core` (see `setSnapshotCapture`). */
  s: ReactiveSnapshotCapture | null
}

const _c: CleanupFrame = {
  c: null,
  o: false,
  s: null,
}

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
  if (_c.o) {
    // `[fn]`, not `[]` + push: V8's first push reserves 16 slots, and most
    // windows collect exactly one cleanup.
    if (_c.c === null) _c.c = [fn]
    else _c.c.push(fn)
  }
}

/**
 * Saved state of the onCleanup window, as returned by `_enterCleanupFrame`.
 * `false` = window was closed, `true` = open with nothing collected yet, an
 * array = open with that collector. Encoded as one value so entering a frame
 * allocates nothing.
 * @internal
 */
export type CleanupFrameToken = boolean | (() => void)[]

/**
 * Open a fresh onCleanup window for a NON-effect owner — a component's setup
 * frame. `@pyreon/core`'s `runWithHooks` calls this so that `onCleanup()` in a
 * component body is collected for THAT component (and run on its unmount)
 * instead of vanishing at the root or latching onto whichever effect happens to
 * be mounting the component (a `<For>` / `<Show>` / router boundary), whose
 * re-runs would fire it while the component is still mounted.
 *
 * Must be paired with `_exitCleanupFrame(token)` in a `finally` — it RESTORES
 * the caller's window (never resets to a constant: setup nests inside effect
 * runs and inside other setups).
 * @internal
 */
export function _enterCleanupFrame(): CleanupFrameToken {
  const token: CleanupFrameToken = _c.o ? (_c.c ?? true) : false
  _c.o = true
  _c.c = null

  return token
}

/**
 * Close the frame opened by `_enterCleanupFrame`, restore the caller's window,
 * and return what this frame collected (`null` when nothing was registered).
 * @internal
 */
export function _exitCleanupFrame(token: CleanupFrameToken): (() => void)[] | null {
  const collected = _c.c
  _c.o = token !== false
  _c.c = typeof token === 'boolean' ? null : token

  return collected
}

// Lazy inner-effect window sentinel: a run opens the window by setting the
// module collector to THIS array, and the first nested `effect()` swaps in a real
// one. Nothing ever pushes into the sentinel, so the dominant
// no-nested-effects case allocates nothing.
const LAZY_INNER: unknown[] = []

// Inner-effect collector state lives in tracking.ts so `runUntracked` can
// suspend it in lock-step with `_t.e`.

/** Two returned cleanups of one effect: run both. */
function chainCleanup(first: () => void, second: () => void): () => void {
  return () => {
    try {
      first()
    } catch (err) {
      _errorHandler(err)
    }
    second()
  }
}

/**
 * An `effect()`: the node in the graph, the handle `effect()` returns, and
 * what the scope (or the enclosing effect) stores to dispose it. Methods live
 * on the prototype; per effect there is this one object plus one `Link` per
 * dependency.
 */
class EffectNode implements WatcherNode, Effect {
  _f = 0
  _deps: Link | null = null
  _depsTail: Link | null = null
  _fn: () => (() => void) | void
  /** The cleanup the last run returned. */
  _cleanup: (() => void) | undefined = undefined
  /** `onCleanup` callbacks registered by the last run. */
  _cleanups: (() => void)[] | null = null
  /** Effects created by the last run (disposed before the next one). */
  _inner: Effect[] | null = null
  /** The scope current at creation: `onUpdate` hooks after each re-run. */
  _scope: EffectScope | null
  /** Context snapshot captured at creation, restored around re-runs. */
  _snap: unknown

  constructor(fn: () => (() => void) | void, scope: EffectScope | null, snap: unknown) {
    this._fn = fn
    this._scope = scope
    this._snap = snap
  }

  /** At its queue turn: run if a source it read changed. */
  run(): void {
    const f = this._f
    if ((f & F_DISPOSED) !== 0) return
    if ((f & F_DIRTY) !== 0 || ((f & F_PENDING) !== 0 && checkDirty(this))) this._exec(false)
    else this._f &= ~F_PENDING
  }

  _exec(first: boolean): void {
    if (process.env.NODE_ENV !== 'production') {
      _countSink.__pyreon_count__?.('reactivity.effectRun')
      _rdRecordFire(this)
    }
    // Most effects hold nothing to tear down between runs; skip the call.
    if (this._inner !== null || this._cleanups !== null || this._cleanup !== undefined) this._runCleanup()
    // Open LAZY inner-effect + onCleanup windows (nothing allocated until
    // actually used), saved/restored so nested runs can't clobber this one.
    const outerCollector = _t.n
    _t.n = LAZY_INNER
    const prevCleanupWindow = _c.o
    const prevCleanupCollector = _c.c
    _c.o = true
    _c.c = null
    const prevSub = _t.e
    _t.e = this
    this._depsTail = null
    this._f = (this._f & ~(F_DIRTY | F_PENDING)) | F_RUNNING
    let ok = false
    try {
      // The first run is inside the synchronous mount where the context stack
      // is still intact, so it calls fn directly; re-runs happen after
      // mountReactive truncated the stack and need it restored.
      const snap = this._snap
      const cap = _c.s
      const fn = this._fn
      const ret = !first && snap !== null && cap !== null ? cap.restore(snap, fn) : fn()
      ok = true
      if (typeof ret === 'function') this._cleanup = this._cleanup === undefined ? ret : chainCleanup(this._cleanup, ret)
    } catch (err) {
      _errorHandler(err)
    } finally {
      _t.e = prevSub
      const f = this._f & ~F_RUNNING
      this._f = f
      // Disposed by its own run: drop what the run linked. A run that THREW
      // keeps its unconfirmed dependency tail (a later change to it re-runs),
      // with any stale marks on it resolved (`settleUnread`).
      if ((f & F_DISPOSED) !== 0) unlinkAllDeps(this)
      else if (ok) purgeDeps(this)
      else settleUnread(unconfirmed(this))
      this._closeWindows(prevCleanupWindow, prevCleanupCollector, outerCollector)
    }
    // Notify scope after each reactive re-run (not the initial synchronous run)
    // so onUpdate hooks fire after the DOM has settled.
    if (!first) this._scope?.notifyEffectRan()
  }

  /**
   * Close the run's `onCleanup` and inner-effect windows and restore the
   * caller's. What this run registered is APPENDED, never assigned (cleanups
   * registered before a throw are kept too).
   */
  _closeWindows(prevOpen: boolean, prevCollector: (() => void)[] | null, outerCollector: unknown[] | null): void {
    const own = _c.c
    _c.o = prevOpen
    _c.c = prevCollector
    if (own !== null) this._cleanups = this._cleanups === null ? own : this._cleanups.concat(own)
    const mine = _t.n
    if (mine !== LAZY_INNER && mine !== null) {
      this._inner = this._inner === null ? (mine as Effect[]) : this._inner.concat(mine as Effect[])
    }
    _t.n = outerCollector
  }

  _runCleanup(): void {
    const inner = this._inner
    if (inner !== null) {
      this._inner = null
      for (const ie of inner) {
        try {
          ;(ie as EffectNode)._dispose()
        } catch (err) {
          _errorHandler(err)
        }
      }
    }
    const cleanups = this._cleanups
    if (cleanups !== null) {
      this._cleanups = null
      for (const c of cleanups) {
        try {
          c()
        } catch (err) {
          _errorHandler(err)
        }
      }
    }
    const cleanup = this._cleanup
    if (cleanup !== undefined) {
      this._cleanup = undefined
      try {
        cleanup()
      } catch (err) {
        _errorHandler(err)
      }
    }
  }

  _dispose(): void {
    if ((this._f & F_DISPOSED) !== 0) return
    this._runCleanup()
    this._f |= F_DISPOSED
    // Running right now (it disposed itself): the run's `finally` unlinks
    // whatever it linked after this point.
    unlinkAllDeps(this)
  }

  /**
   * The public disposer. A getter returning a bound function, because the
   * handle's `dispose` has always worked DETACHED (`onUnmount(e.dispose)`,
   * `const stop = effect(…).dispose`). Framework code calls `_dispose()`.
   */
  get dispose(): () => void {
    return () => this._dispose()
  }

  /** Assigning `handle.dispose` (as on the old plain-object handle) shadows it. */
  set dispose(fn: () => void) {
    Object.defineProperty(this, 'dispose', { value: fn, writable: true, configurable: true, enumerable: true })
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

  // Capture the scope and the context owner at creation — both stay correct
  // during future re-runs (see the module header).
  const cap = _c.s
  const node = new EffectNode(fn, getCurrentScope(), cap ? cap.capture() : null)

  if (process.env.NODE_ENV !== 'production')
    // skipFrames=1: skip the `effect()` frame, capture the user's call site.
    // Prefer build-time-injected location over the ~2.2µs stack-capture
    // fallback. @pyreon/vite-plugin's `injectSignalNames` rewrites
    // `effect(() => …)` to `effect(() => …, { __sourceLocation: {…} })`.
    _rdRegister(node, 'effect', null, node, undefined, options?.__sourceLocation ?? _captureCallerLocation(1))

  // The first run happens inside a batch window, so a write it makes to a
  // signal it already read RE-QUEUES this effect instead of re-running it
  // nested inside itself (design D9). `settleFirstRun` then re-runs it right
  // after the first run returns — synchronously, before `effect()` returns,
  // counted by MAX_PASSES. Other effects the first run's writes reached run
  // when the outermost window closes.
  _b.d++
  try {
    node._exec(true)
    settleFirstRun(node)
  } finally {
    endBatch()
  }

  // If we're inside another effect's run, register with it so the outer disposes
  // this inner automatically. The collector is `null` inside `runUntracked`, so
  // work that explicitly opted out of the outer reactive context falls through
  // to scope.add — that's what keeps child component effects mounted inside
  // `mountFor`'s `runUntracked` wrap alive across the For's next re-run.
  registerEffectHere(node)

  return node
}

/** Register a new effect with the CURRENT frame: the enclosing run's inner window, else the scope. */
function registerEffectHere(e: Effect): void {
  const collector = _t.n
  if (collector !== null) {
    if (collector === LAZY_INNER) {
      // First nested effect of the enclosing run — materialize the real
      // array now (the lazy-window swap; the sentinel itself is never
      // mutated).
      _t.n = [e]
    } else {
      ;(collector as Effect[]).push(e)
    }
  } else {
    // Otherwise auto-register with the active EffectScope (if any)
    getCurrentScope()?.add(e)
  }
}

/**
 * What a run captured with `_captureRun`: the effects it created and the
 * `onCleanup` callbacks it registered (`null` = none).
 * @internal
 */
export interface RunCapture {
  inner: Effect[] | null
  cleanups: (() => void)[] | null
}

/**
 * Run `fn` inside the same inner-effect and `onCleanup` windows an `effect()`
 * run opens, and record what it registered in `out` instead of letting it
 * reach the caller's frame. Pair with `_releaseRun` in whichever frame ends up
 * OWNING that work — so code evaluated once, before its owner is known (an
 * accessor child classified at mount), registers exactly where a call made in
 * that owner would have.
 * @internal
 */
export function _captureRun<T>(fn: () => T, out: RunCapture): T {
  const outerCollector = _t.n
  _t.n = LAZY_INNER
  const token = _enterCleanupFrame()
  try {
    return fn()
  } finally {
    out.cleanups = _exitCleanupFrame(token)
    const mine = _t.n
    out.inner = mine !== LAZY_INNER && mine !== null ? (mine as Effect[]) : null
    _t.n = outerCollector
  }
}

/**
 * Register what `_captureRun` recorded with the CURRENT frame, in creation
 * order, as if it had been created here.
 * @internal
 */
export function _releaseRun(cap: RunCapture): void {
  if (cap.inner !== null) for (const e of cap.inner) registerEffectHere(e)
  if (cap.cleanups !== null) for (const c of cap.cleanups) onCleanup(c)
  cap.inner = null
  cap.cleanups = null
}

/**
 * The disposer `renderEffect` and `_bind` return for a DEAD binding: one whose
 * first run tracked no dependency. Nothing can re-run such a binding (a re-run
 * is only ever scheduled by a tracked source), so it owns no subscription to
 * remove; keeping its closures, deps array and scope entry alive until unmount
 * would be pure waste. Compiled templates hit this for every binding that
 * reads only static props (`<FormRow label="Name" />` → `_bindProp(props,
 * 'label', …)`), which is most bindings on a design-system page.
 *
 * Shared and idempotent. Callers that layer their own teardown on top compare
 * against it (`dispose === _noopDispose`) to drop their wrapper too. Do not
 * store disposers keyed by identity: every dead binding returns this function.
 */
export const _noopDispose = (): void => {}

/**
 * A render binding (`renderEffect` / `_bind`): a graph subscriber with the
 * smallest possible run — no error handler (errors propagate), no `onUpdate`
 * notification, no `onCleanup` / inner-effect windows. `_bind` bindings carry
 * `F_STATIC`: re-runs skip tracking entirely (the compiler guarantees their
 * dependencies never change).
 */
class BindingNode implements WatcherNode {
  _f: number
  _deps: Link | null = null
  _depsTail: Link | null = null
  _fn: () => void
  /** Context snapshot captured at creation, restored around re-runs. */
  _snap: unknown

  constructor(fn: () => void, snap: unknown, flags: number) {
    this._fn = fn
    this._snap = snap
    this._f = flags
  }

  run(): void {
    const f = this._f
    if ((f & F_DISPOSED) !== 0) return
    if ((f & F_DIRTY) !== 0 || ((f & F_PENDING) !== 0 && checkDirty(this))) {
      if (process.env.NODE_ENV !== 'production') _rdRecordFire(this)
      if ((f & F_STATIC) !== 0) {
        // Static deps: no tracking frame (reads see `_t.e === null` in the flush).
        this._f = (this._f & ~(F_DIRTY | F_PENDING)) | F_RUNNING
        let ok = false
        try {
          this._call(true)
          ok = true
        } finally {
          this._f &= ~F_RUNNING
          // A throw may have skipped reading some of its (static) deps.
          if (!ok) settleUnread(this._deps)
        }

        return
      }
      this._track(true)
    } else this._f &= ~F_PENDING
  }

  /** Call the body; `restore` re-enters the setup-time context snapshot. */
  _call(restore: boolean): void {
    const fn = this._fn
    const snap = this._snap
    const cap = _c.s
    if (restore && snap !== null && cap !== null) cap.restore(snap, fn)
    else fn()
  }

  /** A tracked run: reset the cursor, run, drop what this run did not read. */
  _track(restore: boolean): void {
    const prevSub = _t.e
    _t.e = this
    this._depsTail = null
    this._f = (this._f & ~(F_DIRTY | F_PENDING)) | F_RUNNING
    let ok = false
    try {
      this._call(restore)
      ok = true
    } finally {
      _t.e = prevSub
      const f = this._f & ~F_RUNNING
      this._f = f
      if ((f & F_DISPOSED) !== 0) unlinkAllDeps(this)
      else if (ok) purgeDeps(this)
      else settleUnread(unconfirmed(this))
    }
  }

  dispose(): void {
    if ((this._f & F_DISPOSED) !== 0) return
    this._f |= F_DISPOSED
    unlinkAllDeps(this)
  }
}

/** First run of a binding: tracked, inside a batch window (see `effect()`). */
function firstRun(node: BindingNode): void {
  _b.d++
  try {
    node._track(false)
    settleFirstRun(node)
  } finally {
    endBatch()
  }
}

/**
 * Static-dep binding — compiler helper for template expressions.
 *
 * Like renderEffect but assumes dependencies never change (true for all
 * compiler-emitted template bindings like `_tpl()` text/attribute updates).
 *
 * Tracks dependencies only on the first run. Re-runs skip tracking and the
 * tracking-frame save/restore entirely — just call `fn()` directly.
 */
export function _bind(fn: () => void): () => void {
  // Capture the snapshot at SETUP; re-runs restore it.
  const cap = _c.s
  const node = new BindingNode(fn, cap ? cap.capture() : null, F_STATIC)

  // First run: track deps so we know what to unsubscribe on dispose. The
  // synchronous mount stack is intact here, so `fn` runs without the snapshot.
  // Dev: the first run is bracketed by the binding-label frame, so the DOM
  // setter it calls (`_setAttr(el, 'aria-busy', …)`) names the binding.
  if (process.env.NODE_ENV !== 'production') _rdOpenBindingFrame()
  try {
    firstRun(node)
  } finally {
    if (process.env.NODE_ENV !== 'production') _rdCloseBindingFrame()
  }

  // Dead binding: the first run subscribed to nothing, so nothing can ever
  // re-run it. Drop the disposer and the scope entry (see `_noopDispose`).
  if (node._deps === null) return _noopDispose

  // Dev: a LIVE binding is a reactive-graph node. skipFrames=1 skips `_bind`,
  // so the location is the compiled template that emitted the call. `_bind` is
  // only ever compiler-emitted for a DOM write, so it is a binding even when
  // its updater assigns the DOM without a setter (`dom`).
  if (process.env.NODE_ENV !== 'production')
    _rdRegisterBinding(node, _captureCallerLocation(1), 'dom')

  const dispose = (): void => node.dispose()
  if (process.env.NODE_ENV !== 'production') _rdTagHandle(dispose, node)

  // Auto-register with scope so template bindings are disposed during teardown
  getCurrentScope()?.add(dispose)

  return dispose
}

/**
 * Lightweight effect for DOM render bindings.
 *
 * Differences from `effect()`: no error handler (errors propagate naturally),
 * no onUpdate notification, no onCleanup collection, no inner-effect window.
 * Re-runs re-track (dynamic dependencies) but skip that ceremony entirely.
 *
 * It DOES auto-register its disposer with the current `EffectScope`, so
 * template bindings tear down with the owning component. Returns a dispose
 * function rather than an Effect object.
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

  // Same rationale as `_bind`: capture the external context snapshot at
  // SETUP and restore it on signal-driven re-runs so provider lookups stay
  // correct even after `mountReactive`'s cleanup truncates the global stack.
  const cap = _c.s
  const node = new BindingNode(fn, cap ? cap.capture() : null, 0)

  // Dev: bracket the first run with the binding-label frame (the DOM setter it
  // calls names the binding), and register only a LIVE binding — after the
  // run, once its deps are known. No try/finally: Bun's minifier keeps an
  // emptied `finally {}`, so the production output would change. If the first
  // run throws (the error propagates out of the mount anyway) the dev frame
  // stays open; that is harmless — every later frame saves and restores
  // around it.
  if (process.env.NODE_ENV !== 'production') _rdOpenBindingFrame()
  firstRun(node)
  if (process.env.NODE_ENV !== 'production') _rdCloseBindingFrame()

  // Dead binding (see `_noopDispose`): no dependency was tracked on the first
  // run, so no signal can ever schedule a re-run.
  if (node._deps === null) return _noopDispose

  // skipFrames=1: skip the `renderEffect()` frame, capture the caller's site.
  if (process.env.NODE_ENV !== 'production')
    _rdRegisterBinding(node, _captureCallerLocation(1))

  const dispose = (): void => node.dispose()
  if (process.env.NODE_ENV !== 'production') _rdTagHandle(dispose, node)

  // Auto-register with scope so render effects are disposed during teardown
  getCurrentScope()?.add(dispose)

  return dispose
}
