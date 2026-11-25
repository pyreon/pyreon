/**
 * @pyreon/store devtools introspection API.
 * Import: `import { ... } from "@pyreon/store/devtools"`
 */

import { addChangeListener } from './devtools-bus'
import { getRegistry } from './registry'

/** Get all registered store IDs. */
export function getRegisteredStores(): string[] {
  return [...getRegistry().keys()]
}

/** Get a store API by ID (or undefined if not registered). */
export function getStoreById(
  id: string,
): import('./index').StoreApi<Record<string, unknown>> | undefined {
  return getRegistry().get(id) as import('./index').StoreApi<Record<string, unknown>> | undefined
}

/** Subscribe to store registry changes (store added/removed). Returns unsubscribe. */
export function onStoreChange(listener: () => void): () => void {
  return addChangeListener(listener)
}
