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

import { type Signal, signal } from "./signal"

// WeakMap: raw object → its reactive proxy (ensures each raw object gets one proxy)
const proxyCache = new WeakMap<object, object>()

const IS_STORE = Symbol("pyreon.store")

/** Returns true if the value is a createStore proxy. */
export function isStore(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
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
  if (proxyCache.has(raw)) return proxyCache.get(raw)!

  // Per-property signals. Lazily created on first access.
  const propSignals = new Map<PropertyKey, Signal<unknown>>()
  // For arrays: track length changes separately (push/pop/splice affect length)
  const isArray = Array.isArray(raw)
  const lengthSig = isArray ? signal((raw as unknown[]).length) : null

  function getOrCreateSignal(key: PropertyKey): Signal<unknown> {
    if (!propSignals.has(key)) {
      propSignals.set(key, signal((raw as Record<PropertyKey, unknown>)[key]))
    }
    return propSignals.get(key)!
  }

  const proxy = new Proxy(raw, {
    get(target, key) {
      // Pass through the identity marker and non-string/number keys (symbols, etc.)
      if (key === IS_STORE) return true
      if (typeof key === "symbol") return (target as Record<symbol, unknown>)[key]

      // Array length — tracked via dedicated signal for push/pop/splice reactivity
      if (isArray && key === "length") return lengthSig?.()

      // Non-own properties: prototype methods (forEach, map, push, …)
      // These must be returned untracked so array methods work normally.
      // Array methods will then go through set/get on indices via the proxy.
      if (!Object.hasOwn(target, key)) {
        return (target as Record<PropertyKey, unknown>)[key]
      }

      // Track via per-property signal
      const value = getOrCreateSignal(key)()

      // Deep reactivity: wrap nested objects/arrays transparently
      if (value !== null && typeof value === "object") {
        return wrap(value as object)
      }

      return value
    },

    set(target, key, value) {
      if (typeof key === "symbol") {
        ;(target as Record<symbol, unknown>)[key] = value
        return true
      }

      const prevLength = isArray ? (target as unknown[]).length : 0
      ;(target as Record<PropertyKey, unknown>)[key] = value

      // Array length set directly (e.g. arr.length = 0)
      if (isArray && key === "length") {
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
      if (typeof key !== "symbol" && propSignals.has(key)) {
        propSignals.get(key)?.set(undefined)
        propSignals.delete(key)
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
