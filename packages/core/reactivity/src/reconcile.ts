/**
 * reconcile — surgically diff new state into an existing createStore proxy.
 *
 * Instead of replacing the store root (which would trigger all downstream effects),
 * reconcile walks both the new value and the store in parallel and only calls
 * `.set()` on signals whose value actually changed.
 *
 * Ideal for applying API responses to a long-lived store:
 *
 * @example
 * const state = createStore({ user: { name: "Alice", age: 30 }, items: [] })
 *
 * // API response arrives:
 * reconcile({ user: { name: "Alice", age: 31 }, items: [{ id: 1 }] }, state)
 * // → only state.user.age signal fires (name unchanged)
 * // → state.items[0] is newly created
 *
 * Arrays are reconciled by index — elements at the same index are recursively
 * diffed rather than replaced wholesale. Excess old elements are removed.
 */

import { isStore } from "./store"

type AnyObject = Record<PropertyKey, unknown>

export function reconcile<T extends object>(source: T, target: T): void {
  _reconcileInner(source, target, new WeakSet())
}

function _reconcileInner(source: object, target: object, seen: WeakSet<object>): void {
  if (seen.has(source)) return // circular reference — stop recursion
  seen.add(source)
  if (Array.isArray(source) && Array.isArray(target)) {
    _reconcileArray(source as unknown[], target as unknown[], seen)
  } else {
    _reconcileObject(source as AnyObject, target as AnyObject, seen)
  }
}

function _reconcileArray(source: unknown[], target: unknown[], seen: WeakSet<object>): void {
  const targetLen = target.length
  const sourceLen = source.length

  // Update / add entries
  for (let i = 0; i < sourceLen; i++) {
    const sv = source[i]
    const tv = (target as unknown[])[i]

    if (
      i < targetLen &&
      sv !== null &&
      typeof sv === "object" &&
      tv !== null &&
      typeof tv === "object"
    ) {
      // Both sides are objects — recurse
      _reconcileInner(sv as object, tv as object, seen)
    } else {
      // Scalar or new entry — write directly (signal will skip if equal via Object.is)
      ;(target as unknown[])[i] = sv
    }
  }

  // Trim excess entries
  if (targetLen > sourceLen) {
    target.length = sourceLen
  }
}

function _reconcileObject(source: AnyObject, target: AnyObject, seen: WeakSet<object>): void {
  const sourceKeys = Object.keys(source)
  const targetKeys = new Set(Object.keys(target))

  for (const key of sourceKeys) {
    const sv = source[key]
    const tv = target[key]

    if (sv !== null && typeof sv === "object" && tv !== null && typeof tv === "object") {
      if (isStore(tv)) {
        // Both objects — recurse into the store node
        _reconcileInner(sv as object, tv as object, seen)
      } else {
        // Target is a raw object (not yet proxied) — just assign
        target[key] = sv
      }
    } else {
      // Scalar: assign (store proxy's set trap skips if Object.is equal)
      target[key] = sv
    }

    targetKeys.delete(key)
  }

  // Remove keys that no longer exist in source
  for (const key of targetKeys) {
    delete target[key]
  }
}
