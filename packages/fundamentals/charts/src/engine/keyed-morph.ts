// Keyed geometry morph — D3's data join for a `<Chart by>` update.
//
// Matching VALUES by key (`alignByKey`) makes each surviving row tween its
// height from its own old value, but positions still snap: a sliding window
// shifts every bar one slot left in the first frame, and a row that left the
// data vanishes. This morphs the drawn GEOMETRY by key instead: a surviving
// bar slides from its old slot to its new one, an entering bar grows from the
// zero line in its new slot, an exiting bar shrinks to the zero line in its
// old slot.
//
// The geometry is the renderer's own: every rect comes from the same layout
// call `renderChartIn` makes (`barsLaid`, `setLaid` and their horizontal
// twins, over the same `geometrySpec` view), so a log scale, a normalized
// stack, a right axis, a horizontal frame, stacked and grouped sets all morph
// between exactly the frames the renderer draws — nothing is re-derived here.
// Kinds whose marks are not per-row rects or points (areas, bands, waterfalls,
// scatter, symbol bars) and numeric-x charts keep the value tween.

import { rectCmd } from './corners'
import { seriesGradient } from './gradient'
import { layoutSeriesPoints } from './layout'
import type { PlotLayout } from './layout'
import { barsLaid, barsLaidH, geometrySpec, growEdgeRect, hasRightAxis, logBounds, resolveY2Domain, resolveYDomain, seriesDomain, setLaid, setLaidH, stateFill, themeCorners } from './render'
import type { ChartSpec, Series } from './render'
import { scaleLinear } from './scale'
import type { Domain, DrawCmd, Double, Pt, Rect } from './types'

type MorphKind = 'bars' | 'line' | 'stacked' | 'grouped'

/** One series' drawn geometry, by row key. */
export interface KeyedGeo {
  kind: MorphKind
  series: Series
  horizontal: boolean
  keys: string[]
  rects: Map<string, Rect>
  /** The datum index each rect / point was drawn from, for per-datum fills. */
  index: Map<string, number>
  points: Map<string, Pt>
  /** The pixel of the value axis' zero (or its floor) — y when vertical, x when horizontal. Bars grow from and shrink to it. */
  baseline: Double
  /** The value domain this series scales against — what `growEdgeRect` collapses its bars toward. */
  dom: Domain
  /** The plot, for gradients laid across it. */
  plot: Rect
  /** The theme corner radius, for bars that take the theme's rounding. */
  radius: Double
}

function morphKind(s: Series): MorphKind | null {
  if (s.kind === 'bars') return s.symbol === undefined ? 'bars' : null
  if (s.kind === 'line') return s.symbol === undefined ? 'line' : null
  if (s.kind === 'stacked' || s.kind === 'grouped') return s.kind
  return null
}

/** True when every series of `spec` can be morphed by key (and there is at least one). */
export function canKeyMorph(spec: ChartSpec): boolean {
  if (spec.series.length === 0) return false
  if ((spec.xValues ?? []).length > 0) return false
  for (const s of spec.series) if (morphKind(s) === null) return false
  return true
}

/** The zero line (or the domain's floor/ceiling when zero is outside it), in pixels along the value axis. */
function zeroPixel(dom: Domain, plot: Rect, horizontal: boolean): Double {
  const zero = dom.min <= 0.0 && dom.max >= 0.0 ? 0.0 : dom.min > 0.0 ? dom.min : dom.max
  return horizontal ? scaleLinear(dom, plot.x, plot.x + plot.w, zero) : scaleLinear(dom, plot.y + plot.h, plot.y, zero)
}

