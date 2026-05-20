import type { StorageSignal } from './types'

// ─── Signal Registry ─────────────────────────────────────────────────────────

interface RegistryEntry<T = unknown> {
  signal: StorageSignal<T>
  defaultValue: T
  backend: string
  /**
   * Per-key consumer refcount. Incremented each `useStorage(key, …)` call
   * (including same-key cached returns); decremented on each `.remove()`.
   * The entry is destroyed only when the count drops to 0 — keeping it
   * alive while N-1 consumers still hold the signal preserves cross-tab
   * sync routing for surviving consumers. See the entry's prose comment
   * in `local.ts:useStorage` for the bug class (post-#725/#729 sweep).
   */
  refCount: number
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
 * Register a new signal in the registry. New entries start at refCount = 1
 * (the first consumer). `retainEntry` is the API for additional consumers
 * (cached returns from `useStorage`).
 */
export function setEntry<T>(
  backend: string,
  key: string,
  signal: StorageSignal<T>,
  defaultValue: T,
): void {
  registry.set(registryKey(backend, key), { signal, defaultValue, backend, refCount: 1 })
}

/**
 * Increment the per-key consumer refcount. Called for same-key cached
 * returns in `useStorage` so a single consumer's `.remove()` doesn't
 * destroy the entry while siblings still hold the signal.
 */
export function retainEntry(backend: string, key: string): void {
  const entry = registry.get(registryKey(backend, key))
  if (entry) entry.refCount++
}

/**
 * Decrement the per-key consumer refcount. Returns `true` if the entry
 * was removed (count reached 0), `false` if the entry remains (other
 * consumers exist). Used by `.remove()` to gate listener-detach +
 * registry-delete behind a true LAST-consumer release.
 */
export function releaseEntry(backend: string, key: string): boolean {
  const composite = registryKey(backend, key)
  const entry = registry.get(composite)
  if (!entry) return false
  entry.refCount--
  if (entry.refCount <= 0) {
    registry.delete(composite)
    return true
  }
  return false
}

/**
 * Remove an entry from the registry unconditionally (bypasses refcount).
 * Used by `removeStorage(key)` — the user-facing "destroy this key
 * everywhere" API — and by test cleanup. Per-consumer `.remove()` goes
 * through `releaseEntry` instead.
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
