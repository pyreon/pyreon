import { signal, wrapSignal } from '@pyreon/reactivity'
import { registerPendingFlush, unregisterPendingFlush } from './local'
import { getEntry, releaseEntry, retainEntry, setEntry, warnIfOptionsDiffer } from './registry'
import type { IndexedDBOptions, IndexedDBSignal } from './types'
import { deserialize, isBrowser, serialize } from './utils'


// ─── Database management ─────────────────────────────────────────────────────
//
// ONE connection per DATABASE (not per db+store). An object store can only be
// created inside a version-change transaction, and an existing database opened
// at the SAME version never runs `onupgradeneeded` — so the old per-store
// `indexedDB.open(dbName, 1)` created the FIRST store only: a second
// `storeName` in an existing database was never created, and every read and
// write against it failed with `NotFoundError`. Now, a missing store closes the
// connection and reopens at `version + 1`, creating it in the upgrade.
//
// Calls for the same database are CHAINED on the cached promise, so two stores
// requested concurrently upgrade one after the other instead of racing two
// version changes against each other.

const dbCache = new Map<string, Promise<IDBDatabase>>()

function rawOpen(dbName: string, storeName: string, version?: number): Promise<IDBDatabase> {
  /* v8 ignore next 3 — SSR/no-indexedDB guard; tests run with happy-dom which provides indexedDB */
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('[Pyreon] indexedDB is not available in this environment'))
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request =
      version === undefined ? indexedDB.open(dbName) : indexedDB.open(dbName, version)

    request.onupgradeneeded = () => {
      const db = request.result
      /* v8 ignore next — upgrade for a store that already exists: only reachable if another connection created it mid-upgrade */
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName)
    }

    request.onsuccess = () => {
      const db = request.result
      // Another tab (or a later version of this code) wants to upgrade: step
      // aside, or its upgrade stays blocked for as long as this tab is open.
      // The next access reopens at the new version.
      db.onversionchange = () => {
        db.close()
        dbCache.delete(dbName)
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  })
}

