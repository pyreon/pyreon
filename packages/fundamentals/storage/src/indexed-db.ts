import { signal, wrapSignal } from '@pyreon/reactivity'
import { getEntry, removeEntry, setEntry } from './registry'
import type { IndexedDBOptions, StorageSignal } from './types'
import { deserialize, isBrowser, serialize } from './utils'


// ─── Database management ─────────────────────────────────────────────────────

const dbCache = new Map<string, Promise<IDBDatabase>>()

function openDB(dbName: string, storeName: string): Promise<IDBDatabase> {
  /* v8 ignore next 3 — SSR/no-indexedDB guard; tests run with happy-dom which provides indexedDB */
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('[Pyreon] indexedDB is not available in this environment'))
  }
  const cacheKey = `${dbName}:${storeName}`
  const cached = dbCache.get(cacheKey)
  /* v8 ignore next — defensive cache hit; second-call path */
  if (cached) return cached

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      /* v8 ignore next — store-already-exists arm: only on a version re-upgrade of an existing store; tests open fresh DBs */
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  // Cache the catching variant — without this, a rejected open promise
  // (quota exceeded, browser settings, blocked upgrade) stays in
  // `dbCache` forever; every subsequent `useIndexedDB(sameKey)` call
  // returns the cached rejection. The `.catch` re-throws so callers
  // still see the original error on this attempt.
  const cachedPromise = promise.catch((err) => {
    dbCache.delete(cacheKey)
    throw err
  })
  dbCache.set(cacheKey, cachedPromise)
  return cachedPromise
}

function idbGet(db: IDBDatabase, storeName: string, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.get(key)
    request.onsuccess = () =>
      resolve(request.result !== undefined ? (request.result as string) : null)
    /* v8 ignore next — IDB get onerror: defensive reject, fires only on a real IDB read failure */
    request.onerror = () => reject(request.error)
  })
}

function idbSet(db: IDBDatabase, storeName: string, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.put(value, key)
    request.onsuccess = () => resolve()
    /* v8 ignore next — IDB put onerror: defensive reject, fires only on a real IDB write failure */
    request.onerror = () => reject(request.error)
  })
}

function idbDelete(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    /* v8 ignore next — IDB delete onerror: defensive reject, fires only on a real IDB delete failure */
    request.onerror = () => reject(request.error)
  })
}

// ─── useIndexedDB ────────────────────────────────────────────────────────────

/**
 * Reactive signal backed by IndexedDB. Suitable for large or structured
 * data that exceeds localStorage limits. Writes are debounced.
 *
 * The signal starts with `defaultValue` and updates asynchronously
 * when the stored value is read from IndexedDB.
 *
 * @example
 * ```ts
 * const draft = useIndexedDB('article-draft', { title: '', body: '' })
 * draft()  // { title: '', body: '' } initially, then stored value
 * draft.set({ title: 'My Post', body: '...' })  // signal updates immediately, IDB write is debounced
 * ```
 */
export function useIndexedDB<T>(
  key: string,
  defaultValue: T,
  options: IndexedDBOptions<T> = {},
): StorageSignal<T> {
  // Return existing signal if already registered
  const existing = getEntry<T>('indexeddb', key)
  if (existing) return existing.signal

  const dbName = options.dbName ?? 'pyreon-storage'
  const storeName = options.storeName ?? 'kv'
  const debounceMs = options.debounceMs ?? 100

  const sig = signal<T>(defaultValue)

  // Async initial load
  if (isBrowser() && typeof indexedDB !== 'undefined') {
    openDB(dbName, storeName)
      .then((db) => idbGet(db, storeName, key))
      .then((raw) => {
        if (raw !== null) {
          const value = deserialize(raw, defaultValue, options)
          sig.set(value)
        }
      })
      /* v8 ignore start — IDB init-failure catch block; requires controlled storage corruption to trigger */
      .catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          // oxlint-disable-next-line no-console
          console.warn(`[Pyreon] IndexedDB "${key}" init failed, using default:`, err)
        }
        options.onError?.(err instanceof Error ? err : new Error(String(err)))
      })
      /* v8 ignore stop */
  }

  // Debounced write
  let writeTimer: ReturnType<typeof setTimeout> | null = null
  let pendingValue: T | undefined

  function flushWrite(): void {
    /* v8 ignore next — defensive pendingValue undef guard */
    if (pendingValue === undefined) return
    const value = pendingValue
    pendingValue = undefined

    /* v8 ignore next — SSR/no-IDB guard */
    if (!isBrowser() || typeof indexedDB === 'undefined') return

    openDB(dbName, storeName)
      .then((db) => idbSet(db, storeName, key, serialize(value, options)))
      /* v8 ignore start — write-failure catch: signal already holds the value; notify onError */
      .catch((err) => {
        // Write failed — signal still has the correct value. Notify onError.
        options.onError?.(err instanceof Error ? err : new Error(String(err)))
      })
    /* v8 ignore stop */
  }

  function scheduleWrite(value: T): void {
    pendingValue = value
    if (writeTimer !== null) clearTimeout(writeTimer)
    writeTimer = setTimeout(flushWrite, debounceMs)
  }

  // `wrapSignal` delegates reads (incl. `.direct` + `_v`) to the shared base
  // `sig` and routes writes through the debounced IDB writer; `.update` defaults.
  const storageSig = wrapSignal(sig, {
    set: (value: T) => {
      sig.set(value)
      scheduleWrite(value)
    },
  }) as unknown as StorageSignal<T>

  storageSig.remove = () => {
    sig.set(defaultValue)
    pendingValue = undefined
    if (writeTimer !== null) clearTimeout(writeTimer)

    if (isBrowser() && typeof indexedDB !== 'undefined') {
      openDB(dbName, storeName)
        .then((db) => idbDelete(db, storeName, key))
        /* v8 ignore start — delete-failure catch: signal already reset, nothing to do */
        .catch(() => {
          // Delete failed — signal already reset
        })
      /* v8 ignore stop */
    }

    removeEntry('indexeddb', key)
  }

  setEntry('indexeddb', key, storageSig, defaultValue, options)

  return storageSig
}

/**
 * Reset the database cache. For testing only.
 */
export function _resetDBCache(): void {
  dbCache.clear()
}
