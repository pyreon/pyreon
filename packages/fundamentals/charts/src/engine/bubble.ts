// Bubble radii — the r channel of a `bubble` mark resolved to PIXEL radii,
// area-mapped over the series' own extent, so the engine only ever sees
// pixels. Pure and in the native-crossing subset: the web `resolveMarks` and
// the native host both call it.

import type { Double } from './types'

/**
 * Map raw magnitudes to radii between `minR` and `maxR` by AREA (a sqrt
 * ramp), so a bubble twice the value reads as twice the area, not twice the
 * diameter. A non-finite or non-positive magnitude counts as 0; an all-zero
 * series draws every bubble at `minR`.
 */
export function bubbleRadii(raw: Double[], minR: Double, maxR: Double): Double[] {
  const clean: Double[] = []
  let hi = 0.0
  for (const v of raw) {
    const c = v === v && v > 0.0 ? v : 0.0
    clean.push(c)
    if (c > hi) hi = c
  }
  const out: Double[] = []
  for (const c of clean) out.push(hi === 0.0 ? minR : minR + Math.sqrt(c / hi) * (maxR - minR))
  return out
}
