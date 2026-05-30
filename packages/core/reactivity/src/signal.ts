import { batch, enqueuePendingNotification, isBatching } from './batch'
import { _notifyTraceListeners, isTracing } from './debug'
import { _captureCallerLocation, _rdRecordFire, _rdRegister } from './reactive-devtools'
import { _recordSignalWrite } from './reactive-trace'
import { notifySubscribers, trackSubscriber } from './tracking'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

export interface SignalDebugInfo<T> {
  /** Signal name (set via options or inferred) */
  name: string | undefined
  /** Current value (same as peek()) */
  value: T
  subscriberCount: number
}

/**
 * Read-only reactive value — the common interface that both Signal and Computed satisfy.
 * Use this as the parameter type when a function only needs to read a reactive value.
 */
export type ReadonlySignal<T> = () => T

export interface Signal<T> {
  (): T
  /** Read the current value WITHOUT registering a reactive dependency. */
  peek(): T
  set(value: T): void
  update(fn: (current: T) => T): void
  /**
   * Subscribe a static listener directly — no effect overhead (no withTracking,
   * no cleanupEffect, no effectDeps WeakMap). Use when the dependency is fixed
   * and dynamic re-tracking is not needed.
   * Returns a disposer that removes the subscription.
   */
  subscribe(listener: () => void): () => void
  /**
   * Register a direct updater — even lighter than subscribe().
   * Intended for compiler-emitted DOM bindings (_bindText, _bindDirect).
   * Returns a disposer that removes the updater (O(1)); the live set
   * stays bounded under register/dispose churn.
   */
  direct(updater: () => void): () => void
  /**
   * Debug name — useful for devtools and logging. Set via the `name` option at
   * creation; can be reassigned at any time (`s.label = 'renamed'`) since it's
   * stored as a regular own property on the signal function.
   */
  label: string | undefined
  debug(): SignalDebugInfo<T>
}

export interface SignalOptions {
  /** Debug name for this signal — shows up in devtools and debug() output. */
  name?: string
  /**
   * @internal — source location injected by `@pyreon/vite-plugin` at build
   * time. When present, the runtime skips the `new Error().stack` capture
   * in `_rdRegister` — saves ~2.2µs per signal creation when devtools is
   * active. Plain user code should NOT set this; the field is opaque
   * (no public type) so it's not part of the public API surface.
   *
   * Shape: `{ file: string; line: number; col: number }` matching
   * `@pyreon/reactivity`'s `SourceLocation`.
   */
  __sourceLocation?: { file: string; line: number; col: number }
}

// Internal shape of a signal function — state stored as properties on the
// function object so methods can be shared via assignment (not per-signal closures).
interface SignalFn<T> {
  (): T
  /** @internal current value */
  _v: T
  /** @internal subscriber set (lazily allocated by trackSubscriber) */
  _s: Set<() => void> | null
  /** @internal direct updater set — compiler-emitted DOM updaters (lazily allocated) */
  _d: Set<() => void> | null
  peek(): T
  set(value: T): void
  update(fn: (current: T) => T): void
  subscribe(listener: () => void): () => void
  direct(updater: () => void): () => void
  label: string | undefined
  debug(): SignalDebugInfo<T>
}

// Shared method implementations — defined once, assigned to every signal.
// Uses `this` binding (signal methods are always called as `signal.method()`).
function _peek(this: SignalFn<unknown>) {
  return this._v
}

function _set(this: SignalFn<unknown>, newValue: unknown) {
  if (Object.is(this._v, newValue)) return
  if (process.env.NODE_ENV !== 'production')
    _countSink.__pyreon_count__?.('reactivity.signalWrite')
  const prev = this._v
  this._v = newValue
  // Dev-only bounded ring buffer of recent writes — attached to error
  // reports so a crash carries the causal sequence of signal changes,
  // not just the thrown value. Tree-shaken in prod via the gate.
  // Deliberately separate from the `isTracing()` path below: that one
  // is opt-in (requires an onSignalUpdate listener) and captures a
  // stack (expensive); this is always-on in dev and intentionally
  // cheap (string preview, no stack).
  if (process.env.NODE_ENV !== 'production') {
    _recordSignalWrite(this.label, prev, newValue)
    _rdRecordFire(this)
  }
  if (isTracing()) {
    // Trace listeners are user-supplied debug code that fires on every
    // signal write. A throwing listener here would leave `_v` updated but
    // subscribers never notified (state divergence: readers see the new
    // value, but no effects run). Trace failures must not corrupt program
    // state — wrap in try/catch and route through `_userErrorHandler` so
    // the corruption is at least visible. Listeners are removed via the
    // disposer returned by `onSignalUpdate`; this catch prevents one bad
    // listener from breaking unrelated reactive flow.
    try {
      _notifyTraceListeners(this as unknown as Signal<unknown>, prev, newValue)
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.error(
          '[pyreon] signal trace listener threw — listener is buggy. Subscribers continue uninterrupted.',
          err,
        )
      }
    }
  }
  // Auto-batch the notification chain. Without this, a diamond dependency
  // graph (a → b, c → d → effect) fires the apex effect TWICE per write
  // because subscribers cascade inline: the first path through `b` reaches
  // `effect`, whose read clears `d`'s dirty flag; then `c`'s notification
  // re-dirties `d` and re-notifies `effect`. Wrapping the notify chain in
  // `batch()` routes cascade-notifications through the pending Set, which
  // dedupes on `d.recompute` and on `effect.run`.
  //
  // The batch is synchronous — observable behaviour is unchanged for the
  // common case (subscribers still fire immediately after the write). Only
  // the dedup semantics change, which is a bug fix.
  //
  // Short-circuit when already inside a batch so we don't wrap redundantly.
  if (isBatching()) {
    if (this._d) notifyDirect(this._d)
    if (this._s) notifySubscribers(this._s)
  } else {
    batch(() => {
      if (this._d) notifyDirect(this._d)
      if (this._s) notifySubscribers(this._s)
    })
  }
}

