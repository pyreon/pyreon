/**
 * Real-Chromium coverage for a FULL storage (#4812).
 *
 * happy-dom has no quota: its `setItem` never throws on its own, so the
 * happy-dom suite (`quota-full.test.ts`) can only simulate the failure. Here
 * the web storages are filled until Chromium itself throws
 * `QuotaExceededError`, and the IndexedDB write runs against Chromium's own
 * engine, whose failures surface on the TRANSACTION.
 *
 * The contract: the stored value stays authoritative for reads, `.set()`
 * still updates the signal, and the write failure reaches `onError`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  removeStorage,
  useCookie,
  useIndexedDB,
  useSessionStorage,
  useStorage,
} from '../index'
import {
  _resetDBCache,
  _resetRegistry,
  _resetStorageListener,
} from '../internal'

/** Write filler keys until Chromium refuses even one more character. */
function fill(area: Storage): void {
  let chunk = 'x'.repeat(1024 * 1024)
  let i = 0
  while (chunk.length > 0) {
    try {
      area.setItem(`__fill_${i++}`, chunk)
    } catch (e) {
      expect((e as DOMException).name).toBe('QuotaExceededError')
      chunk = chunk.slice(0, Math.floor(chunk.length / 2))
    }
  }
}

const clearAll = (): void => {
  localStorage.clear()
  sessionStorage.clear()
}

beforeEach(() => {
  _resetRegistry()
  _resetStorageListener()
  clearAll()
})

afterEach(() => {
  _resetRegistry()
  _resetStorageListener()
  clearAll()
})

describe.each([
  ['localStorage', () => localStorage, useStorage],
  ['sessionStorage', () => sessionStorage, useSessionStorage],
] as const)('a %s Chromium reports as full', (_name, area, useHook) => {
  it('reads the stored value, reports the failed write, keeps the stored value', () => {
    area().setItem('theme', JSON.stringify('dark'))
    fill(area())
    // Precondition: the storage really is full.
    expect(() => area().setItem('__probe__', 'y'.repeat(64))).toThrow()

    const onError = vi.fn()
    const theme = useHook('theme', 'light', { onError })
    expect(theme()).toBe('dark')

    theme.set('a value far longer than the stored one')
    expect(theme()).toBe('a value far longer than the stored one')
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0]![0] as DOMException).name).toBe('QuotaExceededError')
    expect(area().getItem('theme')).toBe(JSON.stringify('dark'))

    // `.remove()` still deletes from a full storage.
    theme.remove()
    expect(area().getItem('theme')).toBeNull()
  })
})

describe('an IndexedDB write whose transaction aborts at commit', () => {
  let dbName = ''
  let seq = 0

  beforeEach(() => {
    _resetDBCache()
    dbName = `pyreon-quota-${Date.now()}-${seq++}`
  })

  afterEach(async () => {
    _resetDBCache()
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    })
  })

  it('reports to onError and leaves the stored value in place', async () => {
    const first = useIndexedDB('draft', 'v0', { dbName, debounceMs: 0 })
    await first.whenReady()
    first.set('stored')
    await first.flush()

    // A quota failure surfaces as the TRANSACTION aborting at commit, after the
    // put request already succeeded. Reproduce that shape in Chromium's engine.
    const realPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      const req = realPut.apply(this, args)
      const tx = this.transaction
      req.addEventListener('success', () => tx.abort())

      return req
    }
    const onError = vi.fn()
    try {
      _resetRegistry()
      _resetDBCache()
      const draft = useIndexedDB('draft', 'v0', { dbName, debounceMs: 0, onError })
      await draft.whenReady()
      expect(draft()).toBe('stored')
      draft.set('new')
      await draft.flush()
      expect(draft()).toBe('new')
      expect(onError).toHaveBeenCalledTimes(1)
    } finally {
      IDBObjectStore.prototype.put = realPut
    }

    // Reload: the stored value is the one before the failed write.
    _resetRegistry()
    _resetDBCache()
    const reloaded = useIndexedDB('draft', 'v0', { dbName })
    await reloaded.whenReady()
    expect(reloaded()).toBe('stored')
  })
})

