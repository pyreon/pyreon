import { describe, expect, it } from 'vitest'
import { accessInternal, callInternal } from '../internals'

describe('accessInternal', () => {
  it('returns the same object reference', () => {
    const obj = { _internal: 'value' }
    const typed = accessInternal<{ _internal: string }>(obj)
    expect(typed).toBe(obj)
    expect(typed._internal).toBe('value')
  })

  it('lets the caller widen the type at no runtime cost', () => {
    type Hidden = { _step(): number }
    let count = 0
    const obj: object = { _step: () => ++count }
    const typed = accessInternal<Hidden>(obj)
    expect(typed._step()).toBe(1)
    expect(typed._step()).toBe(2)
  })
})

describe('callInternal', () => {
  it('calls the named method with args and returns the result', () => {
    const obj = { _double: (n: number) => n * 2 }
    const result = callInternal<'_double', number>(obj, '_double', 21)
    expect(result).toBe(42)
  })

  it('preserves `this` binding inside the called method', () => {
    const obj = {
      base: 10,
      _add(this: { base: number }, n: number): number {
        return this.base + n
      },
    }
    const result = callInternal<'_add', number>(obj, '_add', 5)
    expect(result).toBe(15)
  })

  it('throws if the property is not a function', () => {
    const obj = { _notAFn: 42 }
    expect(() => callInternal(obj, '_notAFn')).toThrow(
      /not a function/,
    )
  })

  it('throws if the property does not exist', () => {
    expect(() => callInternal({}, '_missing')).toThrow(/not a function/)
  })
})
