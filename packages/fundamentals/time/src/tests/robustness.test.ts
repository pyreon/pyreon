import * as time from '../index'
import * as fp from '../fp'
import { setClock } from '../index'
import { rng, pick, int } from './rng'

/**
 * The one rule, tested: a public function given bad data does exactly one of three things. It returns the correct value; it
 * is a guard or parser and returns `false` / `null`; or it throws a TypeError or RangeError whose message starts with
 * `[Pyreon] <function>:`. No raw platform error (a bare `TypeError: x is not a function`, an `Intl` RangeError, a
 * `Cannot convert a Symbol`) ever reaches the caller.
 */
const NULL_PROTO = Object.create(null) as object
const THROWING = { toString() { throw new Error('boom') }, valueOf() { throw new Error('boom') } }

const POOL: unknown[] = [
  undefined, null, true, false, 0, -0, 1, -1, 1.5, -2.5, 0.1, 7, 12, 31, 2026, 10_000, 1e15, 1e308, -1e308, 2 ** 53, -(2 ** 53), Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
  8.64e15, -8.64e15, 253_402_300_800_000, -62_135_596_800_001, 1_795_008_605_250, 0n, 10n, Symbol('s'), '', ' ', 'x', 'yesterday', 'ZZZ', '2026-02-30', '2026-13-01', '2026-2-3', '0000-01-01', '9999-12-31',
  '2026-11-18', '2026-11', '14:30', '14:30:05.250', '24:00', '2026-11-18T14:30', '2026-11-18t14:30', '2026-11-18T14:30Z', '2026-11-18T14:30:05+01:00', '9999-12-31T23:59:59.999', '0001-01-01T00:00',
  'Europe/Prague', 'UTC', 'europe/prague', 'Mars/Nowhere', 'Etc/GMT+5', 'en-US', 'cs', 'not a locale', 'day', 'days', 'month', 'week', 'hour', 'millisecond', 'year', 'compatible', 'reject', 'auto',
  {}, [], [1], NULL_PROTO, THROWING, new Date(0), new Date(Number.NaN), () => 0, () => 'x',
  { days: 1 }, { days: 1.5 }, { months: 0.5 }, { years: 1e308 }, { days: 1, hours: -1 }, { hours: Number.NaN }, { milliseconds: 0.5 }, { weeks: 1e15 }, { day: 1 },
  { weekStart: 7 }, { weekStart: 0 }, { weekStart: 'x' }, { zone: 'Europe/Prague' }, { zone: 5 }, { weeks: 6 }, { weeks: 'auto' }, { weeks: 4 }, { disambiguation: 'reject' }, { disambiguation: 'nope' }, { lenient: true },
]

const SKIP = new Set(['setClock', 'now', 'today', 'localZone', 'daysFromToday', 'isToday', 'isYesterday', 'isTomorrow'])

function describeArg(a: unknown): string {
  if (a === THROWING) return 'THROWING'
  if (a === NULL_PROTO) return 'NULLPROTO'
  if (typeof a === 'symbol') return 'Symbol'
  if (typeof a === 'bigint') return `${a}n`
  if (typeof a === 'number') return String(a)

  try {
    return JSON.stringify(a) ?? String(a)
  } catch {
    return typeof a
  }
}

function outcome(call: () => unknown): 'ok' | string {
  try {
    call()

    return 'ok'
  } catch (error) {
    const message = error instanceof Error ? error.message : ''

    if ((error instanceof TypeError || error instanceof RangeError) && /^\[Pyreon\] [A-Za-z]+/.test(message)) return 'ok'

    return `${error instanceof Error ? error.constructor.name : typeof error}: ${message || String(error)}`
  }
}

