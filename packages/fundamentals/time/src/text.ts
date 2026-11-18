import { civilFromDays, daysFromCivil, daysIn, MAX_DAY, MIN_DAY, MS_PER_DAY } from './civil'
import { badRange, badValue, show, DATE_HINT, DATETIME_HINT, TIME_HINT, YEARMONTH_HINT } from './errors'
import type { PlainDate, PlainDateTime, PlainTime, PlainYearMonth } from './types'

/**
 * Accepted ISO forms (nothing else, no offsets or zone names in a Plain value):
 *
 * - PlainDate       `YYYY-MM-DD`, year 0001-9999, a real calendar day.
 * - PlainYearMonth  `YYYY-MM`.
 * - PlainTime       `HH:MM`, `HH:MM:SS` or `HH:MM:SS.f` / `.ff` / `.fff` (1-3 fraction digits), hour 00-23, second 00-59.
 * - PlainDateTime   a PlainDate, an upper-case `T`, a PlainTime.
 *
 * Parsing reads char codes: no regex, no `split`, no `Number()` on a substring.
 */

export const SHAPE_NONE = 0
export const SHAPE_DATE = 1
export const SHAPE_YM = 2
export const SHAPE_DT = 3
export const SHAPE_TIME = 4

/** Precision levels of a time of day: 0 minutes, 1 seconds, 2 milliseconds. */
export const LEVEL_MINUTE = 0
export const LEVEL_SECOND = 1
export const LEVEL_MS = 2

/** The shape a string looks like (length and separators only; the parsers do the real validation). */
export function shapeOf(s: string): number {
  const n = s.length

  if (n === 10) return s.charCodeAt(4) === 45 ? SHAPE_DATE : s.charCodeAt(2) === 58 ? SHAPE_TIME : SHAPE_NONE
  if (n === 7) return s.charCodeAt(4) === 45 ? SHAPE_YM : SHAPE_NONE
  if (n >= 16) return s.charCodeAt(10) === 84 ? SHAPE_DT : SHAPE_NONE

  return (n === 5 || n === 8 || n === 11 || n === 12) && s.charCodeAt(2) === 58 ? SHAPE_TIME : SHAPE_NONE
}

function num2(s: string, i: number): number {
  const a = s.charCodeAt(i) - 48
  const b = s.charCodeAt(i + 1) - 48

  return a >>> 0 > 9 || b >>> 0 > 9 ? -1 : a * 10 + b
}

function num4(s: string, i: number): number {
  const a = s.charCodeAt(i) - 48
  const b = s.charCodeAt(i + 1) - 48
  const c = s.charCodeAt(i + 2) - 48
  const d = s.charCodeAt(i + 3) - 48

  return a >>> 0 > 9 || b >>> 0 > 9 || c >>> 0 > 9 || d >>> 0 > 9 ? -1 : a * 1000 + b * 100 + c * 10 + d
}

