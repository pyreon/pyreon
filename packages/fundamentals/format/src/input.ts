/**
 * Input handling: ISO date strings parsed with char-code arithmetic (no
 * regex, no `split`, no `Date`), and the calendar-vs-instant rule.
 *
 * A date-only string (`2026-11-18`) and a date-time without an offset
 * (`2026-11-18T14:30`) are CALENDAR values: they are turned into the epoch
 * milliseconds of that wall-clock time read as UTC, and the caller formats them
 * with `timeZone: 'UTC'`, so they show that exact calendar day / clock time in
 * every zone. A string with `Z` or an offset, a `Date` and a number are
 * instants, shown in the requested zone.
 */

/** Largest magnitude of a valid time value (ECMA-262 `TimeClip`). */
const MAX_TIME = 8.64e15

let lastPlain = false

/** Whether the value last converted by {@link toMillis} was a calendar value. */
export function lastWasPlain(): boolean {
  return lastPlain
}

/** Days from 1970-01-01 to a proleptic Gregorian date (Howard Hinnant's `days_from_civil`). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy

  return era * 146097 + doe - 719468
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : (MONTH_DAYS[month - 1] as number)
}

/** `n` ASCII digits at `i` as a number, or `-1`. */
function digits(s: string, i: number, n: number): number {
  let v = 0
  for (let k = 0; k < n; k++) {
    const c = s.charCodeAt(i + k) - 48
    if (c < 0 || c > 9) return -1
    v = v * 10 + c
  }

  return v
}

const CH_DASH = 45
const CH_PLUS = 43
const CH_COLON = 58
const CH_DOT = 46
const CH_T = 84
const CH_t = 116
const CH_SPACE = 32
const CH_Z = 90
const CH_z = 122

/** Index just past the part the last clock / offset helper consumed. */
let cursor = 0

/** `YYYY-MM-DD` at the start of `s` to epoch milliseconds, `NaN` when it is not a real calendar date. */
function isoDay(s: string): number {
  if (s.length < 10 || s.charCodeAt(4) !== CH_DASH || s.charCodeAt(7) !== CH_DASH) return NaN
  const year = digits(s, 0, 4)
  const month = digits(s, 5, 2)
  const day = digits(s, 8, 2)
  if (year < 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return NaN

  return daysFromCivil(year, month, day) * 86400000
}

/** Fraction digits after the dot at `i`, as milliseconds (extra digits are dropped). Sets the cursor; `NaN` when there are none. */
function isoFraction(s: string, i: number): number {
  let ms = 0
  let scale = 100
  let at = i + 1
  while (at < s.length) {
    const d = s.charCodeAt(at) - 48
    if (d < 0 || d > 9) break
    ms += d * scale
    scale = Math.floor(scale / 10)
    at++
  }
  cursor = at

  return at === i + 1 ? NaN : ms
}

/** `HH:MM[:SS[.fff]]` at index 11 to milliseconds since midnight, `NaN` when invalid. Sets the cursor. */
function isoClock(s: string): number {
  if (s.length < 16 || s.charCodeAt(13) !== CH_COLON) return NaN
  const hour = digits(s, 11, 2)
  const minute = digits(s, 14, 2)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return NaN
  let ms = hour * 3600000 + minute * 60000
  cursor = 16
  if (cursor >= s.length || s.charCodeAt(cursor) !== CH_COLON) return ms
  const second = digits(s, cursor + 1, 2)
  if (second < 0 || second > 59) return NaN
  ms += second * 1000
  cursor += 3
  if (cursor < s.length && s.charCodeAt(cursor) === CH_DOT) {
    const fraction = isoFraction(s, cursor)
    if (fraction !== fraction) return NaN
    ms += fraction
  }

  return ms
}

/** `Z`, `±HH:MM`, `±HHMM` or `±HH` at the cursor to the offset in milliseconds, `NaN` when invalid. */
function isoOffset(s: string): number {
  const z = s.charCodeAt(cursor)
  if (z === CH_Z || z === CH_z) {
    cursor++
    return 0
  }
  if (z !== CH_PLUS && z !== CH_DASH) return NaN
  const hours = digits(s, cursor + 1, 2)
  if (hours < 0 || hours > 23) return NaN
  cursor += 3
  let minutes = 0
  if (cursor < s.length) {
    if (s.charCodeAt(cursor) === CH_COLON) cursor++
    minutes = digits(s, cursor, 2)
    if (minutes < 0 || minutes > 59) return NaN
    cursor += 2
  }

  return (hours * 60 + minutes) * 60000 * (z === CH_DASH ? -1 : 1)
}

/**
 * Parse an ISO 8601 string to epoch milliseconds, `NaN` when it is not one.
 * Accepts `YYYY-MM-DD`, then optionally `T`/space and `HH:MM[:SS[.fff…]]`,
 * then optionally `Z`, `±HH:MM`, `±HHMM` or `±HH`. Sets the calendar flag.
 */
function parseIso(s: string): number {
  const day = isoDay(s)
  if (day !== day) return NaN
  if (s.length === 10) {
    lastPlain = true
    return day
  }
  const sep = s.charCodeAt(10)
  if (sep !== CH_T && sep !== CH_t && sep !== CH_SPACE) return NaN
  const clock = isoClock(s)
  if (clock !== clock) return NaN
  if (cursor === s.length) {
    lastPlain = true
    return day + clock
  }
  const offset = isoOffset(s)
  if (offset !== offset || cursor !== s.length) return NaN
  lastPlain = false

  return day + clock - offset
}

/**
 * Epoch milliseconds of a date-like value, `NaN` when it is invalid. Nullish
 * input is also `NaN`: callers check for nullish first when they need to tell
 * "missing" from "invalid". Records whether the value was a calendar value.
 */
export function toMillis(value: unknown): number {
  lastPlain = false
  if (typeof value === 'number') return Math.abs(value) <= MAX_TIME ? value : NaN
  if (typeof value === 'string') {
    const t = parseIso(value)
    return t === t && Math.abs(t) <= MAX_TIME ? t : NaN
  }
  // `instanceof` misses a Date from another realm (an iframe, a vm context).
  if (value instanceof Date || Object.prototype.toString.call(value) === '[object Date]') {
    return (value as Date).getTime()
  }

  return NaN
}
