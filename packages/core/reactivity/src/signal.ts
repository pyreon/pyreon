import { closeInlineBatch, enqueuePendingNotification, isBatching, openInlineBatch } from './batch'
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
   * Force subscribers to re-run WITHOUT changing the value.
   *
   * Signals compare with `Object.is`, so `set(sameReference)` is a no-op — which
   * means mutating a held object IN PLACE (a `Map`, a class instance, an
   * external store like a TanStack table) and re-setting the same reference
   * never re-renders. `trigger()` is the escape hatch: mutate the object, then
   * call `trigger()` to re-run everything that read the signal.
   *
   * Prefer immutable updates (`set(newObject)`) when you can — they're clearer
   * and comparison-friendly. Reach for `trigger()` only when you deliberately
   * own a mutable value (store adapters, perf-critical in-place mutation).
   *
   * @example
   * const items = signal(new Map<string, number>())
   * items.peek().set('a', 1) // mutate in place — set() would be a no-op here
   * items.trigger()          // now subscribers re-run
   */
  trigger(): void
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
  /** @internal direct updater single-subscriber fast slot — first subscriber lives here */
  _d1: (() => void) | null
  /** @internal direct updater Set — allocated on PROMOTION from `_d1` (≥2 subscribers) */
  _d: Set<() => void> | null
  peek(): T
  set(value: T): void
  update(fn: (current: T) => T): void
  trigger(): void
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
    if (this._d1) enqueuePendingNotification(this._d1)
    else if (this._d) notifyDirect(this._d)
    if (this._s) notifySubscribers(this._s)
  } else {
    // INLINE batch window — no `batch(closure)` allocation, and the
    // notifications THIS write owns dispatch DIRECTLY instead of taking a
    // round-trip through the pending queues (enqueue → flush-loop iterate →
    // visited-Set bookkeeping → clear). Measured: the queue round-trip
    // dominated the unbatched write path at ~119ns per single-subscriber
    // notify vs ~12ns for the write itself — this fast path is why.
    //
    // Correctness is unchanged BY CONSTRUCTION:
    // - Dedup exists for diamond graphs (one write reaching the same
    //   downstream via two paths). A diamond requires ≥2 subscribers at the
    //   fan-out point. The direct dispatches below deliver each channel at
    //   most ONCE for THIS write (`_d1` is a single callback; `_s` size 1 is
    //   a single callback), so there is nothing to dedup at this level.
    //   Multi-subscriber channels (`_d` Set, `_s` size > 1 — where diamonds
    //   live) still route through `notifySubscribers`/`notifyDirect`, which
    //   enqueue under the open window exactly as before.
    // - Cascade writes from inside a directly-dispatched callback see
    //   `isBatching() === true` (the window is open) and enqueue into the
    //   shared queues; `closeInlineBatch` drains them with the SAME two-tier
    //   flush `batch()` uses (tier ordering, multi-pass re-fire, MAX_PASSES).
    // - A self-re-enqueue (callback writing its own dep) lands in the queue
    //   and re-fires once in the drain — same observable behavior as the
    //   prior visited-Set promotion path.
    openInlineBatch()
    try {
      if (this._d1) {
        this._d1()
      } else if (this._d) notifyDirect(this._d)
      if (this._s) {
        if (this._s.size === 1) {
          const sub = this._s.values().next().value as () => void
          sub()
        } else {
          notifySubscribers(this._s)
        }
      }
    } finally {
      closeInlineBatch()
    }
  }
}

function _update(this: SignalFn<unknown>, fn: (current: unknown) => unknown) {
  _set.call(this, fn(this._v))
}

