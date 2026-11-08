import { describe, expect, it } from 'vitest'
import { internTextBundle } from '../helpers/internTextBundle'

describe('internTextBundle', () => {
  it('no css → one shared bundle', () => {
    expect(internTextBundle(undefined)).toBe(internTextBundle(undefined))
    expect(internTextBundle(undefined)).toEqual({ extraStyles: undefined })
  })

  it('string css → same bundle per string', () => {
    const a = internTextBundle('color: red;')
    expect(internTextBundle('color: red;')).toBe(a)
    expect(internTextBundle('color: blue;')).not.toBe(a)
    expect(a.extraStyles).toBe('color: red;')
  })

  it('object / function css → same bundle per identity', () => {
    const obj = { strings: [], values: [] }
    const fn = () => 'color: red;'
    expect(internTextBundle(obj)).toBe(internTextBundle(obj))
    expect(internTextBundle(fn)).toBe(internTextBundle(fn))
    expect(internTextBundle({ ...obj })).not.toBe(internTextBundle(obj))
    expect(internTextBundle(fn).extraStyles).toBe(fn)
  })

  it('null / other primitives are wrapped without caching', () => {
    expect(internTextBundle(null)).toEqual({ extraStyles: null })
    expect(internTextBundle(null)).not.toBe(internTextBundle(null))
  })
})
