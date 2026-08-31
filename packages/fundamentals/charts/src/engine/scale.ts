// Scales and ticks — the arithmetic every mark sits on.

import type { Formatter } from './format'
import type { Domain, Tick, Double } from './types'

/**
 * Map a domain value onto a pixel range.
 *
 * A degenerate domain (`min === max`, i.e. a flat series or a single point) maps
 * everything to the range midpoint rather than dividing by zero. Returning NaN
 * there would poison every downstream coordinate and surface as an invisible
 * chart rather than an error.
 */
export function scaleLinear(d: Domain, r0: Double, r1: Double, v: Double): Double {
  const span = d.max - d.min
  if (span === 0.0) return (r0 + r1) / 2.0
  return r0 + ((v - d.min) / span) * (r1 - r0)
}

/**
 * Round a raw step up to a "nice" one — 1, 2, 5 or 10 times a power of ten.
 * The standard axis-labelling choice: those are the steps whose multiples read
 * as round numbers to a human.
 */
export function niceStep(raw: Double): Double {
  if (raw <= 0.0) return 1.0
  const mag = Math.pow(10.0, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  let m = 10.0
  if (norm <= 1.0) m = 1.0
  else if (norm <= 2.0) m = 2.0
  else if (norm <= 5.0) m = 5.0
  return m * mag
}

/**
 * Extend a domain outward to land on nice step boundaries, so the axis starts
 * and ends on a round number instead of on the data's exact extremes.
 */
export function niceDomain(d: Domain, targetCount: Double): Domain {
  if (d.max === d.min) {
    // A flat series still deserves a readable axis: give it a unit of room.
    return { min: d.min - 0.5, max: d.max + 0.5 }
  }
  const step = niceStep((d.max - d.min) / targetCount)
  return {
    min: Math.floor(d.min / step) * step,
    max: Math.ceil(d.max / step) * step,
  }
}

/**
 * Ticks across a domain, positioned along a pixel range.
 *
 * `count` is a TARGET, not a guarantee — the whole point of nice steps is that
 * the step wins and the count lands near what was asked. The loop is bounded
 * independently of the step so a pathological domain cannot spin: a caller
 * passing a domain spanning 1e300 would otherwise generate ticks until it ran
 * out of memory.
 */
export function makeTicks(
  d: Domain,
  r0: Double,
  r1: Double,
  count: Double,
  format?: Formatter,
): Tick[] {
  const fmt = format ?? formatTick
  const out: Tick[] = []
  if (count <= 0.0) return out
  const span = d.max - d.min
  if (span <= 0.0) {
    out.push({ value: d.min, pos: scaleLinear(d, r0, r1, d.min), label: fmt(d.min) })
    return out
  }
  const step = niceStep(span / count)
  const first = Math.ceil(d.min / step) * step
  const maxTicks = 1000
  let i = 0
  while (i < maxTicks) {
    const v = first + step * i
    if (v > d.max + step * 0.000001) break
    out.push({ value: v, pos: scaleLinear(d, r0, r1, v), label: fmt(v) })
    i = i + 1
  }
  return out
}

/**
 * Default tick label. Trims the float noise that `1.1 - 1.0` style arithmetic
 * leaves behind — a tick computed as 0.30000000000000004 must read "0.3".
 */
export function formatTick(v: Double): string {
  const r = Math.round(v)
  if (Math.abs(v - r) < 0.000001) return `${r}`
  return `${Math.round(v * 1000.0) / 1000.0}`
}

/** The min/max of a series, or a unit domain when the series is empty. */
export function extent(values: Double[]): Domain {
  if (values.length === 0) return { min: 0.0, max: 1.0 }
  let lo = values[0]!
  let hi = values[0]!
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return { min: lo, max: hi }
}
