// Theme river — a streamgraph: stacked layers on a symmetric (or zero) baseline.

import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed', '#0e7490', '#9333ea']

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

export interface RiverLayout {
  layers: RiverLayer[]
  xs: Double[]
  ticks: { x: Double; label: string }[]
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

/** Lay the layers out into `box`. */
export function layoutRiver(series: RiverSeries[], box: Rect, options?: RiverOptions): RiverLayout {
  const fontSize = options?.fontSize ?? 11.0
  const showAxis = options?.showAxis !== false
  const plot: Rect = { x: box.x, y: box.y, w: box.w, h: Math.max(0.0, box.h - (showAxis ? fontSize * 1.8 : 0.0)) }
  let n = 0
  for (const s of series) if (s.values.length > n) n = s.values.length
  if (options?.categories !== undefined && options.categories.length > n) n = options.categories.length
  const xs: Double[] = []
  for (let i = 0; i < n; i++) xs.push(n <= 1 ? plot.x + plot.w / 2.0 : plot.x + (plot.w * i) / (n - 1))
  const val = (s: RiverSeries, i: number): Double => {
    const v = s.values[i]
    return v === undefined || v !== v ? 0.0 : Math.max(0.0, v)
  }
  // Stack bottoms per category, then the baseline shift.
  const totals: Double[] = []
  for (let i = 0; i < n; i++) {
    let t = 0.0
    for (const s of series) t = t + val(s, i)
    totals.push(t)
  }
  const base: Double[] = totals.map((t) => (options?.baseline === 'zero' ? 0.0 : -t / 2.0))
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < n; i++) {
    if (base[i]! < lo) lo = base[i]!
    if (base[i]! + totals[i]! > hi) hi = base[i]! + totals[i]!
  }
  if (lo === Infinity) {
    lo = 0.0
    hi = 1.0
  }
  if (hi <= lo) hi = lo + 1.0
  const toY = (v: Double): Double => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h
  const layers: RiverLayer[] = []
  const cursor = base.slice()
  for (let si = 0; si < series.length; si++) {
    const s = series[si]!
    const top: Pt[] = []
    const bottom: Pt[] = []
    let widest = 0.0
    let widestAt = 0
    for (let i = 0; i < n; i++) {
      const v = val(s, i)
      const b = cursor[i]!
      bottom.push({ x: xs[i]!, y: toY(b) })
      top.push({ x: xs[i]!, y: toY(b + v) })
      if (v > widest) {
        widest = v
        widestAt = i
      }
      cursor[i] = b + v
    }
    const mid = { x: xs[widestAt] ?? plot.x, y: (top[widestAt]?.y ?? plot.y) / 2.0 + (bottom[widestAt]?.y ?? plot.y) / 2.0 }
    layers.push({ series: si, name: s.name, color: s.color ?? PALETTE[si % PALETTE.length]!, top, bottom, labelAt: mid, thickness: widest > 0.0 ? (bottom[widestAt]!.y - top[widestAt]!.y) : 0.0 })
  }
  const cats = options?.categories ?? []
  const ticks: { x: Double; label: string }[] = []
  if (showAxis && n > 0) {
    const every = Math.max(1, Math.ceil(n / 8))
    for (let i = 0; i < n; i = i + every) ticks.push({ x: xs[i]!, label: cats[i] ?? String(i + 1) })
  }
  return { layers, xs, ticks, plot }
}

/** Sample a Catmull–Rom spline through `pts` (8 segments per span). */
export function smoothPoints(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts.slice()
  const out: Pt[] = [pts[0]!]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2] ?? p2
    for (let k = 1; k <= 8; k++) {
      const t = k / 8.0
      const t2 = t * t
      const t3 = t2 * t
      const x = 0.5 * (2.0 * p1.x + (-p0.x + p2.x) * t + (2.0 * p0.x - 5.0 * p1.x + 4.0 * p2.x - p3.x) * t2 + (-p0.x + 3.0 * p1.x - 3.0 * p2.x + p3.x) * t3)
      const y = 0.5 * (2.0 * p1.y + (-p0.y + p2.y) * t + (2.0 * p0.y - 5.0 * p1.y + 4.0 * p2.y - p3.y) * t2 + (-p0.y + 3.0 * p1.y - 3.0 * p2.y + p3.y) * t3)
      out.push({ x, y })
    }
  }
  return out
}

/** The closed outline of a layer (top edge forward, bottom edge back). */
export function layerPolygon(layer: RiverLayer, curve: 'smooth' | 'linear', progress: Double): Pt[] {
  const count = progress >= 1.0 ? layer.top.length : Math.max(2, Math.floor(layer.top.length * progress))
  const top = curve === 'smooth' ? smoothPoints(layer.top.slice(0, count)) : layer.top.slice(0, count)
  const bottom = curve === 'smooth' ? smoothPoints(layer.bottom.slice(0, count)) : layer.bottom.slice(0, count)
  return [...top, ...bottom.reverse()]
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
  const m = measure ?? measureApprox()
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

function pointInPolygon(pts: Pt[], px: Double, py: Double): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!
    const b = pts[j]!
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The layer under a point (front-most wins), or null. */
export function hitRiver(layout: RiverLayout, px: Double, py: Double, curve?: 'smooth' | 'linear'): RiverLayer | null {
  for (let i = layout.layers.length - 1; i >= 0; i--) {
    const l = layout.layers[i]!
    if (l.thickness <= 0.0) continue
    if (pointInPolygon(layerPolygon(l, curve ?? 'smooth', 1.0), px, py)) return l
  }
  return null
}

export interface RiverToSvgOptions {
  series: RiverSeries[]
  width?: Double
  height?: Double
  river?: RiverOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Theme river → `<svg>` string, server-safe. */
export function riverToSvg(options: RiverToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 320.0
  const layout = layoutRiver(options.series, { x: 8.0, y: 8.0, w: Math.max(0.0, width - 16.0), h: Math.max(0.0, height - 16.0) }, options.river)
  const cmds = renderRiver(layout, options.river, options.measure ?? measureApprox())
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${options.series.length} streams over ${layout.xs.length} points (${options.series.map((s) => s.name).join(', ')}).` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
