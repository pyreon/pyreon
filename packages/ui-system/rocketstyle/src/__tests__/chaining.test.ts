import { chainOptions, chainOrOptions, chainReservedKeyOptions } from '../utils/chaining'

describe('chainOptions', () => {
  it('appends function to defaults', () => {
    const fn1 = () => ({ a: 1 })
    const fn2 = () => ({ b: 2 })
    const result = chainOptions(fn2, [fn1])
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(fn1)
    expect(result[1]).toBe(fn2)
  })

  it('wraps object in function and appends', () => {
    const obj = { a: 1 }
    const result = chainOptions(obj, [])
    expect(result).toHaveLength(1)
    expect(result[0]?.()).toEqual({ a: 1 })
  })

  it('returns defaults when opts is undefined', () => {
    const fn1 = () => ({ a: 1 })
    const result = chainOptions(undefined, [fn1])
    expect(result).toEqual([fn1])
  })

  it('handles empty defaults', () => {
    const fn = () => ({ a: 1 })
    const result = chainOptions(fn, [])
    expect(result).toHaveLength(1)
  })

  it('defaults to empty array when defaultOpts missing', () => {
    const fn = () => ({ a: 1 })
    // @ts-expect-error testing with undefined defaults
    const result = chainOptions(fn, undefined)
    expect(result).toHaveLength(1)
  })
})

describe('chainOrOptions', () => {
  it('merges opts with defaults using keys', () => {
    const keys = ['a', 'b', 'c'] as const
    const opts = { a: 'new', c: 'also' }
    const defaults = { a: 'old', b: 'default', c: 'orig' }
    const result = chainOrOptions(keys, opts, defaults)
    expect(result).toEqual({ a: 'new', b: 'default', c: 'also' })
  })

  it('uses default when opt is falsy', () => {
    const keys = ['a'] as const
    const opts = { a: '' }
    const defaults = { a: 'default' }
    const result = chainOrOptions(keys, opts, defaults)
    expect(result).toEqual({ a: 'default' })
  })

  it('handles missing keys in both', () => {
    const keys = ['x'] as const
    const result = chainOrOptions(keys, {}, {})
    expect(result).toEqual({ x: undefined })
  })
})

describe('chainReservedKeyOptions', () => {
  it('chains options for each reserved key', () => {
    const keys = ['theme', 'styles'] as const
    const fn1 = () => ({ a: 1 })
    const fn2 = () => ({ b: 2 })
    const opts = { theme: fn2 }
    const defaults = { theme: [fn1], styles: [] }

    const result = chainReservedKeyOptions(keys, opts, defaults)
    expect(result.theme).toHaveLength(2)
    expect(result.styles).toHaveLength(0)
  })

  it('wraps object opts into functions', () => {
    const keys = ['theme'] as const
    const opts = { theme: { color: 'red' } }
    const defaults = { theme: [] }

    const result = chainReservedKeyOptions(keys, opts, defaults)
    expect(result.theme).toHaveLength(1)
    expect(result.theme?.[0]?.()).toEqual({ color: 'red' })
  })
})
