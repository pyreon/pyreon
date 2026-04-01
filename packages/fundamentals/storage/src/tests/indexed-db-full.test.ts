import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetDBCache, _resetRegistry, useIndexedDB } from '../index'

// ─── IndexedDB mock ─────────────────────────────────────────────────────────

function createMockIDB() {
  const stores = new Map<string, Map<string, unknown>>()

  function getStore(storeName: string) {
    if (!stores.has(storeName)) stores.set(storeName, new Map())
    return stores.get(storeName)!
  }

  const mockIDB = {
    open(dbName: string, _version?: number) {
      const request: any = {
        result: null as any,
        error: null,
        onupgradeneeded: null as any,
        onsuccess: null as any,
        onerror: null as any,
      }

      setTimeout(() => {
        const db = {
          objectStoreNames: {
            contains: (name: string) => stores.has(name),
          },
          createObjectStore: (name: string) => {
            stores.set(name, new Map())
          },
          transaction: (storeName: string, mode: string) => ({
            objectStore: (name: string) => {
              const store = getStore(name)
              return {
                get: (key: string) => {
                  const getReq: any = {
                    result: store.get(key),
                    error: null,
                    onsuccess: null as any,
                    onerror: null as any,
                  }
                  setTimeout(() => getReq.onsuccess?.())
                  return getReq
                },
                put: (value: unknown, key: string) => {
                  store.set(key, value)
                  const putReq: any = {
                    result: undefined,
                    error: null,
                    onsuccess: null as any,
                    onerror: null as any,
                  }
                  setTimeout(() => putReq.onsuccess?.())
                  return putReq
                },
                delete: (key: string) => {
                  store.delete(key)
                  const delReq: any = {
                    result: undefined,
                    error: null,
                    onsuccess: null as any,
                    onerror: null as any,
                  }
                  setTimeout(() => delReq.onsuccess?.())
                  return delReq
                },
              }
            },
          }),
        }

        request.result = db

        // Fire upgrade if store doesn't exist
        if (!stores.has('kv')) {
          request.onupgradeneeded?.()
        }

        request.onsuccess?.()
      })

      return request
    },
  }

  return { mockIDB, stores, getStore }
}

describe('useIndexedDB — full coverage', () => {
  let idbMock: ReturnType<typeof createMockIDB>

  beforeEach(() => {
    _resetRegistry()
    _resetDBCache()
    vi.useFakeTimers()
    idbMock = createMockIDB()
    ;(globalThis as any).indexedDB = idbMock.mockIDB
  })

  afterEach(() => {
    _resetRegistry()
    _resetDBCache()
    vi.useRealTimers()
  })

  it('loads stored value from IndexedDB asynchronously', async () => {
    // Pre-store a value
    idbMock.getStore('kv').set('existing-key', JSON.stringify('stored-value'))

    const sig = useIndexedDB('existing-key', 'default')
    expect(sig()).toBe('default') // Initially default

    // Run all microtasks and timers to let IDB load complete
    await vi.runAllTimersAsync()

    expect(sig()).toBe('stored-value')
  })

  it('keeps default when IDB returns null', async () => {
    const sig = useIndexedDB('missing-key', 'fallback')
    await vi.runAllTimersAsync()
    expect(sig()).toBe('fallback')
  })

  it('.set() triggers debounced IDB write', async () => {
    const sig = useIndexedDB('write-test', 'init', { debounceMs: 50 })
    sig.set('new-value')

    // Signal updates immediately
    expect(sig()).toBe('new-value')

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(100)

    // Value should be written to IDB
    const stored = idbMock.getStore('kv').get('write-test')
    expect(stored).toBe(JSON.stringify('new-value'))
  })

  it('.remove() deletes from IDB', async () => {
    idbMock.getStore('kv').set('del-key', JSON.stringify('value'))
    const sig = useIndexedDB('del-key', 'default')
    await vi.runAllTimersAsync()

    sig.remove()
    expect(sig()).toBe('default')

    // Let the delete happen
    await vi.runAllTimersAsync()
  })

  it('.subscribe() works', () => {
    const sig = useIndexedDB('sub-key', 'a')
    let called = false
    const unsub = sig.subscribe(() => {
      called = true
    })
    sig.set('b')
    expect(called).toBe(true)
    unsub()
  })

  it('.direct() is callable', () => {
    const sig = useIndexedDB('direct-key', 0)
    // direct() delegates to the underlying signal's direct method
    expect(typeof sig.direct).toBe('function')
    sig.direct(() => {})
  })

  it('handles IDB open error gracefully', async () => {
    // Override mock to reject
    ;(globalThis as any).indexedDB = {
      open() {
        const request: any = {
          result: null,
          error: new Error('IDB blocked'),
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
        }
        setTimeout(() => request.onerror?.())
        return request
      },
    }

    _resetDBCache()
    const sig = useIndexedDB('fail-key', 'safe-default')
    await vi.runAllTimersAsync()

    // Should keep default value
    expect(sig()).toBe('safe-default')
  })

  it('custom serializer is used for writes', async () => {
    const sig = useIndexedDB('custom-ser', { x: 1 }, {
      serializer: (v) => `CUSTOM:${JSON.stringify(v)}`,
      debounceMs: 10,
    })

    sig.set({ x: 2 })
    await vi.advanceTimersByTimeAsync(50)

    const stored = idbMock.getStore('kv').get('custom-ser')
    expect(stored).toBe('CUSTOM:{"x":2}')
  })

  it('custom deserializer is used for reads', async () => {
    idbMock.getStore('kv').set('custom-de', 'RAW:hello')

    const sig = useIndexedDB('custom-de', '', {
      deserializer: (s) => s.replace('RAW:', ''),
    })
    await vi.runAllTimersAsync()

    expect(sig()).toBe('hello')
  })

  it('onError callback is called on deserialization failure', async () => {
    idbMock.getStore('kv').set('bad-json', '{broken')

    const errors: Error[] = []
    const sig = useIndexedDB('bad-json', 'fallback', {
      onError: (e) => {
        errors.push(e)
        return 'error-recovery'
      },
    })
    await vi.runAllTimersAsync()

    expect(sig()).toBe('error-recovery')
    expect(errors).toHaveLength(1)
  })

  it('debounce coalesces multiple writes', async () => {
    const sig = useIndexedDB('coalesce', 0, { debounceMs: 50 })
    sig.set(1)
    sig.set(2)
    sig.set(3)

    await vi.advanceTimersByTimeAsync(100)

    const stored = idbMock.getStore('kv').get('coalesce')
    expect(stored).toBe(JSON.stringify(3))
  })

  it('remove cancels pending debounced write', async () => {
    const sig = useIndexedDB('remove-cancel', 'default', { debounceMs: 200 })
    sig.set('pending')
    sig.remove()

    await vi.advanceTimersByTimeAsync(300)

    expect(sig()).toBe('default')
  })

  it('flushWrite does nothing when pendingValue is undefined', async () => {
    const sig = useIndexedDB('no-pending', 'val', { debounceMs: 10 })
    // Don't set anything — just advance timers
    await vi.advanceTimersByTimeAsync(50)
    expect(sig()).toBe('val')
  })
})
