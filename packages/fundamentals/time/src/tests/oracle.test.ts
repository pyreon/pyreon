/// <reference lib="esnext.temporal" />
/**
 * Differential tests against the platform's `Temporal`, the correctness oracle for every arithmetic, comparison, week,
 * grid and zone function. `Temporal` exists in Node 26 and Bun 1.4, not in the Node 24 that most CI jobs run; the
 * `test:oracle` script runs this file under Bun with PYREON_REQUIRE_TEMPORAL=1, which turns a missing Temporal into a failure
 * instead of a silent skip. Cases are seeded (mulberry32), so a failure reproduces.
 */
import {
  add,
  addInstant,
  between,
  clamp,
  compare,
  dateParts,
  dayOfWeek,
  dayOfYear,
  daysInMonth,
  diff,
  eachDay,
  endOf,
  isLeapYear,
  isPlainDate,
  isPlainDateTime,
  isPlainTime,
  isPlainYearMonth,
  isSame,
  isTimeZone,
  max,
  min,
  monthGrid,
  offsetAt,
  parseInstant,
  startOf,
  subtract,
  timeParts,
  toInstant,
  toPlainDate,
  toPlainDateTime,
  toPlainTime,
  weekOfYear,
  yearOfWeek,
} from '../core'
import type { Disambiguation, Unit, Weekday } from '../core'
import * as gen from './rng'
import { int, pick, rng } from './rng'

const HAS_TEMPORAL = typeof (globalThis as { Temporal?: unknown }).Temporal === 'object'
const N = 4000

if (process.env.PYREON_REQUIRE_TEMPORAL === '1') {
  it('Temporal is available (PYREON_REQUIRE_TEMPORAL=1 forbids skipping the oracle)', () => {
    expect(HAS_TEMPORAL).toBe(true)
  })
}

const ZONES = [
  'UTC',
  'Europe/Prague',
  'America/New_York',
  'America/St_Johns',
  'Asia/Kathmandu',
  'Australia/Lord_Howe',
  'Pacific/Apia',
  'Africa/Casablanca',
  'Asia/Tokyo',
  'America/Sao_Paulo',
  'Europe/Dublin',
  'Pacific/Chatham',
] as const

const DISAMBIGUATIONS: readonly Disambiguation[] = ['compatible', 'earlier', 'later', 'reject']
const DATE_UNITS: readonly Unit[] = ['year', 'month', 'week', 'day']
const ALL_UNITS: readonly Unit[] = [...DATE_UNITS, 'hour', 'minute', 'second', 'millisecond']
const TIME_UNITS: readonly Unit[] = ['hour', 'minute', 'second', 'millisecond']

const plural = (u: Unit): 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds' =>
  (u + 's') as 'years'

/** Run `fn`, returning the thrown error instead of throwing. */
function attempt<T>(fn: () => T): { value: T } | { error: unknown } {
  try {
    return { value: fn() }
  } catch (error) {
    return { error }
  }
}

const inRange = (y: number): boolean => y >= 1 && y <= 9999

