// Keyed geometry morph — D3's data join for a `<Chart by>` update.
//
// Matching VALUES by key (`alignByKey`) makes each surviving row tween its
// height from its own old value, but positions still snap: a sliding window
// shifts every bar one slot left in the first frame, and a row that left the
// data vanishes. This morphs the drawn GEOMETRY by key instead: a surviving
// bar slides from its old slot to its new one, an entering bar grows from the
// baseline in its new slot, an exiting bar shrinks to the baseline in its old
// slot. Plain bars and lines on a linear, single-axis, vertical category chart
// — the sliding-window shapes; anything else keeps the value tween.

import { layoutBars, layoutSeriesPoints } from './layout'
import type { PlotLayout } from './layout'
import { hasRightAxis, resolveYDomain } from './render'
import type { ChartSpec, Series } from './render'
import { scaleLinear } from './scale'
import type { Domain, DrawCmd, Double, Pt, Rect } from './types'

/** One series' drawn geometry, by row key. */
export interface KeyedGeo {
  kind: 'bars' | 'line'
  color: string
  width: Double
  keys: string[]
  rects: Map<string, Rect>
  points: Map<string, Pt>
  /** The y of the value axis' zero (or the domain's floor), where bars grow from. */
  baseline: Double
}

function morphKind(s: Series): 'bars' | 'line' | null {
  if (s.kind === 'bars' && s.symbol === undefined) return 'bars'
  if (s.kind === 'line' && s.curve === undefined && s.symbol === undefined) return 'line'
  return null
}

/** True when every series of `spec` can be morphed by key (and there is at least one). */
export function canKeyMorph(spec: ChartSpec): boolean {
  if (spec.series.length === 0) return false
  if (spec.horizontal === true || hasRightAxis(spec) || spec.yScale === 'log' || (spec.xValues ?? []).length > 0) return false
  for (const s of spec.series) if (morphKind(s) === null) return false
  return true
}

/** Each series' geometry by key, laid out exactly as `renderChart` lays it out. */
export function keyedGeometry(spec: ChartSpec, l: PlotLayout, keys: string[]): KeyedGeo[] {
  const dom: Domain = resolveYDomain(spec)
  const plot = l.plot
  const zero = dom.min <= 0.0 && dom.max >= 0.0 ? 0.0 : dom.min
  const baseline = scaleLinear(dom, plot.y + plot.h, plot.y, zero)
  return spec.series.map((s) => {
    const kind = morphKind(s) ?? 'line'
    const rects = new Map<string, Rect>()
    const points = new Map<string, Pt>()
    if (kind === 'bars') {
      const rs = layoutBars(s.values, plot, dom, 0.25)
      for (let i = 0; i < rs.length && i < keys.length; i++) if (s.values[i] === s.values[i]) rects.set(keys[i]!, rs[i]!)
    } else {
      const ps = layoutSeriesPoints(s.values, plot, dom)
      for (let i = 0; i < ps.length && i < keys.length; i++) if (s.values[i] === s.values[i]) points.set(keys[i]!, ps[i]!)
    }
    return { kind, color: s.color, width: s.width, keys, rects, points, baseline }
  })
}

const mix = (a: Double, b: Double, e: Double): Double => a + (b - a) * e

/** A bar collapsed to the baseline in its own slot — where an entering bar starts and an exiting bar ends. */
function flat(r: Rect, baseline: Double): Rect {
  return { x: r.x, y: baseline, w: r.w, h: 0.0 }
}

function mixRect(a: Rect, b: Rect, e: Double): Rect {
  return { x: mix(a.x, b.x, e), y: mix(a.y, b.y, e), w: mix(a.w, b.w, e), h: mix(a.h, b.h, e) }
}

/** The morphing series' commands at eased progress `e` (0 = the old frame, 1 = the new). */
export function keyedMorphCmds(from: KeyedGeo[], to: KeyedGeo[], e: Double): DrawCmd[] {
  const out: DrawCmd[] = []
  for (let s = 0; s < to.length; s++) {
    const b = to[s]!
    const a = from[s]
    if (b.kind === 'bars') {
      // Exiting first, so the survivors sliding over them paint on top.
      if (a !== undefined) {
        for (const k of a.keys) {
          const r = a.rects.get(k)
          if (r !== undefined && !b.rects.has(k)) out.push({ kind: 'rect', rect: mixRect(r, flat(r, a.baseline), e), fill: b.color })
        }
      }
      for (const k of b.keys) {
        const r = b.rects.get(k)
        if (r === undefined) continue
        const old = a?.rects.get(k)
        out.push({ kind: 'rect', rect: mixRect(old ?? flat(r, b.baseline), r, e), fill: b.color })
      }
    } else {
      const pts: Pt[] = []
      for (const k of b.keys) {
        const p = b.points.get(k)
        if (p === undefined) continue
        const old = a?.points.get(k)
        pts.push(old === undefined ? p : { x: mix(old.x, p.x, e), y: mix(old.y, p.y, e) })
      }
      if (pts.length > 1) out.push({ kind: 'polyline', points: pts, stroke: b.color, width: b.width })
    }
  }
  return out
}

/** The target spec with the morphing series blanked (their geometry is drawn by `keyedMorphCmds`) and the domain pinned, so axes and grid stay where the new frame puts them. */
export function maskForMorph(spec: ChartSpec): ChartSpec {
  return {
    ...spec,
    yDomain: resolveYDomain(spec),
    series: spec.series.map((s) => ({ ...s, values: s.values.map(() => Number.NaN), showValues: false })),
  }
}
