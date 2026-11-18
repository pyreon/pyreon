import * as core from '../core'
import type { Duration, Instant, PlainDate, PlainDateTime, Unit, Weekday } from '../core'
import * as fp from '../fp'
import { inZone } from '../core'
import * as gen from './rng'
import { int, pick, rng } from './rng'

const ALL_UNITS: readonly Unit[] = ['year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond']
const DATE_UNITS: readonly Unit[] = ['year', 'month', 'week', 'day']
const D = (s: string): PlainDate => s as PlainDate
const DT = (s: string): PlainDateTime => s as PlainDateTime

describe('fp forms equal the value-first forms on seeded random cases', () => {
  it('add, subtract, startOf, endOf on dates and date-times', () => {
    const r = rng(201)

    for (let i = 0; i < 3000; i++) {
      const d = gen.date(r)
      const dur: Duration = gen.dateDuration(r)
      const unit = pick(r, DATE_UNITS)
      const ws = int(r, 1, 7) as Weekday
      const same = <T>(f: () => T, g: () => T): void => {
        const a = (() => { try { return { v: f() } } catch (e) { return { e: String(e) } } })()
        const b = (() => { try { return { v: g() } } catch (e) { return { e: String(e) } } })()

        expect(a).toEqual(b)
      }

      same(() => fp.add(dur)(D(d)), () => core.add(D(d), dur))
      same(() => fp.subtract(dur)(D(d)), () => core.subtract(D(d), dur))
      same(() => fp.startOf(unit, { weekStart: ws })(D(d)), () => core.startOf(D(d), unit, { weekStart: ws }))
      same(() => fp.endOf(unit, { weekStart: ws })(D(d)), () => core.endOf(D(d), unit, { weekStart: ws }))
      const dt = gen.dateTime(r)
      const du = pick(r, ALL_UNITS)

      same(() => fp.add(gen.dateTimeDuration(rng(i)))(DT(dt)), () => core.add(DT(dt), gen.dateTimeDuration(rng(i))))
      same(() => fp.startOf(du)(DT(dt)), () => core.startOf(DT(dt), du))
      same(() => fp.endOf(du)(DT(dt)), () => core.endOf(DT(dt), du))
    }
  })

  it('predicates, ranges, clamp, diffFrom, betweenFrom and by', () => {
    const r = rng(202)

    for (let i = 0; i < 3000; i++) {
      const a = D(gen.date(r))
      const b = D(gen.date(r))
      const c = D(gen.date(r))
      const [lo, hi] = [b, c].sort() as [PlainDate, PlainDate]
      const unit = pick(r, DATE_UNITS)

      expect(fp.isBefore(b)(a)).toBe(core.isBefore(a, b))
      expect(fp.isAfter(b)(a)).toBe(core.isAfter(a, b))
      expect(fp.isSame(b, unit)(a)).toBe(core.isSame(a, b, unit))
      expect(fp.isBetween(lo, hi)(a)).toBe(core.compare(a, lo) >= 0 && core.compare(a, hi) <= 0)
      expect(fp.clamp(lo, hi)(a)).toBe(core.clamp(a, lo, hi))
      expect(fp.diffFrom(a, unit)(b)).toBe(core.diff(a, b, unit))
      expect(fp.betweenFrom(a)(b)).toEqual(core.between(a, b))
    }
    const byYear = fp.by((s: string) => D(s))

    expect(['2026-03-01', '2024-01-01', '2025-02-02'].sort(byYear)).toEqual(['2024-01-01', '2025-02-02', '2026-03-01'])
    expect(() => fp.clamp(D('2026-02-01'), D('2026-01-01'))).toThrow(/lower bound is after/)
  })

  it('zone functions, grids and Date interop', () => {
    const r = rng(203)

    for (const zone of ['Europe/Prague', 'America/St_Johns', 'Asia/Kathmandu', 'UTC']) {
      for (let i = 0; i < 400; i++) {
        const t: Instant = int(r, Date.UTC(1990, 0, 1), Date.UTC(2040, 0, 1))
        const w = core.toPlainDateTime(t, zone)

        expect(fp.toPlainDateTime(zone)(t)).toBe(w)
        expect(fp.toPlainDate(zone)(t)).toBe(core.toPlainDate(t, zone))
        expect(fp.toPlainTime(zone)(t)).toBe(core.toPlainTime(t, zone))
        expect(fp.offsetAt(zone)(t)).toBe(core.offsetAt(t, zone))
        expect(fp.toInstant(zone, { disambiguation: 'later' })(w)).toBe(core.toInstant(w, zone, { disambiguation: 'later' }))
        expect(fp.addInstant({ days: 3, hours: 0 }, zone)(t)).toBe(core.addInstant(t, { days: 3, hours: 0 }, zone))
        expect(fp.fromDate(zone)(new Date(t))).toBe(core.fromDate(new Date(t), zone))
        expect(fp.toDate(zone)(w).getTime()).toBe(core.toDate(w, zone).getTime())
      }
    }
    expect(fp.monthGrid({ weekStart: 7, weeks: 6 })('2026-11')).toEqual(core.monthGrid('2026-11', { weekStart: 7, weeks: 6 }))
    expect(fp.compare).toBe(core.compare)
    expect(fp.weekOfYear).toBe(core.weekOfYear)
  })
})

