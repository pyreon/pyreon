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

/**
 * Parse an ISO 8601 string to epoch milliseconds, `NaN` when it is not one.
 * Accepts `YYYY-MM-DD`, then optionally `T`/space and `HH:MM[:SS[.fff…]]`,
 * then optionally `Z`, `±HH:MM`, `±HHMM` or `±HH`. Sets the calendar flag.
 */
function parseIso(s: string): number {
  const n = s.length
  if (n < 10 || s.charCodeAt(4) !== CH_DASH || s.charCodeAt(7) !== CH_DASH) return NaN
  const year = digits(s, 0, 4)
  const month = digits(s, 5, 2)
  const day = digits(s, 8, 2)
  if (year < 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return NaN
  let ms = daysFromCivil(year, month, day) * 86400000
  if (n === 10) {
    lastPlain = true
    return ms
  }
  const sep = s.charCodeAt(10)
  if (sep !== CH_T && sep !== CH_t && sep !== CH_SPACE) return NaN
  if (n < 16 || s.charCodeAt(13) !== CH_COLON) return NaN
  const hour = digits(s, 11, 2)
  const minute = digits(s, 14, 2)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return NaN
  ms += hour * 3600000 + minute * 60000
  let i = 16
  if (i < n && s.charCodeAt(i) === CH_COLON) {
    const second = digits(s, i + 1, 2)
    if (second < 0 || second > 59) return NaN
    ms += second * 1000
    i += 3
    if (i < n && s.charCodeAt(i) === CH_DOT) {
      i++
      let scale = 100
      let any = false
      while (i < n) {
        const d = s.charCodeAt(i) - 48
        if (d < 0 || d > 9) break
        ms += d * scale
        scale = scale / 10
        any = true
        i++
      }
      if (!any) return NaN
      ms = Math.floor(ms)
    }
  }
  if (i === n) {
    lastPlain = true
    return ms
  }
  const z = s.charCodeAt(i)
  let offset = 0
  if (z === CH_Z || z === CH_z) {
    i++
  } else if (z === CH_PLUS || z === CH_DASH) {
    const oh = digits(s, i + 1, 2)
    if (oh < 0 || oh > 23) return NaN
    let om = 0
    i += 3
    if (i < n) {
      if (s.charCodeAt(i) === CH_COLON) i++
      om = digits(s, i, 2)
      if (om < 0 || om > 59) return NaN
      i += 2
    }
    offset = (oh * 60 + om) * 60000 * (z === CH_DASH ? -1 : 1)
  } else {
    return NaN
  }
  if (i !== n) return NaN
  lastPlain = false
  return Math.abs(ms - offset) <= MAX_TIME ? ms - offset : NaN
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
  if (value instanceof Date) return value.getTime()
  return NaN
}
