import { describe, expect, it } from 'vitest'
import isEmpty from '../isEmpty'

describe('isEmpty', () => {
  it('should return true for null', () => {
    expect(isEmpty(null)).toBe(true)
  })

  it('should return true for undefined', () => {
    expect(isEmpty(undefined)).toBe(true)
  })

  it('should return true for empty object', () => {
    expect(isEmpty({})).toBe(true)
  })

  it('should return true for empty array', () => {
    expect(isEmpty([])).toBe(true)
  })

  it('should return false for non-empty object', () => {
    expect(isEmpty({ a: 1 })).toBe(false)
  })

  it('should return false for non-empty array', () => {
    expect(isEmpty([1])).toBe(false)
  })

  it('should return false for array with falsy values', () => {
    expect(isEmpty([0, null, undefined])).toBe(false)
  })

  it('should return false for object with falsy values', () => {
    expect(isEmpty({ a: 0, b: null })).toBe(false)
  })

  it('should return true for Object.create(null) with no properties', () => {
    expect(isEmpty(Object.create(null))).toBe(true)
  })

  it('should return false for Object.create(null) with properties', () => {
    const obj = Object.create(null)
    obj.a = 1
    expect(isEmpty(obj)).toBe(false)
  })

  it('should return true for non-object truthy primitives', () => {
    // Covers typeof param !== 'object' branch
    expect(isEmpty(42 as any)).toBe(true)
    expect(isEmpty('hello' as any)).toBe(true)
    expect(isEmpty(true as any)).toBe(true)
  })
})