describe('IndexedDB request errors keep their real name', () => {
  const dbName = `pyreon-reqerr-${Date.now()}`

  afterEach(async () => {
    _resetDBCache()
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName)
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    })
  })

  it('a failing put request reaches onError as its own error, not a synthetic UnknownError', async () => {
    _resetDBCache()
    const seed = useIndexedDB('k', 'v0', { dbName, debounceMs: 0 })
    await seed.whenReady()
    seed.set('v1')
    await seed.flush()

    // `add` on an existing key fails the REQUEST with `ConstraintError`; while
    // the transaction's `error` event runs, `tx.error` is still null.
    const realPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      return this.add(value, key)
    }
    const onError = vi.fn()
    try {
      _resetRegistry()
      _resetDBCache()
      const s = useIndexedDB('k', 'v0', { dbName, debounceMs: 0, onError })
      await s.whenReady()
      s.set('v2')
      await s.flush()
    } finally {
      IDBObjectStore.prototype.put = realPut
    }
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0]![0] as DOMException).name).toBe('ConstraintError')
  })

  it('removeStorage(key, { type: "indexeddb" }) deletes without a live binding', async () => {
    _resetDBCache()
    const s = useIndexedDB('orphan', 'v0', { dbName, debounceMs: 0 })
    await s.whenReady()
    s.set('stored')
    await s.flush()
    _resetRegistry()
    _resetDBCache()

    await removeStorage('orphan', { type: 'indexeddb', dbName })
    const value = await new Promise((resolve) => {
      const open = indexedDB.open(dbName)
      open.onsuccess = () => {
        const db = open.result
        const req = db.transaction('kv', 'readonly').objectStore('kv').get('orphan')
        req.onsuccess = () => {
          db.close()
          resolve(req.result)
        }
      }
    })
    expect(value).toBeUndefined()
  })

  it('an unbound removeStorage never creates a database or upgrades one to add a store', async () => {
    const missing = `pyreon-never-created-${Date.now()}`
    await removeStorage('k', { type: 'indexeddb', dbName: missing })
    // Give a fire-and-forget open (the old behaviour) time to create it.
    await new Promise((r) => setTimeout(r, 200))
    const names = (await indexedDB.databases()).map((d) => d.name)
    expect(names).not.toContain(missing)

    // An existing database without the store keeps its version and stores.
    _resetDBCache()
    const seed = useIndexedDB('k', 'v0', { dbName, debounceMs: 0 })
    await seed.whenReady()
    const before = (await indexedDB.databases()).find((d) => d.name === dbName)?.version
    await removeStorage('k', { type: 'indexeddb', dbName, storeName: 'no-such-store' })
    await new Promise((r) => setTimeout(r, 200))
    const after = (await indexedDB.databases()).find((d) => d.name === dbName)?.version
    expect(after).toBe(before)
  })

  it('a bound removeStorage resolves once the delete has committed', async () => {
    _resetDBCache()
    const s = useIndexedDB('bound', 'v0', { dbName, debounceMs: 0 })
    await s.whenReady()
    s.set('stored')
    await s.flush()
    // Record when the delete request actually succeeds.
    let deleted = false
    const realDelete = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
      const req = realDelete.call(this, query)
      req.addEventListener('success', () => {
        deleted = true
      })

      return req
    }
    try {
      // `removeStorage` without dbName uses the binding, which knows its database.
      await removeStorage('bound', { type: 'indexeddb' })
      expect(deleted).toBe(true)
    } finally {
      IDBObjectStore.prototype.delete = realDelete
    }
    const value = await new Promise((resolve) => {
      const open = indexedDB.open(dbName)
      open.onsuccess = () => {
        const db = open.result
        const req = db.transaction('kv', 'readonly').objectStore('kv').get('bound')
        req.onsuccess = () => {
          db.close()
          resolve(req.result)
        }
      }
    })
    expect(value).toBeUndefined()
  })
})

describe('a cookie the browser refuses silently', () => {
  afterEach(() => {
    for (const name of ['big', 'flag']) document.cookie = `${name}=; max-age=0; path=/`
  })

  it('an over-limit value reaches onError; the stored cookie keeps its old value', () => {
    const onError = vi.fn()
    const big = useCookie('big', 'small', { onError })
    big.set('stored')
    expect(onError).not.toHaveBeenCalled()

    big.set('x'.repeat(5000))
    expect(big()).toHaveLength(5000) // the signal shows the new value
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0]![0] as Error).message).toMatch(/did not store the cookie/)
    expect(document.cookie).toContain(`big=${encodeURIComponent(JSON.stringify('stored'))}`)
  })

  it("sameSite: 'none' without secure reaches onError", () => {
    const onError = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const flag = useCookie('flag', 'a', { onError, sameSite: 'none', secure: false })
      flag.set('b')
      expect(onError).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })
})
