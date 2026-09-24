import { signal } from '@pyreon/reactivity'
import { createStorageSignal } from './local'
import { getEntry, retainEntry, setEntry } from './registry'
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
  // Same-key consumers each retain the per-key registry refcount, so the entry
  // is destroyed on the LAST `.remove()` and not the first. `useStorage` was
  // fixed this way in #725/#729 and the registry's own docstring states the
  // contract ("per-consumer `.remove()` goes through `releaseEntry`") — this
  // backend kept the pre-fix shape, so one consumer's `.remove()` orphaned
  // every sibling: `clearStorage`/`removeStorage` stopped seeing their signal,
  // and the next call for the same key minted a SECOND, independent one.
  //
  // Session is the sharpest case: it shares `createStorageSignal` with
  // localStorage, so it always RELEASED a refcount it never took — the count
  // went 1 → 0 on whichever consumer removed first.
  const existing = getEntry<T>('session', key)
  if (existing) {
    retainEntry('session', key)
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

  setEntry('session', key, storageSig, defaultValue, options)

  return storageSig
}
