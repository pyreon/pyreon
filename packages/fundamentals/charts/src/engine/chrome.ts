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

import { fitCircle, hitArc, layoutArcs } from './arc'
import type { Slice } from './arc'
import { hitCalendarIndex } from './calendar'
import type { CalendarLayout, CalendarValue } from './calendar'
import { plain } from './format'
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
import { hitRiverIndex } from './river'
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
  return [n.name, plain(n.value ?? 0.0)]
}

export function riverTip(layout: RiverLayout, px: Double, py: Double, curve?: 'smooth' | 'linear'): string[] {
  const i = hitRiverIndex(layout, px, py, curve)
  return i < 0 ? [] : [layout.layers[i]!.name]
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

export function funnelTip(stages: FunnelStage[], plot: Rect, px: Double, py: Double, options?: FunnelOptions): string[] {
  const i = hitFunnel(stages, plot, px, py, options)
  if (i < 0) return []
  const s = stages[i]!
  return [s.label, plain(s.value)]
}

/** The slice's label, value and share of the whole. */
export function pieTip(slices: Slice[], box: Rect, innerRatio: Double, px: Double, py: Double): string[] {
  const fit = fitCircle(box)
  const i = hitArc(layoutArcs(slices), fit.center, fit.radius, fit.radius * innerRatio, { x: px, y: py })
  if (i < 0) return []
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
