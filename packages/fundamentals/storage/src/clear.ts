import { deleteIndexedDBKey } from './indexed-db'
import { getEntriesByBackend, getEntry, removeEntry } from './registry'
import { getWebStorage, isBrowser } from './utils'

// ─── Storage type mapping ────────────────────────────────────────────────────

type StorageType = 'local' | 'session' | 'cookie' | 'indexeddb' | 'all'

// ─── removeStorage ───────────────────────────────────────────────────────────

/**
 * Remove a specific key from storage and reset its signal to the default value.
 *
 * @example
 * ```ts
 * removeStorage('theme')                        // from localStorage
 * removeStorage('step', { type: 'session' })    // from sessionStorage
 * removeStorage('locale', { type: 'cookie' })   // deletes cookie
 * await removeStorage('draft', { type: 'indexeddb' }) // resolves once the delete committed
 * ```
 *
 * Returns a promise for every backend. The synchronous backends (local,
 * session, cookie) are already cleared when the call returns; IndexedDB
 * resolves once its delete has committed. Without a live binding an IndexedDB
 * delete never creates or upgrades a database or store.
 */
export async function removeStorage(
  key: string,
  options?: {
    type?: 'local' | 'session' | 'cookie' | 'indexeddb'
    /** `indexeddb` only: the database and store the key lives in (defaults match `useIndexedDB`). */
    dbName?: string
    storeName?: string
  },
): Promise<void> {
  const type = options?.type ?? 'local'
  const entry = getEntry(type, key)

  if (entry) {
    // `useIndexedDB`'s `remove()` resolves once the delete commits; the
    // synchronous backends return nothing.
    await entry.signal.remove()
    return
  }
  // No signal registered — still clear the raw storage. There is no binding
  // and so no `onError` to report to: a refused delete is swallowed here
  // rather than thrown out of a cleanup call.
  removeEntry(type, key)
  await removeRaw(type, key, options)
}

async function removeRaw(
  type: 'local' | 'session' | 'cookie' | 'indexeddb',
  key: string,
  options: { dbName?: string; storeName?: string } | undefined,
): Promise<void> {
  try {
    if (type === 'local' || type === 'session') {
      // A full storage still deletes: `getWebStorage` probes with a read
      // (#4812), so a quota-exhausted backend is not mistaken for an absent one.
      getWebStorage(type)?.removeItem(key)
    } else if (type === 'cookie') {
      /* v8 ignore next — SSR guard */
      if (isBrowser()) document.cookie = `${encodeURIComponent(key)}=; max-age=0; path=/`
    } else {
      // IndexedDB: the delete used to be skipped entirely without a binding.
      // It never creates or upgrades a database or store (see `deleteIndexedDBKey`).
      await deleteIndexedDBKey(key, options?.dbName, options?.storeName)
    }
  } catch {
    // Storage blocked (`SecurityError`) or the IndexedDB delete failed: there
    // is no binding to report to.
  }
}

// ─── clearStorage ────────────────────────────────────────────────────────────

/**
 * Clear all managed storage entries for a specific backend, or all backends.
 *
 * @example
 * ```ts
 * clearStorage()           // clear all localStorage entries managed by @pyreon/storage
 * clearStorage('session')  // clear all sessionStorage entries
 * clearStorage('cookie')   // clear all managed cookies
 * clearStorage('all')      // clear everything
 * await clearStorage('indexeddb') // resolves once the IndexedDB deletes committed
 * ```
 */
export async function clearStorage(type: StorageType = 'local'): Promise<void> {
  const types = type === 'all' ? ['local', 'session', 'cookie', 'indexeddb'] : [type]
  // Every removal starts synchronously (the synchronous backends are cleared
  // when this returns); the promise settles once IndexedDB deletes commit.
  const pending: unknown[] = []
  for (const t of types) {
    for (const entry of getEntriesByBackend(t)) pending.push(entry.signal.remove())
  }
  await Promise.all(pending)
}