function _trigger(this: SignalFn<unknown>) {
  if (process.env.NODE_ENV !== 'production') _rdRecordFire(this)
  // The SAME batch-aware notify as `_set` (lines above), minus the value write
  // and the `Object.is` gate. Deliberately DUPLICATED rather than extracted into
  // a shared helper: `_set`'s inline dispatch is perf-tuned and must stay
  // byte-identical (see the long `_set` comment on why the inline path exists);
  // wrapping it in a call would tax the hottest write path for a rare escape
  // hatch's benefit.
  if (isBatching()) {
    if (this._d1) enqueuePendingNotification(this._d1)
    else if (this._d) notifyDirect(this._d)
    if (this._s) notifySubscribers(this._s)
  } else {
    openInlineBatch()
    try {
      if (this._d1) {
        this._d1()
      } else if (this._d) notifyDirect(this._d)
      if (this._s) {
        if (this._s.size === 1) {
          const sub = this._s.values().next().value as () => void
          sub()
        } else {
          notifySubscribers(this._s)
        }
      }
    } finally {
      closeInlineBatch()
    }
  }
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
 * Two-tier storage:
 *
 *  1. **Single-subscriber inline slot `_d1`** — first subscriber stored
 *     directly on the signal as a single field. No Set allocation, no
 *     iteration overhead. This is the steady-state shape for ~all
 *     per-row label/class bindings inside `<For>` rows — 10k rows = 10k
 *     signals each with exactly 1 `_bindText` subscriber.
 *  2. **Promotion to `_d: Set` on second subscribe** — when a second
 *     subscriber arrives, `_d1` is migrated into a fresh Set + the new
 *     subscriber is added. From that point on, the signal uses the Set
 *     path (same as before).
 *
 * Disposal is O(1) in both shapes:
 *  - Inline shape: `if (_d1 === updater) _d1 = null` — no memory leak
 *    (one slot, cleared on dispose).
 *  - Set shape: `_d.delete(updater)` — standard Set semantics.
 *
 * **Why not flat array (the previously-rejected form)**: the array form
 * disposed by nulling the slot (`arr[idx] = null`) but never compacted —
 * so a long-lived signal (theme/locale/auth) bound by churning components
 * accumulated one permanent dead slot per ever-mounted binding. That was
 * an app-lifetime memory leak. The current two-tier shape avoids this:
 * `_d1` is single-slot (no leak by construction); `_d` is a Set (no
 * leak; standard semantics).
 *
 * **Why not always Set**: Set allocation is ~96 bytes + the per-call cost
 * of `set.add` / Set iterator allocation per notify. For ~10k single-
 * subscriber signals (the benchmark's per-row label shape) this is
 * ~960KB heap + 10k Set construction operations + ~50µs of iterator
 * overhead per partial-update cycle. Inline slot eliminates all of that
 * for the dominant case.
 */
function _directFn(this: SignalFn<unknown>, updater: () => void): () => void {
  // Tier 1: empty signal → inline-slot the single subscriber.
  if (this._d1 === null && this._d === null) {
    this._d1 = updater
    const self = this
    return () => {
      // Disposer must defend against PROMOTION: if a 2nd subscriber
      // arrived BEFORE this dispose runs, `_d1` was migrated into
      // `_d` Set and `_d1` is null. Check both tiers so the original
      // first-subscriber is removed regardless of which tier it now
      // lives in.
      if (self._d1 === updater) self._d1 = null
      else if (self._d) self._d.delete(updater)
    }
  }
  // Tier 2: ≥1 subscriber already present. If only `_d1` is set,
  // promote it into a fresh Set before adding the new entry.
  if (this._d === null) {
    const first = this._d1!
    this._d = new Set()
    this._d.add(first)
    this._d1 = null
  }
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
  // The `else` (non-batch) arm is structurally unreachable: every write opens
  // an inline batch window before dispatch (see `openInlineBatch`), so by the
  // time a multi-subscriber `_d` Set is notified, `isBatching()` is always
  // true. Kept as a correctness guard for any future direct caller.
  /* v8 ignore next 3 */
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
 * Shared prototype-like object for all signal callables. Methods live here
 * (one allocation total) instead of being copied onto every signal instance
 * (6 method assignments per signal). Per-signal cost drops from 6 own-prop
 * assignments to a single `Object.setPrototypeOf` call.
 *
 * `Object.setPrototypeOf(fn, proto)` is generally discouraged because it
 * triggers V8 hidden-class transitions — but here every signal goes through
 * the SAME setPrototypeOf call with the SAME proto object, so all signals
 * share one hidden class and stay monomorphic at method-call sites.
 *
 * Methods use `this` binding — they work via the prototype chain because
 * `signal.set(x)` resolves `set` by walking `read → SignalProto → set`.
 *
 * `SignalProto`'s own `[[Prototype]]` is set to `Function.prototype` so the
 * full chain is `read → SignalProto → Function.prototype → Object.prototype`.
 * Without this step, a bare object literal's prototype is `Object.prototype`
 * — every signal would lose `instanceof Function === true` (the read fn was
 * a real function before SignalProto landed). Consumers across the ecosystem
 * (perf-harness, devtools, third-party libs, user code) discriminate signals
 * from plain values via `x instanceof Function`; restoring the Function-
 * prototype link keeps that contract intact while preserving the monomorphic
 * shared-proto allocation win.
 */
const SignalProto = {
  peek: _peek,
  set: _set,
  update: _update,
  trigger: _trigger,
  subscribe: _subscribe,
  direct: _directFn,
  debug: _debug,
}
Object.setPrototypeOf(SignalProto, Function.prototype)

/**
 * Create a reactive signal.
 *
 * Only 1 closure is allocated (the read function). State is stored as
 * properties on the function object (_v, _s, _d) and methods are shared
 * via the SignalProto prototype — not per-signal closures or per-instance
 * property assignments.
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

  // Single setPrototypeOf instead of 6 per-instance method assignments.
  // All signals share SignalProto → monomorphic call sites for method dispatch.
  Object.setPrototypeOf(read, SignalProto)
  read._v = initialValue
  read._s = null
  read._d1 = null
  read._d = null
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