describe('fuzz: no raw platform error reaches the caller', () => {
  const r = rng(404)
  const argsFor = (): unknown[] => Array.from({ length: int(r, 0, 4) }, () => pick(r, POOL))

  it.each(Object.entries(time).filter(([name, fn]) => typeof fn === 'function' && !SKIP.has(name)))('%s', (name, fn) => {
    const failures = new Set<string>()

    for (let i = 0; i < 4000; i++) {
      const args = argsFor()
      const result = outcome(() => (fn as (...a: unknown[]) => unknown)(...args))

      if (result !== 'ok') failures.add(`${name}(${args.map(describeArg).join(', ')}) -> ${result}`)
      if (failures.size > 3) break
    }
    expect([...failures]).toEqual([])
  })

  it.each(Object.entries(fp).filter(([, fn]) => typeof fn === 'function'))('fp.%s (the factory and the function it returns)', (name, fn) => {
    const failures = new Set<string>()

    for (let i = 0; i < 3000; i++) {
      const built = (() => { try { return (fn as (...a: unknown[]) => unknown)(...argsFor()) } catch (error) { const m = outcome(() => { throw error }); if (m !== 'ok') failures.add(`${name} factory -> ${m}`); return undefined } })()

      if (typeof built === 'function') {
        const result = outcome(() => (built as (...a: unknown[]) => unknown)(...argsFor()))

        if (result !== 'ok') failures.add(`${name}(...)(...) -> ${result}`)
      }
      if (failures.size > 3) break
    }
    expect([...failures]).toEqual([])
  })

  it('the clock-reading functions and setClock obey the same rule', () => {
    for (const bad of [5, 'x', {}, undefined]) {
      expect(() => setClock(bad as never)).toThrow(/^\[Pyreon\] setClock/)
    }
    for (let i = 0; i < 500; i++) {
      for (const f of [time.daysFromToday, time.isToday, time.isYesterday, time.isTomorrow] as ((...a: unknown[]) => unknown)[]) {
        expect(outcome(() => f(pick(r, POOL), pick(r, POOL), pick(r, POOL)))).toBe('ok')
      }
    }
    setClock(() => Number.NaN)
    expect(outcome(() => time.today('UTC'))).toBe('ok')
    setClock(null)
  })
})

describe('guards and parsers never throw', () => {
  const r = rng(405)

  it('isPlain*, isTimeZone, parseInstant and parseISO return false or null for anything', () => {
    for (let i = 0; i < 3000; i++) {
      const v = pick(r, POOL)

      for (const f of [time.isPlainDate, time.isPlainTime, time.isPlainDateTime, time.isPlainYearMonth, time.isTimeZone] as ((x: unknown) => boolean)[]) {
        expect(typeof f(v)).toBe('boolean')
      }
      expect(() => time.parseInstant(v as string)).not.toThrow()
      expect(() => time.parseInstant(v as string, { lenient: true })).not.toThrow()
      expect(() => time.parseISO(v as string)).not.toThrow()
    }
  })
})

describe('durations: fractions, signs and huge values are defined', () => {
  it('fractions of fixed-length units balance down to milliseconds; months and years must be whole', () => {
    expect(time.add('2026-11-18T10:00', { days: 1.5 })).toBe('2026-11-19T22:00')
    expect(time.add('2026-11-18T10:00', { weeks: 0.5 })).toBe('2026-11-21T22:00')
    expect(time.add('2026-11-18T10:00', { hours: 1.5 })).toBe('2026-11-18T11:30')
    expect(time.add('2026-11-18T10:00', { minutes: 0.5 })).toBe('2026-11-18T10:00:30')
    expect(time.add('2026-11-18T10:00', { seconds: 0.25 })).toBe('2026-11-18T10:00:00.250')
    expect(time.add('2026-11-18T10:00', { hours: 0.1 })).toBe('2026-11-18T10:06')
    expect(time.add('2026-11-18T10:00', { days: -1.5 })).toBe('2026-11-16T22:00')
    expect(time.add('2026-11-18T10:00', { days: 1, hours: 0.5 })).toBe('2026-11-19T10:30')
    expect(time.toMilliseconds({ days: 1.5 })).toBe(129_600_000)
    expect(time.addInstant(0, { hours: 1.5 })).toBe(5_400_000)
    expect(() => time.add('2026-11-18', { days: 1.5 })).toThrow(/duration.days has a fraction/)
    expect(() => time.add('2026-11-18T10:00', { months: 0.5 })).toThrow(/\[Pyreon\] add: duration.months must be a whole number, got 0.5: a fractional month has no fixed length.*\{ days \}/)
    expect(() => time.add('2026-11-18T10:00', { years: 1.5 })).toThrow(/fractional year has no fixed length/)
    expect(() => time.add('2026-11-18T10:00', { milliseconds: 0.5 })).toThrow(/milliseconds must be a whole number/)
    expect(() => time.add('2026-11-18T10:00', { hours: 1, minutes: -0.5 })).toThrow(/cannot mix positive and negative/)
  })

  it('negative zero, NaN, Infinity, huge values and wrong types', () => {
    expect(time.add('2026-11-18', { days: -0 })).toBe('2026-11-18')
    expect(time.subtract('2026-11-18', { days: 0 })).toBe('2026-11-18')
    expect(time.add('2026-11-18', { days: 1, months: -0 })).toBe('2026-11-19')
    expect(() => time.add('2026-11-18', { days: Number.NaN })).toThrow(/duration.days must be a finite number, got NaN/)
    expect(() => time.add('2026-11-18', { days: Number.POSITIVE_INFINITY })).toThrow(/finite number/)
    expect(() => time.add('2026-11-18', { days: '1' as unknown as number })).toThrow(/finite number, got "1"/)
    expect(() => time.add('2026-11-18', { days: 1e308 })).toThrow(RangeError)
    expect(() => time.add('2026-11-18', { years: 1e308 })).toThrow(RangeError)
    expect(() => time.add('2026-11-18T10:00', { milliseconds: 1e308 })).toThrow(RangeError)
    expect(() => time.addInstant(0, { hours: 1e308 })).toThrow(/outside the range of a Date/)
    expect(() => time.add('2026-11-18', { days: 2 ** 53 })).toThrow(RangeError)
  })
})

