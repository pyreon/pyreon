// Targeted coverage for storage's residual branches/functions.
// happy-dom implements `indexedDB.open` but stubs the object-store get/put/delete
// operations (their request callbacks never complete). Install a real in-memory
// IndexedDB (fake-indexeddb) so the idbGet/idbSet/idbDelete onsuccess callbacks
// actually fire. `/auto` can't override happy-dom's non-configurable global, so
// assign the factory explicitly before the module under test reads it.
import { IDBFactory } from 'fake-indexeddb'
globalThis.indexedDB = new IDBFactory()

import { afterEach, describe, expect, it } from 'vitest'
import { _resetDBCache, _resetRegistry, useCookie, useIndexedDB } from '../index'

afterEach(() => {
  _resetRegistry()
  _resetDBCache()
  globalThis.indexedDB = new IDBFactory() // fresh DB per test
})

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('useIndexedDB — request callbacks complete against a real IDB', () => {
  it('write (idbSet) then a registry-fresh read (idbGet) loads the stored value', async () => {
    const a = useIndexedDB('cov-key', 'initial', { debounceMs: 10 })
    a.set('written-value')
    await tick(120) // debounce + idbSet onsuccess

    // Drop the in-memory registry entry so the next instance MUST read from IDB
    // (without this, the dedup registry would serve the value and idbGet never runs).
    _resetRegistry()

    const b = useIndexedDB('cov-key', 'fallback', { debounceMs: 10 })
    await tick(120) // idbGet onsuccess hydrates the signal
    expect(b()).toBe('written-value')
  })

  it('remove() runs idbDelete against the store', async () => {
    const a = useIndexedDB('cov-del', 'x', { debounceMs: 10 })
    a.set('to-delete')
    await tick(120)
    a.remove()
    await tick(120)
    expect(a()).toBe('x') // reset to default
  })
})

describe('useCookie — a malformed (no `=`) cookie segment is skipped during parse', () => {
  it('a pair without `=` (eqIndex -1 → continue) does not become a cookie', () => {
    document.cookie = 'standalone-flag' // no '=' → eqIndex === -1 → continue
    const c = useCookie('cov-cookie', 'default')
    expect(c()).toBe('default')
  })
})
