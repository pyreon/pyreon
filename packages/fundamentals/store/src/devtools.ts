/**
 * @pyreon/store devtools introspection API.
 * Import: `import { ... } from "@pyreon/store/devtools"`
 */

import { getRegistry } from "./registry"

const _listeners = new Set<() => void>()

/** @internal — called by defineStore/resetStore to notify devtools. */
export function _notifyChange(): void {
  for (const listener of _listeners) listener()
}

/** Get all registered store IDs. */
export function getRegisteredStores(): string[] {
  return [...getRegistry().keys()]
}

/** Get a store API by ID (or undefined if not registered). */
export function getStoreById(
  id: string,
): import("./index").StoreApi<Record<string, unknown>> | undefined {
  return getRegistry().get(id) as import("./index").StoreApi<Record<string, unknown>> | undefined
}

/** Subscribe to store registry changes (store added/removed). Returns unsubscribe. */
export function onStoreChange(listener: () => void): () => void {
  _listeners.add(listener)
  return () => {
    _listeners.delete(listener)
  }
}
