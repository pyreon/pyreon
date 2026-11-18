import { daysFromCivil, daysIn, MS_PER_DAY, weekdayOf } from './civil'
import { D, dur, hasLoadedTime, loadDuration, loadedTimeMs, MO, unitMs, unitSlot, W, Y } from './duration'
import { ANY_HINT, badRange, badValue, show } from './errors'
import {
  checkDay,
  checkWall,
  levelOfLength,
  LEVEL_MS,
  packedYearMonth,
  parseDateAt,
  parseWall,
  SHAPE_DATE,
  SHAPE_DT,
  SHAPE_YM,
  shapeOf,
  writeDay,
  writeWall,
  writeYM,
  writeYMD,
} from './text'
import type { Duration, PlainDate, PlainDateTime, PlainValue, PlainYearMonth, ShapeOf, Unit, Weekday } from './types'

/**
 * Options for the functions that find a week. `weekStart` is an ISO weekday: 1 is Monday ... 7 is Sunday. Default 1.
 *
 * @example const options: WeekOptions = { weekStart: 7 }
 */
export interface WeekOptions {
  weekStart?: Weekday
}

export function weekStartOption(fn: string, options: WeekOptions | undefined): number {
  const ws = options?.weekStart ?? 1

  return Number.isInteger(ws) && ws >= 1 && ws <= 7 ? ws : badRange(fn, `weekStart must be 1 (Monday) to 7 (Sunday), got ${show(ws)}`)
}

/** Apply the loaded years and months to a packed civil date, clamping the day to the target month (Temporal's `constrain`). */
export function shiftMonths(fn: string, p: number): number {
  const months = dur[Y]! * 12 + dur[MO]!

  if (months === 0) return p
  const total = (p >> 9) * 12 + ((p >> 5) & 15) - 1 + months
  const year = Math.floor(total / 12)

  if (!(year >= 1 && year <= 9999)) return badRange(fn, 'the result falls outside the supported range 0001-01-01 ... 9999-12-31')
  const month = total - year * 12 + 1
  const day = Math.min(p & 31, daysIn(year, month))

  return (year << 9) | (month << 5) | day
}

/** Epoch day of a packed civil date moved by the loaded years, months, weeks and days. */
export function shiftDay(fn: string, p: number): number {
  const q = shiftMonths(fn, p)

  return checkDay(fn, daysFromCivil(q >> 9, (q >> 5) & 15, q & 31) + dur[W]! * 7 + dur[D]!)
}

function addDate(fn: string, value: string): PlainDate {
  const p = value.length === 10 ? parseDateAt(value) : -1

  if (p < 0) return badValue(fn, ANY_HINT, value)
  if (hasLoadedTime()) {
    return badRange(fn, 'a PlainDate has no time of day, so hours, minutes, seconds and milliseconds do not apply. Use a PlainDateTime.')
  }
  const q = shiftMonths(fn, p)

  const days = dur[W]! * 7 + dur[D]!

  if (days === 0) return q === p ? (value as PlainDate) : writeYMD(q >> 9, (q >> 5) & 15, q & 31)
  const inMonth = (q & 31) + days

  // The common case stays inside the month: no round trip through epoch days.
  if (inMonth >= 1 && inMonth <= daysIn(q >> 9, (q >> 5) & 15)) return writeYMD(q >> 9, (q >> 5) & 15, inMonth)

  return writeDay(checkDay(fn, daysFromCivil(q >> 9, (q >> 5) & 15, q & 31) + days))
}

function addDateTime(fn: string, value: string): PlainDateTime {
  const wall = parseWall(value)

  if (Number.isNaN(wall)) return badValue(fn, ANY_HINT, value)
  const p = parseDateAt(value)
  const tod = wall - Math.floor(wall / MS_PER_DAY) * MS_PER_DAY
  const result = shiftDay(fn, p) * MS_PER_DAY + tod + loadedTimeMs()

  return writeWall(checkWall(fn, result), levelOfLength(value.length - 11))
}

function addYearMonth(fn: string, value: string): PlainYearMonth {
  const p = packedYearMonth(fn, value)

  if (dur[W] !== 0 || dur[D] !== 0 || hasLoadedTime()) {
    return badRange(fn, 'a PlainYearMonth moves by years and months only. Convert to a PlainDate for weeks and days.')
  }
  const q = shiftMonths(fn, p | 1)

  return writeYM(q >> 9, (q >> 5) & 15)
}

function addImpl(fn: string, value: unknown, duration: Duration, sign: number): string {
  if (typeof value !== 'string') return badValue(fn, ANY_HINT, value)
  const shape = shapeOf(value)

  if (shape !== SHAPE_DATE && shape !== SHAPE_DT && shape !== SHAPE_YM) return badValue(fn, ANY_HINT, value)
  loadDuration(fn, duration, sign)
  if (shape === SHAPE_DATE) return addDate(fn, value)

  return shape === SHAPE_DT ? addDateTime(fn, value) : addYearMonth(fn, value)
}

/**
 * Add a duration to a PlainDate, PlainDateTime or PlainYearMonth; the result has the same shape. Years and months are
 * applied first and clamp the day to the target month (Temporal's `constrain`), then weeks, days and the time fields.
 * Fractions of weeks, days, hours, minutes and seconds balance down (`{ days: 1.5 }` is one day and twelve hours); years and
 * months must be whole. Months are 1-12 everywhere in this package.
 *
 * @example add('2026-01-31', { months: 1 }) // => '2026-02-28'
 * @example add('2026-11-18T10:00', { days: 1.5 }) // => '2026-11-19T22:00'
 */
