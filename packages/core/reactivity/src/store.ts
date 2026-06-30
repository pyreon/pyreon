/**
 * createStore — deep reactive Proxy store.
 *
 * Wraps a plain object/array in a Proxy that creates a fine-grained signal for
 * every property. Direct mutations (`store.count++`, `store.items[0].label = "x"`)
 * trigger only the signals for the mutated properties — not the whole tree.
 *
 * @example
 * const state = createStore({ count: 0, items: [{ id: 1, text: "hello" }] })
 *
 * effect(() => console.log(state.count))  // tracks state.count only
 * state.count++                           // only the count effect re-runs
 * state.items[0].text = "world"           // only text-tracking effects re-run
 */

import { type Signal, signal } from './signal'

// WeakMap: raw object → its reactive proxy (ensures each raw object gets one proxy)
const proxyCache = new WeakMap<object, object>()
// Separate cache for shallow proxies — same raw can produce different proxies
// depending on shallow vs deep mode, so we can't share proxyCache.
const shallowProxyCache = new WeakMap<object, object>()

const IS_STORE = Symbol('pyreon.store')
const IS_RAW = Symbol('pyreon.raw')

/**
 * Mark an object as RAW — `createStore` and `shallowReactive` will return it
 * unwrapped. Useful when storing class instances, third-party objects, or
 * other shapes that shouldn't be deeply proxied (Vue 3 parity).
 *
 * @example
 * const cm = markRaw(new CodeMirrorView(...))
 * const store = createStore({ editor: cm })
 * store.editor === cm  // true (not wrapped)
 *
 * Note: marking is one-way — there's no `unmarkRaw`. Mark BEFORE the object
 * enters a store; marking after wrap doesn't unwrap an existing proxy.
 */
export function markRaw<T extends object>(value: T): T {
  Object.defineProperty(value, IS_RAW, {
    value: true,
    enumerable: false,
    configurable: true,
    writable: false,
  })
  return value
}

/** Returns true if the value was marked with `markRaw()`. */
function isMarkedRaw(value: object): boolean {
  return (value as Record<symbol, unknown>)[IS_RAW] === true
}

// Built-in object types that have internal slots and fail the Proxy
// internal-slot check on every method call (`Map.prototype.set` called on a
// Proxy → `TypeError: Method ... called on incompatible receiver`). Returning
// the raw instance keeps these usable but at the cost of fine-grained
// reactivity for their contents — write replace-the-whole-Map style if you
// need reactivity (`store.users = new Map(store.users)`). A future PR can
// add Vue-style collection-aware wrapping for Map/Set if demand emerges.
function isBuiltinNonProxiable(obj: object): boolean {
  return (
    obj instanceof Map ||
    obj instanceof Set ||
    obj instanceof WeakMap ||
    obj instanceof WeakSet ||
    obj instanceof Date ||
    obj instanceof RegExp ||
    obj instanceof Promise ||
    obj instanceof Error
  )
}

/** Returns true if the value is a createStore proxy. */
export function isStore(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<symbol, unknown>)[IS_STORE] === true
  )
}

/**
 * Create a deep reactive store from a plain object or array.
 * Returns a proxy — mutations to the proxy trigger fine-grained reactive updates.
 */
export function createStore<T extends object>(initial: T): T {
  return wrap(initial, false) as T
}

/**
 * Create a SHALLOW reactive store — only top-level mutations trigger updates.
 * Nested objects are NOT auto-wrapped; reading a nested object returns the
 * raw reference. Use when:
 *   - the nested objects are immutable (frozen API responses)
 *   - you want explicit control over which subtrees are reactive
 *   - you need to store class instances or third-party objects without
 *     paying the deep-proxy overhead
 *
 * @example
 * const store = shallowReactive({ user: { name: 'Alice' }, count: 0 })
 * effect(() => console.log(store.user))  // tracks store.user reference
 * effect(() => console.log(store.count)) // tracks store.count
 * store.user.name = 'Bob'                // does NOT trigger any effect
 * store.count = 5                        // triggers the count effect
 * store.user = { name: 'Bob' }           // triggers the user effect
 */
export function shallowReactive<T extends object>(initial: T): T {
  return wrap(initial, true) as T
}