describe('an error names the field or value that caused it', () => {
  const FIELDS = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds'] as const
  const BAD: unknown[] = [Number.NaN, Number.POSITIVE_INFINITY, '1', null, {}, 0.5]

  it('a bad duration field is named in the message (not another field, not a generic one)', () => {
    for (const field of FIELDS) {
      for (const bad of BAD) {
        let message = ''

        try {
          time.add('2026-11-18T10:00', { [field]: bad } as never)
        } catch (error) {
          message = (error as Error).message
        }
        const valid = (field === 'weeks' || field === 'days' || field === 'hours' || field === 'minutes' || field === 'seconds') && bad === 0.5

        if (!valid && message !== '') expect(message, `${field}=${String(bad)}`).toContain(`duration.${field}`)
        if (!valid && bad !== null) expect(message, `${field}=${String(bad)} must be rejected`).not.toBe('')
      }
    }
  })

  it('a time field on a date names that field, and so does a unit on a date', () => {
    expect(() => time.add('2026-11-18', { minutes: 5 })).toThrow(/duration.minutes/)
    expect(() => time.add('2026-11-18', { seconds: 0.5 })).toThrow(/duration.seconds has a fraction/)
    expect(() => time.add('2026-11', { weeks: 1 })).toThrow(/duration.weeks/)
    expect(() => time.startOf('2026-11-18', 'minute')).toThrow(/the unit "minute"/)
    expect(() => time.diff('2026-11-18', '2026-11-19', 'second')).toThrow(/the unit "second"/)
  })
})

describe('lenient parsing: one door, strict guards stay strict', () => {
  it('parseISO accepts what people and other systems produce and returns the strict types', () => {
    expect(time.parseISO('2026-11-18 14:30')).toBe('2026-11-18T14:30')
    expect(time.parseISO('2026-11-18t14:30:05')).toBe('2026-11-18T14:30:05')
    expect(time.parseISO(' 2026-2-3 ')).toBe('2026-02-03')
    expect(time.parseISO('2026-2')).toBe('2026-02')
    expect(time.parseISO('9:05')).toBe('09:05')
    expect(time.parseISO('2026-11-18T14:30:05,5')).toBe('2026-11-18T14:30:05.500')
    expect(time.parseISO('2026-11-18T14:30:05.123456789')).toBe('2026-11-18T14:30:05.123')
    expect(time.parseISO('2026-11-18')).toBe('2026-11-18')
    for (const none of ['2026-02-30', '2026-11-18T25:00', '2026-11-18T14:30Z', '2026-11-18T14:30+01:00', '2026-11-18T14:30:05.Z', 'yesterday', '', '18.11.2026', '2026/11/18', '2026-11-18T']) {
      expect(time.parseISO(none), none).toBeNull()
    }
    expect(time.isPlainDate('2026-2-3')).toBe(false)
    expect(time.isPlainDateTime('2026-11-18 14:30')).toBe(false)
    expect(time.isPlainDateTime('2026-11-18t14:30')).toBe(false)
  })

  it('parseInstant is strict by default and lenient on request', () => {
    const t = Date.UTC(2026, 10, 18, 13, 30, 5)

    expect(time.parseInstant('2026-11-18 14:30:05+01:00')).toBeNull()
    expect(time.parseInstant('2026-11-18 14:30:05+01:00', { lenient: true })).toBe(t)
    expect(time.parseInstant('2026-11-18t13:30:05z', { lenient: true })).toBe(t)
    expect(time.parseInstant('2026-11-18T14:30:05+0100', { lenient: true })).toBe(t)
    expect(time.parseInstant('2026-11-18T14:30:05+01', { lenient: true })).toBe(t)
    expect(time.parseInstant('2026-11-18T13:30Z', { lenient: true })).toBe(Date.UTC(2026, 10, 18, 13, 30))
    expect(time.parseInstant('2026-11-18T13:30:05.5Z', { lenient: true })).toBe(t + 500)
    expect(time.parseInstant('2026-11-18T13:30:05', { lenient: true })).toBeNull()
    expect(time.parseInstant('garbage', { lenient: true })).toBeNull()
  })

  it('Date objects come in through fromDate', () => {
    expect(time.fromDate(new Date(Date.UTC(2026, 10, 18, 13, 30)), 'Europe/Prague')).toBe('2026-11-18T14:30')
  })
})