export function add<T extends PlainValue>(value: T, duration: Duration): ShapeOf<T> {
  return addImpl('add', value, duration, 1) as ShapeOf<T>
}

/**
 * `add` with every field of `duration` negated.
 *
 * @example subtract('2026-03-31', { months: 1 }) // => '2026-02-28'
 * @example subtract('2026-11-18T00:00', { minutes: 1 }) // => '2026-11-17T23:59'
 */
export function subtract<T extends PlainValue>(value: T, duration: Duration): ShapeOf<T> {
  return addImpl('subtract', value, duration, -1) as ShapeOf<T>
}

// ---------------------------------------------------------------------------------------------------------------------
// startOf / endOf
// ---------------------------------------------------------------------------------------------------------------------

/** Epoch day of the first day of the period of `slot` (year, month or week) containing the packed date `p`. */
function periodStartDay(p: number, slot: number, weekStart: number): number {
  const z = daysFromCivil(p >> 9, (p >> 5) & 15, p & 31)

  if (slot === Y) return daysFromCivil(p >> 9, 1, 1)
  if (slot === MO) return z - (p & 31) + 1
  if (slot === W) return z - ((weekdayOf(z) - weekStart + 7) % 7)

  return z
}

/** Epoch day of the last day of the period of `slot` (year, month or week) containing the packed date `p`. */
function periodEndDay(p: number, slot: number, weekStart: number): number {
  const year = p >> 9
  const month = (p >> 5) & 15

  if (slot === Y) return daysFromCivil(year, 12, 31)
  if (slot === MO) return daysFromCivil(year, month, daysIn(year, month))
  if (slot === W) return periodStartDay(p, W, weekStart) + 6

  return daysFromCivil(year, month, p & 31)
}

function boundaryOfYearMonth(fn: string, value: string, slot: number, end: boolean): PlainYearMonth {
  const p = packedYearMonth(fn, value)

  if (slot === MO) return value as PlainYearMonth
  if (slot !== Y) return badRange(fn, 'a PlainYearMonth has only year and month units')

  return writeYM(p >> 9, end ? 12 : 1)
}

function boundaryOfDate(fn: string, value: string, slot: number, end: boolean, weekStart: number): PlainDate {
  const p = value.length === 10 ? parseDateAt(value) : -1

  if (p < 0) return badValue(fn, ANY_HINT, value)
  if (slot > D) return badRange(fn, 'a PlainDate has no time of day, so hour, minute, second and millisecond do not apply. Use a PlainDateTime.')
  if (slot === D) return value as PlainDate

  return writeDay(checkDay(fn, end ? periodEndDay(p, slot, weekStart) : periodStartDay(p, slot, weekStart)))
}

function boundaryOfDateTime(fn: string, value: string, slot: number, end: boolean, weekStart: number): PlainDateTime {
  const wall = parseWall(value)

  if (Number.isNaN(wall)) return badValue(fn, ANY_HINT, value)
  const level = levelOfLength(value.length - 11)

  if (slot <= D) {
    const p = parseDateAt(value)
    const day = checkDay(fn, end ? periodEndDay(p, slot, weekStart) : periodStartDay(p, slot, weekStart))

    return end ? writeWall(day * MS_PER_DAY + MS_PER_DAY - 1, LEVEL_MS) : writeWall(day * MS_PER_DAY, level)
  }
  const step = unitMs(slot)
  const start = Math.floor(wall / step) * step

  return end ? writeWall(start + step - 1, LEVEL_MS) : writeWall(start, level)
}

function boundary(fn: string, value: unknown, unit: Unit, options: WeekOptions | undefined, end: boolean): string {
  if (typeof value !== 'string') return badValue(fn, ANY_HINT, value)
  const slot = unitSlot(fn, unit)
  const weekStart = slot === W ? weekStartOption(fn, options) : 1
  const shape = shapeOf(value)

  if (shape === SHAPE_DATE) return boundaryOfDate(fn, value, slot, end, weekStart)
  if (shape === SHAPE_DT) return boundaryOfDateTime(fn, value, slot, end, weekStart)

  return shape === SHAPE_YM ? boundaryOfYearMonth(fn, value, slot, end) : badValue(fn, ANY_HINT, value)
}

/**
 * The first moment of the `unit` containing `value`. Weeks start on `options.weekStart` (ISO weekday: 1 is Monday, 7 is
 * Sunday; default Monday). A PlainDateTime keeps the precision it came in with.
 *
 * @example startOf('2026-11-18', 'week') // => '2026-11-16'
 * @example startOf('2026-11-18T14:30:05', 'hour') // => '2026-11-18T14:00:00'
 */
export function startOf<T extends PlainValue>(value: T, unit: Unit, options?: WeekOptions): ShapeOf<T> {
  return boundary('startOf', value, unit, options, false) as ShapeOf<T>
}

/**
 * The last moment of the `unit` containing `value`. For a PlainDateTime that is the last millisecond.
 *
 * @example endOf('2026-11-18', 'month') // => '2026-11-30'
 * @example endOf('2026-11-18T14:30', 'day') // => '2026-11-18T23:59:59.999'
 */
export function endOf<T extends PlainValue>(value: T, unit: Unit, options?: WeekOptions): ShapeOf<T> {
  return boundary('endOf', value, unit, options, true) as ShapeOf<T>
}
