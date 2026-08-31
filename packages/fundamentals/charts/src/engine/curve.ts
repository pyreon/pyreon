// Curve interpolators — each an exported binding, like the marks.
//
// A curve is a pure `(points) => points` DENSIFIER: it returns more polyline
// points, not a new command kind. That one decision is what keeps curves free
// on every platform — the canvas, SVG, SwiftUI and Compose backends all speak
// polyline already, so a smoothed line costs zero new backend work anywhere,
// which is the property that matters for a library whose geometry has to
// compile through PMTC.
//
// `curve` is passed as an imported function (`line(y, { curve: smooth })`),
// never a string, for the same reason a mark is: a binding tree-shakes, a
// string key cannot.

import type { Double, Pt } from './types'

/**
 * Monotone cubic interpolation (Fritsch–Carlson), sampled into a polyline.
 *
 * Monotone rather than the Catmull-Rom family deliberately: a plain cubic
 * OVERSHOOTS — a series that steps from 10 to 90 gets a dip below 10 and a
 * bump above 90 that are not in the data, and on a value chart an invented
 * extremum is a lie, not a style. Monotone tangents never cross a datum's
 * neighbours, so the curve stays inside the data's envelope. (This is also
 * why d3's `curveMonotoneX` is the widely recommended default over
 * `curveCardinal`.)
 */
export function smooth(points: Pt[]): Pt[] {
  const n = points.length
  if (n < 3) return points

  // Secant slopes between consecutive points.
  const dx: Double[] = []
  const dy: Double[] = []
  const slope: Double[] = []
  for (let i = 0; i < n - 1; i++) {
    const dxi = points[i + 1]!.x - points[i]!.x
    dx.push(dxi)
    dy.push(points[i + 1]!.y - points[i]!.y)
    // Coincident x (duplicate timestamps) would divide by zero; a zero slope
    // through the pair keeps the curve finite and flat there.
    slope.push(dxi === 0.0 ? 0.0 : (points[i + 1]!.y - points[i]!.y) / dxi)
  }

  // Fritsch–Carlson tangents: zero at local extrema (the monotonicity
  // guarantee), harmonic-mean-weighted between unequal segments elsewhere.
  const m: Double[] = [slope[0]!]
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope[i - 1]!
    const s1 = slope[i]!
    if (s0 * s1 <= 0.0) {
      m.push(0.0)
    } else {
      const w0 = 2.0 * dx[i]! + dx[i - 1]!
      const w1 = dx[i]! + 2.0 * dx[i - 1]!
      m.push((w0 + w1) / (w0 / s0 + w1 / s1))
    }
  }
  m.push(slope[n - 2]!)

  // Sample each segment with the cubic Hermite basis. 16 steps per segment is
  // past the visual threshold at chart sizes; the count is fixed rather than
  // adaptive so the output is deterministic for snapshot tests.
  const steps = 16
  const out: Pt[] = [points[0]!]
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]!
    const p1 = points[i + 1]!
    const h = dx[i]!
    for (let k = 1; k <= steps; k++) {
      const t = k / steps
      const t2 = t * t
      const t3 = t2 * t
      const h00 = 2.0 * t3 - 3.0 * t2 + 1.0
      const h10 = t3 - 2.0 * t2 + t
      const h01 = -2.0 * t3 + 3.0 * t2
      const h11 = t3 - t2
      out.push({
        x: p0.x + t * h,
        y: h00 * p0.y + h10 * h * m[i]! + h01 * p1.y + h11 * h * m[i + 1]!,
      })
    }
  }
  return out
}

/**
 * Step-after: each value holds until the next datum.
 *
 * The honest shape for values that CHANGE AT instants rather than trend
 * between them — a price, a config value, an inventory count. A straight line
 * between two prices claims the price passed through every value in between.
 */
export function step(points: Pt[]): Pt[] {
  const n = points.length
  if (n < 2) return points
  const out: Pt[] = [points[0]!]
  for (let i = 1; i < n; i++) {
    out.push({ x: points[i]!.x, y: points[i - 1]!.y })
    out.push(points[i]!)
  }
  return out
}
