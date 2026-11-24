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
 * ```
 */
export function removeStorage(
  key: string,
  options?: {
    type?: 'local' | 'session' | 'cookie' | 'indexeddb'
    /** `indexeddb` only: the database and store the key lives in (defaults match `useIndexedDB`). */
    dbName?: string
    storeName?: string
  },
): void {
  const type = options?.type ?? 'local'
  const entry = getEntry(type, key)

  if (entry) {
    entry.signal.remove()
    return
  }
  // No signal registered — still clear the raw storage. There is no binding
  // and so no `onError` to report to: a refused delete is swallowed here
  // rather than thrown out of a cleanup call.
  removeRaw(type, key, options)
  removeEntry(type, key)
}

function removeRaw(
  type: 'local' | 'session' | 'cookie' | 'indexeddb',
  key: string,
  options: { dbName?: string; storeName?: string } | undefined,
): void {
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
      // A failed delete has no binding to report to (exercised in quota.browser.test.ts).
      /* v8 ignore next */
      deleteIndexedDBKey(key, options?.dbName, options?.storeName).catch(() => {})
    }
  } catch {
    // Storage blocked (`SecurityError`): nothing was stored that we could read.
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
 * ```
 */
export function clearStorage(type: StorageType = 'local'): void {
  if (type === 'all') {
    clearBackend('local')
    clearBackend('session')
    clearBackend('cookie')
    clearBackend('indexeddb')
    return
  }

  clearBackend(type)
}

function clearBackend(type: string): void {
  const entries = getEntriesByBackend(type)
  for (const entry of entries) {
    entry.signal.remove()
  }
}
