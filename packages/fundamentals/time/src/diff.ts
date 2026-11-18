import { shiftMonths } from './arith'
import { civilFromDays, daysFromCivil, daysIn, MS_PER_DAY } from './civil'
import { D, loadDuration, MO, unitMs, unitSlot, W, Y } from './duration'
import { badRange, badValue } from './errors'
import {
  packedYearMonth,
  parseDateAt,
  parseDateDay,
  parseTimeAt,
  parseWall,
  SHAPE_DATE,
  SHAPE_DT,
  SHAPE_TIME,
  SHAPE_YM,
  shapeOf,
} from './text'
import type { Comparable, Duration, PlainDate, PlainDateTime, TimeZone, Unit } from './types'
import { offsetMsAt } from './zone'

/**
 * Options of `diff`: `zone`, needed to diff two Instants in years, months, weeks or days.
 *
 * @example const options: DiffOptions = { zone: 'Europe/Prague' }
 */
export interface DiffOptions {
  /** Needed to diff two Instants in years, months, weeks or days (a calendar day depends on the zone). */
  zone?: TimeZone
}

const SHAPE_INSTANT = 9

function shapeOfAny(fn: string, v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? SHAPE_INSTANT : badValue(fn, 'a finite Instant', v)

  return typeof v === 'string' ? shapeOf(v) : badValue(fn, 'a PlainDate, PlainDateTime, PlainYearMonth, PlainTime or Instant', v)
}

/**
 * Whole months from civil date A (with time-of-day `ta`) to B, as Temporal counts them: A is moved forward by that many
 * months with the day clamped to the target month, and the count stops at the last move that does not pass B.
 * 2026-01-31 to 2026-02-28 is 1 month (Jan 31 plus one month clamps to Feb 28), and 2024-02-29 to 2035-02-28 is 11 years:
 * `diff` returns the largest n with `add(a, { months: n }) <= b`. With `clampDay` false the day is NOT clamped (Jan 31 plus
 * one month is "Feb 31", which is past Feb 28), which is how Temporal builds the breakdown `between` returns:
 * 2012-08-31 to 2051-02-28 is 38 years, 5 months and 28 days there.
 */
function wholeMonths(pa: number, ta: number, pb: number, tb: number, clampDay = true): number {
  const total = (pb >> 9) * 12 + ((pb >> 5) & 15) - ((pa >> 9) * 12 + ((pa >> 5) & 15))

  if (total === 0) return 0
  const reached = clampDay ? Math.min(pa & 31, daysIn(pb >> 9, (pb >> 5) & 15)) : pa & 31
  const db = pb & 31

  if (total > 0 && (reached > db || (reached === db && ta > tb))) return total - 1
  if (total < 0 && (reached < db || (reached === db && ta < tb))) return total + 1

  return total
}

const trunc = (n: number): number => (n < 0 ? Math.ceil(n) : Math.floor(n)) + 0

function diffMonthsUnit(slot: number, months: number): number {
  return slot === Y ? trunc(months / 12) : months
}

function diffDates(fn: string, a: string, b: string, slot: number): number {
  const pa = shapeOf(a) === SHAPE_DATE ? parseDateAt(a) : -1
  const pb = shapeOf(b) === SHAPE_DATE ? parseDateAt(b) : -1

  if (pa < 0 || pb < 0) return badValue(fn, 'two PlainDates', pa < 0 ? a : b)
  if (slot <= MO) return diffMonthsUnit(slot, wholeMonths(pa, 0, pb, 0))
  if (slot > D) return badRange(fn, 'a PlainDate has no time of day. Use a PlainDateTime to diff in hours, minutes, seconds or milliseconds.')
  const days = daysFromCivil(pb >> 9, (pb >> 5) & 15, pb & 31) - daysFromCivil(pa >> 9, (pa >> 5) & 15, pa & 31)

  return trunc(slot === W ? days / 7 : days)
}

function diffYearMonths(fn: string, a: string, b: string, slot: number): number {
  if (slot > MO) return badRange(fn, 'a PlainYearMonth has only year and month units')
  const pa = packedYearMonth(fn, a)
  const pb = packedYearMonth(fn, b)
  const months = (pb >> 9) * 12 + ((pb >> 5) & 15) - ((pa >> 9) * 12 + ((pa >> 5) & 15))

  return diffMonthsUnit(slot, months)
}

/** Difference of two wall-clock values (milliseconds as if UTC) in `slot`, truncated toward zero. */
function diffWalls(wa: number, wb: number, slot: number): number {
  if (slot > W) return trunc((wb - wa) / unitMs(slot))
  if (slot === W) return trunc((wb - wa) / unitMs(W))
  const da = Math.floor(wa / MS_PER_DAY)
  const db = Math.floor(wb / MS_PER_DAY)
  const pa = civilFromDays(da)
  const pb = civilFromDays(db)

  return diffMonthsUnit(slot, wholeMonths(pa, wa - da * MS_PER_DAY, pb, wb - db * MS_PER_DAY))
}

function diffDateTimes(fn: string, a: string, b: string, slot: number): number {
  const wa = parseWall(a)
  const wb = parseWall(b)

  if (Number.isNaN(wa) || Number.isNaN(wb)) return badValue(fn, 'two PlainDateTimes', Number.isNaN(wa) ? a : b)

  return diffWalls(wa, wb, slot)
}

