// Chrome that every family shares, as data — the legend entries a layout
// yields and the tooltip lines a point under the pointer yields, plus the
// tooltip box drawn INTO the draw list.
//
// This module CROSSES (it is in the native engine's ENGINE_FILES), which is
// the whole reason it exists: the web host used to build these lists inline
// in seventeen host files, so a native host could not draw a legend or answer
// a tap without a second copy of each rule. Now the web canvas host and both
// native emitters call the same functions over the same layout structs, and
// "what does the legend show" / "what does a tap say" agree by construction.
//
// Conventions, so the native emit stays a one-liner:
// - a tooltip function returns the LINES; an EMPTY list is a miss (native
//   has no `null` list, and an empty tooltip is never drawn anyway).
// - everything reads the LAYOUT, never the host's props — the host already
//   handed the layout to the renderer, so the same value is in scope on every
//   target.

import { fitCircle, hitArc, layoutArcs, layoutArcsWith } from './arc'
import type { ArcConfig, Slice } from './arc'
import { hitCalendarIndex } from './calendar'
import type { CalendarLayout, CalendarValue } from './calendar'
import { groupThousands, plain } from './format'
import { geoValueOf, hitGeoIndex } from './geo'
import type { GeoLayout, GeoValue } from './geo'
import { hitFunnel } from './funnel'
import type { FunnelOptions, FunnelStage } from './funnel'
import { ganttDurationDays, hitGanttIndex } from './gantt'
import type { GanttLayout } from './gantt'
import { hitGraphIndex } from './graph'
import type { GraphLayout } from './graph'
import type { LegendEntry } from './legend'
import { paletteAt } from './palette'
import { hitPolarIndex } from './polar'
import type { PolarLayout, PolarSeries } from './polar'
import { hitSingleAxis } from './single-axis'
import type { SingleAxisLayout, SingleAxisPoint } from './single-axis'
import { hitRiverIndex } from './river'
import { hitChordIndex } from './chord'
import type { ChordLayout } from './chord'
import type { RiverLayout } from './river'
import { hitSankeyIndex } from './sankey'
import type { SankeyLayout } from './sankey'
import { hitSunburstIndex } from './sunburst'
import type { SunburstArc } from './sunburst'
import { placeTooltip } from './tooltip'
import type { Size } from './tooltip'
import { hitTreeIndex } from './tree'
import type { TreeLayout } from './tree'
import { hitTreemapIndex } from './treemap'
import type { TreemapCell } from './treemap'
import type { DrawCmd, Double, Pt, Rect } from './types'

// ---- legends ---------------------------------------------------------------
//
// Each pushes a TYPED const rather than an object literal: an inline literal
// into a `LegendEntry[]` lowers to a native TUPLE (the untypeable-literal
// class), and the generated engine then fails to compile.

/** One entry per top-level cell. */
export function treemapLegend(cells: TreemapCell[]): LegendEntry[] {
  const out: LegendEntry[] = []
  for (const c of cells) {
    if (c.depth !== 0) continue
    const e: LegendEntry = { label: c.name, color: c.color }
    out.push(e)
  }
  return out
}

/** One entry per innermost-ring arc. */
export function sunburstLegend(arcs: SunburstArc[]): LegendEntry[] {
  const out: LegendEntry[] = []
  for (const a of arcs) {
    if (a.depth !== 0) continue
    const e: LegendEntry = { label: a.name, color: a.color }
    out.push(e)
  }
  return out
}

/** One entry per root node. */
export function treeLegend(layout: TreeLayout): LegendEntry[] {
  const out: LegendEntry[] = []
  for (const n of layout.nodes) {
    if (n.depth !== 0) continue
    const e: LegendEntry = { label: n.name, color: n.color }
    out.push(e)
  }
  return out
}

/** One entry per layer. */
export function riverLegend(layout: RiverLayout): LegendEntry[] {
  const out: LegendEntry[] = []
  for (const l of layout.layers) {
    const e: LegendEntry = { label: l.name, color: l.color }
    out.push(e)
  }
  return out
}

