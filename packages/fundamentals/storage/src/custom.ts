import { signal, wrapSignal } from '@pyreon/reactivity'
import { getEntry, getScopedMap, releaseEntry, retainEntry, setEntry } from './registry'
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
    // Same-key consumers each retain the per-key registry refcount, so the entry
    // is destroyed on the LAST `.remove()` and not the first. `useStorage` was
    // fixed this way in #725/#729 and the registry's own docstring states the
    // contract ("per-consumer `.remove()` goes through `releaseEntry`") — this
    // backend kept the pre-fix shape, so one consumer's `.remove()` orphaned
    // every sibling: `clearStorage`/`removeStorage` stopped seeing their signal,
    // and the next call for the same key minted a SECOND, independent one.
    const existing = getEntry<T>(name, key)
    if (existing) {
      retainEntry(name, key)
      return existing.signal
    }

    // Read initial value
    let initialValue = defaultValue
    try {
      const raw = backend.get(key)
      if (raw !== null) {
        initialValue = deserialize(raw, defaultValue, options)
      }
    } catch {
      // Backend read failed — use default
    }

    const sig = signal<T>(initialValue)

    // `wrapSignal` delegates reads (incl. `.direct` + `_v`) to the shared base
    // `sig` and routes writes through the custom backend; `.update` defaults.
    const storageSig = wrapSignal(sig, {
      set: (value: T) => {
        sig.set(value)
        try {
          backend.set(key, serialize(value, options))
        } catch (e) {
          // Write failed — signal still updates. Notify `onError` (return ignored).
          options?.onError?.(e as Error)
        }
      },
    }) as unknown as StorageSignal<T>

    storageSig.remove = () => {
      sig.set(defaultValue)
      try {
        backend.remove(key)
      } catch {
        // Remove failed
      }
      releaseEntry(name, key)
    }

    setEntry(name, key, storageSig, defaultValue, options)

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
  {
    // Request-scoped rather than a module-level `Map`. A plain module map is
    // correct in a browser and a cross-request bleed on a server: the store
    // this hook documents as "useful for SSR" would serve request B whatever
    // request A wrote under the same key. Isolating the cached SIGNAL alone
    // does not fix that — a fresh signal seeded from a process-global byte
    // store still reads A's value — so the bytes move behind the same seam.
    get: (key: string) => getScopedMap<string>('memory').get(key) ?? null,
    set: (key: string, value: string) => {
      getScopedMap<string>('memory').set(key, value)
    },
    remove: (key: string) => {
      getScopedMap<string>('memory').delete(key)
    },
  },
  'memory',
)
