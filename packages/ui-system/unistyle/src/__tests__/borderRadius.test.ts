import { describe, expect, it } from 'vitest'
import borderRadius from '../styles/shorthands/borderRadius'

const empty = {
  full: undefined,
  top: undefined,
  bottom: undefined,
  left: undefined,
  right: undefined,
  topLeft: undefined,
  topRight: undefined,
  bottomLeft: undefined,
  bottomRight: undefined,
}

const br = borderRadius()

describe('borderRadius', () => {
  it('returns null when no values provided', () => {
    expect(br(empty)).toBeNull()
  })

  describe('full shorthand', () => {
    it('all same value produces single-value shorthand', () => {
      expect(br({ ...empty, full: 16 })).toBe('border-radius: 1rem;')
    })

    it('zero is a valid value', () => {
      expect(br({ ...empty, full: 0 })).toBe('border-radius: 0;')
    })

    it('string values pass through', () => {
      expect(br({ ...empty, full: '50%' })).toBe('border-radius: 50%;')
    })
  })

  describe('two-value shorthand', () => {
    it('tl===br and tr===bl produces two-value shorthand', () => {
      const result = br({
        ...empty,
        topLeft: 16,
        topRight: 32,
        bottomRight: 16,
        bottomLeft: 32,
      })
      expect(result).toBe('border-radius: 1rem 2rem;')
    })
  })

  describe('three-value shorthand', () => {
    it('tl, tr===bl, br produces three-value shorthand', () => {
      const result = br({
        ...empty,
        topLeft: 16,
        topRight: 32,
        bottomRight: 48,
        bottomLeft: 32,
      })
      expect(result).toBe('border-radius: 1rem 2rem 3rem;')
    })
  })

  describe('four-value shorthand', () => {
    it('all different produces four-value shorthand', () => {
      const result = br({
        ...empty,
        topLeft: 16,
        topRight: 32,
        bottomRight: 48,
        bottomLeft: 64,
      })
      expect(result).toBe('border-radius: 1rem 2rem 3rem 4rem;')
    })
  })

  describe('per-side values', () => {
    it('top sets topLeft and topRight', () => {
      const result = br({ ...empty, top: 16, bottom: 32 })
      expect(result).toBe('border-radius: 1rem 1rem 2rem 2rem;')
    })

    it('left sets topLeft and bottomLeft', () => {
      const result = br({ ...empty, left: 16, right: 32 })
      expect(result).toBe('border-radius: 1rem 2rem 2rem 1rem;')
    })
  })

  describe('individual corners override sides', () => {
    it('topLeft overrides top and left', () => {
      const result = br({ ...empty, top: 16, topLeft: 32, bottom: 16 })
      // tl=32, tr=16, br=16, bl=16 → tr===bl so 3-value shorthand
      expect(result).toBe('border-radius: 2rem 1rem 1rem;')
    })

    it('bottomRight overrides bottom and right', () => {
      const result = br({ ...empty, full: 16, bottomRight: 32 })
      // tl=16, tr=16, br=32, bl=16 → tr===bl so 3-value shorthand
      expect(result).toBe('border-radius: 1rem 1rem 2rem;')
    })
  })

  describe('individual properties when not all corners have values', () => {
    it('only topLeft is set', () => {
      const result = br({ ...empty, topLeft: 16 })
      expect(result).toBe('border-top-left-radius: 1rem;')
    })

    it('topLeft and bottomRight are set', () => {
      const result = br({ ...empty, topLeft: 16, bottomRight: 32 })
      expect(result).toBe('border-top-left-radius: 1rem;border-bottom-right-radius: 2rem;')
    })

    it('top only sets topLeft and topRight individual properties', () => {
      const result = br({ ...empty, top: 16 })
      expect(result).toBe('border-top-left-radius: 1rem;border-top-right-radius: 1rem;')
    })
  })

  describe('custom rootSize', () => {
    it('uses custom rootSize for conversion', () => {
      const brCustom = borderRadius(10)
      expect(brCustom({ ...empty, full: 20 })).toBe('border-radius: 2rem;')
    })
  })
})