/** One entry per node arc, in ring order. */
export function chordLegend(layout: ChordLayout): LegendEntry[] {
  const out: LegendEntry[] = []
  for (const a of layout.arcs) {
    const e: LegendEntry = { label: a.name, color: a.color }
    out.push(e)
  }
  return out
}

/** One entry per node. */
export function sankeyLegend(layout: SankeyLayout): LegendEntry[] {
  const out: LegendEntry[] = []
  for (const n of layout.nodes) {
    const e: LegendEntry = { label: n.name, color: n.color }
    out.push(e)
  }
  return out
}

/** One entry per series, coloured like the plot (an unset colour takes the palette slot). */
export function polarLegend(series: PolarSeries[], palette: readonly string[]): LegendEntry[] {
  const out: LegendEntry[] = []
  for (let i = 0; i < series.length; i++) {
    const s = series[i]!
    const e: LegendEntry = { label: s.name, color: s.color ?? paletteAt(palette, i) }
    out.push(e)
  }
  return out
}

/** One entry per stage. */
export function funnelLegend(stages: FunnelStage[]): LegendEntry[] {
  const out: LegendEntry[] = []
  for (const s of stages) {
    const e: LegendEntry = { label: s.label, color: s.color }
    out.push(e)
  }
  return out
}

/** One entry per slice. */
export function pieLegend(slices: Slice[]): LegendEntry[] {
  const out: LegendEntry[] = []
  for (const s of slices) {
    const e: LegendEntry = { label: s.label, color: s.color }
    out.push(e)
  }
  return out
}

// ---- tooltips (empty = miss) -----------------------------------------------

export function treemapTip(cells: TreemapCell[], px: Double, py: Double): string[] {
  const i = hitTreemapIndex(cells, px, py)
  if (i < 0) return []
  const c = cells[i]!
  return [c.name, plain(c.value)]
}

export function sunburstTip(arcs: SunburstArc[], center: Pt, px: Double, py: Double): string[] {
  const i = hitSunburstIndex(arcs, center, px, py)
  if (i < 0) return []
  const a = arcs[i]!
  return [a.name, plain(a.value)]
}

export function treeTip(layout: TreeLayout, px: Double, py: Double, symbolSize?: Double): string[] {
  const i = hitTreeIndex(layout, px, py, symbolSize)
  if (i < 0) return []
  const n = layout.nodes[i]!
  // `?? 0.0` is dead on the web (the branch above already returned) and is
  // what unwraps the optional natively — a ternary over `=== undefined` does
  // not narrow in the emit.
  if (n.value === undefined) return [n.name]
  /* v8 ignore next — the `?? 0.0` arm is unreachable on the web: the guard
     above already returned for undefined. It exists to unwrap the optional
     natively, where a `=== undefined` ternary does not narrow. */
  return [n.name, plain(n.value ?? 0.0)]
}

export function riverTip(layout: RiverLayout, px: Double, py: Double, curve?: 'smooth' | 'linear'): string[] {
  const i = hitRiverIndex(layout, px, py, curve)
  return i < 0 ? [] : [layout.layers[i]!.name]
}

export function chordTip(layout: ChordLayout, px: Double, py: Double): string[] {
  const i = hitChordIndex(layout, px, py)
  if (i < 0) return []
  const a = layout.arcs[i]!
  return [a.name, plain(a.total)]
}

export function sankeyTip(layout: SankeyLayout, px: Double, py: Double): string[] {
  const hit = hitSankeyIndex(layout, px, py)
  if (hit.node >= 0) {
    const n = layout.nodes[hit.node]!
    return [n.name, plain(n.value)]
  }
  if (hit.link < 0) return []
  const l = layout.links[hit.link]!
  const from = layout.nodes[l.source]
  const to = layout.nodes[l.target]
  const fromName = from === undefined ? `${l.source}` : from.name
  const toName = to === undefined ? `${l.target}` : to.name
  return [`${fromName} → ${toName}`, plain(l.value)]
}

