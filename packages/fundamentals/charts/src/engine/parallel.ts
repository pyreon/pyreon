// Parallel coordinates — one vertical axis per dimension, one polyline per row.

import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

export interface ParallelAxis {
  name: string
  /** 'value' (default) maps numbers linearly; 'category' maps strings by position in `categories`. */
  type?: 'value' | 'category' | undefined
  categories?: string[] | undefined
  /** Fixed extent for a value axis; default the data's min/max. */
  domain?: [Double, Double] | undefined
  /** Flip so the largest value sits at the bottom. */
  inverse?: boolean | undefined
}

export type ParallelRow = (Double | string | null)[]

export interface ParallelLayoutAxis {
  name: string
  x: Double
  y0: Double
  y1: Double
  /** Resolved extent (category axes: [0, n-1]). */
  domain: [Double, Double]
  ticks: { y: Double; label: string }[]
  /** Y for a raw datum, or null when it cannot be placed on this axis. */
  place: (v: Double | string | null) => Double | null
}

export interface ParallelLine {
  index: number
  /** One point per axis; a null datum breaks the line into runs. */
  points: (Pt | null)[]
  color: string
}

export interface ParallelLayout {
  axes: ParallelLayoutAxis[]
  lines: ParallelLine[]
}

export interface ParallelOptions {
  fontSize?: Double | undefined
  labelColor?: string | undefined
  axisColor?: string | undefined
  /** Line colour for every row, or per row. */
  lineColor?: string | ((row: ParallelRow, index: number) => string) | undefined
  lineOpacity?: Double | undefined
  lineWidth?: Double | undefined
  /** Row indices drawn last, full opacity, in `highlightColor`. */
  highlight?: number[] | undefined
  highlightColor?: string | undefined
  /** Entrance progress 0..1; lines draw left to right. */
  progress?: Double | undefined
}

function rgba(hex: string, alpha: Double): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  if (h.length < 6) return hex
  const ch = (at: number): number => parseInt(h.slice(at, at + 2), 16)
  return `rgba(${ch(0)}, ${ch(2)}, ${ch(4)}, ${alpha})`
}

/** Lay out the axes into `box` and place every row. */
export function layoutParallel(axes: ParallelAxis[], rows: ParallelRow[], box: Rect, options?: ParallelOptions): ParallelLayout {
  const fontSize = options?.fontSize ?? 11.0
  const top = box.y + fontSize * 1.8
  const bottom = box.y + box.h - fontSize * 1.4
  const n = axes.length
  const outAxes: ParallelLayoutAxis[] = []
  for (let a = 0; a < n; a++) {
    const axis = axes[a]!
    const x = n <= 1 ? box.x + box.w / 2.0 : box.x + (box.w * a) / (n - 1)
    const isCat = axis.type === 'category'
    let lo = Infinity
    let hi = -Infinity
    if (isCat) {
      lo = 0.0
      hi = Math.max(0, (axis.categories ?? []).length - 1)
    } else if (axis.domain !== undefined) {
      lo = axis.domain[0]
      hi = axis.domain[1]
    } else {
      for (const r of rows) {
        const v = r[a]
        if (typeof v !== 'number' || v !== v) continue
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      if (lo === Infinity) {
        lo = 0.0
        hi = 1.0
      }
    }
    const span = hi - lo
    const inverse = axis.inverse === true
    const toY = (t: Double): Double => (inverse ? top + (bottom - top) * t : bottom - (bottom - top) * t)
    const place = (v: Double | string | null): Double | null => {
      if (v === null) return null
      if (isCat) {
        const idx = typeof v === 'string' ? (axis.categories ?? []).indexOf(v) : typeof v === 'number' ? v : -1
        if (idx < 0 || idx > hi) return null
        return toY(span <= 0.0 ? 0.5 : idx / span)
      }
      if (typeof v !== 'number' || v !== v) return null
      const t = span <= 0.0 ? 0.5 : (v - lo) / span
      return toY(t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t)
    }
    const ticks: { y: Double; label: string }[] = []
    if (isCat) {
      const cats = axis.categories ?? []
      for (let i = 0; i < cats.length; i++) ticks.push({ y: place(i)!, label: cats[i]! })
    } else {
      ticks.push({ y: toY(0.0), label: String(lo) })
      ticks.push({ y: toY(1.0), label: String(hi) })
    }
    outAxes.push({ name: axis.name, x, y0: top, y1: bottom, domain: [lo, hi], ticks, place })
  }
  const lines: ParallelLine[] = []
  const lc = options?.lineColor
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const points: (Pt | null)[] = []
    for (let a = 0; a < n; a++) {
      const y = outAxes[a]!.place(row[a] ?? null)
      points.push(y === null ? null : { x: outAxes[a]!.x, y })
    }
    const color = typeof lc === 'function' ? lc(row, i) : lc ?? PALETTE[0]!
    lines.push({ index: i, points, color })
  }
  return { axes: outAxes, lines }
}