/** Packed civil triple of the `YYYY-MM-DD` that starts at index 0 (the caller checked the length), or -1. */
export function parseDateAt(s: string): number {
  if (s.charCodeAt(4) !== 45 || s.charCodeAt(7) !== 45) return -1
  const y = num4(s, 0)
  const m = num2(s, 5)
  const d = num2(s, 8)

  if (y < 1 || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return -1

  return (y << 9) | (m << 5) | d
}

/** Epoch day of a PlainDate string, or NaN when it is not one. */
export function parseDateDay(s: string): number {
  if (s.length !== 10) return Number.NaN
  const p = parseDateAt(s)

  return p < 0 ? Number.NaN : daysFromCivil(p >> 9, (p >> 5) & 15, p & 31)
}

/** Milliseconds since midnight of the time that starts at `o` and runs to the end of `s`, or -1. */
export function parseTimeAt(s: string, o: number): number {
  const n = s.length - o

  if ((n !== 5 && n !== 8 && (n < 10 || n > 12)) || s.charCodeAt(o + 2) !== 58) return -1
  const h = num2(s, o)
  const mi = num2(s, o + 3)

  if (h < 0 || h > 23 || mi < 0 || mi > 59) return -1
  if (n === 5) return h * 3_600_000 + mi * 60_000
  if (s.charCodeAt(o + 5) !== 58) return -1
  const sec = num2(s, o + 6)

  if (sec < 0 || sec > 59) return -1
  const base = h * 3_600_000 + mi * 60_000 + sec * 1000

  return n === 8 ? base : parseFraction(s, o + 8, n - 9, base)
}

function parseFraction(s: string, at: number, digits: number, base: number): number {
  if (s.charCodeAt(at) !== 46) return -1
  const d1 = s.charCodeAt(at + 1) - 48
  const d2 = digits > 1 ? s.charCodeAt(at + 2) - 48 : 0
  const d3 = digits > 2 ? s.charCodeAt(at + 3) - 48 : 0

  if (d1 >>> 0 > 9 || d2 >>> 0 > 9 || d3 >>> 0 > 9) return -1

  return base + d1 * 100 + d2 * 10 + d3
}

/** Precision level a time string was written at. */
export function levelOfLength(n: number): number {
  return n === 5 ? LEVEL_MINUTE : n === 8 ? LEVEL_SECOND : LEVEL_MS
}

/** The wall-clock milliseconds (as if UTC) of a PlainDateTime string, or NaN. */
export function parseWall(s: string): number {
  if (s.length < 16 || s.charCodeAt(10) !== 84) return Number.NaN
  const p = parseDateAt(s)
  const tod = parseTimeAt(s, 11)

  return p < 0 || tod < 0 ? Number.NaN : daysFromCivil(p >> 9, (p >> 5) & 15, p & 31) * MS_PER_DAY + tod
}

/**
 * Strict guard: exactly `YYYY-MM-DD`, zero-padded, a real calendar day, years 0001-9999. Never throws.
 *
 * @example isPlainDate('2026-02-30') // => false
 * @example isPlainDate('2026-11-18') // => true
 */
export function isPlainDate(x: unknown): x is PlainDate {
  return typeof x === 'string' && x.length === 10 && parseDateAt(x) >= 0
}

/**
 * Guard for `YYYY-MM` (month 01-12). Never throws.
 *
 * @example isPlainYearMonth('2026-13') // => false
 */
export function isPlainYearMonth(x: unknown): x is PlainYearMonth {
  return (
    typeof x === 'string' &&
    x.length === 7 &&
    x.charCodeAt(4) === 45 &&
    num4(x, 0) >= 1 &&
    num2(x, 5) >= 1 &&
    num2(x, 5) <= 12
  )
}

/**
 * Guard for `HH:MM`, `HH:MM:SS` or `HH:MM:SS.f` to `.fff`. Never throws.
 *
 * @example isPlainTime('14:30:05.250') // => true
 * @example isPlainTime('24:00') // => false
 */
export function isPlainTime(x: unknown): x is PlainTime {
  return typeof x === 'string' && parseTimeAt(x, 0) >= 0
}

/**
 * Guard for a PlainDate, an upper-case `T`, a PlainTime. Offsets and zone names are not allowed. Never throws.
 *
 * @example isPlainDateTime('2026-11-18T14:30') // => true
 * @example isPlainDateTime('2026-11-18T14:30Z') // => false
 */
export function isPlainDateTime(x: unknown): x is PlainDateTime {
  return typeof x === 'string' && !Number.isNaN(parseWall(x))
}

// ---------------------------------------------------------------------------------------------------------------------
// Writers: one concatenation per result, no `padStart`.
// ---------------------------------------------------------------------------------------------------------------------

export function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

function pad3(n: number): string {
  return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n
}

function pad4(n: number): string {
  return n >= 1000 ? '' + n : n >= 100 ? '0' + n : n >= 10 ? '00' + n : '000' + n
}

export function writeYMD(year: number, month: number, day: number): PlainDate {
  return (pad4(year) + '-' + pad2(month) + '-' + pad2(day)) as PlainDate
}

export function writeYM(year: number, month: number): PlainYearMonth {
  return (pad4(year) + '-' + pad2(month)) as PlainYearMonth
}

/** `YYYY-MM-DD` of an epoch day inside 0001-01-01 ... 9999-12-31 (the caller range-checked). */
export function writeDay(epochDay: number): PlainDate {
  const p = civilFromDays(epochDay)

  return writeYMD(p >> 9, (p >> 5) & 15, p & 31)
}

/** `HH:MM[:SS[.mmm]]` of a millisecond-of-day, at least as precise as `level` and as precise as the value needs. */
export function writeTod(tod: number, level: number): string {
  const hh = (tod / 3_600_000) | 0
  const mm = ((tod % 3_600_000) / 60_000) | 0
  const ss = ((tod % 60_000) / 1000) | 0
  const ms = tod % 1000

  if (ms !== 0 || level === LEVEL_MS) return pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss) + '.' + pad3(ms)
  if (ss !== 0 || level === LEVEL_SECOND) return pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss)

  return pad2(hh) + ':' + pad2(mm)
}

/** `YYYY-MM-DDTHH:MM[:SS[.mmm]]` of wall-clock milliseconds inside the supported range. */
export function writeWall(wall: number, level: number): PlainDateTime {
  const day = Math.floor(wall / MS_PER_DAY)

  return (writeDay(day) + 'T' + writeTod(wall - day * MS_PER_DAY, level)) as PlainDateTime
}

const RANGE_MESSAGE = 'the result falls outside the supported range 0001-01-01 ... 9999-12-31'

/** Wall-clock milliseconds must stay inside 0001-01-01T00:00 ... 9999-12-31T23:59:59.999. */
export function checkWall(fn: string, wall: number): number {
  return wall >= MIN_DAY * MS_PER_DAY && wall < (MAX_DAY + 1) * MS_PER_DAY ? wall : badRange(fn, RANGE_MESSAGE)
}

