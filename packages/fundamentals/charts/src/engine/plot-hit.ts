// Pointer → datum for a cartesian chart, as pure geometry over the spec, so
// the web host's click / tooltip and the native tap ask the SAME question.

import { hitBar, hitNearestX, layoutSeriesPoints } from './layout'
import { barsForIn, geometrySpec, layoutChart, resolveYDomain, stackedHitIn } from './render'
import type { ChartSpec } from './render'
import type { PlotLayout } from './layout'
import type { Double, MeasureText } from './types'

/**
 * The datum index a tap on a bar lands on — plain bars first, then stacked /
 * grouped (which cannot be asked one series at a time, each needs the others
 * to place its bars) — or -1. This is what `onSelect` fires with: a line or
 * scatter has no rect to hit, so a click beside its points is a miss.
 */
export function plotHitBars(spec: ChartSpec, measure: MeasureText, px: Double, py: Double): number {
  return plotHitBarsIn(spec, layoutChart(spec, measure), px, py)
}

/** `plotHitBars` over a layout the caller already computed — one layout per frame, not one per question. */
export function plotHitBarsIn(spec: ChartSpec, l: PlotLayout, px: Double, py: Double): number {
  for (let i = 0; i < spec.series.length; i++) {
    const kind = spec.series[i]!.kind
    if (kind !== 'bars' && kind !== 'waterfall') continue
    const idx = hitBar(barsForIn(spec, i, l.plot), px, py)
    if (idx >= 0) return idx
  }
  return stackedHitIn(spec, l.plot, px, py)
}

/**
 * The datum under the pointer for ANY mark kind: a bar hit when there is one,
 * else the nearest x of the first series (what the tooltip and crosshair
 * follow). A bar-only first series with no hit stays a miss.
 */
export function plotHitIndex(spec: ChartSpec, measure: MeasureText, px: Double, py: Double): number {
  return plotHitIndexIn(spec, layoutChart(spec, measure), px, py)
}

/** `plotHitIndex` over a layout the caller already computed. */
export function plotHitIndexIn(raw: ChartSpec, l: PlotLayout, px: Double, py: Double): number {
  const barHit = plotHitBarsIn(raw, l, px, py)
  if (barHit >= 0) return barHit
  // Nearest-x runs over the VIEW (a log chart's points sit where the log
  // view put them) — the index it reports is the same row either way.
  const spec = geometrySpec(raw)
  if (spec.series.length === 0) return -1
  const first = spec.series[0]!
  if (first.kind === 'bars' || first.kind === 'stacked' || first.kind === 'grouped' || first.kind === 'waterfall') return -1
  return hitNearestX(layoutSeriesPoints(first.values, l.plot, resolveYDomain(spec)), px)
}
