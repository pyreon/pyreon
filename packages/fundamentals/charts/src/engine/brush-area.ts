// ECharts' `brush` component on a cartesian chart — its areas, what they
// select, and how the selection paints.
//
// One model for every target: the web canvas / SVG hosts and the SwiftUI /
// Compose hosts build areas with these functions, ask `brushSelection` which
// datums fall inside, and dim the rest through `applyBrushSelection`, so a
// rect drawn over the same pixels selects the same datums everywhere.
//
// Areas live in chart pixels. Selected indices are datum indices: what the
// render loops pass `stateFill`.

import { layoutSeriesPointsAt, layoutSeriesPointsH } from './layout'
import type { PlotLayout } from './layout'
import { barsForIn, categoryPoints, geometrySpec, markerAnchor, resolveY2Domain, resolveYDomain, seriesDomain } from './render'
import type { ChartSpec, Series } from './render'
import type { Double, DrawCmd, Pt, Rect } from './types'

/** One brushed region: `rect`, `polygon`, `lineX` (a column span) or `lineY` (a row span). */
export interface BrushArea {
  type: string
  points: Pt[]
}

/** The datums one series has inside the areas, in visual indices. */
export interface BrushSeriesSelection {
  seriesIndex: Double
  dataIndex: number[]
}

function clampTo(v: Double, lo: Double, hi: Double): Double {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * The area a drag from (ax, ay) to (bx, by) draws, clamped to the plot. A
 * `lineX` spans the plot's height and a `lineY` its width, as ECharts draws
 * them; a `polygon` starts from its first vertex (extend it with `brushPolygonAdd`).
 */
export function brushAreaFromDrag(type: string, plot: Rect, ax: Double, ay: Double, bx: Double, by: Double): BrushArea {
  const x0 = clampTo(ax, plot.x, plot.x + plot.w)
  const x1 = clampTo(bx, plot.x, plot.x + plot.w)
  const y0 = clampTo(ay, plot.y, plot.y + plot.h)
  const y1 = clampTo(by, plot.y, plot.y + plot.h)
  if (type === 'polygon') return { type, points: [{ x: x0, y: y0 }] }
  if (type === 'lineX') return { type, points: [{ x: x0, y: plot.y }, { x: x1, y: plot.y + plot.h }] }
  if (type === 'lineY') return { type, points: [{ x: plot.x, y: y0 }, { x: plot.x + plot.w, y: y1 }] }
  return { type: 'rect', points: [{ x: x0, y: y0 }, { x: x1, y: y1 }] }
}

/** A polygon with one more vertex, clamped to the plot; a vertex within 2px of the last is skipped. */
export function brushPolygonAdd(area: BrushArea, plot: Rect, x: Double, y: Double): BrushArea {
  const px = clampTo(x, plot.x, plot.x + plot.w)
  const py = clampTo(y, plot.y, plot.y + plot.h)
  const pts: Pt[] = []
  let last: Pt = { x: -1000000.0, y: -1000000.0 }
  for (const p of area.points) {
    pts.push(p)
    last = p
  }
  const dx = px - last.x
  const dy = py - last.y
  if (dx * dx + dy * dy < 4.0) return area
  pts.push({ x: px, y: py })
  return { type: area.type, points: pts }
}

/** True when an area is big enough to mean something (a click is not a brush). */
export function brushAreaUsable(area: BrushArea): boolean {
  let n = 0.0
  for (const _p of area.points) n = n + 1.0
  if (area.type === 'polygon') return n >= 3.0
  if (n < 2.0) return false
  const a = area.points[0]!
  const b = area.points[1]!
  const w = a.x < b.x ? b.x - a.x : a.x - b.x
  const h = a.y < b.y ? b.y - a.y : a.y - b.y
  if (area.type === 'lineX') return w >= 3.0
  if (area.type === 'lineY') return h >= 3.0
  return w >= 3.0 && h >= 3.0
}

/** Whether a point lies inside an area (a polygon by the even-odd rule). */
export function pointInBrushArea(area: BrushArea, x: Double, y: Double): boolean {
  if (area.type === 'polygon') {
    let inside = false
    let n = 0
    for (const _p of area.points) n = n + 1
    let j = n - 1
    for (let i = 0; i < n; i++) {
      const a = area.points[i]!
      const b = area.points[j]!
      // Bound first: Swift cannot chain a comparison into another comparison.
      const aAbove = a.y > y
      const bAbove = b.y > y
      if (aAbove !== bAbove && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
      j = i
    }
    return inside
  }
  if (area.points.length < 2) return false
  const a = area.points[0]!
  const b = area.points[1]!
  const lx = a.x < b.x ? a.x : b.x
  const hx = a.x < b.x ? b.x : a.x
  const ly = a.y < b.y ? a.y : b.y
  const hy = a.y < b.y ? b.y : a.y
  return x >= lx && x <= hx && y >= ly && y <= hy
}

/** Where each datum of series `k` sits — the bar centre, the segment's far edge, or the point. */
export function brushDatumPoints(raw: ChartSpec, l: PlotLayout, k: number): Pt[] {
  const spec = geometrySpec(raw)
  const s = spec.series[k]
  const out: Pt[] = []
  if (s === undefined) return out
  const plot = l.plot
  const yDomain = resolveYDomain(spec)
  if (s.kind === 'bars' || s.kind === 'waterfall') {
    for (const r of barsForIn(raw, k, plot)) out.push({ x: r.x + r.w / 2.0, y: r.w < 0.0 ? -1000000.0 : r.y + r.h / 2.0 })
    return out
  }
  if (s.kind === 'stacked' || s.kind === 'grouped') {
    let kf = 0.0
    for (let i = 0; i < k; i++) kf = kf + 1.0
    for (let i = 0; i < s.values.length; i++) {
      const at = markerAnchor(spec, kf, i, plot, yDomain)
      out.push(at.length > 0 ? at[0]! : { x: -1000000.0, y: -1000000.0 })
    }
    return out
  }
  const dom = seriesDomain(s, spec, yDomain, resolveY2Domain(spec))
  if (spec.horizontal === true) return layoutSeriesPointsH(s.values, plot, dom)
  const xs = spec.xValues ?? []
  if (xs.length > 0) return layoutSeriesPointsAt(s.values, xs, plot, dom, l.xDomainUsed)
  return categoryPoints(s.values, plot, dom)
}

/** Per series, the visual indices of the datums inside ANY area (series without one are listed empty). */
export function brushSelection(spec: ChartSpec, l: PlotLayout, areas: BrushArea[]): BrushSeriesSelection[] {
  const out: BrushSeriesSelection[] = []
  let kf = 0.0
  for (let k = 0; k < spec.series.length; k++) {
    const idx: number[] = []
    if (areas.length > 0) {
      const pts = brushDatumPoints(spec, l, k)
      const values = spec.series[k]!.values
      for (let i = 0; i < pts.length; i++) {
        const v = i < values.length ? values[i]! : 0.0 / 0.0
        if (v !== v) continue
        const p = pts[i]!
        let hit = false
        for (const a of areas) if (pointInBrushArea(a, p.x, p.y)) hit = true
        if (hit) idx.push(i)
      }
    }
    out.push({ seriesIndex: kf, dataIndex: idx })
    kf = kf + 1.0
  }
  return out
}

/** The selection with only the listed series kept (ECharts' `brush.seriesIndex`); an empty list keeps all. */
export function brushOnlySeries(sel: BrushSeriesSelection[], only: Double[]): BrushSeriesSelection[] {
  if (only.length === 0) return sel
  const out: BrushSeriesSelection[] = []
  for (const x of sel) {
    let kept = false
    for (const k of only) if (k === x.seriesIndex) kept = true
    out.push(kept ? x : { seriesIndex: x.seriesIndex, dataIndex: [] })
  }
  return out
}


/**
 * The spec with the selection applied: every series marks its brushed datums,
 * and the rest fade to `outOpacity` (ECharts' `outOfBrush.colorAlpha`). No
 * areas leaves the spec untouched, so nothing dims before a brush.
 */
export function applyBrushSelection(spec: ChartSpec, selection: BrushSeriesSelection[], active: boolean, outOpacity: Double): ChartSpec {
  if (!active) return spec
  const series: Series[] = []
  let k = 0
  for (const s of spec.series) {
    const sel: number[] = []
    if (k < selection.length) for (const i of selection[k]!.dataIndex) sel.push(i)
    series.push({ ...s, inBrush: sel, brushOpacity: outOpacity })
    k = k + 1
  }
  return { ...spec, series }
}

/** The areas' covers: a translucent fill with a closed edge, drawn over the plot. */
export function renderBrushAreas(areas: BrushArea[], fill: string, stroke: string): DrawCmd[] {
  const out: DrawCmd[] = []
  for (const a of areas) {
    const ring: Pt[] = []
    if (a.type === 'polygon') {
      for (const p of a.points) ring.push(p)
    } else if (a.points.length >= 2) {
      const p = a.points[0]!
      const q = a.points[1]!
      ring.push({ x: p.x, y: p.y })
      ring.push({ x: q.x, y: p.y })
      ring.push({ x: q.x, y: q.y })
      ring.push({ x: p.x, y: q.y })
    }
    if (ring.length < 2) continue
    if (ring.length >= 3) out.push({ kind: 'polygon', points: ring, fill })
    const edge: Pt[] = []
    for (const p of ring) edge.push(p)
    edge.push(ring[0]!)
    out.push({ kind: 'polyline', points: edge, stroke, width: 1.0 })
  }
  return out
}
