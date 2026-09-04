// Pointer → datum for a cartesian chart, as pure geometry over the spec, so
// the web host's click / tooltip and the native tap ask the SAME question.

import { hitBar, hitNearestX, layoutSeriesPoints } from './layout'
import { barsFor, layoutChart, resolveYDomain, stackedHitAt } from './render'
import type { ChartSpec } from './render'
import type { Double, MeasureText } from './types'

/**
 * The datum index a tap on a bar lands on — plain bars first, then stacked /
 * grouped (which cannot be asked one series at a time, each needs the others
 * to place its bars) — or -1. This is what `onSelect` fires with: a line or
 * scatter has no rect to hit, so a click beside its points is a miss.
 */
export function plotHitBars(spec: ChartSpec, measure: MeasureText, px: Double, py: Double): number {
  for (let i = 0; i < spec.series.length; i++) {
    if (spec.series[i]!.kind !== 'bars') continue
    const idx = hitBar(barsFor(spec, i, measure), px, py)
    if (idx >= 0) return idx
  }
  return stackedHitAt(spec, measure, px, py)
}

/**
 * The datum under the pointer for ANY mark kind: a bar hit when there is one,
 * else the nearest x of the first series (what the tooltip and crosshair
 * follow). A bar-only first series with no hit stays a miss.
 */
export function plotHitIndex(spec: ChartSpec, measure: MeasureText, px: Double, py: Double): number {
  const barHit = plotHitBars(spec, measure, px, py)
  if (barHit >= 0) return barHit
  if (spec.series.length === 0) return -1
  const first = spec.series[0]!
  if (first.kind === 'bars' || first.kind === 'stacked' || first.kind === 'grouped') return -1
  const l = layoutChart(spec, measure)
  return hitNearestX(layoutSeriesPoints(first.values, l.plot, resolveYDomain(spec)), px)
}