export function graphTip(layout: GraphLayout, px: Double, py: Double): string[] {
  const i = hitGraphIndex(layout, px, py)
  if (i < 0) return []
  const n = layout.nodes[i]!
  // `?? 0.0` is dead on the web (the branch above already returned) and is
  // what unwraps the optional natively — a ternary over `=== undefined` does
  // not narrow in the emit.
  if (n.value === undefined) return [n.name]
  /* v8 ignore next — the `?? 0.0` arm is unreachable on the web: the guard
     above already returned for undefined. It exists to unwrap the optional
     natively, where a `=== undefined` ternary does not narrow. */
  return [n.name, plain(n.value ?? 0.0)]
}

export function ganttTip(layout: GanttLayout, px: Double, py: Double): string[] {
  const i = hitGanttIndex(layout, px, py)
  if (i < 0) return []
  const r = layout.rows[i]!
  return [r.task.name, `${plain(ganttDurationDays(r))} days`]
}

export function polarTip(layout: PolarLayout, series: PolarSeries[], px: Double, py: Double): string[] {
  const hit = hitPolarIndex(layout, px, py)
  if (hit.sector >= 0) {
    const sec = layout.sectors[hit.sector]!
    const s = series[sec.series]
    const name = s === undefined ? `Series ${sec.series + 1}` : s.name
    return [name, plain(sec.value)]
  }
  if (hit.line < 0) return []
  const line = layout.lines[hit.line]!
  const s = series[line.series]
  const name = s === undefined ? `Series ${line.series + 1}` : s.name
  return [name]
}

/** The cell's date, and its value when one was recorded for that day. */
export function calendarTip(layout: CalendarLayout, values: CalendarValue[], px: Double, py: Double): string[] {
  const i = hitCalendarIndex(layout, px, py)
  if (i < 0) return []
  const date = layout.cells[i]!.date
  for (const v of values) if (v.date === date) return [date, plain(v.value)]
  return [date]
}

/**
 * The point's name and its position on the axis.
 *
 * A single-axis plot carries ONE number per point, and the layout keeps only
 * where it was drawn — so the caller's own points supply the value, the way
 * `calendarTip` and `geoTip` take theirs.
 */
export function singleAxisTip(layout: SingleAxisLayout, points: SingleAxisPoint[], px: Double, py: Double): string[] {
  const i = hitSingleAxis(layout, px, py)
  // A BOUNDS test, not an `=== undefined` test on the indexed value: this file
  // crosses to Swift and Kotlin, where `points[i]` is a subscript that TRAPS
  // out of range rather than handing back a nil to compare.
  if (i < 0 || i >= points.length) return []
  const point = points[i]!
  const name = point.name
  return name === undefined ? [plain(point.x)] : [name, plain(point.x)]
}

/** The region's name, and its value when one was recorded for that region. */
export function geoTip(layout: GeoLayout, values: GeoValue[], px: Double, py: Double): string[] {
  const i = hitGeoIndex(layout, px, py)
  if (i < 0) return []
  const name = layout.regions[i]!.name
  const v = geoValueOf(values, name)
  return v === v ? [name, plain(v)] : [name]
}

export function funnelTip(stages: FunnelStage[], plot: Rect, px: Double, py: Double, options?: FunnelOptions): string[] {
  const i = hitFunnel(stages, plot, px, py, options)
  if (i < 0) return []
  const s = stages[i]!
  return [s.label, plain(s.value)]
}

/**
 * ECharts' default item tooltip for the funnel stage under a point: the series
 * name (none when unnamed), then the stage's colour, name and grouped value —
 * the cells `renderTooltipRows` draws. Empty on a miss.
 */
export function funnelTipRowsWith(stages: FunnelStage[], plot: Rect, px: Double, py: Double, seriesName: string, options?: FunnelOptions): string[] {
  const i = hitFunnel(stages, plot, px, py, options)
  if (i < 0 || i >= stages.length) return []
  const s = stages[i]!
  return [seriesName, s.color, s.label, groupThousands(s.value)]
}

