// Value tweens — the update-animation primitive: a pure frame between two
// value sets, so a host can animate a data change instead of snapping.

import type { Double } from './types'

/** Ease-out cubic: fast rise, gentle settle. */
export function easeOutCubic(t: Double): Double {
  const c = t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t
  return 1.0 - Math.pow(1.0 - c, 3.0)
}

/** True when every series has the same length in both sets. */
export function sameShape(a: Double[][], b: Double[][]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i]!.length !== b[i]!.length) return false
  return true
}

/** True when every value is identical (NaN equals NaN). */
export function sameValues(a: Double[][], b: Double[][]): boolean {
  if (!sameShape(a, b)) return false
  for (let i = 0; i < a.length; i++) {
    const ra = a[i]!
    const rb = b[i]!
    for (let j = 0; j < ra.length; j++) {
      const x = ra[j]!
      const y = rb[j]!
      if (x !== y && !(x !== x && y !== y)) return false
    }
  }
  return true
}

/**
 * The frame at `t` (0..1) between two value sets of the same shape. A gap
 * (NaN) on the TARGET side stays a gap; a value replacing a gap snaps in,
 * because there is nothing to tween from — neither ever passes through zero.
 */
export function tweenValues(from: Double[][], to: Double[][], t: Double): Double[][] {
  const e = easeOutCubic(t)
  return to.map((row, i) => {
    const prev = from[i]
    if (prev === undefined || prev.length !== row.length) return row.slice()
    return row.map((v, j) => {
      const f = prev[j]!
      if (v !== v || f !== f) return v
      return f + (v - f) * e
    })
  })
}
