// Boxplot geometry — five-number summaries per category, Tukey outliers.
//
// The finance family's sibling: a box (Q1..Q3) with a median line, whiskers
// to the fences, and outliers as dots — rects, lines and circles, which every
// backend already executes. Pure and Double-only so it can join the native
// engine. Written in the native subset (no closures in structs, coalesce
// before branching, no Int/Double mixing).

import { computeLayout } from './layout'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { niceDomain, scaleLinear } from './scale'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Formatter } from './format'
import type { Domain, Double, DrawCmd, MeasureText, Rect } from './types'

/** One category's summary. */
export interface FiveNumber {
  min: Double
  q1: Double
  median: Double
  q3: Double
  max: Double
  /** Points beyond the whiskers, drawn as dots. */
  outliers: Double[]
}

export interface BoxplotOptions {
  /** Box fill; the median and whiskers use `stroke`. */
  fill?: string | undefined
  stroke?: string | undefined
  /** Box width as a fraction of the band, clamped to 0.05..0.9. */
  widthRatio?: Double | undefined
  outlierRadius?: Double | undefined
  /** Entrance progress 0..1; boxes grow from the median line. */
  progress?: Double | undefined
}

/**
 * Summarise raw observations: quartiles by linear interpolation (the R-7 /
 * spreadsheet convention), whiskers at the last observation inside 1.5 IQR
 * (Tukey), everything beyond as outliers. Non-finite inputs are dropped.
 */
export function fiveNumber(values: Double[]): FiveNumber {
  const sorted: Double[] = []
  for (const v of values) if (v === v) sorted.push(v)
  sorted.sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return { min: 0.0, q1: 0.0, median: 0.0, q3: 0.0, max: 0.0, outliers: [] }
  const at = (p: Double): Double => {
    const pos = p * (n - 1.0)
    let lo = 0
    let jf = 1.0
    for (let k = 1; k < n; k++) {
      if (jf <= pos) lo = k
      jf = jf + 1.0
    }
    const hi = lo + 1 < n ? lo + 1 : lo
    let loF = 0.0
    for (let k = 0; k < lo; k++) loF = loF + 1.0
    const frac = pos - loF
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac
  }
  const q1 = at(0.25)
  const median = at(0.5)
  const q3 = at(0.75)
  const iqr = q3 - q1
  const loFence = q1 - 1.5 * iqr
  const hiFence = q3 + 1.5 * iqr
  let min = sorted[0]!
  let max = sorted[n - 1]!
  const outliers: Double[] = []
  let minSet = false
  let maxSet = false
  for (const v of sorted) {
    if (v < loFence || v > hiFence) {
      outliers.push(v)
    } else {
      if (!minSet) {
        min = v
        minSet = true
      }
      max = v
      maxSet = true
    }
  }
  if (!minSet) min = q1
  if (!maxSet) max = q3
  return { min, q1, median, q3, max, outliers }
}

/** The value extent across every summary, outliers included. */
export function boxplotExtent(rows: FiveNumber[]): Domain {
  if (rows.length === 0) return { min: 0.0, max: 1.0 }
  let lo = rows[0]!.min
  let hi = rows[0]!.max
  for (const r of rows) {
    if (r.min < lo) lo = r.min
    if (r.max > hi) hi = r.max
    for (const o of r.outliers) {
      if (o < lo) lo = o
      if (o > hi) hi = o
    }
  }
  if (hi <= lo) return { min: lo - 1.0, max: lo + 1.0 }
  return { min: lo, max: hi }
}

