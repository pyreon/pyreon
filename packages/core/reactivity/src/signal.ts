import { _notifyTraceListeners, isTracing } from './debug'
import { type Link, _b, endBatch, enqueueFn, propagate, trackSubscriber } from './graph'
import { _captureCallerLocation, _rdDirect, _rdRecordFire, _rdRegister } from './reactive-devtools'
import { _recordSignalWrite } from './reactive-trace'

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
   * Subscribe a static listener directly — no effect overhead (no tracking frame,
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
  /** @internal first subscriber edge (see `Source` in graph.ts) */
  _subs: Link | null
  /** @internal last subscriber edge */
  _subsTail: Link | null
  /**
   * @internal The DIRECT tier, first entry: a direct updater (`.direct()`, the
   * compiled `_bindText` / `_bindDirect`) or a `subscribe()` listener. Fires
   * before the tracked subscribers of the same write.
   */
  _d1: (() => void) | null
  /** @internal direct tier Set — allocated on PROMOTION from `_d1` (≥2 entries) */
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
//
// A DETACHED reference (`.then(sig.set)`, `ref={props.sig.set}`) therefore
// runs with `this === undefined`, which used to surface as "Cannot read
// properties of undefined (reading '_v')". Dev builds name the mistake and the
// fix instead. Inside JSX the compiler binds a reference to a signal it knows
// (`ref={el.set}` → `el.set.bind(el)`, #4356), so this fires only for one it
// cannot see.
function _detached(method: string): never {
  throw new TypeError(
    `[Pyreon] signal.${method}() was called without its signal. Signal methods read \`this\`, so a detached reference such as promise.then(sig.${method}) or ref={props.sig.${method}} cannot work. Pass an arrow instead: (v) => sig.${method}(v).`,
  )
}

function _peek(this: SignalFn<unknown>) {
  if (process.env.NODE_ENV !== 'production' && this == null) _detached('peek')
  return this._v
}

/**
 * Deliver a change of `src` (a signal write or `trigger()`): the direct tier
 * first, then mark the tracked subscribers (`propagate`). Outside any batch
 * window this opens one, fires a SOLE direct entry synchronously (the
 * historical fast path — no queue round-trip) and flushes the queue when the
 * window closes; inside one everything is queued for the outermost close.
 *
 * Shared by `_set` and `_trigger` deliberately: the window, the direct tier
 * and the marking are one sequence, and a copy per caller drifted before.
 */
function notifySignal(d1: (() => void) | null, d: Set<() => void> | null, subs: Link | null): void {
  if (_b.d > 0) {
    if (d1 !== null) enqueueFn(d1)
    else if (d !== null) for (const fn of d) enqueueFn(fn)
    if (subs !== null) propagate(subs)
    return
  }
  _b.d = 1
  try {
    if (d1 !== null) {
      // Mark BEFORE the sole direct entry runs: it may read a computed below
      // this signal (which must resolve fresh), and if it throws, the window's
      // close still flushes the effects this write reached.
      if (subs !== null) propagate(subs)
      d1()
    } else {
      if (d !== null) for (const fn of d) enqueueFn(fn)
      if (subs !== null) propagate(subs)
    }
  } finally {
    endBatch()
  }
}

function _set(this: SignalFn<unknown>, newValue: unknown) {
  if (process.env.NODE_ENV !== 'production' && this == null) _detached('set')
  if (Object.is(this._v, newValue)) return
  if (process.env.NODE_ENV !== 'production')
    _countSink.__pyreon_count__?.('reactivity.signalWrite')
  const prev = this._v
  this._v = newValue
  // Dev-only bounded ring buffer of recent writes, attached to error reports so
  // a crash carries the causal sequence of signal changes. Separate from the
  // `isTracing()` path below: that one is opt-in and captures a stack
  // (expensive); this is always-on in dev and deliberately cheap.
  if (process.env.NODE_ENV !== 'production') {
    _recordSignalWrite(this.label, prev, newValue)
    _rdRecordFire(this)
  }
  if (isTracing()) {
    // A throwing trace listener would leave `_v` updated but subscribers never
    // notified (readers see the new value, no effects run). Debug code must not
    // corrupt program state — catch and keep the reactive flow intact.
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
  // No-subscriber fast path: nothing to deliver, no batch window. The
  // dominant shape for write-only signals.
  const d1 = this._d1
  const d = this._d
  const subs = this._subs
  if (d1 === null && d === null && subs === null) return
  notifySignal(d1, d, subs)
}

function _update(this: SignalFn<unknown>, fn: (current: unknown) => unknown) {
  if (process.env.NODE_ENV !== 'production' && this == null) _detached('update')
  _set.call(this, fn(this._v))
}

function _trigger(this: SignalFn<unknown>) {
  if (process.env.NODE_ENV !== 'production' && this == null) _detached('trigger')
  if (process.env.NODE_ENV !== 'production') _rdRecordFire(this)
  const d1 = this._d1
  const d = this._d
  const subs = this._subs
  if (d1 === null && d === null && subs === null) return
  notifySignal(d1, d, subs)
}

/** Add `fn` to a source's direct tier (idempotent). */
export function _addDirect(host: DirectHost, fn: () => void): void {
  const d1 = host._d1
  const d = host._d
  if (d === null) {
    if (d1 === null) {
      host._d1 = fn
      return
    }
    if (d1 === fn) return
    // Promote: the second entry moves both into a Set (subscription order kept).
    const set = new Set<() => void>()
    set.add(d1)
    set.add(fn)
    host._d1 = null
    host._d = set
    return
  }
  if (d1 !== null) {
    // A Set exists AND the inline slot is occupied (a sole-suspension resumed
    // around a newcomer): fold the slot in.
    host._d1 = null
    d.add(d1)
  }
  d.add(fn)
}

/** Remove `fn` from a source's direct tier. No-op when absent. */
export function _removeDirect(host: DirectHost, fn: () => void): void {
  if (host._d1 === fn) host._d1 = null
  else if (host._d !== null) host._d.delete(fn)
}

/** The direct tier of a signal or computed. */
export interface DirectHost {
  _d1: (() => void) | null
  _d: Set<() => void> | null
}

/**
 * Subscribe a listener. It joins the DIRECT tier (with compiled `.direct()`
 * bindings): no tracking frame, no graph edge, and it fires before the effects
 * of the same write. Promotion-aware disposer: a second entry may have moved
 * `listener` from the inline slot into the Set before it runs.
 */
function _subscribe(this: SignalFn<unknown>, listener: () => void): () => void {
  if (process.env.NODE_ENV !== 'production' && this == null) _detached('subscribe')
  _addDirect(this, listener)
  const self = this
  return () => _removeDirect(self, listener)
}

/**
 * @internal Does `sig` still have ANY live subscriber — a graph edge, or an
 * entry in the direct tier (`_d1` / `_d`)?
 *
 * The direct tier is TWO-TIER: the first entry lives in an inline slot and
 * only a second one promotes to a Set. A presence check that reads the Set
 * alone would report "unused" for the overwhelmingly common single-entry
 * shape — the false negative that would make a reclamation sweep evict LIVE
 * signals.
 *
 * Exported so consumers doing liveness sweeps (`@pyreon/solid-compat`'s
 * `createStore`) cannot re-derive the check and miss a tier as the storage
 * evolves.
 */
export function _hasSubscribers<T>(sig: Signal<T> | (() => T)): boolean {
  const s = sig as unknown as SignalFn<T>
  return s._subs != null || s._d1 != null || (s._d != null && s._d.size > 0)
}

/**
 * @internal Opaque token handed back by {@link _suspendSoleSubscriber} and
 * returned verbatim to {@link _resumeSoleSubscriber}. Callers must treat it as
 * opaque and only test it for `null`.
 */
export type SoleSubscriberToken = (() => void) | Set<() => void>

/**
 * @internal Temporarily remove a `subscribe()`-registered `listener` from `sig`
 * WITHOUT allocating a disposer, then restore it with {@link _resumeSubscriber}.
 * Lets a caller driving a coordinated BATCH of writes silence ONE subscriber
 * across them — its notifications would otherwise round-trip the batch queue
 * purely to rebuild change information the caller already has.
 *
 * Adds ZERO cost to the hot write path. Consumer: `@pyreon/store`'s `patch()`.
 * Suspend is a no-op if `listener` isn't subscribed; resume is idempotent.
 */
export function _suspendSubscriber<T>(sig: Signal<T>, listener: () => void): void {
  _removeDirect(sig as unknown as SignalFn<T>, listener)
}

/** @internal Restore a listener removed by {@link _suspendSubscriber}. */
export function _resumeSubscriber<T>(sig: Signal<T>, listener: () => void): void {
  _addDirect(sig as unknown as SignalFn<T>, listener)
}

/**
 * @internal O(1) variant of {@link _suspendSubscriber} for when the caller's
 * listener is the SOLE entry of `sig`'s direct tier — the dominant shape for
 * `@pyreon/store`'s per-field change detectors. Detaches the inline slot, or a
 * promoted Set of exactly one, by a field swap rather than paying a
 * `Set.delete` hash op, returning it as a token for {@link _resumeSoleSubscriber}.
 * Returns `null` when the tier is empty or holds more than one entry — the
 * caller MUST then fall back to `_suspendSubscriber`.
 *
 * **PRECONDITION (caller-guaranteed, not verified):** the sole entry must BE
 * the caller's listener. The store's invariant provides it; callers without
 * such an invariant must use `_suspendSubscriber`.
 */
export function _suspendSoleSubscriber<T>(sig: Signal<T>): SoleSubscriberToken | null {
  const s = sig as unknown as SignalFn<T>
  const d = s._d
  const d1 = s._d1
  if (d1 !== null) {
    if (d !== null && d.size > 0) return null
    s._d1 = null
    return d1
  }
  if (d === null || d.size !== 1) return null
  s._d = null
  return d
}

/**
 * @internal Pair of {@link _suspendSoleSubscriber}. Restores the detached
 * entry. If a NEW entry arrived during the suspension window, the caller's
 * `listener` is folded in alongside it rather than clobbering it (listener
 * re-added after the newcomer).
 */
export function _resumeSoleSubscriber<T>(
  sig: Signal<T>,
  saved: SoleSubscriberToken,
  listener: () => void,
): void {
  const s = sig as unknown as SignalFn<T>
  if (typeof saved === 'function') {
    _addDirect(s, saved)
    return
  }
  if (s._d1 === null && (s._d === null || s._d.size === 0)) s._d = saved
  else _addDirect(s, listener)
}

/**
 * Register a direct updater — lighter than an effect. Used by compiler-emitted
 * `_bindText`/`_bindDirect` for zero-overhead DOM bindings.
 *
 * Two-tier storage: the FIRST entry lives in the inline slot `_d1` (no Set
 * allocation, no iteration) — the steady-state shape for ~all per-row bindings
 * inside `<For>` rows. A SECOND entry promotes `_d1` into a `_d: Set`.
 *
 * Disposal is O(1) in both shapes. A flat array was rejected: it disposed by
 * nulling the slot and never compacted, so a long-lived signal (theme/locale/
 * auth) bound by churning components accumulated one permanent dead slot per
 * ever-mounted binding — an app-lifetime leak.
 */
function _directFn(this: SignalFn<unknown>, updater: () => void): () => void {
  // Dev: store an instrumented wrapper so the updater is a reactive-graph node
  // whose notifications count as fires (see `_rdDirect`). Folds away in prod.
  if (process.env.NODE_ENV !== 'production') updater = _rdDirect(updater)
  _addDirect(this, updater)
  const self = this
  return () => _removeDirect(self, updater)
}

/** Number of subscriber edges of a source plus its direct-tier entries. */
export function _subscriberCount(s: { _subs: Link | null; _d1?: (() => void) | null; _d?: Set<() => void> | null }): number {
  let n = 0
  for (let l = s._subs; l !== null; l = l.nextSub) n++
  if (s._d1 != null) n++
  if (s._d != null) n += s._d.size
  return n
}

function _debug(this: SignalFn<unknown>): SignalDebugInfo<unknown> {
  return {
    name: this.label,
    value: this._v,
    subscriberCount: _subscriberCount(this),
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
 * properties on the function object (_v, _subs, _d1, _d) and methods are shared
 * via the SignalProto prototype — not per-signal closures or per-instance
 * property assignments.
 */
export function signal<T>(initialValue: T, options?: SignalOptions): Signal<T> {
  if (process.env.NODE_ENV !== 'production')
    _countSink.__pyreon_count__?.('reactivity.signalCreate')
  // The read function is the only per-signal closure.
  // It doubles as the graph source (`_subs`) for trackSubscriber.
  //
  // Two declarations, chosen by the dev gate, rather than one `(...args)`
  // closure with a dev-only warning inside: a bundler folds the warning branch
  // away but NOT the rest parameter, so production shipped `(...e)=>` and every
  // signal READ materialized an argument array it never looked at. The
  // production arm takes no parameters at all.
  const read = (
    process.env.NODE_ENV !== 'production'
      ? (...args: unknown[]) => {
          if (args.length > 0) {
            // oxlint-disable-next-line no-console
            console.warn(
              '[Pyreon] signal() was called with an argument. ' +
                'Use signal.set(value) or signal.update(fn) to write. ' +
                'signal(value) only reads — the argument is ignored.',
            )
          }
          trackSubscriber(read as SignalFn<T>)
          return read._v
        }
      : () => {
          trackSubscriber(read as SignalFn<T>)
          return read._v
        }
  ) as unknown as SignalFn<T>

  // Single setPrototypeOf instead of 6 per-instance method assignments.
  // All signals share SignalProto → monomorphic call sites for method dispatch.
  Object.setPrototypeOf(read, SignalProto)
  read._v = initialValue
  read._subs = null
  read._subsTail = null
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
