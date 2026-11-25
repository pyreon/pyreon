import { describe, expect, it } from 'vitest'
import { deserialize, getWebStorage, serialize } from '../utils'

describe('serialize', () => {
  it('uses JSON.stringify by default', () => {
    expect(serialize({ a: 1 })).toBe('{"a":1}')
  })

  it('uses custom serializer when provided', () => {
    const custom = (v: number) => `NUM:${v}`
    expect(serialize(42, { serializer: custom })).toBe('NUM:42')
  })
})

describe('deserialize', () => {
  it('uses JSON.parse by default', () => {
    expect(deserialize('"hello"', 'default')).toBe('hello')
  })

  it('uses custom deserializer when provided', () => {
    const custom = (s: string) => s.toUpperCase()
    expect(deserialize('hello', 'default', { deserializer: custom })).toBe('HELLO')
  })

  it('returns default value on parse error', () => {
    expect(deserialize('{broken', 'fallback')).toBe('fallback')
  })

  it('calls onError and returns its result on parse error', () => {
    const onError = (_e: Error) => 'recovered'
    expect(deserialize('{broken', 'default', { onError })).toBe('recovered')
  })

  it('returns default when onError returns undefined', () => {
    const onError = (_e: Error) => undefined
    expect(deserialize('{broken', 'fallback', { onError })).toBe('fallback')
  })
})

describe('getWebStorage', () => {
  it('returns localStorage for "local"', () => {
    const storage = getWebStorage('local')
    expect(storage).toBe(window.localStorage)
  })

  it('returns sessionStorage for "session"', () => {
    const storage = getWebStorage('session')
    expect(storage).toBe(window.sessionStorage)
  })

  it('a storage whose writes throw (full / quota 0) stays available for reads (#4812)', () => {
    const originalLocalStorage = window.localStorage
    const full = {
      setItem: () => {
        throw new Error('Quota exceeded')
      },
      removeItem: () => {},
      getItem: () => null,
    }
    Object.defineProperty(window, 'localStorage', { value: full, writable: true, configurable: true })
    expect(getWebStorage('local')).toBe(full)
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    })
  })

  it('returns null when storage cannot even be read (blocked / sandboxed)', () => {
    const originalLocalStorage = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        setItem: () => {
          throw new Error('SecurityError')
        },
        removeItem: () => {},
        getItem: () => {
          throw new Error('SecurityError')
        },
      },
      writable: true,
      configurable: true,
    })

    const result = getWebStorage('local')
    expect(result).toBeNull()

    // Restore
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    })
  })
})
