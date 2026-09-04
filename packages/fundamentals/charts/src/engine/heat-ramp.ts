// The closure form of the heat ramp for web callers (visual maps, geo,
// calendar). The colour maths is the crossed `rampColor` in heat.ts; a
// function-returning function has no native form, so it lives here.

import { rampColor } from './heat'
import type { Double } from './types'

/** A color ramp over `#rrggbb` stops: `t` in 0..1 interpolates piecewise between them. */
export function colorRamp(stops: string[]): (t: Double) => string {
  return (t: Double): string => rampColor(stops, t)
}
