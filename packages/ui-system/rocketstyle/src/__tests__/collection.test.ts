import { removeNullableValues } from '../utils/collection'

describe('removeNullableValues', () => {
  it('removes null values', () => {
    expect(removeNullableValues({ a: 1, b: null })).toEqual({ a: 1 })
  })

  it('removes undefined values', () => {
    expect(removeNullableValues({ a: 1, b: undefined })).toEqual({ a: 1 })
  })

  it('removes false values', () => {
    expect(removeNullableValues({ a: 1, b: false })).toEqual({ a: 1 })
  })

  it('keeps truthy values', () => {
    expect(removeNullableValues({ a: 1, b: 'hello', c: true })).toEqual({
      a: 1,
      b: 'hello',
      c: true,
    })
  })

  it('keeps zero and empty string', () => {
    expect(removeNullableValues({ a: 0, b: '' })).toEqual({ a: 0, b: '' })
  })

  it('returns empty object for all nullable', () => {
    expect(removeNullableValues({ a: null, b: undefined, c: false })).toEqual({})
  })

  it('handles empty object', () => {
    expect(removeNullableValues({})).toEqual({})
  })
})
