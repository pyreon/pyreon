// Polar coordinate — bars and lines on an angle/radius pair.
//
// Two shapes, decided by which axis carries the categories: categories on the
// ANGLE axis give radial bars (spokes growing outward) and a polar line; on
// the RADIUS axis they give concentric arc bars sweeping by value. Written in
// the native subset and BUNDLED into the generated Swift/Kotlin engine:
// stacks are index-keyed parallel arrays instead of Maps, every inline object
// array is a named struct, the hit test answers INDICES (the web-facing
// discriminated union lives in polar-hit.ts), and the svg half in family-svg.ts.

import { arcPolygon, pointOnCircle } from './arc'
import type { Domain, Double, DrawCmd, Pt, Rect } from './types'

const POLAR_TAU = Math.PI * 2.0
const POLAR_PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

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
  /** Fixed value extent; default 0..max. (A struct, not a tuple — tuples have no native form.) */
  valueDomain?: Domain | undefined
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

export interface PolarLine {
  series: number
  color: string
  points: PolarPoint[]
}

export interface PolarCategoryLabel {
  text: string
  at: Pt
  align: 'start' | 'middle' | 'end'
}

export interface PolarTick {
  value: Double
  label: string
}

export interface PolarLayout {
  center: Pt
  innerR: Double
  outerR: Double
  domain: Domain
  categoryOn: 'angle' | 'radius'
  sectors: PolarSector[]
  /** Line series, one entry per line series (index into `series`). */
  lines: PolarLine[]
  /** Category label anchors at the rim (angle) or per ring (radius). */
  categoryLabels: PolarCategoryLabel[]
  ticks: PolarTick[]
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

/** The value → 0..1 position on the value axis, clamped. */
function polarFrac(v: Double, lo: Double, hi: Double): Double {
  const span = hi - lo
  const t = span <= 0.0 ? 0.0 : (v - lo) / span
  return t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t
}

/** Round-ish tick values between lo and hi (about three), the way an axis picks them. */
export function polarTicks(lo: Double, hi: Double): Double[] {
  const out: Double[] = []
  if (hi <= lo) {
    out.push(lo)
    return out
  }
  const raw = (hi - lo) / 3.0
  // 10^floor(log10(raw)) by repeated scaling — no log10/pow in the subset.
  let mag = 1.0
  while (mag * 10.0 <= raw) mag = mag * 10.0
  while (mag > raw) mag = mag / 10.0
  const norm = raw / mag
  const step = (norm >= 5.0 ? 5.0 : norm >= 2.0 ? 2.0 : 1.0) * mag
  // ceil(lo / step) * step as a scan from below.
  let v = 0.0
  while (v < lo) v = v + step
  while (v - step >= lo) v = v - step
  let guard = 0
  while (v <= hi + 1e-9 && guard < 1000) {
    out.push(Math.round(v * 1e6) / 1e6)
    v = v + step
    guard = guard + 1
  }
  return out
}

/** Column key of a bar series: its stack, or its own index (grouped). */
function polarColumnKey(s: PolarSeries, i: number): string {
  return s.stack ?? `#${i}`
}

/** Lay out the series into `box`. */
export function layoutPolar(axes: PolarAxes, series: PolarSeries[], box: Rect, options?: PolarOptions): PolarLayout {
  const categoryOn = axes.categoryOn ?? 'angle'
  const n = axes.categories.length
  // nF mirrors the category count as a Double for the slot/ring arithmetic.
  let nF = 0.0
  for (let i = 0; i < n; i++) nF = nF + 1.0
  const fontSize = options?.fontSize ?? 11.0
  const gutter = options?.showLabels === false ? 4.0 : fontSize * 3.0
  const center: Pt = { x: box.x + box.w / 2.0, y: box.y + box.h / 2.0 }
  const side = box.w < box.h ? box.w : box.h
  const rawOuter = side / 2.0 - gutter
  const outerR = rawOuter < 0.0 ? 0.0 : rawOuter
  const rawRatio = options?.innerRatio ?? 0.0
  const ratio = rawRatio < 0.0 ? 0.0 : rawRatio > 0.95 ? 0.95 : rawRatio
  const innerR = outerR * ratio
  const start = axes.startAngle ?? -Math.PI / 2.0
  const dir = axes.clockwise === false ? -1.0 : 1.0
  const barGap = options?.barGap ?? 0.2
  // Column keys: grouped bars share a slot; stacked ones share a column within it.
  const columns: string[] = []
  for (let si = 0; si < series.length; si++) {
    const s = series[si]!
    if (s.kind !== 'bar') continue
    const key = polarColumnKey(s, si)
    let known = false
    for (const c of columns) if (c === key) known = true
    if (!known) columns.push(key)
  }
  let columnsF = 0.0
  for (let i = 0; i < columns.length; i++) columnsF = columnsF + 1.0
  // Stacked totals decide the domain; a stack accumulates per category (one row of tops per column).
  const stackTop: Double[] = []
  for (let c = 0; c < columns.length; c++) for (let i = 0; i < n; i++) stackTop.push(0.0)
  let lo = 0.0
  let hi = 0.0
  for (let si = 0; si < series.length; si++) {
    const s = series[si]!
    let col = -1
    if (s.kind === 'bar' && s.stack !== undefined && categoryOn === 'angle') {
      const key = polarColumnKey(s, si)
      for (let c = 0; c < columns.length; c++) if (columns[c]! === key) col = c
    }
    for (let i = 0; i < n; i++) {
      if (i >= s.values.length) continue
      const v = s.values[i]!
      if (v !== v) continue
      if (col >= 0) {
        const at = col * n + i
        const top = stackTop[at]! + v
        stackTop[at] = top
        if (top > hi) hi = top
        if (top < lo) lo = top
      } else {
        if (v > hi) hi = v
        if (v < lo) lo = v
      }
    }
  }
  const domainLo = axes.valueDomain?.min ?? lo
  const domainHi = axes.valueDomain?.max ?? hi
  const sectors: PolarSector[] = []
  const lines: PolarLine[] = []
  const categoryLabels: PolarCategoryLabel[] = []
  // Running stack bases per column while laying bars out.
  const running: Double[] = []
  for (let c = 0; c < columns.length; c++) for (let i = 0; i < n; i++) running.push(0.0)
  if (categoryOn === 'angle') {
    const slot = nF <= 0.0 ? 0.0 : POLAR_TAU / nF
    for (let si = 0; si < series.length; si++) {
      const s = series[si]!
      if (s.kind !== 'bar') continue
      const key = polarColumnKey(s, si)
      let col = 0
      let colF = 0.0
      for (let c = 0; c < columns.length; c++) {
        if (columns[c]! === key) {
          col = c
          colF = 0.0
          for (let k = 0; k < c; k++) colF = colF + 1.0
        }
      }
      const color = s.color ?? POLAR_PALETTE[si % POLAR_PALETTE.length]!
      let iF = 0.0
      for (let i = 0; i < n; i++) {
        if (i < s.values.length) {
          const v = s.values[i]!
          if (v === v) {
            const inner = (slot * barGap) / 2.0
            const width = (slot - slot * barGap) / columnsF
            const a0 = start + dir * slot * iF + dir * (inner + width * colF)
            const a1 = a0 + dir * width
            const at = col * n + i
            const base = running[at]!
            running[at] = base + v
            sectors.push({
              series: si,
              index: i,
              start: a0 < a1 ? a0 : a1,
              end: a0 < a1 ? a1 : a0,
              innerR: innerR + (outerR - innerR) * polarFrac(base, domainLo, domainHi),
              outerR: innerR + (outerR - innerR) * polarFrac(base + v, domainLo, domainHi),
              color,
              value: v,
            })
          }
        }
        iF = iF + 1.0
      }
    }
    for (let si = 0; si < series.length; si++) {
      const s = series[si]!
      if (s.kind !== 'line') continue
      const color = s.color ?? POLAR_PALETTE[si % POLAR_PALETTE.length]!
      const points: PolarPoint[] = []
      let iF = 0.0
      for (let i = 0; i < n; i++) {
        if (i < s.values.length) {
          const v = s.values[i]!
          if (v === v) {
            const r = innerR + (outerR - innerR) * polarFrac(v, domainLo, domainHi)
            points.push({ series: si, index: i, at: pointOnCircle(center, r, start + dir * slot * (iF + 0.5)), color, value: v })
          }
        }
        iF = iF + 1.0
      }
      lines.push({ series: si, color, points })
    }
    let iF = 0.0
    for (let i = 0; i < n; i++) {
      const a = start + dir * slot * (iF + 0.5)
      const at = pointOnCircle(center, outerR + fontSize * 0.6, a)
      const c = Math.cos(a)
      categoryLabels.push({ text: axes.categories[i]!, at, align: c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle' })
      iF = iF + 1.0
    }
  } else {
    const ring = nF <= 0.0 ? 0.0 : (outerR - innerR) / nF
    for (let si = 0; si < series.length; si++) {
      const s = series[si]!
      if (s.kind !== 'bar') continue
      const key = polarColumnKey(s, si)
      let colF = 0.0
      for (let c = 0; c < columns.length; c++) {
        if (columns[c]! === key) {
          colF = 0.0
          for (let k = 0; k < c; k++) colF = colF + 1.0
        }
      }
      const color = s.color ?? POLAR_PALETTE[si % POLAR_PALETTE.length]!
      let iF = 0.0
      for (let i = 0; i < n; i++) {
        if (i < s.values.length) {
          const v = s.values[i]!
          if (v === v) {
            const r0 = innerR + ring * iF + (ring * barGap) / 2.0
            const width = (ring - ring * barGap) / columnsF
            const sweep = dir * POLAR_TAU * polarFrac(v, domainLo, domainHi)
            const a0 = start
            const a1 = start + sweep
            sectors.push({
              series: si,
              index: i,
              start: a0 < a1 ? a0 : a1,
              end: a0 < a1 ? a1 : a0,
              innerR: r0 + width * colF,
              outerR: r0 + width * (colF + 1.0),
              color,
              value: v,
            })
          }
        }
        iF = iF + 1.0
      }
    }
    for (let si = 0; si < series.length; si++) {
      const s = series[si]!
      if (s.kind !== 'line') continue
      const color = s.color ?? POLAR_PALETTE[si % POLAR_PALETTE.length]!
      const points: PolarPoint[] = []
      let iF = 0.0
      for (let i = 0; i < n; i++) {
        if (i < s.values.length) {
          const v = s.values[i]!
          if (v === v) {
            points.push({ series: si, index: i, at: pointOnCircle(center, innerR + ring * (iF + 0.5), start + dir * POLAR_TAU * polarFrac(v, domainLo, domainHi)), color, value: v })
          }
        }
        iF = iF + 1.0
      }
      lines.push({ series: si, color, points })
    }
    let iF = 0.0
    for (let i = 0; i < n; i++) {
      categoryLabels.push({ text: axes.categories[i]!, at: { x: center.x + 4.0, y: center.y - (innerR + ring * (iF + 0.5)) }, align: 'start' })
      iF = iF + 1.0
    }
  }
  const ticks: PolarTick[] = []
  for (const v of polarTicks(domainLo, domainHi)) ticks.push({ value: v, label: `${v}` })
  return { center, innerR, outerR, domain: { min: domainLo, max: domainHi }, categoryOn, sectors, lines, categoryLabels, ticks }
}

/** A full ring as a 64-segment polyline (the first 65 points of the arc polygon's outer edge). */
function ringPolyline(center: Pt, r: Double): Pt[] {
  const full = arcPolygon(center, r, 0.0, 0.0, POLAR_TAU)
  const out: Pt[] = []
  for (let i = 0; i < full.length; i++) {
    if (i >= 65) break
    out.push(full[i]!)
  }
  return out
}

/** Render grid, then bars, then lines, then labels. */
export function renderPolar(layout: PolarLayout, options?: PolarOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const gridColor = options?.gridColor ?? '#e2e8f0'
  const labelColor = options?.labelColor ?? '#64748b'
  const fontSize = options?.fontSize ?? 11.0
  const lineWidth = options?.lineWidth ?? 2.0
  const c = layout.center
  const lo = layout.domain.min
  const hi = layout.domain.max
  if (options?.showGrid !== false) {
    if (layout.categoryOn === 'angle') {
      for (const t of layout.ticks) {
        const r = layout.innerR + (layout.outerR - layout.innerR) * polarFrac(t.value, lo, hi)
        if (r <= 0.0) continue
        out.push({ kind: 'polyline', points: ringPolyline(c, r), stroke: gridColor, width: 1.0 })
      }
    } else {
      let kF = 0.0
      for (let k = 0; k < 8; k++) {
        out.push({ kind: 'line', from: c, to: pointOnCircle(c, layout.outerR, (kF / 8.0) * POLAR_TAU), stroke: gridColor, width: 1.0 })
        kF = kF + 1.0
      }
      out.push({ kind: 'polyline', points: ringPolyline(c, layout.outerR), stroke: gridColor, width: 1.0 })
    }
  }
  for (const s of layout.sectors) {
    const outerR = layout.categoryOn === 'angle' ? s.innerR + (s.outerR - s.innerR) * progress : s.outerR
    const end = layout.categoryOn === 'radius' ? s.start + (s.end - s.start) * progress : s.end
    if (outerR <= s.innerR || end <= s.start) continue
    out.push({ kind: 'polygon', points: arcPolygon(c, outerR, s.innerR, s.start, end), fill: s.color })
  }
  for (const l of layout.lines) {
    // countF = progress >= 1 ? n : floor(n * progress), as a Double scan.
    let lenF = 0.0
    for (let i = 0; i < l.points.length; i++) lenF = lenF + 1.0
    let countF = 0.0
    if (progress >= 1.0) countF = lenF
    else while (countF + 1.0 <= lenF * progress) countF = countF + 1.0
    const pts: Pt[] = []
    let iF = 0.0
    for (let i = 0; i < l.points.length; i++) {
      if (iF >= countF) break
      pts.push(l.points[i]!.at)
      iF = iF + 1.0
    }
    if (pts.length > 1) out.push({ kind: 'polyline', points: pts, stroke: l.color, width: lineWidth })
    for (const p of pts) out.push({ kind: 'circle', center: p, radius: 2.5, fill: l.color })
  }
  if (options?.showLabels !== false && progress >= 1.0) {
    for (const lab of layout.categoryLabels) out.push({ kind: 'text', text: lab.text, at: lab.at, fill: labelColor, size: fontSize, align: lab.align, baseline: 'middle' })
  }
  return out
}

export interface PolarHitIndex {
  /** Index into `layout.sectors`, or -1. */
  sector: number
  /** Index into `layout.lines` (and into that line's `points`), or -1. */
  line: number
  point: number
}

/** A sector under the point, else the nearest line point within 6px, else all -1. */
export function hitPolarIndex(layout: PolarLayout, px: Double, py: Double): PolarHitIndex {
  const dx = px - layout.center.x
  const dy = py - layout.center.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const ang = Math.atan2(dy, dx)
  let sectorIdx = -1
  for (let i = 0; i < layout.sectors.length; i++) {
    if (sectorIdx >= 0) continue
    const s = layout.sectors[i]!
    if (dist < s.innerR || dist > s.outerR) continue
    let t = ang
    while (t < s.start) t = t + POLAR_TAU
    while (t >= s.start + POLAR_TAU) t = t - POLAR_TAU
    if (t <= s.end) sectorIdx = i
  }
  if (sectorIdx >= 0) return { sector: sectorIdx, line: -1, point: -1 }
  let bestLine = -1
  let bestPoint = -1
  let bestD = 36.0
  for (let li = 0; li < layout.lines.length; li++) {
    const l = layout.lines[li]!
    for (let pi = 0; pi < l.points.length; pi++) {
      const p = l.points[pi]!
      const d = (px - p.at.x) * (px - p.at.x) + (py - p.at.y) * (py - p.at.y)
      if (d <= bestD) {
        bestLine = li
        bestPoint = pi
        bestD = d
      }
    }
  }
  return { sector: -1, line: bestLine, point: bestPoint }
}
