/**
 * Real-Chromium coverage for `useIndexedDB`.
 *
 * Every other IndexedDB spec in this package runs against `fake-indexeddb`,
 * which models the API but not the engine: it has no storage quota, does not
 * enforce structured-clone limits and cannot show that a value survives a real
 * page lifecycle. Here the database is Chromium's own. Each test opens its own
 * uniquely named database and deletes it afterwards, so nothing leaks between
 * tests or into a developer's profile.
 *
 * "Reload" is simulated by dropping the registry + connection cache (what a new
 * page load starts without) while the data stays in the real database.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetDBCache, _resetRegistry, useIndexedDB } from '../index'

let dbName = ''
let seq = 0

const rawOpen = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

/** Read a key straight out of the real database, bypassing the library. */
async function rawGet(key: string): Promise<unknown> {
  const db = await rawOpen()
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/** A fresh page load: the in-memory registry and connection cache are gone, the data is not. */
const reload = () => {
  _resetRegistry()
  _resetDBCache()
}

const until = async (cond: () => Promise<boolean>, what: string) => {
  for (let i = 0; i < 100; i++) {
    if (await cond()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`timed out waiting for ${what}`)
}

beforeEach(() => {
  dbName = `pyreon-storage-browser-${++seq}-${Date.now()}`
  reload()
})

afterEach(async () => {
  reload()
  // An open library connection closes itself on `versionchange`, so this cannot hang.
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(dbName)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
})

describe('useIndexedDB in real Chromium', () => {
  it('persists a value across a page reload, as a JSON string in the real database', async () => {
    const a = useIndexedDB('draft', { title: '', body: '' }, { dbName })
    await a.whenReady()
    a.set({ title: 'Hello', body: 'World' })
    await a.flush()
    expect(JSON.parse(String(await rawGet('draft')))).toEqual({ title: 'Hello', body: 'World' })

    reload()
    const b = useIndexedDB('draft', { title: '', body: '' }, { dbName })
    expect(b()).toEqual({ title: '', body: '' }) // the default shows until the read settles
    await b.whenReady()
    expect(b()).toEqual({ title: 'Hello', body: 'World' })
  })

  it('stores a value larger than localStorage can hold', async () => {
    const big = 'x'.repeat(12_000_000)
    // The control: the claim "exceeds localStorage limits" is only meaningful if localStorage really refuses it.
    expect(() => localStorage.setItem('pyreon-browser-quota-probe', big)).toThrow()
    localStorage.removeItem('pyreon-browser-quota-probe')

    const a = useIndexedDB('blob', '', { dbName, debounceMs: 0 })
    await a.whenReady()
    a.set(big)
    await a.flush()

    reload()
    const b = useIndexedDB('blob', '', { dbName })
    await b.whenReady()
    expect(b().length).toBe(big.length)
  })

  it('survives structured data: nested objects, arrays and unicode', async () => {
    const value = { a: [1, 2, { b: 'č ř ž 日本語 🙂' }], n: null as null | number, t: true }
    const a = useIndexedDB('shape', value, { dbName, debounceMs: 0 })
    await a.whenReady()
    a.set({ ...value, n: 7 })
    await a.flush()
    reload()
    const b = useIndexedDB('shape', value, { dbName })
    await b.whenReady()
    expect(b()).toEqual({ ...value, n: 7 })
  })

  it('reads a value that was already in the database before the signal existed', async () => {
    const seed = useIndexedDB('seeded', 0, { dbName, debounceMs: 0 })
    await seed.whenReady()
    seed.set(41)
    await seed.flush()
    reload()
    const sig = useIndexedDB('seeded', 0, { dbName })
    expect(sig.ready()).toBe(false)
    await sig.whenReady()
    expect(sig.ready()).toBe(true)
    expect(sig()).toBe(41)
  })

  it('remove() deletes the key from the real database and resets the signal', async () => {
    const a = useIndexedDB('gone', 'default', { dbName, debounceMs: 0 })
    await a.whenReady()
    a.set('kept')
    await a.flush()
    expect(JSON.parse(String(await rawGet('gone')))).toBe('kept')
    a.remove()
    expect(a()).toBe('default')
    await until(async () => (await rawGet('gone')) === undefined, 'the key to be deleted')
  })
})
