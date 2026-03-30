import { calculateHocsFuncs } from '../utils/compose'

describe('calculateHocsFuncs', () => {
  it('extracts functions from object values', () => {
    const fn1 = (x: any) => x
    const fn2 = (x: any) => x
    const options = { a: fn1, b: fn2 }
    const result = calculateHocsFuncs(options)
    expect(result).toHaveLength(2)
  })

  it('filters out non-function values', () => {
    const fn = (x: any) => x
    const options = { a: fn, b: 'string', c: 42, d: null }
    const result = calculateHocsFuncs(options)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(fn)
  })

  it('reverses the order', () => {
    const fn1 = () => 'first'
    const fn2 = () => 'second'
    const options = { a: fn1, b: fn2 }
    const result = calculateHocsFuncs(options)
    expect(result[0]).toBe(fn2)
    expect(result[1]).toBe(fn1)
  })

  it('returns empty array for empty options', () => {
    expect(calculateHocsFuncs({})).toEqual([])
  })

  it('handles undefined options', () => {
    expect(calculateHocsFuncs(undefined as any)).toEqual([])
  })
})
