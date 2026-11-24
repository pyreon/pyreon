import { signal, wrapSignal } from '@pyreon/reactivity'
import { registerPendingFlush, unregisterPendingFlush } from './local'
import { getEntry, releaseWithOwner, retainEntry, setEntry, warnIfOptionsDiffer } from './registry'
import type { IndexedDBOptions, IndexedDBSignal } from './types'
import { deserialize, isBrowser, serialize, toError } from './utils'


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

// A write is durable only once its TRANSACTION completes. A quota failure
// (`QuotaExceededError`) typically surfaces as the transaction ABORTING at
// commit, after the put request already reported success — settling on
// `request.onsuccess` resolved such a write as written and never reached
// `onError` (#4812). Settle on the transaction instead.
function settleOnTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    // A real IDB write failure (quota, aborted commit): exercised in quota.browser.test.ts.
    /* v8 ignore start */
    tx.onabort = () => reject(tx.error ?? new DOMException('IndexedDB write aborted', 'AbortError'))
    // During `error` the transaction's own `error` is still null (it is set
    // when the abort follows): the failing REQUEST holds the real error
    // (`ConstraintError`, `QuotaExceededError`, …).
    tx.onerror = (event) =>
      reject((event.target as IDBRequest | null)?.error ?? tx.error ?? new DOMException('IndexedDB write failed', 'UnknownError'))
    /* v8 ignore stop */
  })
}

function idbSet(db: IDBDatabase, storeName: string, key: string, value: string): Promise<void> {
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).put(value, key)
  return settleOnTx(tx)
}

function idbDelete(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).delete(key)
  return settleOnTx(tx)
}

/**
 * Open an EXISTING database without creating or upgrading anything: resolves
 * `null` when the database does not exist (the version change that would
 * create it is aborted) or lacks `storeName`.
 */
/* v8 ignore start — happy-dom has no IndexedDB; exercised in quota.browser.test.ts */
function openExisting(dbName: string, storeName: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName)
    let created = false
    request.onupgradeneeded = () => {
      // Only a database that does not exist yet upgrades on a version-less
      // open. Abort, so a cleanup call never leaves an empty database behind.
      created = true
      request.transaction?.abort()
    }
    request.onsuccess = () => {
      const db = request.result
      if (db.objectStoreNames.contains(storeName)) return resolve(db)
      db.close()
      resolve(null)
    }
    request.onerror = () => (created ? resolve(null) : reject(request.error))
  })
}
/* v8 ignore stop */

/**
 * Delete one key from a database/store without a live binding (what
 * `removeStorage(key, { type: 'indexeddb' })` needs when nothing is mounted).
 * Never creates or upgrades a database or store: a missing one has nothing to
 * delete. Resolves once the delete commits; rejects with the IndexedDB error.
 */
export async function deleteIndexedDBKey(
  key: string,
  dbName = 'pyreon-storage',
  storeName = 'kv',
): Promise<void> {
  /* v8 ignore next — SSR/no-IDB guard */
  if (!isBrowser() || typeof indexedDB === 'undefined') return
  /* v8 ignore start — happy-dom has no IndexedDB; exercised in quota.browser.test.ts */
  const db = await openExisting(dbName, storeName)
  if (db === null) return
  try {
    await idbDelete(db, storeName, key)
  } finally {
    db.close()
  }
  /* v8 ignore stop */
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
  // Every call holds one refcount on the shared per-key entry, released when
  // the calling owner scope is disposed (`releaseWithOwner`), never by
  // `.remove()`: removing the value keeps the binding alive (#4381).
  const existing = getEntry<T>('indexeddb', key)
  if (existing) {
    warnIfOptionsDiffer('indexeddb', key, existing, defaultValue, options)
    retainEntry('indexeddb', key)
    releaseWithOwner('indexeddb', key)

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
        options.onError?.(toError(err))
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
        // Write failed — signal still has the correct value and the stored
        // value is unchanged (the transaction rolled back). Notify onError.
        options.onError?.(toError(err))
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

  // Resolves once the delete commits (or fails and `onError` is notified).
  storageSig.remove = (): Promise<void> => {
    localWrite = true
    sig.set(defaultValue)
    hasPending = false
    if (writeTimer !== null) clearTimeout(writeTimer)
    writeTimer = null
    unregisterPendingFlush(flushWrite)

    /* v8 ignore next — SSR/no-IDB guard */
    if (!isBrowser() || typeof indexedDB === 'undefined') return Promise.resolve()
    // Delete failed — the signal is already reset. Report it like a write.
    return openDB(dbName, storeName)
      .then((db) => idbDelete(db, storeName, key))
      .catch((err) => void options.onError?.(toError(err)))
  }

  storageSig.ready = () => readySig()
  storageSig.whenReady = () => readyPromise
  storageSig.flush = flushWrite

  setEntry('indexeddb', key, storageSig, defaultValue, options)
  releaseWithOwner('indexeddb', key)

  return storageSig
}

/**
 * Reset the database cache. For testing only.
 */
export function _resetDBCache(): void {
  dbCache.clear()
}
