import { _notifyTraceListeners, isTracing } from "./debug"
import { notifySubscribers, trackSubscriber } from "./tracking"

export interface SignalDebugInfo<T> {
  /** Signal name (set via options or inferred) */
  name: string | undefined
  /** Current value (same as peek()) */
  value: T
  /** Number of active subscribers */
  subscriberCount: number
}

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
  /** Debug name — useful for devtools and logging. */
  label: string | undefined
  /** Returns a snapshot of the signal's debug info (value, name, subscriber count). */
  debug(): SignalDebugInfo<T>
}

export interface SignalOptions {
  /** Debug name for this signal — shows up in devtools and debug() output. */
  name?: string
}

// Internal shape of a signal function — state stored as properties on the
// function object so methods can be shared via assignment (not per-signal closures).
interface SignalFn<T> {
  (): T
  /** @internal current value */
  _v: T
  /** @internal subscriber set (lazily allocated by trackSubscriber) */
  _s: Set<() => void> | null
  /** @internal debug name */
  _n: string | undefined
  peek(): T
  set(value: T): void
  update(fn: (current: T) => T): void
  subscribe(listener: () => void): () => void
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
  const prev = this._v
  this._v = newValue
  if (isTracing()) _notifyTraceListeners(this as unknown as Signal<unknown>, prev, newValue)
  if (this._s) notifySubscribers(this._s)
}

function _update(this: SignalFn<unknown>, fn: (current: unknown) => unknown) {
  _set.call(this, fn(this._v))
}

function _subscribe(this: SignalFn<unknown>, listener: () => void): () => void {
  if (!this._s) this._s = new Set()
  this._s.add(listener)
  return () => this._s?.delete(listener)
}

function _debug(this: SignalFn<unknown>): SignalDebugInfo<unknown> {
  return {
    name: this._n,
    value: this._v,
    subscriberCount: this._s?.size ?? 0,
  }
}

// label getter/setter — maps to _n for devtools-friendly access
const _labelDescriptor: PropertyDescriptor = {
  get(this: SignalFn<unknown>) {
    return this._n
  },
  set(this: SignalFn<unknown>, v: string | undefined) {
    this._n = v
  },
  enumerable: false,
  configurable: true,
}

/**
 * Create a reactive signal.
 *
 * Only 1 closure is allocated (the read function). State is stored as
 * properties on the function object (_v, _s) and methods (peek, set,
 * update, subscribe) are shared across all signals — not per-signal closures.
 */
export function signal<T>(initialValue: T, options?: SignalOptions): Signal<T> {
  // The read function is the only per-signal closure.
  // It doubles as the SubscriberHost (_s property) for trackSubscriber.
  const read = (() => {
    trackSubscriber(read as SignalFn<T>)
    return read._v
  }) as unknown as SignalFn<T>

  read._v = initialValue
  read._s = null
  read._n = options?.name
  read.peek = _peek as () => T
  read.set = _set as (value: T) => void
  read.update = _update as (fn: (current: T) => T) => void
  read.subscribe = _subscribe as (listener: () => void) => () => void
  read.debug = _debug as () => SignalDebugInfo<T>
  Object.defineProperty(read, "label", _labelDescriptor)

  return read as unknown as Signal<T>
}