function openDB(dbName: string, storeName: string): Promise<IDBDatabase> {
  const previous = dbCache.get(dbName)
  const promise = (previous ?? Promise.resolve(null))
    .catch(() => null)
    .then(async (existing: IDBDatabase | null) => {
      const db = existing ?? (await rawOpen(dbName, storeName))
      if (db.objectStoreNames.contains(storeName)) return db
      // The database exists without this store — upgrade to create it.
      const nextVersion = db.version + 1
      db.close()
      return rawOpen(dbName, storeName, nextVersion)
    })

  // Evict a rejected open so the next call retries instead of receiving the
  // cached rejection forever (quota exceeded, blocked by browser settings).
  // The caller still sees this attempt's error.
  const cachedPromise = promise.catch((err) => {
    if (dbCache.get(dbName) === cachedPromise) dbCache.delete(dbName)
    throw err
  })
  dbCache.set(dbName, cachedPromise)
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
 * The signal starts with `defaultValue` and updates asynchronously when the
 * stored value is read from IndexedDB. `ready()` (reactive) turns `true` once
 * that read settles, and `whenReady()` resolves at the same moment. A `.set()`
 * or `.remove()` made BEFORE the read settles wins — the late read never
 * overwrites it. A pending debounced write is flushed on `pagehide` /
 * `beforeunload`, and `flush()` forces it (resolving once it is written).
 *
 * @example
 * ```ts
 * const draft = useIndexedDB('article-draft', { title: '', body: '' })
 * draft()  // { title: '', body: '' } initially, then stored value
 * await draft.whenReady()
 * draft.set({ title: 'My Post', body: '...' })  // signal updates immediately, IDB write is debounced
 * ```
 */
export function useIndexedDB<T>(
  key: string,
  defaultValue: T,
  options: IndexedDBOptions<T> = {},
): IndexedDBSignal<T> {
  // Same-key consumers each retain the per-key registry refcount, so the entry
  // is destroyed on the LAST `.remove()` and not the first. `useStorage` was
  // fixed this way in #725/#729 and the registry's own docstring states the
  // contract ("per-consumer `.remove()` goes through `releaseEntry`") — this
  // backend kept the pre-fix shape, so one consumer's `.remove()` orphaned
  // every sibling: `clearStorage`/`removeStorage` stopped seeing their signal,
  // and the next call for the same key minted a SECOND, independent one.
  const existing = getEntry<T>('indexeddb', key)
  if (existing) {
    warnIfOptionsDiffer('indexeddb', key, existing, defaultValue, options)
    retainEntry('indexeddb', key)
    return existing.signal as IndexedDBSignal<T>
  }

  const dbName = options.dbName ?? 'pyreon-storage'
  const storeName = options.storeName ?? 'kv'
  const debounceMs = options.debounceMs ?? 100

  const sig = signal<T>(defaultValue)
  const readySig = signal(false)

  // Set once this tab writes (`.set`) or clears (`.remove`) the value. The
  // initial read is async; if it resolves AFTER a local write it holds the
  // OLDER value, and applying it would silently discard what the user typed.
  let localWrite = false

  let resolveReady!: () => void
  const readyPromise = new Promise<void>((r) => {
    resolveReady = r
  })
  const markReady = (): void => {
    readySig.set(true)
    resolveReady()
  }

  // Async initial load
  if (isBrowser() && typeof indexedDB !== 'undefined') {
    openDB(dbName, storeName)
      .then((db) => idbGet(db, storeName, key))
      .then((raw) => {
        if (raw !== null && !localWrite) {
          sig.set(deserialize(raw, defaultValue, options))
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
      .finally(markReady)
  } else {
    // SSR / no IndexedDB: nothing to load.
    markReady()
  }

  // Debounced write
  let writeTimer: ReturnType<typeof setTimeout> | null = null
  let hasPending = false
  let pendingValue: T = defaultValue
  let lastWrite: Promise<void> = Promise.resolve()

  function flushWrite(): Promise<void> {
    if (writeTimer !== null) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
    unregisterPendingFlush(flushWrite)
    if (!hasPending) return lastWrite
    hasPending = false
    const value = pendingValue

    /* v8 ignore next — SSR/no-IDB guard */
    if (!isBrowser() || typeof indexedDB === 'undefined') return lastWrite

    lastWrite = openDB(dbName, storeName)
      .then((db) => idbSet(db, storeName, key, serialize(value, options)))
      /* v8 ignore start — write-failure catch: signal already holds the value; notify onError */
      .catch((err) => {
        // Write failed — signal still has the correct value. Notify onError.
        options.onError?.(err instanceof Error ? err : new Error(String(err)))
      })
    /* v8 ignore stop */
    return lastWrite
  }

  function scheduleWrite(value: T): void {
    pendingValue = value
    hasPending = true
    registerPendingFlush(flushWrite)
    if (writeTimer !== null) clearTimeout(writeTimer)
    writeTimer = setTimeout(flushWrite, debounceMs)
  }

  // `wrapSignal` delegates reads (incl. `.direct` + `_v`) to the shared base
  // `sig` and routes writes through the debounced IDB writer; `.update` defaults.
  const storageSig = wrapSignal(sig, {
    set: (value: T) => {
      localWrite = true
      sig.set(value)
      scheduleWrite(value)
    },
  }) as unknown as IndexedDBSignal<T>

  storageSig.remove = () => {
    localWrite = true
    sig.set(defaultValue)
    hasPending = false
    if (writeTimer !== null) clearTimeout(writeTimer)
    writeTimer = null
    unregisterPendingFlush(flushWrite)

    if (isBrowser() && typeof indexedDB !== 'undefined') {
      openDB(dbName, storeName)
        .then((db) => idbDelete(db, storeName, key))
        /* v8 ignore start — delete-failure catch: signal already reset, nothing to do */
        .catch(() => {
          // Delete failed — signal already reset
        })
      /* v8 ignore stop */
    }

    releaseEntry('indexeddb', key)
  }

  storageSig.ready = () => readySig()
  storageSig.whenReady = () => readyPromise
  storageSig.flush = flushWrite

  setEntry('indexeddb', key, storageSig, defaultValue, options)

  return storageSig
}

/**
 * Reset the database cache. For testing only.
 */
export function _resetDBCache(): void {
  dbCache.clear()
}
