// ECharts' toolbox `magicType` — switch the chart between line / bar and
// stacked / tiled, as a pure rewrite of the series kinds.
//
// One rule for every host: the web plot, the option chart and the native
// hosts all run a spec through `applyMagicType`, so a tap on "stack" gives the
// same chart everywhere. `kind` is 'line' | 'bar' | '' (no override) and
// `stack` is 'stack' | 'tiled' | '' — ECharts keeps the two pairs independent.

import type { ChartSpec, Series } from './render'

function retype(s: Series, kind: string, stack: string): Series {
  let k = s.kind
  if (kind === 'line') {
    if (k === 'bars' || k === 'grouped') k = 'line'
    else if (k === 'stacked') k = 'stackedArea'
  } else if (kind === 'bar') {
    if (k === 'line' || k === 'area') k = 'bars'
    else if (k === 'stackedArea') k = 'stacked'
  }
  if (stack === 'stack') {
    if (k === 'bars' || k === 'grouped') k = 'stacked'
    else if (k === 'line' || k === 'area') k = 'stackedArea'
  } else if (stack === 'tiled') {
    if (k === 'stacked') k = 'bars'
    else if (k === 'stackedArea') k = 'line'
  }
  return { ...s, kind: k }
}

/**
 * The spec with every switchable series retyped. Two or more independent bar
 * series share a band side by side (grouped), as ECharts draws them; points,
 * bands and waterfalls keep their geometry.
 */
export function applyMagicType(spec: ChartSpec, kind: string, stack: string): ChartSpec {
  if (kind === '' && stack === '') return spec
  const series: Series[] = []
  let bars = 0.0
  for (const s of spec.series) {
    const r = retype(s, kind, stack)
    if (r.kind === 'bars') bars = bars + 1.0
    series.push(r)
  }
  const out: Series[] = []
  for (const s of series) out.push(bars > 1.0 && s.kind === 'bars' ? { ...s, kind: 'grouped' } : s)
  return { ...spec, series: out }
}