/** The slice's label, value and share of the whole. */
export function pieTip(slices: Slice[], box: Rect, innerRatio: Double, px: Double, py: Double): string[] {
  const fit = fitCircle(box)
  const arcs = layoutArcs(slices)
  const i = hitArc(arcs, fit.center, fit.radius, fit.radius * innerRatio, { x: px, y: py })
  return i < 0 ? [] : pieTipAt(slices, arcs[i]!.index)
}

/** The tooltip lines for the slice at input index `i`, or none. */
/**
 * The slice under a point by its INPUT index (a slice that draws nothing is
 * not an arc), laid round by `arcs` — ECharts' start angle, direction, rose
 * and gaps; -1 on a miss.
 */
export function pieHitWith(slices: Slice[], box: Rect, innerRatio: Double, arcs: ArcConfig, px: Double, py: Double): number {
  const fit = fitCircle(box)
  const laid = layoutArcsWith(slices, arcs)
  const i = hitArc(laid, fit.center, fit.radius, fit.radius * innerRatio, { x: px, y: py })
  return i < 0 ? -1 : laid[i]!.index
}

/** `pieTip` for a pie laid round by `arcs`. */
export function pieTipWith(slices: Slice[], box: Rect, innerRatio: Double, arcs: ArcConfig, px: Double, py: Double): string[] {
  return pieTipAt(slices, pieHitWith(slices, box, innerRatio, arcs, px, py))
}

/**
 * ECharts' default tooltip rows for the slice under a point: the series name,
 * then its colour, name and grouped value — the flat shape `renderTooltipRows`
 * draws. Empty on a miss.
 */
export function pieTipRowsWith(slices: Slice[], box: Rect, innerRatio: Double, arcs: ArcConfig, px: Double, py: Double, seriesName: string): string[] {
  const i = pieHitWith(slices, box, innerRatio, arcs, px, py)
  if (i < 0 || i >= slices.length) return []
  const s = slices[i]!
  return [seriesName, s.color, s.label, groupThousands(s.value)]
}

export function pieTipAt(slices: Slice[], i: number): string[] {
  if (i < 0 || i >= slices.length) return []
  const s = slices[i]!
  let total = 0.0
  for (const x of slices) total += x.value
  // `floor(x + 0.5)` rather than `Math.round`: both native targets keep floor a Double, while round returns an integer type.
  const pct = total > 0.0 ? Math.floor((s.value / total) * 100.0 + 0.5) : 0.0
  return [s.label, `${plain(s.value)} (${plain(pct)}%)`]
}

// ---- the tooltip box, drawn into the list -----------------------------------

export interface TooltipOptions {
  fontSize: Double
  /** Box fill and border — the theme's surface and grid. */
  fill: string
  border: string
  /** Text colour — the theme's text. */
  text: string
  /** Inner padding; the first line is set in a heavier tone by size, not weight. */
  pad: Double
  radius: Double
}

/**
 * The tooltip as draw commands: a rounded box at `at`, flipped inside
 * `bounds` by `placeTooltip`, one line of text per entry. The web keeps its
 * DOM overlay (selectable text, no re-render per move); the native canvases
 * append this to the frame they already paint.
 */
