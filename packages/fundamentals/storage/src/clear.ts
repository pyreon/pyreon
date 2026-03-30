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
  options?: { type?: 'local' | 'session' | 'cookie' | 'indexeddb' },
): void {
  const type = options?.type ?? 'local'
  const entry = getEntry(type, key)

  if (entry) {
    entry.signal.remove()
  } else {
    // No signal registered — still try to clear the raw storage
    if (type === 'local' || type === 'session') {
      const storage = getWebStorage(type)
      if (storage) storage.removeItem(key)
    } else if (type === 'cookie' && isBrowser()) {
      // biome-ignore lint/suspicious/noDocumentCookie: standard cookie deletion API
      document.cookie = `${encodeURIComponent(key)}=; max-age=0; path=/`
    }
    removeEntry(type, key)
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
