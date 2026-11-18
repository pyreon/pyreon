import { signal } from '@pyreon/reactivity'
import { createStorageSignal } from './local'
import { getEntry, releaseWithOwner, retainEntry, warnIfOptionsDiffer } from './registry'
import type { StorageOptions, StorageSignal } from './types'
import { deserialize, getWebStorage } from './utils'

// ─── useSessionStorage ───────────────────────────────────────────────────────

/**
 * Reactive signal backed by sessionStorage. Scoped to the current
 * browser tab — does not sync across tabs.
 *
 * @example
 * ```ts
 * const step = useSessionStorage('wizard-step', 0)
 * step()       // 0 (or stored value)
 * step.set(3)  // updates signal + sessionStorage
 * step.remove() // clears storage, resets to default
 * ```
 */
export function useSessionStorage<T>(
  key: string,
  defaultValue: T,
  options?: StorageOptions<T>,
): StorageSignal<T> {
  // Every call holds one refcount on the shared per-key entry, released when
  // the calling owner scope is disposed (`releaseWithOwner`), never by
  // `.remove()`: removing the value keeps the binding alive (#4381).
  const existing = getEntry<T>('session', key)
  if (existing) {
    warnIfOptionsDiffer('session', key, existing, defaultValue, options)
    retainEntry('session', key)
    releaseWithOwner('session', key)

    return existing.signal
  }

  const storage = getWebStorage('session')

  // Read initial value from storage
  let initialValue = defaultValue
  /* v8 ignore next — defensive null storage guard */
  if (storage) {
    const raw = storage.getItem(key)
    if (raw !== null) {
      initialValue = deserialize(raw, defaultValue, options)
    }
  }

  const sig = signal<T>(initialValue)
  const storageSig = createStorageSignal(sig, key, defaultValue, 'session', options)
  releaseWithOwner('session', key)

  return storageSig
}
