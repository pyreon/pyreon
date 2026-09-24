import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearStorage } from '../clear'
import { useCookie } from '../cookie'
import { createStorage } from '../custom'
import { _resetStorageListener, useStorage } from '../local'
import { useIndexedDB } from '../indexed-db'
import { _resetRegistry, getEntry } from '../registry'
import { useSessionStorage } from '../session'
import type { StorageSignal } from '../types'

// `useStorage` was taught to refcount same-key consumers (#725/#729) so that one
// consumer's `.remove()` does not destroy the entry the others are still using.
// The registry's own docstring states the contract — "per-consumer `.remove()`
// goes through `releaseEntry`" — and FOUR of the five backends kept the pre-fix
// shape. These lock the contract across all of them, so the next backend added
// has a spec to satisfy rather than a precedent to copy from whichever file it
// happened to read.

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
}[] = [
  { name: 'local', backend: 'local', open: () => useStorage('k', 1) },
  { name: 'session', backend: 'session', open: () => useSessionStorage('k', 1) },
  { name: 'cookie', backend: 'cookie', open: () => useCookie('k', 1) },
  {
    // `useIndexedDB` guards its async work on `typeof indexedDB !== 'undefined'`,
    // which happy-dom does not define — so the signal, the registry entry and
    // `.remove()`'s refcounting all run here with only the IDB round-trip
    // skipped. That is exactly the half this suite is about.
    name: 'indexeddb',
    backend: 'indexeddb',
    open: () => useIndexedDB('k', 1),
  },
  {
    name: 'custom',
    backend: 'mem',
    open: (() => {
      // NOTE the order: `createStorage(backend, name)`. Reversed, the registry
      // keys on `[object Object]` and every lookup silently misses — which is
      // exactly how this spec first 'confirmed' a bug it was not testing.
      const mem = createStorage(memoryBackend(), 'mem')
      return () => mem('k', 1)
    })(),
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

  it('the LAST consumer removing destroys it', () => {
    const a = open()
    const b = open()
    a.remove()
    b.remove()
    expect(getEntry(backend, 'k'), 'the entry outlived its last consumer').toBeUndefined()
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
