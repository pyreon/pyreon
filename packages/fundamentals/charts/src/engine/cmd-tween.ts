// Draw-list tweens — the update animation every family gets for free.
//
// `tween.ts` interpolates VALUES and needs a host that knows what a value is;
// a treemap, a sankey, a pie have no `Double[][]` in common. What they all
// have is the frame they just painted: a flat `DrawCmd[]`. When two frames
// have the same shape (same length, same kind at every index, same point
// counts), interpolating their numbers IS the update animation — a bar slides
// to its new height, a slice sweeps to its new angle, a treemap cell glides
// to its new cell. When the shapes differ (a row added, a series removed) the
// frame snaps, which is the honest answer: there is no path between a shape
// and a different shape that means anything.
//
// Colours snap rather than blend: a mid-tween mix of two palette colours is a
// third colour that belongs to no series.

import type { ChartGradient, DrawCmd, Double, Pt } from './types'

function mix(a: Double, b: Double, e: Double): Double {
  return a + (b - a) * e
}

function mixPt(a: Pt, b: Pt, e: Double): Pt {
  return { x: mix(a.x, b.x, e), y: mix(a.y, b.y, e) }
}

function mixGrad(a: ChartGradient | undefined, b: ChartGradient | undefined, e: Double): ChartGradient | undefined {
  if (a === undefined || b === undefined) return b
  return { from: mixPt(a.from, b.from, e), to: mixPt(a.to, b.to, e), stops: b.stops }
}

/** True when the two lists can be interpolated command by command. */
export function sameCmdShape(a: DrawCmd[], b: DrawCmd[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    if (x.kind !== y.kind) return false
    if ((x.kind === 'polyline' || x.kind === 'polygon') && (y.kind === 'polyline' || y.kind === 'polygon') && x.points.length !== y.points.length) return false
    if (x.kind === 'text' && y.kind === 'text' && x.text !== y.text) return false
  }
  return true
}

/**
 * The frame at eased `e` (0..1) between two same-shape lists. Every number
 * that places or sizes a shape interpolates; strings (colours, text, dash
 * patterns) take the TARGET's value. A pair that fails `sameCmdShape` returns
 * the target as is.
 */
export function tweenCmds(from: DrawCmd[], to: DrawCmd[], e: Double): DrawCmd[] {
  if (e >= 1.0 || !sameCmdShape(from, to)) return to
  // No `e <= 0 → from` shortcut: colours snap to the TARGET at the first
  // frame (a recoloured cell must read as recoloured at once), only the
  // geometry starts where the old frame left it.
  const out: DrawCmd[] = []
  for (let i = 0; i < to.length; i++) {
    const a = from[i]!
    const b = to[i]!
    switch (b.kind) {
      case 'rect': {
        const ac = a as DrawCmd & { kind: 'rect' }
        const ar = ac.rect
        const grad = mixGrad(ac.grad, b.grad, e)
        out.push({
          ...b,
          rect: { x: mix(ar.x, b.rect.x, e), y: mix(ar.y, b.rect.y, e), w: mix(ar.w, b.rect.w, e), h: mix(ar.h, b.rect.h, e) },
          grad,
        })
        break
      }
      case 'line': {
        const al = a as DrawCmd & { kind: 'line' }
        out.push({ ...b, from: mixPt(al.from, b.from, e), to: mixPt(al.to, b.to, e) })
        break
      }
      case 'polyline': {
        const ap = a as DrawCmd & { kind: 'polyline' }
        out.push({ ...b, points: b.points.map((p, j) => mixPt(ap.points[j]!, p, e)) })
        break
      }
      case 'polygon': {
        const ap = a as DrawCmd & { kind: 'polygon' }
        out.push({ ...b, points: b.points.map((p, j) => mixPt(ap.points[j]!, p, e)), grad: mixGrad(ap.grad, b.grad, e) })
        break
      }
      case 'circle': {
        const ac = a as DrawCmd & { kind: 'circle' }
        out.push({ ...b, center: mixPt(ac.center, b.center, e), radius: mix(ac.radius, b.radius, e) })
        break
      }
      case 'text': {
        const at = a as DrawCmd & { kind: 'text' }
        out.push({ ...b, at: mixPt(at.at, b.at, e), size: mix(at.size, b.size, e) })
        break
      }
    }
  }
  return out
}

/** True when two same-shape lists place every shape at the same numbers — nothing to animate. */
export function cmdsEqual(a: DrawCmd[], b: DrawCmd[]): boolean {
  if (!sameCmdShape(a, b)) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    switch (y.kind) {
      case 'rect': {
        const r = (x as DrawCmd & { kind: 'rect' }).rect
        if (r.x !== y.rect.x || r.y !== y.rect.y || r.w !== y.rect.w || r.h !== y.rect.h || (x as DrawCmd & { kind: 'rect' }).fill !== y.fill) return false
        break
      }
      case 'line': {
        const l = x as DrawCmd & { kind: 'line' }
        if (l.from.x !== y.from.x || l.from.y !== y.from.y || l.to.x !== y.to.x || l.to.y !== y.to.y) return false
        break
      }
      case 'polyline':
      case 'polygon': {
        const p = (x as DrawCmd & { kind: 'polyline' }).points
        for (let j = 0; j < p.length; j++) if (p[j]!.x !== y.points[j]!.x || p[j]!.y !== y.points[j]!.y) return false
        break
      }
      case 'circle': {
        const c = x as DrawCmd & { kind: 'circle' }
        if (c.center.x !== y.center.x || c.center.y !== y.center.y || c.radius !== y.radius) return false
        break
      }
      case 'text': {
        const t = x as DrawCmd & { kind: 'text' }
        if (t.at.x !== y.at.x || t.at.y !== y.at.y || t.size !== y.size) return false
        break
      }
    }
  }
  return true
}
