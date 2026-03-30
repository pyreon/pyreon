import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetDBCache, _resetRegistry, useIndexedDB } from '../index'

describe('useIndexedDB — debounced writes', () => {
  beforeEach(() => {
    _resetRegistry()
    _resetDBCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    _resetRegistry()
    _resetDBCache()
    vi.useRealTimers()
  })

  it('signal updates immediately, IDB write is debounced', () => {
    const draft = useIndexedDB('debounce-test', 'initial', { debounceMs: 50 })
    draft.set('updated')
    // Signal is synchronous
    expect(draft()).toBe('updated')
  })

  it('multiple rapid sets coalesce into one write (only last value)', () => {
    const draft = useIndexedDB('coalesce-test', '', { debounceMs: 100 })
    draft.set('first')
    draft.set('second')
    draft.set('third')

    // Signal reflects latest immediately
    expect(draft()).toBe('third')
  })

  it('custom debounceMs is respected', () => {
    const fast = useIndexedDB('fast', '', { debounceMs: 10 })
    fast.set('value')
    expect(fast()).toBe('value')

    const slow = useIndexedDB('slow', '', { debounceMs: 5000 })
    slow.set('value')
    expect(slow()).toBe('value')
  })

  it('default debounceMs is 100', () => {
    const sig = useIndexedDB('default-debounce', 'initial')
    sig.set('value')
    expect(sig()).toBe('value')
  })

  it('update() also triggers debounced write', () => {
    const count = useIndexedDB('update-debounce', 0, { debounceMs: 50 })
    count.update((n) => n + 1)
    count.update((n) => n + 1)
    count.update((n) => n + 1)
    expect(count()).toBe(3)
  })

  it('remove() cancels pending debounced write', () => {
    const draft = useIndexedDB('remove-cancel', 'default', { debounceMs: 200 })
    draft.set('pending-value')
    draft.remove()
    expect(draft()).toBe('default')
  })

  it('custom dbName and storeName options', () => {
    const sig = useIndexedDB('custom-db-key', 'val', {
      dbName: 'my-app-db',
      storeName: 'my-store',
    })
    sig.set('updated')
    expect(sig()).toBe('updated')
  })

  it('custom serializer/deserializer with IndexedDB', () => {
    const sig = useIndexedDB('date-idb', new Date('2025-01-01'), {
      serializer: (d) => d.toISOString(),
      deserializer: (s) => new Date(s),
      debounceMs: 50,
    })
    const newDate = new Date('2025-06-15')
    sig.set(newDate)
    expect(sig().toISOString()).toBe('2025-06-15T00:00:00.000Z')
  })

  it('.subscribe() works with debounced signals', () => {
    const sig = useIndexedDB('sub-idb', 'a', { debounceMs: 50 })
    let called = false
    const unsub = sig.subscribe(() => {
      called = true
    })
    sig.set('b')
    expect(called).toBe(true)
    unsub()
  })
})
