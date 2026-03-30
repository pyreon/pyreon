import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetRegistry, createStorage, useMemoryStorage } from '../index'

describe('createStorage', () => {
  beforeEach(() => {
    _resetRegistry()
  })

  afterEach(() => {
    _resetRegistry()
  })

  it('creates a working storage hook from a custom backend', () => {
    const store = new Map<string, string>()
    const useCustom = createStorage({
      get: (k) => store.get(k) ?? null,
      set: (k, v) => store.set(k, v),
      remove: (k) => store.delete(k),
    })

    const sig = useCustom('key', 'default')
    expect(sig()).toBe('default')

    sig.set('updated')
    expect(sig()).toBe('updated')
    expect(store.get('key')).toBe(JSON.stringify('updated'))
  })

  it('reads existing values from the backend', () => {
    const store = new Map<string, string>()
    store.set('key', JSON.stringify('existing'))

    const useCustom = createStorage({
      get: (k) => store.get(k) ?? null,
      set: (k, v) => store.set(k, v),
      remove: (k) => store.delete(k),
    })

    const sig = useCustom('key', 'default')
    expect(sig()).toBe('existing')
  })

  it('.remove() clears from backend and resets signal', () => {
    const store = new Map<string, string>()
    const useCustom = createStorage({
      get: (k) => store.get(k) ?? null,
      set: (k, v) => store.set(k, v),
      remove: (k) => store.delete(k),
    })

    const sig = useCustom('key', 'default')
    sig.set('updated')
    sig.remove()

    expect(sig()).toBe('default')
    expect(store.has('key')).toBe(false)
  })

  it('deduplicates signals for same backend + key', () => {
    const store = new Map<string, string>()
    const useCustom = createStorage(
      {
        get: (k) => store.get(k) ?? null,
        set: (k, v) => store.set(k, v),
        remove: (k) => store.delete(k),
      },
      'test-backend',
    )

    const a = useCustom('key', 'default')
    const b = useCustom('key', 'default')
    expect(a).toBe(b)
  })

  it('handles backend read errors gracefully', () => {
    const useCustom = createStorage({
      get: () => {
        throw new Error('read failed')
      },
      set: () => {
        // intentional no-op for error test
      },
      remove: () => {
        // intentional no-op for error test
      },
    })

    const sig = useCustom('key', 'fallback')
    expect(sig()).toBe('fallback')
  })

  it('handles backend write errors gracefully', () => {
    const useCustom = createStorage({
      get: () => null,
      set: () => {
        throw new Error('write failed')
      },
      remove: () => {
        // intentional no-op for error test
      },
    })

    const sig = useCustom('key', 'default')
    // Should not throw — signal still updates
    sig.set('new-value')
    expect(sig()).toBe('new-value')
  })

  it('.subscribe() delegates to underlying signal', () => {
    const store = new Map<string, string>()
    const useCustom = createStorage({
      get: (k) => store.get(k) ?? null,
      set: (k, v) => store.set(k, v),
      remove: (k) => store.delete(k),
    })

    const sig = useCustom('sub-key', 'a')
    let called = false
    const unsub = sig.subscribe(() => {
      called = true
    })
    sig.set('b')
    expect(called).toBe(true)
    unsub()
  })

  it('.direct() delegates to underlying signal', () => {
    const store = new Map<string, string>()
    const useCustom = createStorage({
      get: (k) => store.get(k) ?? null,
      set: (k, v) => store.set(k, v),
      remove: (k) => store.delete(k),
    })

    const sig = useCustom('dir-key', 'a')
    let called = false
    const unsub = sig.direct(() => {
      called = true
    })
    sig.set('b')
    expect(called).toBe(true)
    unsub()
  })

  it('.debug() and .label work', () => {
    const store = new Map<string, string>()
    const useCustom = createStorage({
      get: (k) => store.get(k) ?? null,
      set: (k, v) => store.set(k, v),
      remove: (k) => store.delete(k),
    })

    const sig = useCustom('debug-key', 'test')
    sig.label = 'my-signal'
    expect(sig.label).toBe('my-signal')
    expect(sig.debug().value).toBe('test')
  })

  it('supports custom serializer/deserializer', () => {
    const store = new Map<string, string>()
    const useCustom = createStorage({
      get: (k) => store.get(k) ?? null,
      set: (k, v) => store.set(k, v),
      remove: (k) => store.delete(k),
    })

    const date = useCustom('date', new Date('2025-01-01'), {
      serializer: (d) => d.toISOString(),
      deserializer: (s) => new Date(s),
    })

    const newDate = new Date('2025-06-15')
    date.set(newDate)
    expect(date().toISOString()).toBe('2025-06-15T00:00:00.000Z')
  })
})

describe('useMemoryStorage', () => {
  beforeEach(() => {
    _resetRegistry()
  })

  afterEach(() => {
    _resetRegistry()
  })

  it('works as an in-memory storage', () => {
    const sig = useMemoryStorage('key', 'default')
    expect(sig()).toBe('default')

    sig.set('updated')
    expect(sig()).toBe('updated')
  })

  it('deduplicates signals', () => {
    const a = useMemoryStorage('key', 'default')
    const b = useMemoryStorage('key', 'default')
    expect(a).toBe(b)
  })

  it('.remove() resets to default', () => {
    const sig = useMemoryStorage('temp', 'initial')
    sig.set('changed')
    sig.remove()
    expect(sig()).toBe('initial')
  })
})
