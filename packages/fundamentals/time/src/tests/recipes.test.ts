import { add, between, dayOfWeek, diff, eachDay, endOf, isToday, monthGrid, startOf, toInstant, toPlainDateTime, weekStartOf, dateParts, isSame, isPlainDate, parseISO, weekOfYear } from '../core'
import type { PlainDate } from '../core'
import { add as addBy, endOf as endOfBy, pipe, toPlainDate } from '../fp'

/** The docs' recipes and "Coming from" calls, run. The docs show these snippets with these outputs. */
describe('recipes', () => {
  it('a calendar month grid for a picker', () => {
    const grid = monthGrid('2026-11', { weekStart: weekStartOf('cs'), weeks: 6 })

    expect(grid).toHaveLength(6)
    expect(grid[0]![0]).toBe('2026-10-26')
    expect(grid[5]![6]).toBe('2026-12-06')
    expect(grid.flat().filter((d) => d.startsWith('2026-11'))).toHaveLength(30)
  })

  it('every weekday in a range', () => {
    const weekdays = eachDay('2026-11-16', '2026-11-24').filter((d) => dayOfWeek(d) <= 5)

    expect(weekdays).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'])
  })

  it('next business day by composition', () => {
    const skipWeekend = (d: PlainDate): PlainDate => add(d, { days: dayOfWeek(d) === 6 ? 2 : dayOfWeek(d) === 7 ? 1 : 0 })
    const nextBusinessDay = (d: PlainDate): PlainDate => skipWeekend(add(d, { days: 1 }))

    expect(nextBusinessDay('2026-11-20')).toBe('2026-11-23') // Friday -> Monday
    expect(nextBusinessDay('2026-11-18')).toBe('2026-11-19')
    expect(nextBusinessDay('2026-11-21')).toBe('2026-11-23')
  })

  it('age from a birthday', () => {
    const age = (birthday: PlainDate, on: PlainDate): number => diff(birthday, on, 'year')

    expect(age('1990-05-20', '2026-11-18')).toBe(36)
    expect(age('1990-11-19', '2026-11-18')).toBe(35) // birthday tomorrow
    expect(age('1990-11-18', '2026-11-18')).toBe(36)
  })

  it('countdown parts from two instants', () => {
    const now = Date.UTC(2026, 10, 18, 12, 0, 0)
    const target = Date.UTC(2026, 11, 25, 15, 30, 10)

    expect(between(toPlainDateTime(now, 'UTC'), toPlainDateTime(target, 'UTC'))).toEqual({ years: 0, months: 1, days: 7, hours: 3, minutes: 30, seconds: 10, milliseconds: 0 })
  })

  it('a meeting time between zones', () => {
    const meeting = toInstant('2026-11-18T10:00', 'America/New_York')

    expect(toPlainDateTime(meeting, 'Europe/Prague')).toBe('2026-11-18T16:00')
    expect(toPlainDateTime(meeting, 'Asia/Tokyo')).toBe('2026-11-19T00:00')
    expect(toPlainDateTime(meeting, 'Asia/Kathmandu')).toBe('2026-11-18T20:45')
  })

  it('grouping records by local day', () => {
    const records = [{ at: Date.UTC(2026, 10, 18, 22, 30) }, { at: Date.UTC(2026, 10, 18, 23, 30) }, { at: Date.UTC(2026, 10, 19, 5, 0) }]
    const byDay = new Map<PlainDate, number>()
    const dayKey = toPlainDate('Europe/Prague')

    for (const r of records) byDay.set(dayKey(r.at), (byDay.get(dayKey(r.at)) ?? 0) + 1)
    expect([...byDay]).toEqual([['2026-11-18', 1], ['2026-11-19', 2]])
  })

  it('start and end of a fiscal quarter (year starts in April)', () => {
    const fiscalQuarterStart = (d: PlainDate): PlainDate => {
      const monthIndex = (dateParts(d).month - 4 + 12) % 12

      return startOf(add(d, { months: -(monthIndex % 3) }), 'month')
    }
    const fiscalQuarterEnd = pipe(fiscalQuarterStart, addBy({ months: 2 }), endOfBy('month'))

    expect(fiscalQuarterStart('2026-11-18')).toBe('2026-10-01')
    expect(fiscalQuarterEnd('2026-11-18')).toBe('2026-12-31')
    expect(fiscalQuarterStart('2026-05-31')).toBe('2026-04-01')
    expect(fiscalQuarterEnd('2026-05-31')).toBe('2026-06-30')
    expect(fiscalQuarterStart('2026-02-10')).toBe('2026-01-01')
  })
})