/** Each series' geometry by key, laid out exactly as `renderChartIn` lays it out. */
export function keyedGeometry(raw: ChartSpec, l: PlotLayout, keys: string[]): KeyedGeo[] {
  const spec = geometrySpec(raw)
  const horizontal = spec.horizontal === true
  const plot = l.plot
  const yDomain = resolveYDomain(spec)
  const y2Domain = hasRightAxis(spec) ? resolveY2Domain(spec) : yDomain
  const sets = new Map<string, { seg: Rect; seriesIndex: number; datumIndex: number }[]>()
  const setOf = (kind: 'stacked' | 'grouped') => {
    let got = sets.get(kind)
    if (got === undefined) {
      got = (horizontal ? setLaidH(spec, kind, plot, yDomain) : setLaid(spec, kind, plot, yDomain)).map((s) => ({ seg: s.rect, seriesIndex: s.seriesIndex, datumIndex: s.datumIndex }))
      sets.set(kind, got)
    }
    return got
  }
  const withinKind = new Map<string, number>()
  return spec.series.map((s, k) => {
    const kind = morphKind(s) ?? 'line'
    const dom = kind === 'stacked' || kind === 'grouped' ? yDomain : seriesDomain(s, spec, yDomain, y2Domain)
    const rects = new Map<string, Rect>()
    const points = new Map<string, Pt>()
    const index = new Map<string, number>()
    const finite = (i: number): boolean => i < s.values.length && s.values[i] === s.values[i]
    if (kind === 'bars') {
      const rs = horizontal ? barsLaidH(spec, k, plot, dom) : barsLaid(spec, k, plot, dom)
      for (let i = 0; i < rs.length && i < keys.length; i++) {
        if (!finite(i)) continue
        rects.set(keys[i]!, rs[i]!)
        index.set(keys[i]!, i)
      }
    } else if (kind === 'stacked' || kind === 'grouped') {
      const local = withinKind.get(kind) ?? 0
      withinKind.set(kind, local + 1)
      for (const seg of setOf(kind)) {
        if (seg.seriesIndex !== local || seg.datumIndex >= keys.length || !finite(seg.datumIndex)) continue
        rects.set(keys[seg.datumIndex]!, seg.seg)
        index.set(keys[seg.datumIndex]!, seg.datumIndex)
      }
    } else if (!horizontal) {
      // A line has no horizontal frame — `renderChartIn` skips it there, so it has no geometry to morph.
      const ps = layoutSeriesPoints(s.values, plot, dom)
      for (let i = 0; i < ps.length && i < keys.length; i++) {
        if (!finite(i)) continue
        points.set(keys[i]!, ps[i]!)
        index.set(keys[i]!, i)
      }
    }
    return { kind, series: s, horizontal, keys, rects, index, points, baseline: zeroPixel(dom, plot, horizontal), dom, plot, radius: spec.theme.radius }
  })
}

const mix = (a: Double, b: Double, e: Double): Double => a + (b - a) * e

function mixRect(a: Rect, b: Rect, e: Double): Rect {
  return { x: mix(a.x, b.x, e), y: mix(a.y, b.y, e), w: mix(a.w, b.w, e), h: mix(a.h, b.h, e) }
}

/** A morphing bar drawn as the renderer draws it: its state fill, corners, gradient and pattern. */
function barCmd(g: KeyedGeo, rect: Rect, datum: number): DrawCmd {
  const s = g.series
  const v = datum >= 0 && datum < s.values.length ? s.values[datum]! : 0.0
  // Plain bars take the theme's rounding when they set none; a stack or group does not.
  const corners = s.corners ?? (g.kind === 'bars' ? themeCorners(g.radius, v >= 0.0, g.horizontal) : undefined)
  const grad = seriesGradient(s.gradient, g.plot)
  const fill = datum >= 0 ? stateFill(s, datum, s.color) : s.color
  return rectCmd(rect, fill, corners, grad.stops.length === 0 ? undefined : grad, s.pattern)
}

