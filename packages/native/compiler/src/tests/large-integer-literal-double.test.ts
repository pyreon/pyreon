// A whole-number literal outside the 32-bit range types its field Double.
// Kotlin's Int is 32-bit, so an epoch-millisecond timestamp — how time-series
// data is written — typed its field Int and kotlinc rejected the literal
// ("actual type is 'Long', but 'Int' was expected"). JavaScript has one
// number type; Double is the faithful reading.
//
// Kotlin whole-number fields now default to Long, not Int (finishing the
// Int-to-Long pass across the emitter's runtime APIs — a Kotlin Int is
// 32-bit, and a TS `number` field routinely carries something that isn't,
// timestamps included), so a small integer field like `n` below is Long too.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const src = `import { Text } from '@pyreon/primitives'
interface Reading { at: number; n: number }
const READINGS: Reading[] = [{ at: 1709251200000, n: 1 }, { at: 1711929600000, n: 2 }]
export function C() { return <Text>{READINGS.length}</Text> }
`

describe('an integer literal beyond Int32 is a Double', () => {
  it('Kotlin: the field is Double and the literal carries .0; a small integer field is Long', () => {
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('data class Reading(var at: Double, var n: Long)')
    expect(r.code).toContain('Reading(at = 1709251200000.0, n = 1L)')
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