export function checkDay(fn: string, epochDay: number): number {
  return epochDay >= MIN_DAY && epochDay <= MAX_DAY ? epochDay : badRange(fn, RANGE_MESSAGE)
}

// ---------------------------------------------------------------------------------------------------------------------
// Strict readers that throw a `[Pyreon]` error naming the calling function.
// ---------------------------------------------------------------------------------------------------------------------

export function dayOfDate(fn: string, s: unknown): number {
  const z = typeof s === 'string' ? parseDateDay(s) : Number.NaN

  return Number.isNaN(z) ? badValue(fn, DATE_HINT, s) : z
}

export function wallOfDateTime(fn: string, s: unknown): number {
  const w = typeof s === 'string' ? parseWall(s) : Number.NaN

  return Number.isNaN(w) ? badValue(fn, DATETIME_HINT, s) : w
}

export function todOfTime(fn: string, s: unknown): number {
  const t = typeof s === 'string' ? parseTimeAt(s, 0) : -1

  return t < 0 ? badValue(fn, TIME_HINT, s) : t
}

/** Packed civil triple (day 0) of a PlainYearMonth. */
export function packedYearMonth(fn: string, s: unknown): number {
  return isPlainYearMonth(s) ? (num4(s, 0) << 9) | (num2(s, 5) << 5) : badValue(fn, YEARMONTH_HINT, s)
}

// ---------------------------------------------------------------------------------------------------------------------
// Construct and inspect.
// ---------------------------------------------------------------------------------------------------------------------

function intIn(fn: string, name: string, v: number, lo: number, hi: number): number {
  return Number.isInteger(v) && v >= lo && v <= hi ? v : badRange(fn, `${name} must be an integer from ${lo} to ${hi}, got ${show(v)}`)
}

/**
 * Build a PlainDate from numbers. The month is 1-12. Throws on an impossible date.
 *
 * @example plainDate(2026, 11, 18) // => '2026-11-18'
 */
export function plainDate(year: number, month: number, day: number): PlainDate {
  const y = intIn('plainDate', 'year', year, 1, 9999)
  const m = intIn('plainDate', 'month', month, 1, 12)
  const d = intIn('plainDate', 'day', day, 1, daysIn(y, m))

  return writeYMD(y, m, d)
}

/**
 * Build a PlainYearMonth from numbers. The month is 1-12.
 *
 * @example plainYearMonth(2026, 11) // => '2026-11'
 */
export function plainYearMonth(year: number, month: number): PlainYearMonth {
  return writeYM(intIn('plainYearMonth', 'year', year, 1, 9999), intIn('plainYearMonth', 'month', month, 1, 12))
}

/**
 * Build a PlainTime from numbers, written at the least precision that holds the value.
 *
 * @example plainTime(14, 30, 0, 250) // => '14:30:00.250'
 */
export function plainTime(hour: number, minute = 0, second = 0, millisecond = 0): PlainTime {
  const h = intIn('plainTime', 'hour', hour, 0, 23)
  const mi = intIn('plainTime', 'minute', minute, 0, 59)
  const s = intIn('plainTime', 'second', second, 0, 59)
  const ms = intIn('plainTime', 'millisecond', millisecond, 0, 999)

  return writeTod(h * 3_600_000 + mi * 60_000 + s * 1000 + ms, LEVEL_MINUTE) as PlainTime
}

/**
 * The numeric fields of a date. The month is 1-12 (not 0-11 as in `Date`).
 *
 * @example dateParts('2026-11-18') // => { year: 2026, month: 11, day: 18 }
 */
export function dateParts(value: PlainDate | PlainDateTime): { year: number; month: number; day: number } {
  const ok = typeof value === 'string' && (value.length === 10 ? parseDateAt(value) >= 0 : isPlainDateTime(value))

  if (!ok) return badValue('dateParts', `${DATE_HINT} or ${DATETIME_HINT}`, value)
  const p = parseDateAt(value)

  return { year: p >> 9, month: (p >> 5) & 15, day: p & 31 }
}

/**
 * The numeric fields of a time of day.
 *
 * @example timeParts('14:30:05.250') // => { hour: 14, minute: 30, second: 5, millisecond: 250 }
 */
export function timeParts(value: PlainTime | PlainDateTime): { hour: number; minute: number; second: number; millisecond: number } {
  const dt = typeof value === 'string' && value.length >= 16 && value.charCodeAt(10) === 84
  const tod = typeof value === 'string' && (!dt || parseDateAt(value) >= 0) ? parseTimeAt(value, dt ? 11 : 0) : -1

  if (tod < 0) return badValue('timeParts', `${TIME_HINT} or ${DATETIME_HINT}`, value)

  return { hour: (tod / 3_600_000) | 0, minute: ((tod % 3_600_000) / 60_000) | 0, second: ((tod % 60_000) / 1000) | 0, millisecond: tod % 1000 }
}
