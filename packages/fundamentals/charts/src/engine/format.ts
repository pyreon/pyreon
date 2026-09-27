// Value formatting for axis labels and tooltips.
//
// Axis labels are the one place a chart's numbers are read literally, and a raw
// `${v}` there produces "1200000" and "0.30000000000000004" — both of which
// make a chart look broken regardless of how correct its geometry is.

import type { Double } from './types'

export type Formatter = (value: Double) => string

/** Trims float noise; the engine's default. */
export function plain(v: Double): string {
  const r = Math.round(v)
  if (Math.abs(v - r) < 0.000001) return `${r}`
  return `${Math.round(v * 1000.0) / 1000.0}`
}

/**
 * `plain` with its integer part grouped by thousands — ECharts' `addCommas`,
 * what its default tooltip shows (2,000; 1,234.5). A `while` over the digits
 * rather than a regex, so it lowers through PMTC.
 */
export function groupThousands(v: Double): string {
  return groupDigits(plain(v))
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
