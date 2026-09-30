// Value formatting for axis labels and tooltips.
//
// Axis labels are the one place a chart's numbers are read literally, and a raw
// `${v}` there produces "1200000" and "0.30000000000000004" — both of which
// make a chart look broken regardless of how correct its geometry is.

import type { Double } from './types'

/** Native-subset-safe finite-number predicate shared by chart arithmetic. */
export function isFiniteChartNumber(v: Double): boolean {
  // Intentional IEEE-754 checks: the native subset cannot lower Number.isFinite.
  return v === v && v - v === 0.0 // lgtm[js/identical-operand]
}

export type Formatter = (value: Double) => string

/**
 * Trims float noise; the engine's default.
 *
 * Integers print as integers and ordinary fractions keep three decimals — but
 * the decimals GROW for small magnitudes so data like 0.00012 does not
 * collapse to "0" (every tick and tooltip of a small-valued chart used to read
 * the same), and values outside 1e-4..1e15 use exponent notation (`1.5e-7`,
 * `2e21`) rather than a runaway digit string.
 */
export function plain(v: Double): string {
  if (!isFiniteChartNumber(v)) {
    if (!(v === v)) return 'NaN'
    return v > 0.0 ? 'Infinity' : '-Infinity'
  }
  const mag = Math.abs(v)
  // Below 1e-12 is float noise (0.1 + 0.2 - 0.3), not data.
  if (mag < 0.000000000001) return '0'
  if (mag >= 1000000000000000.0 || mag < 0.0001) return exponential(v)
  const r = Math.round(v)
  if (Math.abs(v - r) < 0.000001) return `${r}`
  // Three decimals, more below 0.01 so ~3 significant digits survive.
  let places = 3.0
  if (mag < 0.01) places = Math.ceil(-Math.log10(mag)) + 2.0
  const mul = Math.pow(10.0, places)
  return `${Math.round(v * mul) / mul}`
}

/** Exponent notation with a 3-decimal mantissa — the same text on every target. */
function exponential(v: Double): string {
  const mag = Math.abs(v)
  let e = Math.floor(Math.log10(mag))
  let m = Math.round((mag / Math.pow(10.0, e)) * 1000.0) / 1000.0
  if (m >= 10.0) {
    m = m / 10.0
    e = e + 1.0
  }
  const sign = v < 0.0 ? '-' : ''
  const mant = Math.abs(m - Math.round(m)) < 0.0000001 ? `${Math.round(m)}` : `${m}`
  return `${sign}${mant}e${Math.round(e)}`
}

/**
 * `plain` with its integer part grouped by thousands — ECharts' `addCommas`,
 * what its default tooltip shows (2,000; 1,234.5). A `while` over the digits
 * rather than a regex, so it lowers through PMTC.
 */
export function groupThousands(v: Double): string {
  const s = plain(v)
  // Exponent notation has no integer part to group (`1e21` used to become
  // `1,e+2,1`).
  if (s.indexOf('e') >= 0 || s === 'NaN') return s
  return groupDigits(s)
}

/** Group the integer part of an already-formatted number by thousands. */
function groupDigits(s: string): string {
  const neg = s.length > 0 && s.charAt(0) === '-'
  const body = neg ? s.slice(1) : s
  const dot = body.indexOf('.')
  const whole = dot < 0 ? body : body.slice(0, dot)
  const frac = dot < 0 ? '' : body.slice(dot)
  let out = ''
  let end = whole.length
  while (end > 0) {
    const start = end - 3 > 0 ? end - 3 : 0
    const chunk = whole.slice(start, end)
    out = out === '' ? chunk : `${chunk},${out}`
    end = start
  }
  return `${neg ? '-' : ''}${out}${frac}`
}

/**
 * Compact notation — 1.2K, 3.4M.
 *
 * Hand-rolled rather than `Intl.NumberFormat` because this has to compile to
 * Swift and Kotlin through PMTC, which lowers your source and not the browser's
 * built-ins. Web-only formatting can still be passed in as a custom
 * `Formatter`.
 */
export function compact(v: Double): string {
  const abs = Math.abs(v)
  const sign = v < 0.0 ? '-' : ''
  if (abs >= 1000000000.0) return `${sign}${trim(abs / 1000000000.0)}B`
  if (abs >= 1000000.0) return `${sign}${trim(abs / 1000000.0)}M`
  if (abs >= 1000.0) return `${sign}${trim(abs / 1000.0)}K`
  return plain(v)
}

function trim(v: Double): string {
  const r = Math.round(v * 10.0) / 10.0
  return Number.isInteger(r) ? `${Math.round(r)}` : `${r}`
}

/** A fixed number of decimal places, without `toFixed`'s locale surprises. */
export function fixed(places: number): Formatter {
  const p = Math.max(0, Math.min(10, places))
  const mul = Math.pow(10.0, p)
  return (v: Double): string => {
    const r = Math.round(v * mul) / mul
    if (p === 0) return `${Math.round(r)}`
    const s = `${r}`
    const dot = s.indexOf('.')
    if (dot < 0) return `${s}.${'0'.repeat(p)}`
    const decimals = s.length - dot - 1
    return decimals >= p ? s : `${s}${'0'.repeat(p - decimals)}`
  }
}

