// A whole-number literal outside the 32-bit range types its field Double.
// Kotlin's Int is 32-bit, so an epoch-millisecond timestamp — how time-series
// data is written — typed its field Int and kotlinc rejected the literal
// ("actual type is 'Long', but 'Int' was expected"). JavaScript has one
// number type; Double is the faithful reading.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const src = `import { Text } from '@pyreon/primitives'
interface Reading { at: number; n: number }
const READINGS: Reading[] = [{ at: 1709251200000, n: 1 }, { at: 1711929600000, n: 2 }]
export function C() { return <Text>{READINGS.length}</Text> }
`

describe('an integer literal beyond Int32 is a Double', () => {
  it('Kotlin: the field is Double and the literal carries .0; small integers stay Int', () => {
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('data class Reading(var at: Double, var n: Int)')
    expect(r.code).toContain('Reading(at = 1709251200000.0, n = 1)')
  })

  it('Swift: the same field type, so one source means one model on both targets', () => {
    expect(transform(src, { target: 'swift' }).code).toContain('Reading(at: 1709251200000.0, n: 1)')
  })

  it('compiles on both targets', () => {
    const s = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
    if (!s.skipped) expect(s.ok, s.error).toBe(true)
    const k = validateKotlin(transform(src, { target: 'kotlin' }).code)
    if (!k.skipped) expect(k.ok, k.error).toBe(true)
  })
})
