// Theme river — a streamgraph: stacked layers on a symmetric (or zero) baseline.
// Written in the native subset and BUNDLED into the generated Swift/Kotlin
// engine (no Infinity sentinels, no slices/spreads, no optional chaining on
// indices, named tick struct); the svg half lives in family-svg.ts.

import { approxTextWidth } from './treemap'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const RIVER_PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed', '#0e7490', '#9333ea']

export interface RiverSeries {
  name: string
  /** One value per category; missing / non-finite counts as 0. */
  values: Double[]
  color?: string | undefined
}

export interface RiverLayer {
  series: number
  name: string
  color: string
  /** Upper and lower edges, one point per category, in draw order. */
  top: Pt[]
  bottom: Pt[]
  /** Anchor at the layer's widest point — where a label fits best. */
  labelAt: Pt
  thickness: Double
}

export interface RiverTick {
  x: Double
  label: string
}

export interface RiverLayout {
  layers: RiverLayer[]
  xs: Double[]
  ticks: RiverTick[]
  plot: Rect
}

export interface RiverOptions {
  categories?: string[] | undefined
  /** 'silhouette' (default) centres the stack on a midline; 'zero' stacks from the bottom. */
  baseline?: 'silhouette' | 'zero' | undefined
  curve?: 'smooth' | 'linear' | undefined
  showLabels?: boolean | undefined
  showAxis?: boolean | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  axisColor?: string | undefined
  /** Entrance progress 0..1; the river flows in from the left. */
  progress?: Double | undefined
}

/** A series value at `i`: missing and non-finite count as 0, negatives clamp to 0. */
function riverValue(s: RiverSeries, i: number): Double {
  if (i >= s.values.length) return 0.0
  const v = s.values[i]!
  if (v !== v) return 0.0
  return v < 0.0 ? 0.0 : v
}

/** Lay the layers out into `box`. */
export function layoutRiver(series: RiverSeries[], box: Rect, options?: RiverOptions): RiverLayout {
  const fontSize = options?.fontSize ?? 11.0
  const showAxis = options?.showAxis !== false
  const rawH = box.h - (showAxis ? fontSize * 1.8 : 0.0)
  const plot: Rect = { x: box.x, y: box.y, w: box.w, h: rawH < 0.0 ? 0.0 : rawH }
  let n = 0
  for (const s of series) if (s.values.length > n) n = s.values.length
  const cats = options?.categories ?? []
  if (cats.length > n) n = cats.length
  // nF mirrors the category count as a Double for the x spacing.
  let nF = 0.0
  for (let i = 0; i < n; i++) nF = nF + 1.0
  const xs: Double[] = []
  let iF = 0.0
  for (let i = 0; i < n; i++) {
    xs.push(nF <= 1.0 ? plot.x + plot.w / 2.0 : plot.x + (plot.w * iF) / (nF - 1.0))
    iF = iF + 1.0
  }
  // Stack bottoms per category, then the baseline shift.
  const totals: Double[] = []
  for (let i = 0; i < n; i++) {
    let t = 0.0
    for (const s of series) t = t + riverValue(s, i)
    totals.push(t)
  }
  const zeroBase = options?.baseline === 'zero'
  const base: Double[] = []
  for (const t of totals) base.push(zeroBase ? 0.0 : -t / 2.0)
  let lo = 0.0
  let hi = 1.0
  let seen = false
  for (let i = 0; i < n; i++) {
    const b = base[i]!
    const top = b + totals[i]!
    if (!seen || b < lo) lo = b
    if (!seen || top > hi) hi = top
    seen = true
  }
  if (hi <= lo) hi = lo + 1.0
  const layers: RiverLayer[] = []
  const cursor: Double[] = []
  for (const b of base) cursor.push(b)
  for (let si = 0; si < series.length; si++) {
    const s = series[si]!
    const top: Pt[] = []
    const bottom: Pt[] = []
    let widest = 0.0
    let widestAt = 0
    for (let i = 0; i < n; i++) {
      const v = riverValue(s, i)
      const b = cursor[i]!
      bottom.push({ x: xs[i]!, y: plot.y + plot.h - ((b - lo) / (hi - lo)) * plot.h })
      top.push({ x: xs[i]!, y: plot.y + plot.h - ((b + v - lo) / (hi - lo)) * plot.h })
      if (v > widest) {
        widest = v
        widestAt = i
      }
      cursor[i] = b + v
    }
    const hasPts = n > 0
    const midX = hasPts ? xs[widestAt]! : plot.x
    const midY = hasPts ? top[widestAt]!.y / 2.0 + bottom[widestAt]!.y / 2.0 : plot.y
    const thickness = hasPts && widest > 0.0 ? bottom[widestAt]!.y - top[widestAt]!.y : 0.0
    layers.push({ series: si, name: s.name, color: s.color ?? RIVER_PALETTE[si % RIVER_PALETTE.length]!, top, bottom, labelAt: { x: midX, y: midY }, thickness })
  }
  const ticks: RiverTick[] = []
  if (showAxis && n > 0) {
    // At most ~8 ticks: every = ceil(n / 8) as an integer scan.
    let every = 1
    while (every * 8 < n) every = every + 1
    let ti = 0
    while (ti < n) {
      ticks.push({ x: xs[ti]!, label: ti < cats.length ? cats[ti]! : `${ti + 1}` })
      ti = ti + every
    }
  }
  return { layers, xs, ticks, plot }
}

