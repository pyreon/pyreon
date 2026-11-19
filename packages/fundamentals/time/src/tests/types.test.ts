import { add, compare, diff, endOf, isPlainDate, max, min, monthGrid, startOf, subtract, toInstant } from '../core'
import type { Instant, PlainDate, PlainDateTime, PlainTime, PlainYearMonth } from '../core'

/** Type-level tests: this file is checked by `tsc --noEmit`; a `@ts-expect-error` that stops erroring fails the typecheck. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const assertType = <_T extends true>(): void => {}

describe('types', () => {
  it('literals type-check without a cast and the result keeps the input shape', () => {
    const a = add('2026-01-31', { months: 1 })
    const b = add('2026-01-31T10:00', { hours: 1 })
    const c = add('2026-01', { months: 1 })
    const d = subtract('2026-01-31', { days: 1 })
    const e = startOf('2026-01-31T10:00:30.5', 'hour')
    const f = endOf('2026-01-31', 'month')

    assertType<Equal<typeof a, PlainDate>>()
    assertType<Equal<typeof b, PlainDateTime>>()
    assertType<Equal<typeof c, PlainYearMonth>>()
    assertType<Equal<typeof d, PlainDate>>()
    assertType<Equal<typeof e, PlainDateTime>>()
    assertType<Equal<typeof f, PlainDate>>()
    const day: PlainDate = '2026-11-18'
    const next: PlainDate = add(day, { days: 1 })

    expect([a, b, c, d, e, f, next]).toHaveLength(7)
  })

  it('shapes the type system can reject are rejected', () => {
    // @ts-expect-error a word is not a PlainDate
    expect(() => add('yesterday', { days: 1 })).toThrow()
    // @ts-expect-error a plain string must be checked first
    const unchecked = (s: string): string => add(s, { days: 1 })
    // @ts-expect-error a number is an Instant, not a calendar value
    expect(() => add(5, { days: 1 })).toThrow()
    // @ts-expect-error a PlainDate is not a PlainYearMonth
    const wrong: PlainYearMonth = '2026-11-18' as PlainDate
    // @ts-expect-error unknown unit
    expect(() => startOf('2026-01-01', 'days')).toThrow()
    // @ts-expect-error unknown duration field
    expect(() => add('2026-01-01', { day: 1 })).not.toThrow()
    // @ts-expect-error weekStart is 1..7
    expect(() => startOf('2026-01-01', 'week', { weekStart: 0 })).toThrow()
    // @ts-expect-error a PlainDateTime is not a PlainDate
    const dt: PlainDate = '2026-01-01T10:00' as PlainDateTime

    expect([unchecked, wrong, dt]).toHaveLength(3)
  })

  it('the guards narrow, and the generic functions keep literal unions', () => {
    const maybe: string = '2026-11-18'

    if (isPlainDate(maybe)) {
      const out: PlainDate = add(maybe, { days: 1 })

      expect(out).toBe('2026-11-19')
    }
    const lo = min('2026-03-01', '2026-01-01')
    const hi = max(1, 2)
    const order = compare('14:30' as PlainTime, '14:31' as PlainTime)
    const grid = monthGrid('2026-11')
    const when: Instant = toInstant('2026-11-18T10:00', 'UTC')
    const n: number = diff('2026-01-01', '2026-02-01', 'day')

    assertType<Equal<typeof grid, PlainDate[][]>>()
    expect([lo, hi, order, when, n]).toHaveLength(5)
  })
})
