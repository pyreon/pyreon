import { signal } from '@pyreon/reactivity'
import { getEntry, removeEntry, setEntry } from './registry'
import type { IndexedDBOptions, StorageSignal } from './types'
import { deserialize, isBrowser, serialize } from './utils'

// @ts-ignore — import.meta.env.DEV is Vite/Rolldown literal-replaced at build time
const __DEV__: boolean = import.meta.env?.DEV === true

// ─── Database management ─────────────────────────────────────────────────────

const dbCache = new Map<string, Promise<IDBDatabase>>()

function openDB(dbName: string, storeName: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('[Pyreon] indexedDB is not available in this environment'))
  }
  const cacheKey = `${dbName}:${storeName}`
  const cached = dbCache.get(cacheKey)
  if (cached) return cached

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  dbCache.set(cacheKey, promise)
  return promise
}

function idbGet(db: IDBDatabase, storeName: string, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.get(key)
    request.onsuccess = () =>
      resolve(request.result !== undefined ? (request.result as string) : null)
    request.onerror = () => reject(request.error)
  })
}

function idbSet(db: IDBDatabase, storeName: string, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function idbDelete(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.delete(key)
    request.onsuccess = () => resolve()
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
          const value = deserialize(raw, defaultValue, options.deserializer, options.onError)
          sig.set(value)
        }
      })
      .catch((err) => {
        if (__DEV__) {
          // oxlint-disable-next-line no-console
          console.warn(`[Pyreon] IndexedDB "${key}" init failed, using default:`, err)
        }
        options.onError?.(err instanceof Error ? err : new Error(String(err)))
      })
  }

  // Debounced write
  let writeTimer: ReturnType<typeof setTimeout> | null = null
  let pendingValue: T | undefined

  function flushWrite(): void {
    if (pendingValue === undefined) return
    const value = pendingValue
    pendingValue = undefined

    if (!isBrowser() || typeof indexedDB === 'undefined') return

    openDB(dbName, storeName)
      .then((db) => idbSet(db, storeName, key, serialize(value, options.serializer)))
      .catch(() => {
        // Write failed — signal still has the correct value
      })
  }

  function scheduleWrite(value: T): void {
    pendingValue = value
    if (writeTimer !== null) clearTimeout(writeTimer)
    writeTimer = setTimeout(flushWrite, debounceMs)
  }

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
    scheduleWrite(value)
  }

  storageSig.update = (fn: (current: T) => T) => {
    const newValue = fn(sig.peek())
    storageSig.set(newValue)
  }

  storageSig.remove = () => {
    sig.set(defaultValue)
    pendingValue = undefined
    if (writeTimer !== null) clearTimeout(writeTimer)

    if (isBrowser() && typeof indexedDB !== 'undefined') {
      openDB(dbName, storeName)
        .then((db) => idbDelete(db, storeName, key))
        .catch(() => {
          // Delete failed — signal already reset
        })
    }

    removeEntry('indexeddb', key)
  }

  setEntry('indexeddb', key, storageSig, defaultValue)

  return storageSig
}

/**
 * Reset the database cache. For testing only.
 */
export function _resetDBCache(): void {
  dbCache.clear()
}