/** Sample a Catmull–Rom spline through `pts` (8 segments per span). */
export function smoothPoints(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  if (pts.length < 3) {
    for (const p of pts) out.push(p)
    return out
  }
  out.push(pts[0]!)
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p0 = i > 0 ? pts[i - 1]! : p1
    const p3 = i + 2 < pts.length ? pts[i + 2]! : p2
    let kf = 1.0
    for (let k = 1; k <= 8; k++) {
      const t = kf / 8.0
      const t2 = t * t
      const t3 = t2 * t
      const x = 0.5 * (2.0 * p1.x + (-p0.x + p2.x) * t + (2.0 * p0.x - 5.0 * p1.x + 4.0 * p2.x - p3.x) * t2 + (-p0.x + 3.0 * p1.x - 3.0 * p2.x + p3.x) * t3)
      const y = 0.5 * (2.0 * p1.y + (-p0.y + p2.y) * t + (2.0 * p0.y - 5.0 * p1.y + 4.0 * p2.y - p3.y) * t2 + (-p0.y + 3.0 * p1.y - 3.0 * p2.y + p3.y) * t3)
      out.push({ x, y })
      kf = kf + 1.0
    }
  }
  return out
}

/** The closed outline of a layer (top edge forward, bottom edge back). */
export function layerPolygon(layer: RiverLayer, curve: 'smooth' | 'linear', progress: Double): Pt[] {
  // countF = progress >= 1 ? n : max(2, floor(n * progress)), as a Double scan.
  let lenF = 0.0
  for (let i = 0; i < layer.top.length; i++) lenF = lenF + 1.0
  let countF = 0.0
  if (progress >= 1.0) countF = lenF
  else {
    while (countF + 1.0 <= lenF * progress) countF = countF + 1.0
    if (countF < 2.0) countF = 2.0
  }
  const topCut: Pt[] = []
  const bottomCut: Pt[] = []
  let iF = 0.0
  for (let i = 0; i < layer.top.length; i++) {
    if (iF >= countF) break
    topCut.push(layer.top[i]!)
    if (i < layer.bottom.length) bottomCut.push(layer.bottom[i]!)
    iF = iF + 1.0
  }
  const top = curve === 'smooth' ? smoothPoints(topCut) : topCut
  const bottom = curve === 'smooth' ? smoothPoints(bottomCut) : bottomCut
  const out: Pt[] = []
  for (const p of top) out.push(p)
  let bi = bottom.length - 1
  while (bi >= 0) {
    out.push(bottom[bi]!)
    bi = bi - 1
  }
  return out
}

/** Render layers back to front, then the axis and labels. */
export function renderRiver(layout: RiverLayout, options?: RiverOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const curve = options?.curve ?? 'smooth'
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#ffffff'
  const axisColor = options?.axisColor ?? '#94a3b8'
  const m: MeasureText = measure ?? approxTextWidth
  if (progress <= 0.0 || layout.xs.length < 2) return out
  for (const l of layout.layers) {
    if (l.thickness <= 0.0) continue
    out.push({ kind: 'polygon', points: layerPolygon(l, curve, progress), fill: l.color })
  }
  if (progress < 1.0) return out
  if (options?.showAxis !== false && layout.ticks.length > 0) {
    const y = layout.plot.y + layout.plot.h
    out.push({ kind: 'line', from: { x: layout.plot.x, y }, to: { x: layout.plot.x + layout.plot.w, y }, stroke: axisColor, width: 1.0 })
    for (const t of layout.ticks) out.push({ kind: 'text', text: t.label, at: { x: t.x, y: y + 4.0 }, fill: '#64748b', size: fontSize, align: 'middle', baseline: 'top' })
  }
  if (options?.showLabels !== false) {
    for (const l of layout.layers) {
      if (l.thickness < fontSize + 2.0) continue
      if (m(l.name, fontSize) > layout.plot.w / 3.0) continue
      out.push({ kind: 'text', text: l.name, at: l.labelAt, fill: labelColor, size: fontSize, align: 'middle', baseline: 'middle' })
    }
  }
  return out
}

/** Ray-cast point-in-polygon (even-odd). */
function riverPointInPolygon(pts: Pt[], px: Double, py: Double): boolean {
  let inside = false
  let j = pts.length - 1
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[j]!
    const aAbove = a.y > py
    const bAbove = b.y > py
    if (aAbove !== bAbove && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
    j = i
  }
  return inside
}

/** The layer under a point (front-most wins), or null. */
export function hitRiver(layout: RiverLayout, px: Double, py: Double, curve?: 'smooth' | 'linear'): RiverLayer | null {
  const shape = curve ?? 'smooth'
  let bestIdx = -1
  for (let i = layout.layers.length - 1; i >= 0; i--) {
    if (bestIdx >= 0) continue
    const l = layout.layers[i]!
    if (l.thickness > 0.0 && riverPointInPolygon(layerPolygon(l, shape, 1.0), px, py)) bestIdx = i
  }
  if (bestIdx < 0) return null
  return layout.layers[bestIdx]!
}