function wrap(raw: object, shallow: boolean): object {
  // Cache lookup FIRST — the dominant path. A deep store's `get` trap calls
  // `wrap()` on every nested-object property read, so the cache hit is the hot
  // case. A cached `raw` was already validated as proxiable when first wrapped
  // (the cache is only populated at the bottom of this function, AFTER the
  // builtin/markRaw checks), and neither check can flip afterwards — object
  // type is fixed, and markRaw-after-wrap is a documented no-op — so the hit
  // returns without re-running the 8 `instanceof` checks + the markRaw symbol
  // lookup that the builtin/markRaw guards below perform.
  const cache = shallow ? shallowProxyCache : proxyCache
  const cached = cache.get(raw)
  if (cached) return cached

  // Built-ins with internal slots (Map, Set, Date, …) can't be proxied: their
  // methods fail the receiver check when called on the proxy. Return raw.
  if (isBuiltinNonProxiable(raw)) return raw
  // Vue parity — `markRaw()` opts an object out of proxying entirely. Useful
  // for class instances, third-party objects, or any shape the consumer
  // wants to keep unwrapped.
  if (isMarkedRaw(raw)) return raw

  // Per-property signals. Lazily created on first access.
  const propSignals = new Map<PropertyKey, Signal<unknown>>()
  // For arrays: track length changes separately (push/pop/splice affect length)
  const isArray = Array.isArray(raw)
  const lengthSig = isArray ? signal((raw as unknown[]).length) : null

  function getOrCreateSignal(key: PropertyKey): Signal<unknown> {
    // Single Map lookup (was has()+get()): `undefined` is never a stored value
    // — every entry is a real Signal — so a missing key is unambiguous.
    let sig = propSignals.get(key)
    if (sig === undefined) {
      sig = signal((raw as Record<PropertyKey, unknown>)[key])
      propSignals.set(key, sig)
    }
    return sig
  }

  const proxy = new Proxy(raw, {
    get(target, key) {
      // Pass through the identity marker and non-string/number keys (symbols, etc.)
      if (key === IS_STORE) return true
      if (typeof key === 'symbol') return (target as Record<symbol, unknown>)[key]

      // Array length — tracked via dedicated signal for push/pop/splice reactivity
      if (isArray && key === 'length') return lengthSig?.()

      // Non-own properties without a tracked signal: prototype methods
      // (forEach, map, push, …) returned untracked so array methods work.
      // BUT if a signal already exists for this key, the property was tracked
      // before — most likely the property is currently absent because of a
      // `delete` operation. Continue tracking via the existing signal so that
      // a subsequent reassign (`state.b = 99`) re-runs effects that read the
      // key during its absent window. Without this branch, the `delete` →
      // notify-undefined → effect-re-runs-and-reads-`undefined`-via-this-fast-
      // path → effect-loses-subscription chain breaks reactivity for any
      // delete-then-reassign cycle.
      if (!Object.hasOwn(target, key)) {
        if (propSignals.has(key)) return propSignals.get(key)?.()
        return (target as Record<PropertyKey, unknown>)[key]
      }

      // Track via per-property signal
      const value = getOrCreateSignal(key)()

      // Deep reactivity: wrap nested objects/arrays transparently. Shallow
      // mode skips this — nested objects are returned raw so consumers can
      // mutate them outside the proxy without triggering effects.
      if (!shallow && value !== null && typeof value === 'object') {
        return wrap(value as object, false)
      }

      return value
    },

    // Lint flags 4 `.set()` calls function-scope (proxy handler object),
    // but PER-TRAP-CALL the proxy notifies AT MOST ONE signal due to:
    //   1. Fresh `propSignals.set(key, signal(value))` — newly-created
    //      signal has zero subscribers, so its initial value is just
    //      stored. No notify, nothing to batch.
    //   2. `lengthSig.set(prev)` short-circuits via `Object.is(_v, new)`
    //      when the new length equals the previous (e.g. trap 2 of
    //      `Array.prototype.push` re-sets length to the value trap 1
    //      already updated). Empirically verified across push / splice
    //      / direct-index / length-truncation paths — 1 notify max.
    //   3. The "writes prop signal AND length signal in same trap"
    //      shape only fires when the prop signal pre-existed (effect
    //      subscribed earlier) AND length actually changed (sparse
    //      assign) — in that case lengthSig.set fires; the prop signal
    //      write only fires IF the value differs, which by definition
    //      means the slot WAS in-bounds → length DIDN'T change. The
    //      two conditions are mutually exclusive in practice.
    // A `batch()` wrap around the multi-line block here was prototyped,
    // measured, and proven a no-op via bisect (revert-restore in real
    // Chromium against arr.push / splice / direct-index — every variant
    // fires 1 effect re-run with OR without the wrap). Inline-suppress
    // so the lint count is honest and future contributors don't redo
    // the failed-prototype loop.
    // pyreon-lint-disable-next-line pyreon/no-unbatched-updates
    set(target, key, value) {
      if (typeof key === 'symbol') {
        ;(target as Record<symbol, unknown>)[key] = value
        return true
      }

      // Defense-in-depth against prototype pollution: a bare
      // `target.__proto__ = obj` here would mutate the store object's
      // prototype rather than set a property. `reconcile()` already
      // filters these, but the proxy is the public write surface
      // (`store.__proto__ = …`, spread of untrusted data) so guard here
      // too. Silently ignore — assigning these through a store is never
      // a legitimate operation.
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return true
      }

      const prevLength = isArray ? (target as unknown[]).length : 0
      ;(target as Record<PropertyKey, unknown>)[key] = value

      // Array length set directly (e.g. arr.length = 0)
      if (isArray && key === 'length') {
        lengthSig?.set(value as number)
        return true
      }

      // Update or create signal for this property
      if (propSignals.has(key)) {
        propSignals.get(key)?.set(value)
      } else {
        propSignals.set(key, signal(value))
      }

      // If array length changed (e.g. via push/splice index assignment), update it
      if (isArray && (target as unknown[]).length !== prevLength) {
        lengthSig?.set((target as unknown[]).length)
      }

      return true
    },

    deleteProperty(target, key) {
      delete (target as Record<PropertyKey, unknown>)[key]
      // Notify subscribers that the property is now undefined, but KEEP the
      // signal in `propSignals`. If we delete the entry, a later `set` on the
      // same key creates a fresh signal — but every effect that previously
      // read this key tracked the old (dropped) signal and never re-runs on
      // the reassign. Keeping the entry preserves signal identity across
      // delete-then-reassign cycles. The trade-off is that long-lived stores
      // with high churn on transient keys retain those signal entries; for
      // workloads where that's a real leak, reassign to undefined instead of
      // delete.
      if (typeof key !== 'symbol' && propSignals.has(key)) {
        propSignals.get(key)?.set(undefined)
      }
      if (isArray) lengthSig?.set((target as unknown[]).length)
      return true
    },

    has(target, key) {
      return Reflect.has(target, key)
    },

    ownKeys(target) {
      return Reflect.ownKeys(target)
    },

    getOwnPropertyDescriptor(target, key) {
      return Reflect.getOwnPropertyDescriptor(target, key)
    },
  })

  cache.set(raw, proxy)
  return proxy
}
