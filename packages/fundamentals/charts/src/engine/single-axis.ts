// Single axis — points along one horizontal axis (category or value), sized by a second dimension.

import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

export interface SingleAxisSpec {
  type?: 'category' | 'value' | undefined
  categories?: string[] | undefined
  /** Fixed extent for a value axis; default the data's min/max. */
  domain?: [Double, Double] | undefined
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

export interface SingleAxisLayout {
  axis: { y: Double; x0: Double; x1: Double; ticks: { x: Double; label: string }[]; name: string | undefined }
  points: { index: number; at: Pt; radius: Double; color: string; name: string | undefined }[]
}

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
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v = v + step) out.push(Math.round(v * 1e6) / 1e6)
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
  let lo = 0.0
  let hi = 1.0
  if (isCat) {
    lo = 0.0
    hi = Math.max(0, (axis.categories ?? []).length - 1)
  } else if (axis.domain !== undefined) {
    lo = axis.domain[0]
    hi = axis.domain[1]
  } else {
    lo = Infinity
    hi = -Infinity
    for (const p of points) {
      if (p.x < lo) lo = p.x
      if (p.x > hi) hi = p.x
    }
    if (lo === Infinity) {
      lo = 0.0
      hi = 1.0
    }
  }
  const span = hi - lo
  const px = (v: Double): Double => (span <= 0.0 ? (x0 + x1) / 2.0 : x0 + ((v - lo) / span) * (x1 - x0))
  const ticks: { x: Double; label: string }[] = []
  if (isCat) {
    const cats = axis.categories ?? []
    for (let i = 0; i < cats.length; i++) ticks.push({ x: px(i), label: cats[i]! })
  } else {
    for (const v of niceTicks(lo, hi, 6)) ticks.push({ x: px(v), label: String(v) })
  }
  let maxSize = 0.0
  for (const p of points) if (p.size !== undefined && p.size > maxSize) maxSize = p.size
  const color = options?.color ?? '#0f766e'
  const laid = points.map((p, i) => ({
    index: i,
    at: { x: px(p.x), y },
    radius: p.size === undefined || maxSize <= 0.0 ? base : base * (0.6 + 1.4 * Math.sqrt(Math.max(0.0, p.size) / maxSize)),
    color: p.color ?? color,
    name: p.name,
  }))
  return { axis: { y, x0, x1, ticks, name: axis.name }, points: laid }
}

/** Render the axis line + ticks, then the points, then labels. */
export function renderSingleAxis(layout: SingleAxisLayout, options?: SingleAxisOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const fontSize = options?.fontSize ?? 11.0
  const axisColor = options?.axisColor ?? '#94a3b8'
  const labelColor = options?.labelColor ?? '#334155'
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  void (measure ?? measureApprox())
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
  let bestD = Infinity
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

export interface SingleAxisToSvgOptions {
  axis: SingleAxisSpec
  points: SingleAxisPoint[]
  width?: Double
  height?: Double
  options?: SingleAxisOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Single-axis scatter → `<svg>` string, server-safe. */
export function singleAxisToSvg(o: SingleAxisToSvgOptions): string {
  const width = o.width ?? 640.0
  const height = o.height ?? 120.0
  const layout = layoutSingleAxis(o.axis, o.points, { x: 0.0, y: 0.0, w: width, h: height }, o.options)
  const cmds = renderSingleAxis(layout, o.options, o.measure ?? measureApprox())
  const description = o.description ?? (o.title !== undefined ? `${o.title}: ${o.points.length} points on a ${o.axis.type ?? 'value'} axis.` : undefined)
  return renderSvg(cmds, width, height, {
    ...o.svg,
    ...(o.title !== undefined ? { title: o.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
