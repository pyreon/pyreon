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

const IS_STORE = Symbol('pyreon.store')

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
  return wrap(initial) as T
}

function wrap(raw: object): object {
  // Built-ins with internal slots (Map, Set, Date, …) can't be proxied: their
  // methods fail the receiver check when called on the proxy. Return raw.
  if (isBuiltinNonProxiable(raw)) return raw

  const cached = proxyCache.get(raw)
  if (cached) return cached

  // Per-property signals. Lazily created on first access.
  const propSignals = new Map<PropertyKey, Signal<unknown>>()
  // For arrays: track length changes separately (push/pop/splice affect length)
  const isArray = Array.isArray(raw)
  const lengthSig = isArray ? signal((raw as unknown[]).length) : null

  function getOrCreateSignal(key: PropertyKey): Signal<unknown> {
    if (!propSignals.has(key)) {
      propSignals.set(key, signal((raw as Record<PropertyKey, unknown>)[key]))
    }
    return propSignals.get(key) as Signal<unknown>
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

      // Deep reactivity: wrap nested objects/arrays transparently
      if (value !== null && typeof value === 'object') {
        return wrap(value as object)
      }

      return value
    },

    set(target, key, value) {
      if (typeof key === 'symbol') {
        ;(target as Record<symbol, unknown>)[key] = value
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

  proxyCache.set(raw, proxy)
  return proxy
}