function diffTimes(fn: string, a: string, b: string, slot: number): number {
  const ta = parseTimeAt(a, 0)
  const tb = parseTimeAt(b, 0)

  if (ta < 0 || tb < 0) return badValue(fn, 'two PlainTimes', ta < 0 ? a : b)
  if (slot < 4) return badRange(fn, 'a PlainTime has only hour, minute, second and millisecond units')

  return trunc((tb - ta) / unitMs(slot))
}

function diffInstants(fn: string, a: number, b: number, slot: number, zone: TimeZone | undefined): number {
  if (slot > D) return trunc((b - a) / unitMs(slot))
  if (zone === undefined) {
    return badRange(fn, 'diffing Instants in years, months, weeks or days needs a time zone (a day is not always 24 hours): diff(a, b, "day", { zone: "Europe/Prague" })')
  }

  return diffWalls(Math.floor(a) + offsetMsAt(fn, zone, a), Math.floor(b) + offsetMsAt(fn, zone, b), slot)
}

/**
 * Whole `unit`s from `a` to `b`, truncated toward zero; the sign is the direction. Works on PlainDate, PlainDateTime,
 * PlainYearMonth, PlainTime and Instant (Instants need `options.zone` for year, month, week and day). A month counts as complete
 * when adding it (day clamped) does not pass `b`, as in Temporal's truncated `until`.
 *
 * @example diff('2026-11-18', '2026-12-24', 'day') // => 36
 * @example diff('2026-01-31', '2026-02-28', 'month') // => 1
 */
export function diff<T extends Comparable>(a: T, b: T, unit: Unit, options?: DiffOptions): number {
  const slot = unitSlot('diff', unit)
  const shape = shapeOfAny('diff', a)

  if (shapeOfAny('diff', b) !== shape) {
    return badValue('diff', 'two values of the same shape', b)
  }
  if (shape === SHAPE_INSTANT) return diffInstants('diff', a as number, b as number, slot, options?.zone)
  const x = a as string
  const y = b as string

  if (shape === SHAPE_DATE) return diffDates('diff', x, y, slot)
  if (shape === SHAPE_YM) return diffYearMonths('diff', x, y, slot)
  if (shape === SHAPE_DT) return diffDateTimes('diff', x, y, slot)

  return shape === SHAPE_TIME ? diffTimes('diff', x, y, slot) : badValue('diff', 'a PlainDate, PlainDateTime, PlainYearMonth, PlainTime or Instant', a)
}

/**
 * The span from `a` to `b` broken down from years to days (and hours to milliseconds for a PlainDateTime), as Temporal's
 * `until` with `largestUnit: 'year'`. All fields share the direction's sign.
 *
 * @example between('2026-01-31', '2026-03-01') // => { years: 0, months: 1, days: 1 }
 */
export function between(a: PlainDate | PlainDateTime, b: PlainDate | PlainDateTime): Duration {
  const shape = typeof a === 'string' ? shapeOf(a) : -1

  if (shape !== SHAPE_DATE && shape !== SHAPE_DT) return badValue('between', 'a PlainDate or PlainDateTime', a)
  if (typeof b !== 'string' || shapeOf(b) !== shape) return badValue('between', 'a value of the same shape as the first', b)
  const withTime = shape === SHAPE_DT
  const wa = withTime ? parseWall(a) : parseDateDay(a) * MS_PER_DAY
  const wb = withTime ? parseWall(b) : parseDateDay(b) * MS_PER_DAY

  if (Number.isNaN(wa) || Number.isNaN(wb)) return badValue('between', withTime ? 'two PlainDateTimes' : 'two PlainDates', Number.isNaN(wa) ? a : b)

  return breakDown(wa, wb, withTime)
}

function breakDown(wa: number, wb: number, withTime: boolean): Duration {
  const da = Math.floor(wa / MS_PER_DAY)
  const sign = wb < wa ? -1 : 1
  let db = Math.floor(wb / MS_PER_DAY)
  let tod = wb - db * MS_PER_DAY - (wa - da * MS_PER_DAY)

  // Temporal: when the time of day runs against the direction of travel, the last day is not complete. Count one day
  // less and carry a full day into the time (1918-08-31T08:11:42 to 1976-07-01T08:11 ends on 06-30 plus 23:59:18).
  if (tod * sign < 0) {
    db -= sign
    tod += sign * MS_PER_DAY
  }
  const pa = civilFromDays(da)
  const months = wholeMonths(pa, 0, civilFromDays(db), 0, false)
  const years = trunc(months / 12)

  loadDuration('between', { years, months: months - years * 12 }, 1)
  const mid = shiftMonths('between', pa)
  const days = db - daysFromCivil(mid >> 9, (mid >> 5) & 15, mid & 31)
  const result: Duration = { years, months: months - years * 12, days }

  if (!withTime) return result
  result.hours = trunc(tod / 3_600_000)
  result.minutes = trunc((tod % 3_600_000) / 60_000)
  result.seconds = trunc((tod % 60_000) / 1000)
  result.milliseconds = (tod % 1000) + 0

  return result
}