describe('calendar truth for relative questions', () => {
  const PRAGUE = 'Europe/Prague'

  it('isSame on Instants by a calendar unit needs a zone, and says so', () => {
    const a = Date.UTC(2026, 10, 18, 22, 30)
    const b = Date.UTC(2026, 10, 18, 23, 30)

    expect(() => time.isSame(a, b, 'day')).toThrow(/\[Pyreon\] isSame: comparing Instants by "day" needs a time zone.*\{ zone/)
    expect(time.isSame(a, b, 'day', { zone: PRAGUE })).toBe(false) // 23:30 and 00:30 local
    expect(time.isSame(a, b, 'day', { zone: 'UTC' })).toBe(true)
    expect(time.isSame(a, b, 'day', { zone: 'Asia/Kathmandu' })).toBe(true) // 04:15 and 05:15 local
    expect(time.isSame(a, b, 'hour', { zone: 'Asia/Kathmandu' })).toBe(false)
    expect(time.isSame(a, a + 1, 'minute')).toBe(true) // no zone needed below the hour
    expect(time.isSame(a, a + 60_000, 'minute')).toBe(false)
  })

  it('on the 23-hour and 25-hour days of a DST change, "same day" is the calendar day', () => {
    const springStart = Date.UTC(2026, 2, 28, 23, 0) // 00:00 on 2026-03-29, a 23-hour day
    const springEnd = Date.UTC(2026, 2, 29, 22, 0) - 1 // 23:59:59.999 the same local day
    const fallStart = Date.UTC(2026, 9, 24, 22, 0) // 00:00 on 2026-10-25, a 25-hour day
    const fallEnd = Date.UTC(2026, 9, 25, 23, 0) - 1

    expect(springEnd - springStart + 1).toBe(23 * 3_600_000)
    expect(fallEnd - fallStart + 1).toBe(25 * 3_600_000)
    for (const [start, end] of [[springStart, springEnd], [fallStart, fallEnd]] as [number, number][]) {
      expect(time.isSame(start, end, 'day', { zone: PRAGUE })).toBe(true)
      expect(time.isSame(start - 1, start, 'day', { zone: PRAGUE })).toBe(false)
      expect(time.isSame(end, end + 1, 'day', { zone: PRAGUE })).toBe(false)
    }
  })

  it('isToday, isYesterday, isTomorrow and daysFromToday read calendar days in the zone', () => {
    const now = Date.UTC(2026, 10, 18, 12, 0) // 13:00 in Prague on 2026-11-18
    const localMidnight = Date.UTC(2026, 10, 17, 23, 0) // 00:00 on 2026-11-18 in Prague

    expect(time.isToday(localMidnight, PRAGUE, now)).toBe(true)
    expect(time.isToday(localMidnight - 1, PRAGUE, now)).toBe(false)
    expect(time.isYesterday(localMidnight - 1, PRAGUE, now)).toBe(true)
    expect(time.isTomorrow(localMidnight + 24 * 3_600_000, PRAGUE, now)).toBe(true)
    expect(time.isToday(localMidnight, 'UTC', now)).toBe(false) // 23:00 UTC the day before
    expect(time.isYesterday(localMidnight, 'UTC', now)).toBe(true)
    expect(time.isToday('2026-11-18', PRAGUE, now)).toBe(true)
    expect(time.isTomorrow('2026-11-19T00:00', PRAGUE, now)).toBe(true)
    expect(time.daysFromToday('2026-12-18', PRAGUE, now)).toBe(30)
    // On the 23-hour day, "tomorrow" is still the next calendar day, not 24 hours later.
    const springNoon = Date.UTC(2026, 2, 29, 10, 0) // 12:00 CEST on the 23-hour day
    expect(time.isTomorrow(Date.UTC(2026, 2, 30, 0, 30), PRAGUE, springNoon)).toBe(true) // 02:30 CEST the next day
    expect(time.isToday(Date.UTC(2026, 2, 29, 22, 30), PRAGUE, springNoon)).toBe(false) // 00:30 next day, only 12.5 h away
    // The reactive entry reads the pinned clock.
    setClock(() => now)
    expect(time.isToday('2026-11-18', PRAGUE)).toBe(true)
    setClock(null)
  })
})