describe('pipe', () => {
  it('composes left to right for every length from one to eight', () => {
    const inc = (n: number): number => n + 1
    const dbl = (n: number): number => n * 2

    expect(fp.pipe(inc)(1)).toBe(2)
    expect(fp.pipe(inc, dbl)(1)).toBe(4)
    expect(fp.pipe(inc, dbl, inc)(1)).toBe(5)
    expect(fp.pipe(inc, dbl, inc, dbl)(1)).toBe(10)
    expect(fp.pipe(inc, inc, inc, inc, inc, inc, inc, inc)(0)).toBe(8)
    expect(fp.pipe(inc, (n) => `${n}`)(1)).toBe('2')
  })

  it('the documented building blocks print what the docs claim', () => {
    const nextMonthStart = fp.pipe(fp.add({ months: 1 }), fp.startOf('month'))
    const startOfNextWeek = fp.pipe(fp.add({ weeks: 1 }), fp.startOf('week'))
    const endOfQuarter = (d: PlainDate): PlainDate => {
      const month = core.dateParts(d).month

      return core.endOf(core.add(core.startOf(d, 'year'), { months: Math.ceil(month / 3) * 3 - 1 }), 'month')
    }
    const sameDayNextMonth = fp.add({ months: 1 })

    expect((['2026-01-31', '2026-11-18'] as PlainDate[]).map(nextMonthStart)).toEqual(['2026-02-01', '2026-12-01'])
    expect(startOfNextWeek(D('2026-11-18'))).toBe('2026-11-23')
    expect(endOfQuarter(D('2026-11-18'))).toBe('2026-12-31')
    expect(endOfQuarter(D('2026-02-10'))).toBe('2026-03-31')
    expect(sameDayNextMonth(D('2026-01-31'))).toBe('2026-02-28')
    const inRange = (['2026-01-05', '2026-02-10', '2026-03-20'] as PlainDate[]).filter(fp.isBetween('2026-02-01', '2026-03-01'))

    expect(inRange).toEqual(['2026-02-10'])
    const instants = [Date.UTC(2026, 10, 18, 22, 30), Date.UTC(2026, 10, 18, 23, 30), Date.UTC(2026, 10, 19, 5, 0)]
    const byDay: Record<string, number> = {}

    for (const t of instants) {
      const key = fp.pipe(fp.toPlainDate('Europe/Prague'))(t)

      byDay[key] = (byDay[key] ?? 0) + 1
    }
    expect(byDay).toEqual({ '2026-11-18': 1, '2026-11-19': 2 })
  })
})

describe('inZone', () => {
  it('binds the zone once and agrees with the unbound functions', () => {
    const z = inZone('Europe/Prague')
    const t = Date.UTC(2026, 2, 29, 1, 30)

    expect(z.zone).toBe('Europe/Prague')
    expect(z.toPlainDateTime(t)).toBe(core.toPlainDateTime(t, 'Europe/Prague'))
    expect(z.toPlainDate(t)).toBe('2026-03-29')
    expect(z.toPlainTime(t)).toBe('03:30')
    expect(z.offsetAt(t)).toBe(120)
    expect(z.toInstant('2026-03-29T02:30')).toBe(t)
    expect(z.toInstant('2026-03-29T02:30', { disambiguation: 'earlier' })).toBe(t - 3_600_000)
    expect(z.addInstant(Date.UTC(2026, 2, 28, 11, 0), { days: 1 })).toBe(Date.UTC(2026, 2, 29, 10, 0))
    expect(z.startOfDay(t)).toBe(Date.UTC(2026, 2, 28, 23, 0))
    expect(z.endOfDay(t)).toBe(Date.UTC(2026, 2, 29, 22, 0) - 1)
    expect(z.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(inZone('UTC').startOfDay(Date.UTC(2026, 0, 5, 13))).toBe(Date.UTC(2026, 0, 5))
    expect(() => inZone('Mars/Olympus')).toThrow(/\[Pyreon\] inZone: unknown time zone/)
  })
})
