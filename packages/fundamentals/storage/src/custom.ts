import { signal } from '@pyreon/reactivity'
import { getEntry, removeEntry, setEntry } from './registry'
import type { StorageBackend, StorageOptions, StorageSignal } from './types'
import { deserialize, serialize } from './utils'

// ─── createStorage ───────────────────────────────────────────────────────────

/**
 * Create a custom storage hook backed by any synchronous storage backend.
 * Useful for encrypted storage, in-memory storage, or custom adapters.
 *
 * @example
 * ```ts
 * const useEncrypted = createStorage({
 *   get: (key) => decrypt(localStorage.getItem(key)),
 *   set: (key, value) => localStorage.setItem(key, encrypt(value)),
 *   remove: (key) => localStorage.removeItem(key),
 * })
 *
 * const secret = useEncrypted('api-key', '')
 * ```
 */
export function createStorage(
  backend: StorageBackend,
  backendName?: string,
): <T>(key: string, defaultValue: T, options?: StorageOptions<T>) => StorageSignal<T> {
  const name = backendName ?? 'custom'

  return function useCustomStorage<T>(
    key: string,
    defaultValue: T,
    options?: StorageOptions<T>,
  ): StorageSignal<T> {
    // Return existing signal if already registered
    const existing = getEntry<T>(name, key)
    if (existing) return existing.signal

    // Read initial value
    let initialValue = defaultValue
    try {
      const raw = backend.get(key)
      if (raw !== null) {
        initialValue = deserialize(raw, defaultValue, options?.deserializer, options?.onError)
      }
    } catch {
      // Backend read failed — use default
    }

    const sig = signal<T>(initialValue)

    // Build the storage signal
    const storageSig = (() => sig()) as unknown as StorageSignal<T>

    storageSig.peek = () => sig.peek()
    storageSig.subscribe = (listener: () => void) => sig.subscribe(listener)
    storageSig.direct = (updater: () => void) => sig.direct(updater)
    storageSig.debug = () => sig.debug()

    Object.defineProperty(storageSig, 'label', {
      get: () => sig.label,
      set: (v: string | undefined) => {
        sig.label = v
      },
    })

    storageSig.set = (value: T) => {
      sig.set(value)
      try {
        backend.set(key, serialize(value, options?.serializer))
      } catch {
        // Write failed — signal still updates
      }
    }

    storageSig.update = (fn: (current: T) => T) => {
      const newValue = fn(sig.peek())
      storageSig.set(newValue)
    }

    storageSig.remove = () => {
      sig.set(defaultValue)
      try {
        backend.remove(key)
      } catch {
        // Remove failed
      }
      removeEntry(name, key)
    }

    setEntry(name, key, storageSig, defaultValue)

    return storageSig
  }
}

// ─── Memory storage ──────────────────────────────────────────────────────────

/**
 * In-memory storage backend. Useful for SSR, testing, or ephemeral state.
 * Values are lost on page unload.
 *
 * @example
 * ```ts
 * import { useMemoryStorage } from '@pyreon/storage'
 *
 * const temp = useMemoryStorage('key', 'default')
 * ```
 */
export const useMemoryStorage = createStorage(
  (() => {
    const store = new Map<string, string>()
    return {
      get: (key: string) => store.get(key) ?? null,
      set: (key: string, value: string) => store.set(key, value),
      remove: (key: string) => store.delete(key),
    }
  })(),
  'memory',
)
