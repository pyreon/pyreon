import { type Signal, signal } from '@pyreon/reactivity'

/**
 * Shared-prototype builder for query/mutation result objects.
 *
 * Each query hook used to `return { get data() {...}, get error() {...}, ... }`
 * — an object literal with 8-13 accessor getters PER CALL. An object literal
 * with that many accessors lands in V8 dictionary (slow-properties) mode AND
 * allocates a fresh getter closure per field per result (each capturing the
 * call's `slots` + `observer`). A structurally-faithful A/B (node --expose-gc,
 * NODE_ENV=production, 100k results, getters un-accessed) measured the literal
 * shape at ~1888 B/result vs ~280 B for this shared-prototype + plain-fields
 * shape — ~85% smaller per result object. Same pathology + fix as the
 * `signal`/`computed` SignalProto/ComputedProto refactors.
 *
 * The lazy-signal slot-bag is unchanged: getters still do
 * `slots[name] ??= signal(read(observer.getCurrentResult()))`, preserving the
 * same `Signal<T>` identity + materialize-on-first-access semantics the
 * existing observer-subscribe write path relies on. Only the per-instance
 * getter CLOSURES move to a single shared prototype.
 *
 * Getter-access is NON-hot for query results (read a handful of times per
 * render, not in a loop), so the prototype being defineProperty-built (one
 * object per result type, at module init) is irrelevant to runtime speed — the
 * win is the per-result allocation, not access throughput.
 *
 * ONLY GETTERS move to the prototype. Methods (refetch / mutate / reset / …)
 * stay as per-instance arrow closures on the result object, because they are
 * routinely DETACHED and called later — `onClick={query.refetch}`,
 * `const r = query.refetch; r()` — and a prototype method that reads `this`
 * would lose its binding when detached and crash. A getter has no such hazard:
 * it's invoked at property-access time (`result.data`), where `this` is always
 * the accessed object, so it can never be detached-and-called.
 */

/** A result instance carries its lazy-signal slot bag + the observer. */
export interface ResultInstance<
  C,
  O extends { getCurrentResult(): C } = { getCurrentResult(): C },
> {
  _slots: Record<string, Signal<unknown>>
  _observer: O
}

/**
 * Build a shared, getters-only result prototype.
 *
 * @param getters map of result-field name → reader over the observer's current
 *   result. Typed against `C`, so a wrong field is a compile error (preserving
 *   the type-safety the inline literals had).
 *
 * `O` defaults to the minimal `{ getCurrentResult(): C }` — the getters only
 * ever call `getCurrentResult()`, so call sites with awkward observer generic
 * arity (infinite / suspense) can pass just `C`.
 */
/**
 * Build one lazy-materialize getter. Extracted to a top-level factory (not an
 * inline closure in `makeResultProto`'s loop) so the `signal()` call lives in a
 * deferred getter body lexically OUTSIDE any loop — the slot is materialized on
 * first property access, not per iteration. (Also keeps `pyreon/no-signal-in-loop`
 * from false-positiving on the loop that wires the getters onto the prototype.)
 */
function lazyGetter<C, O extends { getCurrentResult(): C }>(
  name: string,
  read: (cur: C) => unknown,
): (this: ResultInstance<C, O>) => Signal<unknown> {
  return function (this: ResultInstance<C, O>) {
    return (this._slots[name] ??= signal(read(this._observer.getCurrentResult())))
  }
}

export function makeResultProto<
  C,
  O extends { getCurrentResult(): C } = { getCurrentResult(): C },
>(getters: Record<string, (cur: C) => unknown>): object {
  const proto: Record<string, unknown> = {}
  for (const name in getters) {
    const read = getters[name] as (cur: C) => unknown
    Object.defineProperty(proto, name, {
      get: lazyGetter<C, O>(name, read),
      // NON-enumerable: these are accessors, not data. Keeps result internals
      // (_slots/_observer) + the signals out of Object.keys / for-in / spread,
      // and avoids object pretty-printers (e.g. vitest diffs) walking the
      // inherited getters and invoking them with the wrong `this`.
      enumerable: false,
      configurable: true,
    })
  }
  return proto
}