describe('coming from', () => {
  const NOW = Date.UTC(2026, 10, 18, 12)

  it.each([
    ['date-fns addDays(d, 1)', () => add('2026-11-18', { days: 1 }), '2026-11-19'],
    ['date-fns addMonths(d, 1)', () => add('2026-01-31', { months: 1 }), '2026-02-28'],
    ['date-fns differenceInCalendarDays(b, a)', () => diff('2026-11-18', '2026-12-24', 'day'), 36],
    ['date-fns startOfWeek(d, { weekStartsOn: 1 })', () => startOf('2026-11-18', 'week'), '2026-11-16'],
    ['date-fns endOfMonth(d)', () => endOf('2026-11-18', 'month'), '2026-11-30'],
    ['date-fns eachDayOfInterval', () => eachDay('2026-11-18', '2026-11-20'), ['2026-11-18', '2026-11-19', '2026-11-20']],
    ['date-fns getISOWeek(d)', () => weekOfYear('2027-01-01'), 53],
    ['date-fns isSameDay(a, b)', () => isSame('2026-11-18T01:00', '2026-11-18T23:00', 'day'), true],
    ['date-fns isValid(parseISO(s))', () => isPlainDate('2026-02-30'), false],
    ['date-fns parseISO("2026-11-18 14:30")', () => parseISO('2026-11-18 14:30'), '2026-11-18T14:30'],
    ['Day.js dayjs(d).add(1, "month")', () => add('2026-01-31', { months: 1 }), '2026-02-28'],
    ['Day.js dayjs(b).diff(a, "day")', () => diff('2026-11-18', '2026-12-24', 'day'), 36],
    ['Day.js dayjs(d).startOf("week") (Sunday first)', () => startOf('2026-11-18', 'week', { weekStart: 7 }), '2026-11-15'],
    ['Day.js dayjs(d).startOf("isoWeek")', () => startOf('2026-11-18', 'week'), '2026-11-16'],
    ['Day.js dayjs(t).tz("Europe/Prague")', () => toPlainDateTime(NOW, 'Europe/Prague'), '2026-11-18T13:00'],
    ['Day.js dayjs.tz(s, zone).valueOf()', () => toInstant('2026-11-18T13:00', 'Europe/Prague'), NOW],
    ['Luxon DateTime.fromISO(s).plus({ days: 1 })', () => add('2026-11-18', { days: 1 }), '2026-11-19'],
    ['Luxon b.diff(a, "days").days', () => diff('2026-11-18', '2026-12-24', 'day'), 36],
    ['Luxon DateTime.fromMillis(t, { zone })', () => toPlainDateTime(NOW, 'Asia/Tokyo'), '2026-11-18T21:00'],
    ['Luxon DateTime.fromISO(s, { zone }).toMillis()', () => toInstant('2026-11-18T21:00', 'Asia/Tokyo'), NOW],
    ['Moment moment(s).add(1, "months")', () => add('2026-01-31', { months: 1 }), '2026-02-28'],
    ['Moment moment(b).diff(a, "days")', () => diff('2026-11-18', '2026-12-24', 'day'), 36],
    ['Moment moment(d).startOf("isoWeek")', () => startOf('2026-11-18', 'week'), '2026-11-16'],
    ['Moment moment().isSame(d, "day")', () => isToday('2026-11-18', 'Europe/Prague', NOW), true],
    ['Temporal PlainDate.from(s).add({ days: 1 }).toString()', () => add('2026-11-18', { days: 1 }), '2026-11-19'],
    ['Temporal a.until(b, { largestUnit: "day" }).days', () => diff('2026-11-18', '2026-12-24', 'day'), 36],
    ['Temporal a.until(b, { largestUnit: "year" })', () => between('2020-01-01', '2026-11-18'), { years: 6, months: 10, days: 17 }],
    ['Temporal PlainDate.from(s).dayOfWeek', () => dayOfWeek('2026-11-18'), 3],
    ['Temporal plain.toZonedDateTime(zone).epochMilliseconds', () => toInstant('2026-11-18T13:00', 'Europe/Prague'), NOW],
    ['Temporal Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(z).toPlainDateTime()', () => toPlainDateTime(NOW, 'Europe/Prague'), '2026-11-18T13:00'],
  ] as const)('%s', (_name, ours, expected) => {
    expect(ours()).toEqual(expected)
  })
})
