import { describe, expect, it } from 'vitest'
import { deserialize, getWebStorage, serialize } from '../utils'

describe('serialize', () => {
  it('uses JSON.stringify by default', () => {
    expect(serialize({ a: 1 })).toBe('{"a":1}')
  })

  it('uses custom serializer when provided', () => {
    const custom = (v: number) => `NUM:${v}`
    expect(serialize(42, custom)).toBe('NUM:42')
  })
})

describe('deserialize', () => {
  it('uses JSON.parse by default', () => {
    expect(deserialize('"hello"', 'default')).toBe('hello')
  })

  it('uses custom deserializer when provided', () => {
    const custom = (s: string) => s.toUpperCase()
    expect(deserialize('hello', 'default', custom)).toBe('HELLO')
  })

  it('returns default value on parse error', () => {
    expect(deserialize('{broken', 'fallback')).toBe('fallback')
  })

  it('calls onError and returns its result on parse error', () => {
    const onError = (e: Error) => 'recovered'
    expect(deserialize('{broken', 'default', undefined, onError)).toBe('recovered')
  })

  it('returns default when onError returns undefined', () => {
    const onError = (_e: Error) => undefined
    expect(deserialize('{broken', 'fallback', undefined, onError)).toBe('fallback')
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

  it('returns null when storage throws (e.g. private browsing)', () => {
    const originalLocalStorage = window.localStorage
    // Mock localStorage to throw on setItem
    Object.defineProperty(window, 'localStorage', {
      value: {
        setItem: () => {
          throw new Error('Quota exceeded')
        },
        removeItem: () => {},
        getItem: () => null,
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
