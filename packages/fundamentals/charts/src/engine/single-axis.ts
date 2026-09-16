// Single axis — points along one horizontal axis (category or value), sized by a second dimension.

import type { Domain, Double, DrawCmd, Pt, Rect } from './types'

export interface SingleAxisSpec {
  type?: 'category' | 'value' | undefined
  categories?: string[] | undefined
  /** Fixed extent for a value axis; default the data's min/max. */
  domain?: Domain | undefined
  name?: string | undefined
}

export interface SingleAxisPoint {
  /** Category index or value, depending on the axis type. */
  x: Double
  /** Size channel; undefined = base radius. */
  size?: Double | undefined
  name?: string | undefined
  color?: string | undefined
}

export interface SingleAxisTick { x: Double; label: string; index: number }
export interface SingleAxisLayoutAxis { y: Double; x0: Double; x1: Double; ticks: SingleAxisTick[]; name: string | undefined }

export interface SingleAxisLayout {
  axis: SingleAxisLayoutAxis
  points: SingleAxisLayoutPoint[]
}

export interface SingleAxisLayoutPoint { index: number; at: Pt; radius: Double; color: string; name: string | undefined }

export interface SingleAxisOptions {
  radius?: Double | undefined
  color?: string | undefined
  showLabels?: boolean | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  axisColor?: string | undefined
  progress?: Double | undefined
}

function niceTicks(lo: Double, hi: Double, count: number): Double[] {
  if (hi <= lo) return [lo]
  const raw = (hi - lo) / count
  const mag = Math.pow(10.0, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm >= 5.0 ? 5.0 : norm >= 2.0 ? 2.0 : 1.0) * mag
  const out: Double[] = []
  let v = Math.ceil(lo / step) * step
  while (v <= hi + 1e-9) {
    out.push(Math.round(v * 1e6) / 1e6)
    v = v + step
  }
  return out
}

/** Lay the axis across `box` (vertically centred) and place the points on it. */
export function layoutSingleAxis(axis: SingleAxisSpec, points: SingleAxisPoint[], box: Rect, options?: SingleAxisOptions): SingleAxisLayout {
  const fontSize = options?.fontSize ?? 11.0
  const base = options?.radius ?? 5.0
  const isCat = axis.type === 'category'
  const gutter = fontSize * 2.0
  const x0 = box.x + gutter
  const x1 = box.x + box.w - gutter
  const y = box.y + box.h / 2.0
  // No initializer: every branch below assigns both before use (checked —
  // isCat / domain / points-extent all set lo+hi unconditionally), so a
  // starting value here is dead code a static analyzer correctly flags.
  let lo: Double
  let hi: Double
  if (isCat) {
    lo = 0.0
    hi = Math.max(0.0, (axis.categories ?? []).length * 1.0 - 1.0)
  } else if (axis.domain !== undefined) {
    const domain: Domain = axis.domain ?? { min: 0.0, max: 1.0 }
    lo = domain.min
    hi = domain.max
  } else {
    lo = 999999999999999.0
    hi = -999999999999999.0
    for (const p of points) {
      if (p.x < lo) lo = p.x
      if (p.x > hi) hi = p.x
    }
    if (lo === 999999999999999.0) {
      lo = 0.0
      hi = 1.0
    }
  }
  const span = hi - lo
  const px = (v: Double): Double => (span <= 0.0 ? (x0 + x1) / 2.0 : x0 + ((v - lo) / span) * (x1 - x0))
  const ticks: SingleAxisTick[] = []
  if (isCat) {
    const cats = axis.categories ?? []
    for (let i = 0; i < cats.length; i++) ticks.push({ x: px(i * 1.0), label: cats[i]!, index: i })
  } else {
    let index = 0
    for (const v of niceTicks(lo, hi, 6)) {
      ticks.push({ x: px(v), label: String(v), index })
      index++
    }
  }
  let maxSize = 0.0
  for (const p of points) {
    const pointSize = p.size ?? 0.0
    if (pointSize > maxSize) maxSize = pointSize
  }
  const color = options?.color ?? '#0f766e'
  const laid: SingleAxisLayoutPoint[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const pointSize = p.size ?? 0.0
    const hasSize = p.size !== undefined
    laid.push({
      index: i,
      at: { x: px(p.x), y },
      radius: !hasSize || maxSize <= 0.0 ? base : base * (0.6 + 1.4 * Math.sqrt(Math.max(0.0, pointSize) / maxSize)),
      color: p.color ?? color,
      name: p.name,
    })
  }
  return { axis: { y, x0, x1, ticks, name: axis.name }, points: laid }
}

/** Render the axis line + ticks, then the points, then labels. */
export function renderSingleAxis(layout: SingleAxisLayout, options?: SingleAxisOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const fontSize = options?.fontSize ?? 11.0
  const axisColor = options?.axisColor ?? '#94a3b8'
  const labelColor = options?.labelColor ?? '#334155'
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const a = layout.axis
  out.push({ kind: 'line', from: { x: a.x0, y: a.y }, to: { x: a.x1, y: a.y }, stroke: axisColor, width: 1.0 })
  for (const t of a.ticks) {
    out.push({ kind: 'line', from: { x: t.x, y: a.y }, to: { x: t.x, y: a.y + 4.0 }, stroke: axisColor, width: 1.0 })
    out.push({ kind: 'text', text: t.label, at: { x: t.x, y: a.y + 8.0 }, fill: labelColor, size: fontSize, align: 'middle', baseline: 'top' })
  }
  if (a.name !== undefined) out.push({ kind: 'text', text: a.name, at: { x: a.x1, y: a.y + fontSize * 2.2 }, fill: labelColor, size: fontSize, align: 'end', baseline: 'top' })
  for (const p of layout.points) {
    out.push({ kind: 'circle', center: p.at, radius: p.radius * progress, fill: p.color })
    if (options?.showLabels === true && progress >= 1.0 && p.name !== undefined) {
      out.push({ kind: 'text', text: p.name, at: { x: p.at.x, y: p.at.y - p.radius - 4.0 }, fill: labelColor, size: fontSize, align: 'middle', baseline: 'bottom' })
    }
  }
  return out
}

/** The point under a pixel (nearest within its symbol + halo), or -1. */
export function hitSingleAxis(layout: SingleAxisLayout, px: Double, py: Double): number {
  let best = -1
  let bestD = 999999999999999.0
  for (const p of layout.points) {
    const d = (px - p.at.x) * (px - p.at.x) + (py - p.at.y) * (py - p.at.y)
    const r = p.radius + 3.0
    if (d <= r * r && d < bestD) {
      best = p.index
      bestD = d
    }
  }
  return best
}
