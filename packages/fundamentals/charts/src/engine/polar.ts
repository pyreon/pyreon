// Polar coordinate — bars and lines on an angle/radius pair.
//
// Two shapes, decided by which axis carries the categories: categories on the
// ANGLE axis give radial bars (spokes growing outward) and a polar line; on
// the RADIUS axis they give concentric arc bars sweeping by value.

import { arcPolygon, pointOnCircle } from './arc'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const TAU = Math.PI * 2.0
const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

export interface PolarSeries {
  name: string
  kind: 'bar' | 'line'
  values: Double[]
  color?: string | undefined
  /** Bars sharing a stack key accumulate along the value axis (angle-category only). */
  stack?: string | undefined
}

export interface PolarAxes {
  categories: string[]
  /** Which axis the categories sit on; default 'angle'. */
  categoryOn?: 'angle' | 'radius' | undefined
  /** Fixed value extent; default [0, max]. */
  valueDomain?: [Double, Double] | undefined
  /** Radians, screen orientation; default 12 o'clock. */
  startAngle?: Double | undefined
  clockwise?: boolean | undefined
}

export interface PolarSector {
  series: number
  index: number
  start: Double
  end: Double
  innerR: Double
  outerR: Double
  color: string
  value: Double
}

export interface PolarPoint {
  series: number
  index: number
  at: Pt
  color: string
  value: Double
}

export interface PolarLayout {
  center: Pt
  innerR: Double
  outerR: Double
  domain: [Double, Double]
  categoryOn: 'angle' | 'radius'
  sectors: PolarSector[]
  /** Line series points, one array per line series (index into `series`). */
  lines: { series: number; color: string; points: PolarPoint[] }[]
  /** Category label anchors at the rim (angle) or per ring (radius). */
  categoryLabels: { text: string; at: Pt; align: 'start' | 'middle' | 'end' }[]
  ticks: { value: Double; label: string }[]
}

export interface PolarOptions {
  /** Hole radius as a fraction of the outer radius; default 0. */
  innerRatio?: Double | undefined
  /** Fraction of each category slot left empty between bars; default 0.2. */
  barGap?: Double | undefined
  showGrid?: boolean | undefined
  showLabels?: boolean | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  gridColor?: string | undefined
  lineWidth?: Double | undefined
  /** Entrance progress 0..1; bars grow, lines draw. */
  progress?: Double | undefined
}

