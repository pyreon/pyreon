import { signal } from '@pyreon/reactivity'
import { createStorageSignal } from './local'
import { getEntry, setEntry } from './registry'
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
  // Return existing signal if already registered
  const existing = getEntry<T>('session', key)
  if (existing) return existing.signal

  const storage = getWebStorage('session')

  // Read initial value from storage
  let initialValue = defaultValue
  if (storage) {
    const raw = storage.getItem(key)
    if (raw !== null) {
      initialValue = deserialize(raw, defaultValue, options?.deserializer, options?.onError)
    }
  }

  const sig = signal<T>(initialValue)
  const storageSig = createStorageSignal(sig, key, defaultValue, 'session', options)

  setEntry('session', key, storageSig, defaultValue)

  return storageSig
}
