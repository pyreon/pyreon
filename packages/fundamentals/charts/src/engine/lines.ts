// Polyline path geometry — a point a distance along a path, the piece of a
// path between two distances, and a path's length. The geo overlay draws its
// moving trails with these.

import type { Double, Pt } from './types'

/** The point `dist` pixels along a polyline (clamped to its ends). */
export function pointAlong(pts: Pt[], dist: Double): Pt {
  if (pts.length === 0) return { x: 0.0, y: 0.0 }
  let remaining = dist
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const seg = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))
    if (remaining <= seg && seg > 0.0) {
      const f = remaining / seg
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
    }
    remaining = remaining - seg
  }
  return pts[pts.length - 1]!
}

/** The stretch of a polyline between two distances along it, both ends included. */
export function subPath(pts: Pt[], from: Double, to: Double): Pt[] {
  const out: Pt[] = []
  if (pts.length < 2 || to <= from) return out
  out.push(pointAlong(pts, from))
  let walked = 0.0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    walked = walked + Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))
    if (walked > from && walked < to) out.push(b)
  }
  out.push(pointAlong(pts, to))
  return out
}

/** Total pixel length of a polyline. */
export function pathLength(pts: Pt[]): Double {
  let total = 0.0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    total = total + Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))
  }
  return total
}