function _update(this: SignalFn<unknown>, fn: (current: unknown) => unknown) {
  _set.call(this, fn(this._v))
}

function _subscribe(this: SignalFn<unknown>, listener: () => void): () => void {
  if (!this._s) this._s = new Set()
  this._s.add(listener)
  return () => this._s?.delete(listener)
}

/**
 * Register a direct updater — lighter than subscribe().
 * Used by compiler-emitted _bindText/_bindDirect for zero-overhead DOM bindings.
 *
 * Backed by a `Set` (same as `_s`), NOT a flat array. The array form
 * disposed by nulling the slot (`arr[idx] = null`) but never compacted —
 * so a long-lived signal (theme/locale/auth, or a signal read inside
 * `<For>` rows) bound by churning components accumulated one permanent
 * dead slot per ever-mounted binding. That is an app-lifetime memory
 * leak AND degrades the signal-write hot path: `notifyDirect` iterated
 * O(total-ever-registered), not O(live). A Set bounds growth to the live
 * set and keeps disposal + iteration O(live); the "Set.delete overhead"
 * the array form optimised for is negligible against an unbounded array.
 */
function _directFn(this: SignalFn<unknown>, updater: () => void): () => void {
  if (!this._d) this._d = new Set()
  const set = this._d
  set.add(updater)
  return () => {
    set.delete(updater)
  }
}

/**
 * Notify direct updaters — set iteration, batch-aware. Disposed updaters
 * are already absent from the set (O(1) delete on disposal).
 */
function notifyDirect(updaters: Set<() => void>): void {
  if (isBatching()) {
    for (const fn of updaters) enqueuePendingNotification(fn)
  } else {
    for (const fn of updaters) fn()
  }
}

function _debug(this: SignalFn<unknown>): SignalDebugInfo<unknown> {
  return {
    name: this.label,
    value: this._v,
    subscriberCount: this._s?.size ?? 0,
  }
}

/**
 * Create a reactive signal.
 *
 * Only 1 closure is allocated (the read function). State is stored as
 * properties on the function object (_v, _s) and methods (peek, set,
 * update, subscribe) are shared across all signals — not per-signal closures.
 */
export function signal<T>(initialValue: T, options?: SignalOptions): Signal<T> {
  if (process.env.NODE_ENV !== 'production')
    _countSink.__pyreon_count__?.('reactivity.signalCreate')
  // The read function is the only per-signal closure.
  // It doubles as the SubscriberHost (_s property) for trackSubscriber.
  const read = ((...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production' && args.length > 0) {
      // oxlint-disable-next-line no-console
      console.warn(
        '[Pyreon] signal() was called with an argument. ' +
          'Use signal.set(value) or signal.update(fn) to write. ' +
          'signal(value) only reads — the argument is ignored.',
      )
    }
    trackSubscriber(read as SignalFn<T>)
    return read._v
  }) as unknown as SignalFn<T>

  read._v = initialValue
  read._s = null
  read._d = null
  read.peek = _peek as () => T
  read.set = _set as (value: T) => void
  read.update = _update as (fn: (current: T) => T) => void
  read.subscribe = _subscribe as (listener: () => void) => () => void
  read.direct = _directFn as (updater: () => void) => () => void
  read.debug = _debug as () => SignalDebugInfo<T>
  read.label = options?.name

  if (process.env.NODE_ENV !== 'production') {
    // Prefer build-time-injected location (zero runtime cost) over the
    // ~2.2µs stack-capture fallback. @pyreon/vite-plugin's
    // `injectSignalLocations` rewrites `signal(0)` to
    // `signal(0, { __sourceLocation: {...} })` at transform time so most
    // dev-mode signals never pay the stack-capture cost.
    const loc = options?.__sourceLocation
      ? options.__sourceLocation
      : _captureCallerLocation(1)
    _rdRegister(read, 'signal', read, null, read.label, loc)
  }

  return read as unknown as Signal<T>
}
