// `shadeBy` colours, as engine geometry: the same function maps a datum's value
// to its colour on the web and on iOS / Android, so the two cannot disagree.

import { rampColor } from './heat'
import { isFiniteNumber } from './scale'
import type { Domain, Double } from './types'

/** The extent of the finite values (`{ 0, 0 }` when there are none). */
export function shadeExtent(shades: Double[]): Domain {
  let lo = 0.0
  let hi = 0.0
  let seen = 0
  for (const v of shades) {
    if (!isFiniteNumber(v)) continue
    if (seen === 0) {
      lo = v
      hi = v
    }
    if (v < lo) lo = v
    if (v > hi) hi = v
    seen = seen + 1
  }

  return { min: lo, max: hi }
}

/**
 * One colour per value: low values take the first stop, high values the last,
 * a constant series the middle of the ramp. A gap (a non-finite value) gets ''
 * and keeps the series colour.
 */
export function shadeColors(shades: Double[], stops: string[], min: Double, max: Double): string[] {
  const out: string[] = []
  const span = max - min
  for (const v of shades) out.push(isFiniteNumber(v) ? rampColor(stops, span > 0.0 ? (v - min) / span : 0.5) : '')

  return out
}
