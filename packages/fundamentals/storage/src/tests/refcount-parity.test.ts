import { effectScope } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearStorage } from '../clear'
import { useCookie } from '../cookie'
import { createStorage } from '../custom'
import { _resetStorageListener, useStorage } from '../local'
import { useIndexedDB } from '../indexed-db'
import { _resetRegistry, getEntry } from '../registry'
import { useSessionStorage } from '../session'
import type { StorageSignal } from '../types'

// The binding contract, locked for EVERY backend so the next one added has a
// spec to satisfy rather than a precedent to copy:
//
// - Same-key calls share ONE signal, and each call holds one refcount on it.
// - `.remove()` deletes the stored value and resets to the default, and the
//   binding STAYS ALIVE: later writes persist again (#4381). It used to release
//   the caller's refcount, leaving a consumer that kept using the key holding a
//   dead signal (and the next call for the key minted a second, independent one).
// - The hold is released on the lifecycle path instead: the calling owner
//   scope's disposal. The entry is destroyed when the last holder is disposed,
//   so keeping the binding alive after `.remove()` is not a leak.

const customMem = memoryBackend()

function memoryBackend() {
  const store = new Map<string, string>()
  return {
    get: (k: string) => store.get(k) ?? null,
    set: (k: string, v: string) => void store.set(k, v),
    remove: (k: string) => void store.delete(k),
    store,
  }
}

const reset = () => {
  customMem.store.clear()
  document.cookie = 'k=; max-age=0; path=/'
  _resetRegistry()
  _resetStorageListener()
  localStorage.clear()
  sessionStorage.clear()
}
beforeEach(reset)
afterEach(reset)

/** Every backend, as `(open two consumers) → [backendName, signals]`. */
const BACKENDS: {
  name: string
  backend: string
  open: () => StorageSignal<number>
  /** The raw stored value for `k`, or `undefined` where the store is unreadable here. */
  stored: () => string | null | undefined
}[] = [
  { name: 'local', backend: 'local', open: () => useStorage('k', 1), stored: () => localStorage.getItem('k') },
  {
    name: 'session',
    backend: 'session',
    open: () => useSessionStorage('k', 1),
    stored: () => sessionStorage.getItem('k'),
  },
  {
    name: 'cookie',
    backend: 'cookie',
    open: () => useCookie('k', 1),
    stored: () => {
      // happy-dom keeps a `max-age=0` cookie as an empty value: read it as deleted.
      const hit = document.cookie.split('; ').find((c) => c.startsWith('k='))
      return hit === undefined || hit === 'k=' ? null : decodeURIComponent(hit.slice(2))
    },
  },
  {
    // `useIndexedDB` guards its async work on `typeof indexedDB !== 'undefined'`,
    // which happy-dom does not define — so the signal, the registry entry and
    // `.remove()`'s refcounting all run here with only the IDB round-trip
    // skipped. That is exactly the half this suite is about.
    name: 'indexeddb',
    backend: 'indexeddb',
    open: () => useIndexedDB('k', 1),
    stored: () => undefined,
  },
  {
    name: 'custom',
    backend: 'mem',
    open: (() => {
      // NOTE the order: `createStorage(backend, name)`. Reversed, the registry
      // keys on `[object Object]` and every lookup silently misses — which is
      // exactly how this spec first 'confirmed' a bug it was not testing.
      const mem = createStorage(customMem, 'mem')
      return () => mem('k', 1)
    })(),
    stored: () => customMem.store.get('k') ?? null,
  },
]

describe.each(BACKENDS)('$name — same-key consumers are refcounted', ({ backend, open }) => {
  it('one consumer removing leaves the entry for the others', () => {
    const a = open()
    const b = open()
    expect(a, 'same-key consumers must share ONE signal').toBe(b)

    a.remove()

    expect(
      getEntry(backend, 'k'),
      'the first `.remove()` destroyed the entry the sibling still holds',
    ).toBeDefined()
  })

  it('every consumer removing still leaves the binding alive', () => {
    const a = open()
    const b = open()
    a.remove()
    b.remove()
    expect(getEntry(backend, 'k'), '`.remove()` ended the binding').toBeDefined()
    expect(open(), 'a later call minted a second signal for the same key').toBe(a)
  })

  it('a surviving consumer still resolves to the SAME signal', () => {
    // The consequence of an orphaned entry: the next call for the same key
    // mints a SECOND, independent signal, so two live consumers of one storage
    // key stop agreeing.
    const a = open()
    const b = open()
    a.remove()
    expect(open(), 'a fresh consumer got a different signal than the survivor').toBe(b)
  })

  it('a surviving consumer is still reachable from clearStorage', () => {
    const a = open()
    const b = open()
    b.set(42)
    a.remove()
    clearStorage(backend as 'local')
    expect(b(), 'the survivor was invisible to clearStorage').toBe(1)
  })

  it('`.remove()` still clears the VALUE even with siblings outstanding', () => {
    // Only the ENTRY is refcounted. Clearing the stored value is what the
    // caller asked for and happens either way, matching createStorageSignal.
    const a = open()
    const b = open()
    b.set(7)
    a.remove()
    expect(b()).toBe(1)
  })
})

describe.each(BACKENDS)('$name — remove() keeps the binding alive (#4381)', ({ backend, open, stored }) => {
  it('a write after remove() reaches storage again', () => {
    const a = open()
    a.set(5)
    a.remove()
    expect(a()).toBe(1)
    if (stored() !== undefined) expect(stored(), 'remove() did not delete the stored value').toBeNull()

    a.set(9)
    expect(a()).toBe(9)
    if (stored() !== undefined) expect(stored(), 'the write after remove() never reached storage').toBe('9')
    expect(getEntry(backend, 'k')?.signal).toBe(a)
  })
})

describe.each(BACKENDS)('$name — the binding is released with its owner scope', ({ backend, open }) => {
  it('the entry lives until the LAST consumer scope is disposed', () => {
    const s1 = effectScope()
    const s2 = effectScope()
    const a = s1.runInScope(open)
    const b = s2.runInScope(open)
    expect(a).toBe(b)

    s1.stop()
    expect(getEntry(backend, 'k'), 'disposing one consumer destroyed the shared entry').toBeDefined()
    expect(open(), 'the survivor no longer resolves to the shared signal').toBe(b)

    s2.stop()
    // `open()` above ran outside any scope, so it holds the entry for the page.
    expect(getEntry(backend, 'k')).toBeDefined()
  })

  it('disposing every consumer scope destroys the entry, remove() or not', () => {
    const s1 = effectScope()
    const s2 = effectScope()
    const a = s1.runInScope(open)
    s2.runInScope(open)
    a.remove() // must not change when the entry goes away
    s1.stop()
    expect(getEntry(backend, 'k')).toBeDefined()
    s2.stop()
    expect(getEntry(backend, 'k'), 'the entry outlived its last consumer').toBeUndefined()
  })

  it('a consumer outside any scope is never released (module-level lifetime)', () => {
    open()
    const s = effectScope()
    s.runInScope(open)
    s.stop()
    expect(getEntry(backend, 'k')).toBeDefined()
  })

  it('a dispose after the entry was replaced does not delete the new entry', () => {
    const s = effectScope()
    s.runInScope(open)
    _resetRegistry() // e.g. test teardown; the next call mints a fresh entry
    const fresh = open()
    s.stop()
    expect(getEntry(backend, 'k')?.signal).toBe(fresh)
  })
})