/** Currency, symbol first, thousands grouped: `currency('$')(60000)` is "$60,000". */
export function currency(symbol: string, places: number = 0): Formatter {
  const f = fixed(places)
  return (v: Double): string => (v < 0.0 ? `-${symbol}${groupDigits(f(-v))}` : `${symbol}${groupDigits(f(v))}`)
}

/** A ratio as a percentage — `percent()(0.42)` is "42%". */
export function percent(places: number = 0): Formatter {
  const f = fixed(places)
  return (v: Double): string => `${f(v * 100.0)}%`
}

const MONTH_NAMES: string[] = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_MS = 86400000.0

/** A non-negative whole number, left-padded with zeros to `width` digits. */
function padded(v: Double, width: number): string {
  const s = `${Math.round(v)}`
  return s.length >= width ? s : `${'0'.repeat(width - s.length)}${s}`
}

/**
 * Epoch milliseconds printed through a pattern, in UTC, the same on the web,
 * iOS and Android: `YYYY` `YY` year, `MMMM` `MMM` `MM` `M` month, `DD` `D`
 * day, `HH` `H` hour, `mm` minute, `ss` second. Text in `[brackets]` is
 * printed as written; anything else is copied through. A non-finite value
 * prints nothing.
 *
 * UTC by design: a chart's tick labels must not move with the viewer's
 * timezone, and the pattern is the same on every target. For the reader's
 * own locale and timezone, pass `locale` to the chart instead.
 */
export function formatDate(ms: Double, pattern: string): string {
  // NaN and ±Infinity are the values for which `x - x` is not zero; there is
  // no `Number.isFinite` / `Infinity` in the native subset.
  if (!isFiniteChartNumber(ms)) return ''
  const days = Math.floor(ms / DAY_MS)
  const inDay = ms - days * DAY_MS
  // Howard Hinnant's civil_from_days (as `civilFromDays` in calendar.ts).
  const z = days + 719468.0
  const era = Math.floor(z / 146097.0)
  const doe = z - era * 146097.0
  const yoe = Math.floor((doe - Math.floor(doe / 1460.0) + Math.floor(doe / 36524.0) - Math.floor(doe / 146096.0)) / 365.0)
  const doy = doe - (365.0 * yoe + Math.floor(yoe / 4.0) - Math.floor(yoe / 100.0))
  const mp = Math.floor((5.0 * doy + 2.0) / 153.0)
  const day = doy - Math.floor((153.0 * mp + 2.0) / 5.0) + 1.0
  const month = mp < 10.0 ? mp + 3.0 : mp - 9.0
  const year = (month <= 2.0 ? 1.0 : 0.0) + yoe + era * 400.0
  const hour = Math.floor(inDay / 3600000.0)
  const minute = Math.floor((inDay - hour * 3600000.0) / 60000.0)
  const second = Math.floor((inDay - hour * 3600000.0 - minute * 60000.0) / 1000.0)
  const name = MONTH_NAMES[Math.round(month) - 1]!
  let out = ''
  let i = 0
  while (i < pattern.length) {
    const c = pattern.substring(i, i + 1)
    if (c === '[') {
      let end = i + 1
      while (end < pattern.length && pattern.substring(end, end + 1) !== ']') end = end + 1
      out = out + pattern.substring(i + 1, end)
      i = end + 1
    } else if (pattern.substring(i, i + 4) === 'YYYY') {
      out = out + padded(year, 4)
      i = i + 4
    } else if (pattern.substring(i, i + 2) === 'YY') {
      out = out + padded(year - Math.floor(year / 100.0) * 100.0, 2)
      i = i + 2
    } else if (pattern.substring(i, i + 4) === 'MMMM') {
      out = out + name
      i = i + 4
    } else if (pattern.substring(i, i + 3) === 'MMM') {
      out = out + name.substring(0, 3)
      i = i + 3
    } else if (pattern.substring(i, i + 2) === 'MM') {
      out = out + padded(month, 2)
      i = i + 2
    } else if (c === 'M') {
      out = out + padded(month, 1)
      i = i + 1
    } else if (pattern.substring(i, i + 2) === 'DD') {
      out = out + padded(day, 2)
      i = i + 2
    } else if (c === 'D') {
      out = out + padded(day, 1)
      i = i + 1
    } else if (pattern.substring(i, i + 2) === 'HH') {
      out = out + padded(hour, 2)
      i = i + 2
    } else if (c === 'H') {
      out = out + padded(hour, 1)
      i = i + 1
    } else if (pattern.substring(i, i + 2) === 'mm') {
      out = out + padded(minute, 2)
      i = i + 2
    } else if (pattern.substring(i, i + 2) === 'ss') {
      out = out + padded(second, 2)
      i = i + 2
    } else {
      out = out + c
      i = i + 1
    }
  }
  return out
}

/**
 * A date formatter over epoch milliseconds: `date('MMM YYYY')(ms)` is
 * "Mar 2024". Pass it as the time axis's `format` and the axis, tooltip and
 * accessible table all print it — see `formatDate` for the tokens.
 */
export function date(pattern: string): Formatter {
  return (v: Double): string => formatDate(v, pattern)
}
