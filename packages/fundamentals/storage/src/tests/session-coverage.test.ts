import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetRegistry, useSessionStorage } from '../index'

describe('useSessionStorage — full coverage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    _resetRegistry()
  })

  afterEach(() => {
    sessionStorage.clear()
    _resetRegistry()
  })

  it('returns default value when key is not in storage', () => {
    const val = useSessionStorage('step', 0)
    expect(val()).toBe(0)
  })

  it('reads existing value from sessionStorage', () => {
    sessionStorage.setItem('step', JSON.stringify(3))
    const val = useSessionStorage('step', 0)
    expect(val()).toBe(3)
  })

  it('.set() updates signal and sessionStorage', () => {
    const val = useSessionStorage('step', 0)
    val.set(5)
    expect(val()).toBe(5)
    expect(JSON.parse(sessionStorage.getItem('step')!)).toBe(5)
  })

  it('.update() works', () => {
    const val = useSessionStorage('count', 10)
    val.update((n) => n + 5)
    expect(val()).toBe(15)
  })

  it('.remove() resets to default and clears sessionStorage', () => {
    const val = useSessionStorage('temp', 'default')
    val.set('modified')
    val.remove()
    expect(val()).toBe('default')
    expect(sessionStorage.getItem('temp')).toBeNull()
  })

  it('returns same signal for same key', () => {
    const a = useSessionStorage('key', 'val')
    const b = useSessionStorage('key', 'val')
    expect(a).toBe(b)
  })

  it('handles corrupt storage values gracefully', () => {
    sessionStorage.setItem('broken', 'not valid json{{{')
    const val = useSessionStorage('broken', 'fallback')
    expect(val()).toBe('fallback')
  })

  it('custom serializer/deserializer', () => {
    const val = useSessionStorage('date', new Date('2025-01-01'), {
      serializer: (d) => d.toISOString(),
      deserializer: (s) => new Date(s),
    })
    expect(val()).toEqual(new Date('2025-01-01'))
  })

  it('.debug() and .label work', () => {
    const val = useSessionStorage('debug', 'test')
    expect(val.debug().value).toBe('test')
    val.label = 'session-sig'
    expect(val.label).toBe('session-sig')
  })

  it('.peek() reads without subscribing', () => {
    const val = useSessionStorage('peek', 'hello')
    expect(val.peek()).toBe('hello')
  })

  it('onError callback is called on deserialization failure', () => {
    sessionStorage.setItem('bad', '{invalid')
    const errors: Error[] = []
    const val = useSessionStorage('bad', 'default', {
      onError: (e) => {
        errors.push(e)
        return 'recovered'
      },
    })
    expect(val()).toBe('recovered')
    expect(errors).toHaveLength(1)
  })
})
