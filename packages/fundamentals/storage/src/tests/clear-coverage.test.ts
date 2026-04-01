import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetDBCache,
  _resetRegistry,
  clearStorage,
  removeStorage,
  useCookie,
  useIndexedDB,
  useSessionStorage,
  useStorage,
} from '../index'

describe('removeStorage — indexeddb branch', () => {
  beforeEach(() => {
    _resetRegistry()
    _resetDBCache()
  })

  afterEach(() => {
    _resetRegistry()
    _resetDBCache()
  })

  it('removes indexeddb entry with registered signal', () => {
    const sig = useIndexedDB('idb-remove', 'default')
    sig.set('modified')
    removeStorage('idb-remove', { type: 'indexeddb' })
    expect(sig()).toBe('default')
  })

  it('removeStorage for indexeddb without registered signal (no-op)', () => {
    // This covers the else branch where entry is not found for indexeddb
    expect(() => removeStorage('nonexistent-idb', { type: 'indexeddb' })).not.toThrow()
  })

  it('removeStorage for cookie without registered signal (browser path)', () => {
    // Covers the cookie branch in clear.ts
    expect(() => removeStorage('nonexistent-cookie', { type: 'cookie' })).not.toThrow()
  })
})

describe('clearStorage — indexeddb backend', () => {
  beforeEach(() => {
    _resetRegistry()
    _resetDBCache()
  })

  afterEach(() => {
    _resetRegistry()
    _resetDBCache()
  })

  it('clears indexeddb entries', () => {
    const sig = useIndexedDB('idb-clear', 'default')
    sig.set('modified')
    clearStorage('indexeddb')
    expect(sig()).toBe('default')
  })

  it('clearStorage("all") includes indexeddb', () => {
    const local = useStorage('l', 'default')
    const session = useSessionStorage('s', 'default')
    const cookie = useCookie('c', 'default')
    const idb = useIndexedDB('i', 'default')

    local.set('x')
    session.set('x')
    cookie.set('x')
    idb.set('x')

    clearStorage('all')

    expect(local()).toBe('default')
    expect(session()).toBe('default')
    expect(cookie()).toBe('default')
    expect(idb()).toBe('default')
  })
})