/** Split a line at nulls into drawable runs of at least two points. */
export function lineRuns(points: (Pt | null)[]): Pt[][] {
  const runs: Pt[][] = []
  let cur: Pt[] = []
  for (const p of points) {
    if (p === null) {
      if (cur.length >= 2) runs.push(cur)
      cur = []
    } else cur.push(p)
  }
  if (cur.length >= 2) runs.push(cur)
  return runs
}

/** Render lines (highlighted last), then axes, ticks and names. */
export function renderParallel(layout: ParallelLayout, options?: ParallelOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const opacity = options?.lineOpacity ?? 0.45
  const width = options?.lineWidth ?? 1.0
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const n = layout.axes.length
  const shown = progress >= 1.0 ? n : Math.floor(n * progress)
  const highlight = new Set(options?.highlight ?? [])
  const highlightColor = options?.highlightColor ?? '#b42318'
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#334155'
  const axisColor = options?.axisColor ?? '#94a3b8'
  void (measure ?? measureApprox())
  const draw = (line: ParallelLine, stroke: string, w: Double): void => {
    for (const run of lineRuns(line.points.slice(0, shown))) out.push({ kind: 'polyline', points: run, stroke, width: w })
  }
  for (const line of layout.lines) if (!highlight.has(line.index)) draw(line, rgba(line.color, opacity), width)
  for (const line of layout.lines) if (highlight.has(line.index)) draw(line, highlightColor, width + 1.0)
  for (const axis of layout.axes) {
    out.push({ kind: 'line', from: { x: axis.x, y: axis.y0 }, to: { x: axis.x, y: axis.y1 }, stroke: axisColor, width: 1.0 })
    if (progress < 1.0) continue
    out.push({ kind: 'text', text: axis.name, at: { x: axis.x, y: axis.y0 - fontSize * 0.5 }, fill: labelColor, size: fontSize, align: 'middle', baseline: 'bottom' })
    for (const t of axis.ticks) {
      out.push({ kind: 'line', from: { x: axis.x - 3.0, y: t.y }, to: { x: axis.x + 3.0, y: t.y }, stroke: axisColor, width: 1.0 })
      out.push({ kind: 'text', text: t.label, at: { x: axis.x + 5.0, y: t.y }, fill: labelColor, size: fontSize * 0.9, align: 'start', baseline: 'middle' })
    }
  }
  return out
}

function segmentDistance(p: Pt, a: Pt, b: Pt): Double {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 <= 0.0 ? 0.0 : Math.max(0.0, Math.min(1.0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const qx = a.x + dx * t
  const qy = a.y + dy * t
  return Math.sqrt((p.x - qx) * (p.x - qx) + (p.y - qy) * (p.y - qy))
}

/** The nearest line within `tolerance` pixels, or null. */
export function hitParallel(layout: ParallelLayout, px: Double, py: Double, tolerance?: Double): ParallelLine | null {
  const tol = tolerance ?? 4.0
  let best: ParallelLine | null = null
  let bestD = tol
  const p = { x: px, y: py }
  for (const line of layout.lines) {
    for (const run of lineRuns(line.points)) {
      for (let i = 1; i < run.length; i++) {
        const d = segmentDistance(p, run[i - 1]!, run[i]!)
        if (d <= bestD) {
          best = line
          bestD = d
        }
      }
    }
  }
  return best
}

export interface ParallelToSvgOptions {
  axes: ParallelAxis[]
  rows: ParallelRow[]
  width?: Double
  height?: Double
  parallel?: ParallelOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Parallel coordinates → `<svg>` string, server-safe. */
export function parallelToSvg(options: ParallelToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 360.0
  const gutter = 40.0
  const layout = layoutParallel(options.axes, options.rows, { x: gutter, y: 8.0, w: Math.max(0.0, width - gutter * 2.0), h: Math.max(0.0, height - 16.0) }, options.parallel)
  const cmds = renderParallel(layout, options.parallel, options.measure ?? measureApprox())
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${options.rows.length} rows across ${options.axes.length} axes (${options.axes.map((a) => a.name).join(', ')}).` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
