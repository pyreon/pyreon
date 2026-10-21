/**
 * The number deserializers sum short all-digit values directly instead of
 * `trim()` + `+raw`. That fast path must be indistinguishable from the
 * general rule it replaces: blank → default, otherwise `+raw`, NaN → default.
 */
import { describe, expect, it } from 'vitest'
import { inferSerializer } from '../serializers'

const DEFAULT = -1
const reference = (raw: string): number => {
  if (raw.trim() === '') return DEFAULT
  const n = +raw
  return n === n ? n : DEFAULT
}

const EDGE = [
  '', ' ', '\t', '0', '7', '007', '42', '12345',
  '999999999999999', // 15 digits — last length the fast path takes
  '9999999999999999', // 16 digits — general path
  '12345678901234567890', ' 4', '4 ', '-3', '+3', '1.5', '.5', '5.', '1e3',
  '0x10', '0b1', 'x', '4x', 'Infinity', '-0', '١٢', '１２',
]

describe('number deserialize — fast path matches the general rule', () => {
  const scalar = inferSerializer(DEFAULT)
  const array = inferSerializer([DEFAULT])

  it('agrees on the edge cases', () => {
    for (const raw of EDGE) {
      expect(Object.is(scalar.deserialize(raw), reference(raw)), JSON.stringify(raw)).toBe(true)
    }
  })

  it('agrees on 5,000 random strings over digits and ToNumber-relevant chars', () => {
    const alphabet = '0123456789 .-+eEx'
    let seed = 12345
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let k = 0; k < 5000; k++) {
      const len = Math.floor(rand() * 18)
      let raw = ''
      for (let i = 0; i < len; i++) raw += alphabet[Math.floor(rand() * alphabet.length)]
      expect(Object.is(scalar.deserialize(raw), reference(raw)), JSON.stringify(raw)).toBe(true)
    }
  })

  it('an array element uses the same rule (invalid element → whole default)', () => {
    expect(array.deserialize('1,22,333')).toEqual([1, 22, 333])
    expect(array.deserialize('1, 2')).toEqual([1, 2])
    expect(array.deserialize('1,,2')).toEqual([DEFAULT])
    expect(array.deserialize('1,x')).toEqual([DEFAULT])
  })
})