function niceTicks(lo: Double, hi: Double): Double[] {
  if (hi <= lo) return [lo]
  const raw = (hi - lo) / 3.0
  const mag = Math.pow(10.0, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm >= 5.0 ? 5.0 : norm >= 2.0 ? 2.0 : 1.0) * mag
  const out: Double[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v = v + step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

/** Lay out the series into `box`. */
export function layoutPolar(axes: PolarAxes, series: PolarSeries[], box: Rect, options?: PolarOptions): PolarLayout {
  const categoryOn = axes.categoryOn ?? 'angle'
  const n = axes.categories.length
  const fontSize = options?.fontSize ?? 11.0
  const gutter = options?.showLabels === false ? 4.0 : fontSize * 3.0
  const center: Pt = { x: box.x + box.w / 2.0, y: box.y + box.h / 2.0 }
  const outerR = Math.max(0.0, Math.min(box.w, box.h) / 2.0 - gutter)
  const innerR = outerR * Math.max(0.0, Math.min(0.95, options?.innerRatio ?? 0.0))
  const start = axes.startAngle ?? -Math.PI / 2.0
  const dir = axes.clockwise === false ? -1.0 : 1.0
  const barGap = options?.barGap ?? 0.2
  // Stacked totals decide the domain; a stack accumulates per category.
  const stackTop = new Map<string, Double[]>()
  let lo = 0.0
  let hi = 0.0
  for (const s of series) {
    for (let i = 0; i < n; i++) {
      const v = s.values[i]
      if (v === undefined || v !== v) continue
      if (s.kind === 'bar' && s.stack !== undefined && categoryOn === 'angle') {
        const acc = stackTop.get(s.stack) ?? new Array<Double>(n).fill(0.0)
        acc[i] = acc[i]! + v
        stackTop.set(s.stack, acc)
        if (acc[i]! > hi) hi = acc[i]!
        if (acc[i]! < lo) lo = acc[i]!
      } else {
        if (v > hi) hi = v
        if (v < lo) lo = v
      }
    }
  }
  const domain: [Double, Double] = axes.valueDomain ?? [lo, hi]
  const span = domain[1] - domain[0]
  const frac = (v: Double): Double => {
    const t = span <= 0.0 ? 0.0 : (v - domain[0]) / span
    return t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t
  }
  const radiusOf = (v: Double): Double => innerR + (outerR - innerR) * frac(v)
  const sectors: PolarSector[] = []
  const lines: PolarLayout['lines'] = []
  const categoryLabels: PolarLayout['categoryLabels'] = []
  const barSeries = series.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'bar')
  // Grouped bars share a slot; stacked ones share a column within it.
  const columns: string[] = []
  for (const b of barSeries) {
    const key = b.s.stack ?? '#' + String(b.i)
    if (!columns.includes(key)) columns.push(key)
  }
  const running = new Map<string, Double[]>()
  if (categoryOn === 'angle') {
    const slot = n <= 0 ? 0.0 : TAU / n
    const angleOf = (i: Double): Double => start + dir * slot * i
    for (const b of barSeries) {
      const key = b.s.stack ?? '#' + String(b.i)
      const col = columns.indexOf(key)
      const acc = running.get(key) ?? new Array<Double>(n).fill(0.0)
      running.set(key, acc)
      const color = b.s.color ?? PALETTE[b.i % PALETTE.length]!
      for (let i = 0; i < n; i++) {
        const v = b.s.values[i]
        if (v === undefined || v !== v) continue
        const inner = slot * barGap / 2.0
        const width = (slot - slot * barGap) / columns.length
        const a0 = angleOf(i) + dir * (inner + width * col)
        const a1 = a0 + dir * width
        const base = acc[i]!
        acc[i] = base + v
        sectors.push({ series: b.i, index: i, start: Math.min(a0, a1), end: Math.max(a0, a1), innerR: radiusOf(base), outerR: radiusOf(base + v), color, value: v })
      }
    }
    for (let si = 0; si < series.length; si++) {
      const s = series[si]!
      if (s.kind !== 'line') continue
      const color = s.color ?? PALETTE[si % PALETTE.length]!
      const points: PolarPoint[] = []
      for (let i = 0; i < n; i++) {
        const v = s.values[i]
        if (v === undefined || v !== v) continue
        points.push({ series: si, index: i, at: pointOnCircle(center, radiusOf(v), angleOf(i + 0.5)), color, value: v })
      }
      lines.push({ series: si, color, points })
    }
    for (let i = 0; i < n; i++) {
      const a = angleOf(i + 0.5)
      const at = pointOnCircle(center, outerR + fontSize * 0.6, a)
      const c = Math.cos(a)
      categoryLabels.push({ text: axes.categories[i]!, at, align: c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle' })
    }
  } else {
    const ring = n <= 0 ? 0.0 : (outerR - innerR) / n
    for (const b of barSeries) {
      const col = columns.indexOf(b.s.stack ?? '#' + String(b.i))
      const color = b.s.color ?? PALETTE[b.i % PALETTE.length]!
      for (let i = 0; i < n; i++) {
        const v = b.s.values[i]
        if (v === undefined || v !== v) continue
        const r0 = innerR + ring * i + ring * barGap / 2.0
        const width = (ring - ring * barGap) / columns.length
        const sweep = dir * TAU * frac(v)
        sectors.push({ series: b.i, index: i, start: Math.min(start, start + sweep), end: Math.max(start, start + sweep), innerR: r0 + width * col, outerR: r0 + width * (col + 1), color, value: v })
      }
    }
    for (let si = 0; si < series.length; si++) {
      const s = series[si]!
      if (s.kind !== 'line') continue
      const color = s.color ?? PALETTE[si % PALETTE.length]!
      const points: PolarPoint[] = []
      for (let i = 0; i < n; i++) {
        const v = s.values[i]
        if (v === undefined || v !== v) continue
        points.push({ series: si, index: i, at: pointOnCircle(center, innerR + ring * (i + 0.5), start + dir * TAU * frac(v)), color, value: v })
      }
      lines.push({ series: si, color, points })
    }
    for (let i = 0; i < n; i++) categoryLabels.push({ text: axes.categories[i]!, at: { x: center.x + 4.0, y: center.y - (innerR + ring * (i + 0.5)) }, align: 'start' })
  }
  const ticks = niceTicks(domain[0], domain[1]).map((v) => ({ value: v, label: String(v) }))
  return { center, innerR, outerR, domain, categoryOn, sectors, lines, categoryLabels, ticks }
}

/** Render grid, then bars, then lines, then labels. */
export function renderPolar(layout: PolarLayout, options?: PolarOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const gridColor = options?.gridColor ?? '#e2e8f0'
  const labelColor = options?.labelColor ?? '#64748b'
  const fontSize = options?.fontSize ?? 11.0
  const lineWidth = options?.lineWidth ?? 2.0
  void (measure ?? measureApprox())
  const c = layout.center
  const span = layout.domain[1] - layout.domain[0]
  if (options?.showGrid !== false) {
    if (layout.categoryOn === 'angle') {
      for (const t of layout.ticks) {
        const f = span <= 0.0 ? 0.0 : (t.value - layout.domain[0]) / span
        const r = layout.innerR + (layout.outerR - layout.innerR) * f
        if (r <= 0.0) continue
        out.push({ kind: 'polyline', points: arcPolygon(c, r, 0.0, 0.0, TAU).slice(0, 65), stroke: gridColor, width: 1.0 })
      }
    } else {
      for (let k = 0; k < 8; k++) out.push({ kind: 'line', from: c, to: pointOnCircle(c, layout.outerR, (k / 8.0) * TAU), stroke: gridColor, width: 1.0 })
      out.push({ kind: 'polyline', points: arcPolygon(c, layout.outerR, 0.0, 0.0, TAU).slice(0, 65), stroke: gridColor, width: 1.0 })
    }
  }
  for (const s of layout.sectors) {
    const outerR = layout.categoryOn === 'angle' ? s.innerR + (s.outerR - s.innerR) * progress : s.outerR
    const end = layout.categoryOn === 'radius' ? s.start + (s.end - s.start) * progress : s.end
    if (outerR <= s.innerR || end <= s.start) continue
    out.push({ kind: 'polygon', points: arcPolygon(c, outerR, s.innerR, s.start, end), fill: s.color })
  }
  for (const l of layout.lines) {
    const count = progress >= 1.0 ? l.points.length : Math.floor(l.points.length * progress)
    const pts = l.points.slice(0, count).map((p) => p.at)
    if (pts.length > 1) out.push({ kind: 'polyline', points: pts, stroke: l.color, width: lineWidth })
    for (const p of pts) out.push({ kind: 'circle', center: p, radius: 2.5, fill: l.color })
  }
  if (options?.showLabels !== false && progress >= 1.0) {
    for (const lab of layout.categoryLabels) out.push({ kind: 'text', text: lab.text, at: lab.at, fill: labelColor, size: fontSize, align: lab.align, baseline: 'middle' })
  }
  return out
}

export type PolarHit = { kind: 'sector'; sector: PolarSector } | { kind: 'point'; point: PolarPoint } | null

/** A sector under the point, else the nearest line point within 6px, else null. */
export function hitPolar(layout: PolarLayout, px: Double, py: Double): PolarHit {
  const dx = px - layout.center.x
  const dy = py - layout.center.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const ang = Math.atan2(dy, dx)
  for (const s of layout.sectors) {
    if (dist < s.innerR || dist > s.outerR) continue
    let t = ang
    while (t < s.start) t = t + TAU
    while (t >= s.start + TAU) t = t - TAU
    if (t <= s.end) return { kind: 'sector', sector: s }
  }
  let best: PolarPoint | null = null
  let bestD = 36.0
  for (const l of layout.lines) {
    for (const p of l.points) {
      const d = (px - p.at.x) * (px - p.at.x) + (py - p.at.y) * (py - p.at.y)
      if (d <= bestD) {
        best = p
        bestD = d
      }
    }
  }
  return best === null ? null : { kind: 'point', point: best }
}

export interface PolarToSvgOptions {
  axes: PolarAxes
  series: PolarSeries[]
  width?: Double
  height?: Double
  polar?: PolarOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Polar chart → `<svg>` string, server-safe. */
export function polarToSvg(options: PolarToSvgOptions): string {
  const width = options.width ?? 480.0
  const height = options.height ?? 480.0
  const layout = layoutPolar(options.axes, options.series, { x: 0.0, y: 0.0, w: width, h: height }, options.polar)
  const cmds = renderPolar(layout, options.polar, options.measure ?? measureApprox())
  const description =
    options.description ??
    (options.title !== undefined
      ? `${options.title}: ${options.series.length} series over ${options.axes.categories.length} categories, values ${layout.domain[0]} to ${layout.domain[1]}.`
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
