import type { Adjuster, Duration, Mapper, PlainDate, PlainDateTime, PlainYearMonth } from '../core'
import { add, between } from '../core'
import { add as fpAdd, diffFrom, endOf, isBefore, pipe, startOf, toPlainDate } from '../fp'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const assertType = <_T extends true>(): void => {}

/** Structural copy of the duration input `@pyreon/format` takes (`formatDuration`); this package does not import it. */
interface FormatDuration {
  years?: number | undefined
  months?: number | undefined
  weeks?: number | undefined
  days?: number | undefined
  hours?: number | undefined
  minutes?: number | undefined
  seconds?: number | undefined
  milliseconds?: number | undefined
}

/** Structural copy of the date input `@pyreon/format` takes (`DateInput`). */
type FormatDateInput = Date | number | string | null | undefined

describe('fp types', () => {
  it('adjusters keep the input shape, in both directions', () => {
    const plusMonth = fpAdd({ months: 1 })
    const a = plusMonth('2026-01-31' as PlainDate)
    const b = plusMonth('2026-01-31T10:00' as PlainDateTime)
    const c = plusMonth('2026-01' as PlainYearMonth)
    const month: Adjuster<PlainDate> = startOf('month')
    const asMapper: Mapper<PlainDate, PlainDate> = endOf('week')

    assertType<Equal<typeof a, PlainDate>>()
    assertType<Equal<typeof b, PlainDateTime>>()
    assertType<Equal<typeof c, PlainYearMonth>>()
    expect([a, b, c, month('2026-11-18'), asMapper('2026-11-18')]).toHaveLength(5)
    // @ts-expect-error a plain string is not a PlainDate
    expect(() => plusMonth('yesterday')).toThrow()
  })

  it('pipe infers every step left to right and keeps shape', () => {
    const nextMonthStart = pipe(fpAdd({ months: 1 }), startOf('month'))
    const out = nextMonthStart('2026-01-31' as PlainDate)
    const toKey = pipe(toPlainDate('Europe/Prague'), startOf('month'), (d: PlainDate) => d.slice(0, 7))
    const key = toKey(0)
    const eight = pipe((n: number) => n, (n) => n + 1, (n) => `${n}`, (s) => s.length, (n) => n > 0, (b) => (b ? 1 : 0), (n) => [n], (a) => a.length)

    assertType<Equal<typeof out, PlainDate>>()
    assertType<Equal<typeof key, string>>()
    assertType<Equal<ReturnType<typeof eight>, number>>()
    expect([out, key, eight(1)]).toEqual(['2026-02-01', '1970-01', 1])
    // @ts-expect-error the second step must accept what the first returns
    pipe((n: number) => `${n}`, (n: number) => n)
  })

  it('predicates and diffs take the value last', () => {
    const early = (['2026-01-01', '2026-06-01'] as PlainDate[]).filter(isBefore('2026-03-01'))
    const days = ['2026-01-10' as PlainDate].map(diffFrom('2026-01-01' as PlainDate, 'day'))

    assertType<Equal<typeof days, number[]>>()
    expect([early, days]).toEqual([['2026-01-01'], [9]])
  })

  it('a Duration from between() lines up with the shapes @pyreon/format takes', () => {
    const d: Duration = between('2026-01-01', '2026-03-05')
    const forFormat: FormatDuration = d
    const backToTime: Duration = forFormat
    const asInput: FormatDateInput[] = ['2026-11-18' as PlainDate, '2026-11-18T14:30' as PlainDateTime, Date.now()]

    expect(add('2026-01-01', backToTime)).toBe('2026-03-05')
    expect(asInput).toHaveLength(3)
  })
})