/** Render one box per category across the plot's bands. */
export function renderBoxplot(rows: FiveNumber[], plot: Rect, domain: Domain, options?: BoxplotOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const n = rows.length
  if (n === 0) return out
  const fill = options?.fill ?? 'rgba(99,102,241,0.35)'
  const stroke = options?.stroke ?? '#4649c8'
  const rawRatio = options?.widthRatio ?? 0.5
  const ratio = rawRatio < 0.05 ? 0.05 : rawRatio > 0.9 ? 0.9 : rawRatio
  const radius = options?.outlierRadius ?? 3.0
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const band = plot.w / n
  const bw = band * ratio
  const yOf = (v: Double): Double => scaleLinear(domain, plot.y + plot.h, plot.y, v)
  for (let i = 0; i < n; i++) {
    const r = rows[i]!
    const cx = plot.x + band * i + band / 2.0
    const yMed = yOf(r.median)
    // Everything grows out of the median line during the entrance.
    const grow = (y: Double): Double => yMed + (y - yMed) * progress
    const yQ1 = grow(yOf(r.q1))
    const yQ3 = grow(yOf(r.q3))
    const yMin = grow(yOf(r.min))
    const yMax = grow(yOf(r.max))
    // Whiskers first, box over them (the candle rule: a line crossing a fill
    // reads as an artifact).
    out.push({ kind: 'line', from: { x: cx, y: yMax }, to: { x: cx, y: yQ3 }, stroke, width: 1.0 })
    out.push({ kind: 'line', from: { x: cx, y: yQ1 }, to: { x: cx, y: yMin }, stroke, width: 1.0 })
    out.push({ kind: 'line', from: { x: cx - bw / 4.0, y: yMax }, to: { x: cx + bw / 4.0, y: yMax }, stroke, width: 1.0 })
    out.push({ kind: 'line', from: { x: cx - bw / 4.0, y: yMin }, to: { x: cx + bw / 4.0, y: yMin }, stroke, width: 1.0 })
    const top = yQ3 < yQ1 ? yQ3 : yQ1
    const h = yQ1 > yQ3 ? yQ1 - yQ3 : yQ3 - yQ1
    out.push({ kind: 'rect', rect: { x: cx - bw / 2.0, y: top, w: bw, h: h < 1.0 ? 1.0 : h }, fill })
    out.push({ kind: 'line', from: { x: cx - bw / 2.0, y: yMed }, to: { x: cx + bw / 2.0, y: yMed }, stroke, width: 2.0 })
    if (progress >= 1.0) {
      for (const o of r.outliers) {
        out.push({ kind: 'circle', center: { x: cx, y: yOf(o) }, radius, fill: stroke })
      }
    }
  }
  return out
}

/** Which category's band contains a point, or -1. */
export function hitBox(count: number, plot: Rect, px: Double, py: Double): number {
  if (count === 0 || px < plot.x || px > plot.x + plot.w || py < plot.y || py > plot.y + plot.h) return -1
  const band = plot.w / count
  let idx = 0
  let jf = 1.0
  for (let k = 1; k < count; k++) {
    if (plot.x + band * jf <= px) idx = k
    jf = jf + 1.0
  }
  return idx
}

export interface BoxplotToSvgOptions<T> {
  data: T[]
  /** Raw observations per datum — summarised with `fiveNumber`. */
  values: (d: T, index: number) => Double[]
  x?: (d: T, index: number) => string
  width?: Double
  height?: Double
  theme?: Partial<ChartTheme>
  box?: BoxplotOptions
  format?: Formatter
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
  /** Precomputed summaries (index-aligned with `data`) — skips `fiveNumber`. */
  summaries?: FiveNumber[]
}

/** Boxplot → `<svg>` string, server-safe. */
export function boxplotToSvg<T>(options: BoxplotToSvgOptions<T>): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 320.0
  const t = { ...defaultTheme, ...options.theme }
  const rows = options.summaries ?? options.data.map((d, i) => fiveNumber(options.values(d, i)))
  const domain = niceDomain(boxplotExtent(rows), 5.0)
  const measure = options.measure ?? measureApprox()
  const l = computeLayout(
    {
      width,
      height,
      xDomain: { min: 0.0, max: rows.length > 1 ? rows.length - 1 : 1.0 },
      yDomain: domain,
      categories: options.x !== undefined ? options.data.map((d, i) => options.x!(d, i)) : [],
      fontSize: t.fontSize,
      xTickCount: 5.0,
      yTickCount: 5.0,
      showXAxis: true,
      showYAxis: true,
      yFormat: options.format,
    },
    measure,
  )
  const cmds: DrawCmd[] = []
  for (const tick of l.yTicks) {
    cmds.push({ kind: 'line', from: { x: l.plot.x, y: tick.pos }, to: { x: l.plot.x + l.plot.w, y: tick.pos }, stroke: t.grid, width: 1.0 })
    cmds.push({ kind: 'text', text: tick.label, at: { x: l.plot.x - 6.0, y: tick.pos }, fill: t.label, size: t.fontSize, align: 'end', baseline: 'middle' })
  }
  for (const tick of l.xTicks) {
    cmds.push({ kind: 'text', text: tick.label, at: { x: tick.pos, y: l.plot.y + l.plot.h + 6.0 }, fill: t.label, size: t.fontSize, align: 'middle', baseline: 'top' })
  }
  for (const c of renderBoxplot(rows, l.plot, domain, options.box)) cmds.push(c)
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${rows.length} boxes, medians ${rows.map((r) => r.median).join(', ')}.` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
