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
  const slope: Double[] = []
  for (let i = 0; i < n - 1; i++) {
    const dxi = points[i + 1]!.x - points[i]!.x
    dx.push(dxi)
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

/**
 * ECharts' smoothed line: one cubic Bézier per segment, the control points
 * computed exactly as ECharts' `poly.js` `drawSegment` does. `amount` is the
 * series' `smooth` (0.5 for `true`); `monotone` is `smoothMonotone` ('x', 'y'
 * or '' for none). Each control point is clamped into the box of its two
 * neighbouring data, so the curve never overshoots an extreme.
 *
 * Returns the segment control points flat, six numbers per segment after the
 * start (cp0x, cp0y, cp1x, cp1y, x, y) — the same sequence ECharts' path
 * carries in its `C` commands.
 */
export function echartsBeziers(points: Pt[], amount: Double, monotone: string): Double[] {
  const out: Double[] = []
  const n = points.length
  if (n < 2) return out
  let prevX = points[0]!.x
  let prevY = points[0]!.y
  let cpx0 = prevX
  let cpy0 = prevY
  for (let i = 1; i < n; i++) {
    const x = points[i]!.x
    const y = points[i]!.y
    const ddx = x - prevX
    const ddy = y - prevY
    // ECharts drops a point closer than ~0.7px to the previous one.
    if (ddx * ddx + ddy * ddy < 0.5) continue
    let cpx1 = x
    let cpy1 = y
    let nextCpx0 = x
    let nextCpy0 = y
    if (i + 1 < n) {
      const nextX = points[i + 1]!.x
      const nextY = points[i + 1]!.y
      let vx = nextX - prevX
      let vy = nextY - prevY
      const dx0 = x - prevX
      const dx1 = nextX - x
      const dy0 = y - prevY
      const dy1 = nextY - y
      if (monotone === 'x') {
        const lenPrev = Math.abs(dx0)
        const lenNext = Math.abs(dx1)
        const dirX = vx > 0.0 ? 1.0 : -1.0
        cpx1 = x - dirX * lenPrev * amount
        nextCpx0 = x + dirX * lenNext * amount
      } else if (monotone === 'y') {
        const lenPrev = Math.abs(dy0)
        const lenNext = Math.abs(dy1)
        const dirY = vy > 0.0 ? 1.0 : -1.0
        cpy1 = y - dirY * lenPrev * amount
        nextCpy0 = y + dirY * lenNext * amount
      } else {
        const lenPrev = Math.sqrt(dx0 * dx0 + dy0 * dy0)
        const lenNext = Math.sqrt(dx1 * dx1 + dy1 * dy1)
        const ratio = lenNext / (lenNext + lenPrev)
        nextCpx0 = x + vx * amount * ratio
        nextCpy0 = y + vy * amount * ratio
        // Keep the next control point between this datum and the next.
        nextCpx0 = Math.max(Math.min(nextCpx0, Math.max(nextX, x)), Math.min(nextX, x))
        nextCpy0 = Math.max(Math.min(nextCpy0, Math.max(nextY, y)), Math.min(nextY, y))
        vx = nextCpx0 - x
        vy = nextCpy0 - y
        cpx1 = x - (vx * lenPrev) / lenNext
        cpy1 = y - (vy * lenPrev) / lenNext
        // And this one between the previous datum and this.
        cpx1 = Math.max(Math.min(cpx1, Math.max(prevX, x)), Math.min(prevX, x))
        cpy1 = Math.max(Math.min(cpy1, Math.max(prevY, y)), Math.min(prevY, y))
        vx = x - cpx1
        vy = y - cpy1
        nextCpx0 = x + (vx * lenNext) / lenPrev
        nextCpy0 = y + (vy * lenNext) / lenPrev
      }
    }
    out.push(cpx0)
    out.push(cpy0)
    out.push(cpx1)
    out.push(cpy1)
    out.push(x)
    out.push(y)
    cpx0 = nextCpx0
    cpy0 = nextCpy0
    prevX = x
    prevY = y
  }
  return out
}

/** ECharts' smoothed line sampled into a polyline (16 points per Bézier). */
export function echartsSmooth(points: Pt[], amount: Double, monotone: string): Pt[] {
  if (points.length < 2 || amount <= 0.0) return points
  const bz = echartsBeziers(points, amount, monotone)
  const out: Pt[] = [points[0]!]
  let x0 = points[0]!.x
  let y0 = points[0]!.y
  const segs = Math.floor(bz.length / 6)
  for (let s = 0; s < segs; s++) {
    const c0x = bz[s * 6]!
    const c0y = bz[s * 6 + 1]!
    const c1x = bz[s * 6 + 2]!
    const c1y = bz[s * 6 + 3]!
    const x1 = bz[s * 6 + 4]!
    const y1 = bz[s * 6 + 5]!
    for (let k = 1; k <= 16; k++) {
      const t = k / 16.0
      const u = 1.0 - t
      const a = u * u * u
      const b = 3.0 * u * u * t
      const c = 3.0 * u * t * t
      const d = t * t * t
      out.push({ x: a * x0 + b * c0x + c * c1x + d * x1, y: a * y0 + b * c0y + c * c1y + d * y1 })
    }
    x0 = x1
    y0 = y1
  }
  return out
}

/** Step-before (ECharts' `step: true` / 'start'): the line rises at each datum's predecessor, then holds. */
export function stepStart(points: Pt[]): Pt[] {
  const n = points.length
  if (n < 2) return points
  const out: Pt[] = [points[0]!]
  for (let i = 1; i < n; i++) {
    out.push({ x: points[i - 1]!.x, y: points[i]!.y })
    out.push(points[i]!)
  }
  return out
}

/** Step-middle (ECharts' `step: 'middle'`): the turn sits halfway between two data. */
export function stepMiddle(points: Pt[]): Pt[] {
  const n = points.length
  if (n < 2) return points
  const out: Pt[] = [points[0]!]
  for (let i = 1; i < n; i++) {
    const mid = (points[i - 1]!.x + points[i]!.x) / 2.0
    out.push({ x: mid, y: points[i - 1]!.y })
    out.push({ x: mid, y: points[i]!.y })
    out.push(points[i]!)
  }
  return out
}
