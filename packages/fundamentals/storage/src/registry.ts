import type { StorageSignal } from "./types"

// ─── Signal Registry ─────────────────────────────────────────────────────────

interface RegistryEntry<T = unknown> {
  signal: StorageSignal<T>
  defaultValue: T
  backend: string
}

const registry = new Map<string, RegistryEntry>()

/**
 * Build a composite key from backend type + storage key to avoid
 * collisions between different backends using the same key name.
 */
function registryKey(backend: string, key: string): string {
  return `${backend}:${key}`
}

/**
 * Get an existing signal from the registry.
 */
export function getEntry<T>(backend: string, key: string): RegistryEntry<T> | undefined {
  return registry.get(registryKey(backend, key)) as RegistryEntry<T> | undefined
}

/**
 * Register a new signal in the registry.
 */
export function setEntry<T>(
  backend: string,
  key: string,
  signal: StorageSignal<T>,
  defaultValue: T,
): void {
  registry.set(registryKey(backend, key), { signal, defaultValue, backend })
}

/**
 * Remove an entry from the registry.
 */
export function removeEntry(backend: string, key: string): void {
  registry.delete(registryKey(backend, key))
}

/**
 * Get all entries for a specific backend.
 */
export function getEntriesByBackend(backend: string): RegistryEntry[] {
  const entries: RegistryEntry[] = []
  for (const entry of registry.values()) {
    if (entry.backend === backend) entries.push(entry)
  }
  return entries
}

/**
 * Clear all entries from the registry. Used for testing.
 */
export function _resetRegistry(): void {
  registry.clear()
}
