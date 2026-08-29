// Log and time scales.

import { plain } from './format'
import type { Formatter } from './format'
import type { Domain, Double, Tick } from './types'

/**
 * Logarithmic scale.
 *
 * Non-positive domains are invalid — log(0) is -Infinity and log of a negative
 * is NaN — so the domain is clamped up to a small positive floor rather than
 * producing coordinates that silently blank the chart. A caller plotting values
 * that cross zero wants a symlog or a linear scale, not this.
 */
export function scaleLog(d: Domain, r0: Double, r1: Double, v: Double): Double {
  const min = d.min <= 0.0 ? 0.000001 : d.min
  const max = d.max <= min ? min * 10.0 : d.max
  const val = v <= 0.0 ? min : v
  // No `hi === lo` guard: `max` above is widened to at least `min * 10`
  // whenever it is not already greater than `min`, so the span is always a
  // decade or more and the division can never be by zero. Coverage found the
  // guard unreachable, which is how it was noticed.
  const lo = Math.log10(min)
  const hi = Math.log10(max)
  return r0 + ((Math.log10(val) - lo) / (hi - lo)) * (r1 - r0)
}

/** Ticks at each power of ten inside the domain. */
export function logTicks(d: Domain, r0: Double, r1: Double): Tick[] {
  const min = d.min <= 0.0 ? 0.000001 : d.min
  const max = d.max <= min ? min * 10.0 : d.max
  const out: Tick[] = []
  const from = Math.floor(Math.log10(min))
  const to = Math.ceil(Math.log10(max))
  // Bounded independently of the domain: a span of 1e-300..1e300 would
  // otherwise generate 600 ticks nobody can read.
  const limit = 24
  let count = 0
  for (let e = from; e <= to && count < limit; e++) {
    const v = Math.pow(10.0, e)
    if (v < min || v > max) continue
    out.push({ value: v, pos: scaleLog(d, r0, r1, v), label: plain(v) })
    count = count + 1
  }
  return out
}

const MINUTE = 60000.0
const HOUR = MINUTE * 60.0
const DAY = HOUR * 24.0

/**
 * Time ticks at a human-meaningful interval.
 *
 * Steps are chosen from calendar units rather than the nice-number ladder,
 * because a "nice" 20,000ms step produces labels nobody reads. The unit is
 * picked from the span so a day-long series ticks hourly and a year-long one
 * ticks monthly.
 */
export function timeTicks(
  d: Domain,
  r0: Double,
  r1: Double,
  target: number,
  format?: Formatter,
): Tick[] {
  const span = d.max - d.min
  const out: Tick[] = []
  if (span <= 0.0 || target <= 0) return out

  const steps: Double[] = [
    1000.0, 5000.0, 15000.0, 30000.0,
    MINUTE, MINUTE * 5.0, MINUTE * 15.0, MINUTE * 30.0,
    HOUR, HOUR * 3.0, HOUR * 6.0, HOUR * 12.0,
    DAY, DAY * 7.0, DAY * 30.0, DAY * 90.0, DAY * 365.0,
  ]
  const ideal = span / target
  let step = steps[steps.length - 1]!
  for (const s of steps) {
    if (s >= ideal) {
      step = s
      break
    }
  }

  const first = Math.ceil(d.min / step) * step
  const limit = 200
  let i = 0
  while (i < limit) {
    const v = first + step * i
    if (v > d.max) break
    out.push({
      value: v,
      pos: r0 + ((v - d.min) / span) * (r1 - r0),
      label: format === undefined ? formatTime(v, step) : format(v),
    })
    i = i + 1
  }
  return out
}

/**
 * Label a timestamp at a resolution matching the step.
 *
 * Built on `Date` getters rather than `toLocaleString` so the same code can
 * lower to native: PMTC compiles your source, not the platform's
 * internationalization tables. A locale-aware label is a `Formatter` the caller
 * supplies on web.
 */
export function formatTime(ms: Double, step: Double): string {
  const d = new Date(ms)
  const p2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)
  if (step >= DAY * 300.0) return `${d.getFullYear()}`
  if (step >= DAY * 25.0) return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`
  if (step >= DAY) return `${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
  if (step >= MINUTE) return `${p2(d.getHours())}:${p2(d.getMinutes())}`
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
}