/** The displayed geometry at eased progress `e`, retained for an interrupted update. */
export function keyedMorphGeometry(from: KeyedGeo[], to: KeyedGeo[], e: Double): KeyedGeo[] {
  return to.map((b, s) => {
    const a = from[s]
    const points = new Map<string, Pt>()
    const rects = new Map<string, Rect>()
    const index = new Map<string, number>()
    const keys: string[] = []
    if (b.kind === 'line') {
      for (const k of b.keys) {
        keys.push(k)
        const p = b.points.get(k)
        if (p === undefined) continue
        const old = a?.points.get(k)
        points.set(k, old === undefined ? p : { x: mix(old.x, p.x, e), y: mix(old.y, p.y, e) })
        index.set(k, b.index.get(k) ?? -1)
      }
    } else {
      // Exiting first, so survivors sliding over them paint on top. Keep
      // exits in the snapshot too: a retarget must not drop a visible bar.
      if (a !== undefined) {
        for (const k of a.keys) {
          const r = a.rects.get(k)
          if (r === undefined || b.rects.has(k)) continue
          keys.push(k)
          rects.set(k, mixRect(r, growEdgeRect(r, a.dom, a.plot, a.horizontal), e))
          index.set(k, -1)
        }
      }
      for (const k of b.keys) {
        const r = b.rects.get(k)
        if (r === undefined) continue
        keys.push(k)
        const old = a?.rects.get(k)
        rects.set(k, mixRect(old ?? growEdgeRect(r, b.dom, b.plot, b.horizontal), r, e))
        index.set(k, b.index.get(k) ?? -1)
      }
    }
    return { ...b, keys, rects, points, index }
  })
}

/** Draw a displayed keyed snapshot, using the target series' styling. */
export function keyedGeoCmds(geo: KeyedGeo[]): DrawCmd[] {
  const out: DrawCmd[] = []
  for (const g of geo) {
    if (g.kind === 'line') {
      const runs: Pt[][] = [[]]
      for (const k of g.keys) {
        const p = g.points.get(k)
        if (p === undefined) {
          if (runs[runs.length - 1]!.length > 0) runs.push([])
          continue
        }
        runs[runs.length - 1]!.push(p)
      }
      for (const run of runs) {
        const shaped = g.series.curve === undefined ? run : g.series.curve(run)
        if (shaped.length < 2) continue
        out.push(g.series.dash === undefined
          ? { kind: 'polyline', points: shaped, stroke: g.series.color, width: g.series.width }
          : { kind: 'polyline', points: shaped, stroke: g.series.color, width: g.series.width, dash: g.series.dash })
      }
    } else {
      for (const k of g.keys) {
        const r = g.rects.get(k)
        if (r !== undefined) out.push(barCmd(g, r, g.index.get(k) ?? -1))
      }
    }
  }
  return out
}

/** The morphing series' commands at eased progress `e` (0 = the old frame, 1 = the new). */
export function keyedMorphCmds(from: KeyedGeo[], to: KeyedGeo[], e: Double): DrawCmd[] {
  return keyedGeoCmds(keyedMorphGeometry(from, to, e))
}

/**
 * True when a snapshot of the old frame can morph into `spec`'s frame: the
 * same number of series, each the same kind, the same orientation. A switch
 * between frames (bars to lines, vertical to horizontal) has no join to draw,
 * so it takes the value tween instead.
 */
export function morphMatches(from: KeyedGeo[], spec: ChartSpec): boolean {
  if (from.length !== spec.series.length) return false
  const horizontal = spec.horizontal === true
  for (let i = 0; i < from.length; i++) {
    if (from[i]!.kind !== morphKind(spec.series[i]!) || from[i]!.horizontal !== horizontal) return false
  }
  return true
}

/**
 * The target spec with the morphing series blanked (their geometry is drawn by
 * `keyedMorphCmds`) and every value domain pinned, so the grid, the rules and
 * the axes stay where the new frame puts them instead of re-fitting to the
 * blanked data. A log chart pins its data-space decade bounds (the log view is
 * derived from them); a dual-axis chart pins the right domain too.
 */
export function maskForMorph(spec: ChartSpec): ChartSpec {
  const yDomain = spec.yScale === 'log' ? logBounds(spec) : resolveYDomain(spec)
  const y2Domain = hasRightAxis(spec) ? resolveY2Domain(spec) : spec.y2Domain
  return {
    ...spec,
    yDomain,
    y2Domain,
    series: spec.series.map((s) => ({ ...s, values: s.values.map(() => Number.NaN), showValues: false })),
  }
}
