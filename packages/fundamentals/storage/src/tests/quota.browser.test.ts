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
  _resetDBCache,
  _resetRegistry,
  _resetStorageListener,
  useIndexedDB,
  useSessionStorage,
  useStorage,
} from '../index'

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
