import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStorage, _resetStorageListener } from '../local'
import { createStorage } from '../custom'
import { _resetRegistry } from '../registry'

describe('write-failure → onError (notification)', () => {
  beforeEach(() => {
    _resetRegistry()
    _resetStorageListener()
    localStorage.clear()
  })
  afterEach(() => {
    _resetRegistry()
    _resetStorageListener()
    localStorage.clear()
  })

  it('custom backend set() throwing routes to onError; signal still updates', () => {
    const onError = vi.fn()
    const useThrowing = createStorage(
      {
        get: () => null,
        set: () => {
          throw new Error('boom')
        },
        remove: () => {},
      },
      'throwing',
    )
    const s = useThrowing('k', 'a', { onError })
    s.set('b')
    expect(s()).toBe('b') // in-memory signal unaffected by the write failure
    expect(onError).toHaveBeenCalledTimes(1)
    const err = onError.mock.calls[0]?.[0]
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('boom')
  })

  it('localStorage quota-exceeded on setItem routes to onError', () => {
    const original = window.localStorage
    const quotaErr = new Error('QuotaExceededError')
    // Probe (getWebStorage) passes; only real-key writes throw.
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => null,
        removeItem: () => {},
        setItem: (key: string) => {
          if (key === '__pyreon_storage_test__') return
          throw quotaErr
        },
      },
      writable: true,
      configurable: true,
    })
    try {
      const onError = vi.fn()
      const s = useStorage('big', '', { onError })
      s.set('x'.repeat(10))
      expect(s()).toBe('x'.repeat(10)) // signal still holds the value
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]?.[0]).toBe(quotaErr)
    } finally {
      Object.defineProperty(window, 'localStorage', {
        value: original,
        writable: true,
        configurable: true,
      })
    }
  })

  it('write failure with NO onError is silently swallowed (back-compat)', () => {
    const useThrowing = createStorage(
      {
        get: () => null,
        set: () => {
          throw new Error('boom')
        },
        remove: () => {},
      },
      'throwing-silent',
    )
    const s = useThrowing('k', 'a')
    expect(() => s.set('b')).not.toThrow()
    expect(s()).toBe('b')
  })
})

describe('.remove() idempotency (cross-tab listener refcount)', () => {
  beforeEach(() => {
    _resetRegistry()
    _resetStorageListener()
    localStorage.clear()
  })
  afterEach(() => {
    _resetRegistry()
    _resetStorageListener()
    localStorage.clear()
  })

  it('a double .remove() on the same signal is a safe no-op (listener count floor)', () => {
    const s = useStorage('theme', 'light')
    s.set('dark')
    s.remove() // last consumer → detaches listener, count → 0
    expect(localStorage.getItem('theme')).toBeNull()
    // Second remove hits the `activeCount === 0` guard without underflowing.
    expect(() => s.remove()).not.toThrow()
    expect(s()).toBe('light')
  })
})