describe.skipIf(!HAS_TEMPORAL)('oracle: Temporal', () => {
  describe('arithmetic', () => {
    it('add / subtract on PlainDate match Temporal.PlainDate', () => {
      const r = rng(1)

      for (let i = 0; i < N; i++) {
        const d = gen.date(r)
        const dur = gen.dateDuration(r)
        const sub = r() < 0.5
        const expected = attempt(() => {
          const t = Temporal.PlainDate.from(d)

          return (sub ? t.subtract(dur) : t.add(dur)).toString()
        })
        const actual = attempt(() => (sub ? subtract(d as '2026-01-01', dur) : add(d as '2026-01-01', dur)))

        if ('value' in expected && inRange(Number(expected.value.slice(0, 4))) && !expected.value.startsWith('-') && expected.value.length === 10) {
          expect(actual, `${sub ? 'subtract' : 'add'} ${d} ${JSON.stringify(dur)}`).toEqual({ value: expected.value })
        } else {
          expect('error' in actual, `${d} ${JSON.stringify(dur)} is out of range, so it must throw`).toBe(true)
        }
      }
    })

    it('add / subtract on PlainDateTime match Temporal.PlainDateTime (all precisions)', () => {
      const r = rng(2)

      for (let i = 0; i < N; i++) {
        const s = gen.dateTime(r)
        const dur = gen.dateTimeDuration(r)
        const sub = r() < 0.5
        const expected = attempt(() => {
          const t = Temporal.PlainDateTime.from(s)

          return sub ? t.subtract(dur) : t.add(dur)
        })
        const actual = attempt(() => (sub ? subtract(s as '2026-01-01T10:00', dur) : add(s as '2026-01-01T10:00', dur)))

        if ('value' in expected && inRange(expected.value.year)) {
          expect('value' in actual, `${s} ${JSON.stringify(dur)}`).toBe(true)
          if ('value' in actual) {
            expect(Temporal.PlainDateTime.from(actual.value).equals(expected.value), `${s} ${sub ? '-' : '+'} ${JSON.stringify(dur)} gave ${actual.value}, Temporal ${expected.value}`).toBe(true)
          }
        } else {
          expect('error' in actual, `${s} ${JSON.stringify(dur)} is out of range`).toBe(true)
        }
      }
    })

    it('add on PlainYearMonth matches Temporal.PlainYearMonth', () => {
      const r = rng(3)

      for (let i = 0; i < N; i++) {
        const ym = gen.yearMonth(r)
        const dur = gen.yearMonthDuration(r)
        const expected = attempt(() => Temporal.PlainYearMonth.from(ym).add(dur))
        const actual = attempt(() => add(ym as '2026-01', dur))

        if ('value' in expected && inRange(expected.value.year)) expect(actual, `${ym} ${JSON.stringify(dur)}`).toEqual({ value: expected.value.toString() })
        else expect('error' in actual).toBe(true)
      }
    })

    it('startOf / endOf on PlainDate match Temporal for every unit and week start', () => {
      const r = rng(4)

      for (let i = 0; i < N; i++) {
        const d = gen.date(r)
        const unit = pick(r, DATE_UNITS)
        const ws = int(r, 1, 7) as Weekday
        const t = Temporal.PlainDate.from(d)
        const first = unit === 'year' ? t.with({ month: 1, day: 1 }) : unit === 'month' ? t.with({ day: 1 }) : unit === 'week' ? t.subtract({ days: (t.dayOfWeek - ws + 7) % 7 }) : t
        const last = unit === 'year' ? t.with({ month: 12, day: 31 }) : unit === 'month' ? t.with({ day: t.daysInMonth }) : unit === 'week' ? first.add({ days: 6 }) : t

        for (const [fn, want] of [[startOf, first], [endOf, last]] as const) {
          const out = attempt(() => fn(d as '2026-01-01', unit, { weekStart: ws }))

          if (inRange(want.year)) expect(out, `${fn.name} ${d} ${unit} ws${ws}`).toEqual({ value: want.toString() })
          else expect('error' in out).toBe(true)
        }
      }
    })

    it('startOf / endOf on PlainDateTime and PlainYearMonth match Temporal', () => {
      const r = rng(5)

      for (let i = 0; i < N; i++) {
        const s = gen.dateTime(r)
        const unit = pick(r, ALL_UNITS)
        const ws = int(r, 1, 7) as Weekday
        const t = Temporal.PlainDateTime.from(s)
        const startDate = unit === 'year' ? t.toPlainDate().with({ month: 1, day: 1 }) : unit === 'month' ? t.toPlainDate().with({ day: 1 }) : unit === 'week' ? t.toPlainDate().subtract({ days: (t.dayOfWeek - ws + 7) % 7 }) : t.toPlainDate()
        const dayUnit = DATE_UNITS.includes(unit)
        const first = dayUnit ? startDate.toPlainDateTime() : t.round({ smallestUnit: unit as 'hour', roundingMode: 'floor' })
        const next = first.add({ [plural(unit)]: 1 })
        const startOut = attempt(() => startOf(s as '2026-01-01T10:00', unit, { weekStart: ws }))

        if (inRange(first.year)) expect(Temporal.PlainDateTime.from((startOut as { value: string }).value).equals(first), `startOf ${s} ${unit} ws${ws}`).toBe(true)
        const endOut = attempt(() => endOf(s as '2026-01-01T10:00', unit, { weekStart: ws }))
        const wantEnd = next.subtract({ milliseconds: 1 })

        if (inRange(first.year) && inRange(wantEnd.year)) expect(Temporal.PlainDateTime.from((endOut as { value: string }).value).equals(wantEnd), `endOf ${s} ${unit} ws${ws}`).toBe(true)
      }

      for (let i = 0; i < 500; i++) {
        const ym = gen.yearMonth(r)
        const t = Temporal.PlainYearMonth.from(ym)

        expect(startOf(ym as '2026-01', 'year')).toBe(`${ym.slice(0, 4)}-01`)
        expect(endOf(ym as '2026-01', 'year')).toBe(`${ym.slice(0, 4)}-12`)
        expect(startOf(ym as '2026-01', 'month')).toBe(t.toString())
      }
    })
  })

  describe('diff and between', () => {
    it('diff on PlainDate matches PlainDate.until (trunc) in every unit', () => {
      const r = rng(6)

      for (let i = 0; i < N * 2; i++) {
        const a = r() < 0.3 ? gen.date(r) : '2024-02-29'
        const b = r() < 0.5 ? gen.date(r) : Temporal.PlainDate.from(a).add({ days: int(r, -800, 800) }).toString()
        const unit = pick(r, DATE_UNITS)

        if (b.length !== 10 || !isPlainDate(b)) continue
        const want = Temporal.PlainDate.from(a).until(b, { largestUnit: unit as 'year', smallestUnit: unit as 'year', roundingMode: 'trunc' })[plural(unit)]

        expect(diff(a as '2026-01-01', b as '2026-01-01', unit), `diff ${a} ${b} ${unit}`).toBe(want + 0)
      }
    })

    it('diff on PlainDateTime matches PlainDateTime.until (trunc) in every unit', () => {
      const r = rng(7)

      for (let i = 0; i < N * 2; i++) {
        const a = gen.dateTime(r)
        const b = r() < 0.4 ? gen.dateTime(r) : Temporal.PlainDateTime.from(a).add(r() < 0.5 ? { minutes: int(r, 0, 3_000_000), milliseconds: int(r, 0, 999) } : { minutes: int(r, -3_000_000, 0), milliseconds: int(r, -999, 0) }).toString()
        const unit = pick(r, ALL_UNITS)

        if (!isPlainDateTime(b) || b.startsWith('-')) continue
        const want = Temporal.PlainDateTime.from(a).until(b, { largestUnit: unit as 'year', smallestUnit: unit as 'year', roundingMode: 'trunc' })[plural(unit)]

        expect(diff(a as '2026-01-01T10:00', b as '2026-01-01T10:00', unit), `diff ${a} ${b} ${unit}`).toBe(want + 0)
      }
    })

    it('diff on PlainYearMonth and PlainTime matches Temporal', () => {
      const r = rng(8)

      for (let i = 0; i < 2000; i++) {
        const a = gen.yearMonth(r)
        const b = gen.yearMonth(r)
        const unit = pick(r, ['year', 'month'] as const)

        expect(diff(a as '2026-01', b as '2026-01', unit), `${a} ${b} ${unit}`).toBe(Temporal.PlainYearMonth.from(a).until(b, { largestUnit: unit, smallestUnit: unit, roundingMode: 'trunc' })[plural(unit)] + 0)
      }
      for (let i = 0; i < 2000; i++) {
        const a = gen.time(r)
        const b = gen.time(r)
        const unit = pick(r, TIME_UNITS)

        expect(diff(a as '10:00', b as '10:00', unit), `${a} ${b} ${unit}`).toBe(Temporal.PlainTime.from(a).until(b, { largestUnit: unit as 'hour', smallestUnit: unit as 'hour', roundingMode: 'trunc' })[plural(unit)] + 0)
      }
    })

    it('between matches until with largestUnit year, for dates and date-times', () => {
      const r = rng(9)

      for (let i = 0; i < N; i++) {
        const a = gen.date(r)
        const b = r() < 0.5 ? gen.date(r) : Temporal.PlainDate.from(a).add({ days: int(r, -1500, 1500) }).toString()

        if (!isPlainDate(b)) continue
        const want = Temporal.PlainDate.from(a).until(b, { largestUnit: 'year' })

        expect(between(a as '2026-01-01', b as '2026-01-01'), `${a} -> ${b}`).toEqual({ years: want.years + 0, months: want.months + 0, days: want.days + 0 })
      }
      for (let i = 0; i < N; i++) {
        const a = gen.dateTime(r)
        const b = r() < 0.5 ? gen.dateTime(r) : Temporal.PlainDateTime.from(a).add(r() < 0.5 ? { hours: int(r, 0, 90_000), milliseconds: int(r, 0, 999) } : { hours: int(r, -90_000, 0), milliseconds: int(r, -999, 0) }).toString()

        if (!isPlainDateTime(b)) continue
        const want = Temporal.PlainDateTime.from(a).until(b, { largestUnit: 'year' })

        expect(between(a as '2026-01-01T10:00', b as '2026-01-01T10:00'), `${a} -> ${b}`).toEqual({
          years: want.years + 0,
          months: want.months + 0,
          days: want.days + 0,
          hours: want.hours + 0,
          minutes: want.minutes + 0,
          seconds: want.seconds + 0,
          milliseconds: want.milliseconds + 0,
        })
      }
    })
  })

  describe('compare, week and calendar facts', () => {
    it('compare / isBefore / min / max / clamp / isSame agree with Temporal', () => {
      const r = rng(10)

      for (let i = 0; i < N; i++) {
        const a = gen.dateTime(r)
        const b = r() < 0.3 ? a.slice(0, 16) + ':00' : gen.dateTime(r)
        const want = Temporal.PlainDateTime.compare(a, b)

        expect(compare(a as '2026-01-01T10:00', b as '2026-01-01T10:00'), `${a} ${b}`).toBe(want)
        const da = gen.date(r)
        const db = gen.date(r)

        expect(compare(da as '2026-01-01', db as '2026-01-01')).toBe(Temporal.PlainDate.compare(da, db))
        expect(min(da as '2026-01-01', db as '2026-01-01')).toBe(Temporal.PlainDate.compare(da, db) <= 0 ? da : db)
        expect(max(da as '2026-01-01', db as '2026-01-01')).toBe(Temporal.PlainDate.compare(da, db) >= 0 ? da : db)
        const ta = gen.time(r)
        const tb = gen.time(r)

        expect(compare(ta as '10:00', tb as '10:00'), `${ta} ${tb}`).toBe(Temporal.PlainTime.compare(ta, tb))
      }
    })

    it('clamp and isSame (year, month, week, day) agree with Temporal', () => {
      const r = rng(11)

      for (let i = 0; i < N; i++) {
        const [x, lo, hi] = [gen.date(r), gen.date(r), gen.date(r)].sort() as [string, string, string]
        const v = gen.date(r)
        const want = Temporal.PlainDate.compare(v, lo) < 0 ? lo : Temporal.PlainDate.compare(v, hi) > 0 ? hi : v

        expect(clamp(v as '2026-01-01', lo as '2026-01-01', hi as '2026-01-01'), `${v} in ${lo}..${hi}`).toBe(want)
        void x
        const a = gen.date(r)
        const b = r() < 0.5 ? gen.date(r) : Temporal.PlainDate.from(a).add({ days: int(r, -20, 20) }).toString()

        if (!isPlainDate(b)) continue
        const ws = int(r, 1, 7) as Weekday
        const ta = Temporal.PlainDate.from(a)
        const tb = Temporal.PlainDate.from(b)
        const weekFirst = (t: Temporal.PlainDate): string => t.subtract({ days: (t.dayOfWeek - ws + 7) % 7 }).toString()

        expect(isSame(a as '2026-01-01', b as '2026-01-01', 'year')).toBe(ta.year === tb.year)
        expect(isSame(a as '2026-01-01', b as '2026-01-01', 'month')).toBe(ta.year === tb.year && ta.month === tb.month)
        expect(isSame(a as '2026-01-01', b as '2026-01-01', 'week', { weekStart: ws })).toBe(weekFirst(ta) === weekFirst(tb))
        expect(isSame(a as '2026-01-01', b as '2026-01-01', 'day')).toBe(a === b)
      }
    })

    it('dayOfWeek, dayOfYear, weekOfYear, yearOfWeek, daysInMonth, isLeapYear match Temporal', () => {
      const r = rng(12)

      for (let i = 0; i < N * 2; i++) {
        const d = gen.date(r)
        const t = Temporal.PlainDate.from(d)

        expect(dayOfWeek(d as '2026-01-01'), d).toBe(t.dayOfWeek)
        expect(dayOfYear(d as '2026-01-01'), d).toBe(t.dayOfYear)
        expect(weekOfYear(d as '2026-01-01'), d).toBe(t.weekOfYear)
        expect(yearOfWeek(d as '2026-01-01'), d).toBe(t.yearOfWeek)
        expect(daysInMonth(d as '2026-01-01')).toBe(t.daysInMonth)
        expect(daysInMonth(d.slice(0, 7) as '2026-01')).toBe(t.daysInMonth)
        expect(isLeapYear(d as '2026-01-01')).toBe(t.inLeapYear)
        expect(isLeapYear(t.year)).toBe(t.inLeapYear)
      }
    })

    it('every day of years around ISO week-53 years matches Temporal', () => {
      for (const y of [1976, 1981, 1992, 1998, 2004, 2009, 2015, 2020, 2026, 2032, 2037, 2043]) {
        for (let t = Temporal.PlainDate.from(`${y}-01-01`); t.year === y; t = t.add({ days: 1 })) {
          const s = t.toString() as '2026-01-01'

          expect([weekOfYear(s), yearOfWeek(s)], s).toEqual([t.weekOfYear, t.yearOfWeek])
        }
      }
    })

    it('timeParts and dateParts match Temporal', () => {
      const r = rng(13)

      for (let i = 0; i < 2000; i++) {
        const s = gen.dateTime(r)
        const t = Temporal.PlainDateTime.from(s)

        expect(dateParts(s as '2026-01-01T10:00')).toEqual({ year: t.year, month: t.month, day: t.day })
        expect(timeParts(s as '2026-01-01T10:00')).toEqual({ hour: t.hour, minute: t.minute, second: t.second, millisecond: t.millisecond })
      }
    })

    it('eachDay and monthGrid match Temporal', () => {
      const r = rng(14)

      for (let i = 0; i < 300; i++) {
        const a = gen.date(r)
        const len = int(r, -3, 70)
        const b = Temporal.PlainDate.from(a).add({ days: len }).toString()

        if (!isPlainDate(b)) continue
        const want: string[] = []

        for (let t = Temporal.PlainDate.from(a); Temporal.PlainDate.compare(t, b) <= 0; t = t.add({ days: 1 })) want.push(t.toString())
        expect(eachDay(a as '2026-01-01', b as '2026-01-01'), `${a}..${b}`).toEqual(want)
      }
      for (let i = 0; i < N / 2; i++) {
        const ym = gen.yearMonth(r)
        const ws = int(r, 1, 7) as Weekday
        const weeks = pick(r, ['auto', 6] as const)
        const first = Temporal.PlainYearMonth.from(ym).toPlainDate({ day: 1 })
        const lead = (first.dayOfWeek - ws + 7) % 7
        const rows = weeks === 6 ? 6 : Math.ceil((lead + first.daysInMonth) / 7)
        const start = first.subtract({ days: lead })

        if (!inRange(start.year) || !inRange(start.add({ days: rows * 7 - 1 }).year)) {
          expect(() => monthGrid(ym as '2026-01', { weekStart: ws, weeks })).toThrow(/\[Pyreon\]/)
          continue
        }
        const want = Array.from({ length: rows }, (_, row) => Array.from({ length: 7 }, (_, col) => start.add({ days: row * 7 + col }).toString()))

        expect(monthGrid(ym as '2026-01', { weekStart: ws, weeks }), `${ym} ws${ws} ${weeks}`).toEqual(want)
        expect(monthGrid(`${ym}-15` as '2026-01-15', { weekStart: ws, weeks })).toEqual(want)
      }
    })
  })

  describe('parsing and validation', () => {
    it('agrees with Temporal on what is a real calendar value inside our grammar', () => {
      const r = rng(15)
      const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/
      const YM_SHAPE = /^\d{4}-\d{2}$/
      const TIME_SHAPE = /^\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/
      const mutate = (s: string): string => {
        const i = int(r, 0, s.length - 1)
        const c = pick(r, ['0', '1', '2', '3', '9', '-', ':', 'T', '.', ' ', 'x', ''])

        return s.slice(0, i) + c + s.slice(i + 1)
      }

      for (let i = 0; i < N * 2; i++) {
        const d = r() < 0.5 ? gen.date(r) : mutate(gen.date(r))
        const ok = DATE_SHAPE.test(d) && attempt(() => Temporal.PlainDate.from(d)).constructor === Object && 'value' in attempt(() => Temporal.PlainDate.from(d)) && !d.startsWith('0000')

        expect(isPlainDate(d), d).toBe(ok)
        const ym = r() < 0.5 ? gen.yearMonth(r) : mutate(gen.yearMonth(r))

        expect(isPlainYearMonth(ym), ym).toBe(YM_SHAPE.test(ym) && 'value' in attempt(() => Temporal.PlainYearMonth.from(ym)) && !ym.startsWith('0000'))
        const t = r() < 0.5 ? gen.time(r) : mutate(gen.time(r))

        expect(isPlainTime(t), t).toBe(TIME_SHAPE.test(t) && 'value' in attempt(() => Temporal.PlainTime.from(t)))
        const dt = r() < 0.5 ? gen.dateTime(r) : mutate(gen.dateTime(r))
        const dtOk = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(dt) && 'value' in attempt(() => Temporal.PlainDateTime.from(dt)) && !dt.startsWith('0000')

        expect(isPlainDateTime(dt), dt).toBe(dtOk)
      }
    })

    it('parseInstant agrees with Temporal.Instant.from on valid strings and rejects what Temporal accepts only leniently', () => {
      const r = rng(16)

      for (let i = 0; i < N; i++) {
        const base = gen.dateTime(r).slice(0, 16) + `:${String(int(r, 0, 59)).padStart(2, '0')}`
        const frac = pick(r, ['', '.5', '.25', '.250', '.123456789', '.9999'])
        const off = pick(r, ['Z', '+01:00', '-05:30', '+05:45', '-00:00', '+14:00', '-12:00'])
        const text = base + frac + off
        const want = attempt(() => Temporal.Instant.from(text).epochMilliseconds)

        if ('value' in want) expect(parseInstant(text), text).toBe(want.value)
        else expect(parseInstant(text), text).toBeNull()
      }
      for (const bad of ['2026-11-18T14:30Z', '2026-11-18T14:30:05', '2026-11-18', '2026-11-18t14:30:05z', '2026-11-18 14:30:05Z', '2026-11-18T14:30:05+0100', '2026-11-18T14:30:05+01', '2026-11-18T24:00:00Z', '2026-02-30T10:00:00Z', '2026-11-18T14:30:05.Z', '+002026-11-18T14:30:05Z', '']) {
        expect(parseInstant(bad), bad).toBeNull()
      }
    })
  })

  describe('time zones', () => {
    const sampleInstants = (r: () => number, zone: string, n: number): number[] => {
      const out: number[] = []
      const base = Temporal.Instant.fromEpochMilliseconds(Date.UTC(1900, 0, 1)).toZonedDateTimeISO(zone)
      let t = base
      const transitions: number[] = []

      for (let k = 0; k < 400; k++) {
        const next = t.getTimeZoneTransition('next')

        if (next === null || next.year > 2100) break
        transitions.push(next.epochMilliseconds)
        t = next
      }
      for (let i = 0; i < n; i++) {
        if (transitions.length > 0 && r() < 0.6) out.push(pick(r, transitions) + int(r, -7_200_000, 7_200_000) + (r() < 0.2 ? int(r, -3 * 86_400_000, 3 * 86_400_000) : 0))
        else out.push(r() < 0.7 ? int(r, Date.UTC(1900, 0, 1), Date.UTC(2100, 0, 1)) : int(r, -62_135_596_800_000 + 1e9, 253_402_300_799_999 - 1e9))
      }

      return out
    }

    it.each(ZONES)('toPlainDateTime / toPlainDate / toPlainTime / offsetAt match ZonedDateTime in %s', (zone) => {
      const r = rng(17 + zone.length)

      for (const t of sampleInstants(r, zone, 1500)) {
        const z = Temporal.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(zone)

        expect(Temporal.PlainDateTime.from(toPlainDateTime(t, zone)).equals(z.toPlainDateTime()), `${zone} ${t}: ${toPlainDateTime(t, zone)} vs ${z.toPlainDateTime().toString()}`).toBe(true)
        expect(toPlainDate(t, zone)).toBe(z.toPlainDate().toString())
        expect(Temporal.PlainTime.from(toPlainTime(t, zone)).equals(z.toPlainTime())).toBe(true)
        expect(offsetAt(t, zone) * 60_000, `${zone} ${t}`).toBeCloseTo(z.offsetNanoseconds / 1e6, 6)
      }
    })

    it.each(ZONES)('toInstant matches toZonedDateTime for all four disambiguation modes in %s', (zone) => {
      const r = rng(31 + zone.length)
      let gaps = 0
      let overlaps = 0

      for (const t of sampleInstants(r, zone, 1200)) {
        const wall = Temporal.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(zone).toPlainDateTime().add({ minutes: int(r, -150, 150) })
        const text = wall.toString() as '2026-01-01T10:00'
        const mode = pick(r, DISAMBIGUATIONS)

        if (!inRange(wall.year)) continue
        const want = attempt(() => wall.toZonedDateTime(zone, { disambiguation: mode }).epochMilliseconds)
        const got = attempt(() => toInstant(text, zone, { disambiguation: mode }))

        if ('error' in want) {
          expect('error' in got, `${zone} ${text} ${mode}: Temporal rejects, so must we`).toBe(true)
          if (wall.toZonedDateTime(zone, { disambiguation: 'earlier' }).epochMilliseconds === wall.toZonedDateTime(zone, { disambiguation: 'later' }).epochMilliseconds) continue
        } else {
          expect(got, `${zone} ${text} ${mode}`).toEqual({ value: want.value })
        }
        const e = wall.toZonedDateTime(zone, { disambiguation: 'earlier' }).epochMilliseconds
        const l = wall.toZonedDateTime(zone, { disambiguation: 'later' }).epochMilliseconds

        if (e !== l) {
          if (Temporal.PlainDateTime.compare(wall.toZonedDateTime(zone, { disambiguation: 'earlier' }).toPlainDateTime(), wall) === 0) overlaps++
          else gaps++
        }
      }
      if (zone !== 'UTC' && zone !== 'Asia/Tokyo') expect(gaps + overlaps, `${zone} exercised gaps/overlaps`).toBeGreaterThan(20)
    })

    it('a PlainDate converts as its midnight (start of day), also across the Apia skipped day', () => {
      const r = rng(41)

      for (const zone of ZONES) {
        for (let i = 0; i < 400; i++) {
          const d = gen.date(r)

          if (Number(d.slice(0, 4)) < 1900 || Number(d.slice(0, 4)) > 2100) continue
          expect(toInstant(d as '2026-01-01', zone), `${zone} ${d}`).toBe(Temporal.PlainDate.from(d).toZonedDateTime(zone).epochMilliseconds)
        }
      }
      expect(toInstant('2011-12-30', 'Pacific/Apia')).toBe(Temporal.PlainDate.from('2011-12-30').toZonedDateTime('Pacific/Apia').epochMilliseconds)
    })

    it('addInstant matches ZonedDateTime.add for calendar and time units', () => {
      const r = rng(43)

      for (const zone of ZONES) {
        for (const t of sampleInstants(r, zone, 400)) {
          const dur = gen.dateTimeDuration(r)
          const want = attempt(() => Temporal.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(zone).add(dur).epochMilliseconds)
          const got = attempt(() => addInstant(t, dur, zone))

          if ('value' in want && Math.abs(want.value) < 2.4e14 && want.value > -6.2e13) expect(got, `${zone} ${t} + ${JSON.stringify(dur)}`).toEqual({ value: want.value })
        }
      }
    })

    it('diff of Instants in a zone matches ZonedDateTime.until (trunc)', () => {
      const r = rng(47)
      let checked = 0

      for (const zone of ZONES) {
        for (const t of sampleInstants(r, zone, 300)) {
          const u = t + int(r, -400 * 86_400_000, 400 * 86_400_000)
          const unit = pick(r, ALL_UNITS)
          const za = Temporal.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(zone)
          const zb = Temporal.Instant.fromEpochMilliseconds(u).toZonedDateTimeISO(zone)
          const want = za.until(zb, { largestUnit: unit as 'year', smallestUnit: unit as 'year', roundingMode: 'trunc' })[plural(unit)] + 0

          expect(diff(t, u, unit, { zone }), `${zone} ${t} ${u} ${unit}`).toBe(want)
          checked++
        }
      }
      expect(checked).toBeGreaterThan(3000)
    })

    it('isTimeZone agrees with Temporal on names the platform knows and rejects garbage', () => {
      for (const zone of [...ZONES, 'Etc/GMT+5', 'europe/prague', 'Asia/Kolkata']) expect(isTimeZone(zone), zone).toBe(true)
      for (const bad of ['', 'Mars/Olympus', 'Europe/Praha', 'not a zone', '12345', 'UTC+1x']) {
        expect(isTimeZone(bad), bad).toBe('value' in attempt(() => Temporal.Now.zonedDateTimeISO(bad)))
      }
      expect(isTimeZone(undefined)).toBe(false)
      expect(isTimeZone(5)).toBe(false)
    })
  })

  describe('exhaustive transitions: no double transition within two days', () => {
    it('no zone the platform lists changes offset twice within 48 hours (the resolver probes +-1 day, like Temporal)', () => {
      const zones = Intl.supportedValuesOf('timeZone')
      const close: string[] = []

      for (const zone of zones) {
        let t = Temporal.Instant.fromEpochMilliseconds(Date.UTC(1900, 0, 1)).toZonedDateTimeISO(zone)
        let prev = -Infinity

        for (let k = 0; k < 600; k++) {
          const next = t.getTimeZoneTransition('next')

          if (next === null || next.year > 2100) break
          if (next.epochMilliseconds - prev < 2 * 86_400_000) close.push(`${zone} ${next.toString()}`)
          prev = next.epochMilliseconds
          t = next
        }
      }
      expect(close).toEqual([])
    })
  })
})