export function renderTooltip(
  lines: string[],
  at: Pt,
  bounds: Rect,
  opts: TooltipOptions,
  measure: (text: string, size: Double) => Double,
): DrawCmd[] {
  const cmds: DrawCmd[] = []
  if (lines.length === 0) return cmds
  const lineH = opts.fontSize * 1.4
  let w = 0.0
  for (const l of lines) {
    const m = measure(l, opts.fontSize)
    if (m > w) w = m
  }
  const size: Size = { w: w + opts.pad * 2.0, h: lineH * lines.length + opts.pad * 2.0 - (lineH - opts.fontSize) }
  const p = placeTooltip(at, size, bounds, 12.0)
  const r = opts.radius
  cmds.push({ kind: 'rect', rect: { x: p.x, y: p.y, w: size.w, h: size.h }, fill: opts.fill, corners: [r, r, r, r] })
  cmds.push({
    kind: 'polyline',
    points: [
      { x: p.x, y: p.y },
      { x: p.x + size.w, y: p.y },
      { x: p.x + size.w, y: p.y + size.h },
      { x: p.x, y: p.y + size.h },
      { x: p.x, y: p.y },
    ],
    stroke: opts.border,
    width: 1.0,
  })
  let y = p.y + opts.pad
  for (const l of lines) {
    cmds.push({ kind: 'text', text: l, at: { x: p.x + opts.pad, y }, fill: opts.text, size: opts.fontSize, align: 'start', baseline: 'top' })
    y = y + lineH
  }
  return cmds
}

/**
 * ECharts' default tooltip box as draw commands: `rows[0]` the header (a
 * series or a category name; '' for none), then (colour, name, value) triples — a 10px
 * swatch, the name, and the value bold at the right with at least 20px
 * between them; rows 10px apart. The box is edged in the first row's colour
 * when `edgeByRow` (an item tooltip), else the theme's border.
 */
export function renderTooltipRows(rows: string[], at: Pt, bounds: Rect, opts: TooltipOptions, measure: (text: string, size: Double) => Double, edgeByRow: boolean): DrawCmd[] {
  const cmds: DrawCmd[] = []
  if (rows.length < 4) return cmds
  const fs = opts.fontSize
  const count = Math.floor((rows.length - 1) / 3)
  const head = rows[0]! !== ''
  let w = head ? measure(rows[0]!, fs) : 0.0
  for (let k = 0; k < count; k++) {
    const rw = 16.0 + measure(rows[1 + k * 3 + 1]!, fs) + 20.0 + measure(rows[1 + k * 3 + 2]!, fs)
    if (rw > w) w = rw
  }
  const inner = (head ? fs + 10.0 : 0.0) + count * fs + (count - 1) * 10.0
  const size: Size = { w: w + opts.pad * 2.0, h: inner + opts.pad * 2.0 }
  const p = placeTooltip(at, size, bounds, 12.0)
  const r = opts.radius
  const edge = edgeByRow ? rows[1]! : opts.border
  cmds.push({ kind: 'rect', rect: { x: p.x, y: p.y, w: size.w, h: size.h }, fill: opts.fill, corners: [r, r, r, r] })
  cmds.push({
    kind: 'polyline',
    points: [
      { x: p.x, y: p.y },
      { x: p.x + size.w, y: p.y },
      { x: p.x + size.w, y: p.y + size.h },
      { x: p.x, y: p.y + size.h },
      { x: p.x, y: p.y },
    ],
    stroke: edge,
    width: 1.0,
  })
  const left = p.x + opts.pad
  const right = p.x + size.w - opts.pad
  if (head) cmds.push({ kind: 'text', text: rows[0]!, at: { x: left, y: p.y + opts.pad }, fill: opts.text, size: fs, align: 'start', baseline: 'top' })
  let y = head ? p.y + opts.pad + fs + 10.0 : p.y + opts.pad
  for (let k = 0; k < count; k++) {
    cmds.push({ kind: 'circle', center: { x: left + 5.0, y: y + fs / 2.0 }, radius: 5.0, fill: rows[1 + k * 3]! })
    // An unnamed row (ECharts' noName) draws no name.
    if (rows[1 + k * 3 + 1]! !== '') cmds.push({ kind: 'text', text: rows[1 + k * 3 + 1]!, at: { x: left + 16.0, y }, fill: opts.text, size: fs, align: 'start', baseline: 'top' })
    cmds.push({ kind: 'text', text: rows[1 + k * 3 + 2]!, at: { x: right, y }, fill: opts.text, size: fs, align: 'end', baseline: 'top', weight: 'bold' })
    y = y + fs + 10.0
  }
  return cmds
}
