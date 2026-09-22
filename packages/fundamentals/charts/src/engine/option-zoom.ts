// ECharts `dataZoom` on a compiled option — the category-axis window.
//
// The window is fractions of the category rows, the same `ZoomWindow` the
// grammar chart, the navigator and the native hosts use. A windowed spec is a
// chart of fewer rows: every per-row array (categories, series values, labels,
// error bars, extras) is sliced, so geometry, hits and the accessible table
// stay correct with no further awareness. `filterMode: 'none' | 'empty'` keeps
// the y extent of every row, as ECharts does; the default `filter` lets the
// visible rows set it.

import type { OptionWarning } from './option'
import type { ChartSpec, Series } from './render'
import { resolveY2Domain, resolveYDomain } from './render'
import type { Double } from './types'
import { clampWindow, limitZoomWindow, sliceRange } from './zoom'
import type { ZoomWindow } from './zoom'

export interface OptionZoom {
  /** Wheel / pinch zoom and drag pan over the plot. */
  inside: boolean
  /** The navigator strip under the plot. */
  slider: boolean
  /** The initial window. */
  window: ZoomWindow
  /** `filterMode: 'none' | 'empty'` — the y extent stays that of every row. */
  keepY: boolean
  /** `zoomLock`: the span is fixed; the window only pans. */
  lock: boolean
  /** `minSpan` / `maxSpan`, as fractions. */
  minSpan: Double
  maxSpan: Double
  /** Inside: `zoomOnMouseWheel` / `moveOnMouseMove`. */
  wheel: boolean
  move: boolean
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A category reference (`startValue: 3` or `startValue: 'Wed'`) as a row index, or null. */
function rowOf(v: unknown, categories: string[]): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v === 'string') {
    const i = categories.indexOf(v)
    return i < 0 ? null : i
  }
  return null
}

/**
 * Read `option.dataZoom` for a category x axis, or undefined without one.
 * A y-axis (`yAxisIndex` / vertical) zoom and an x axis other than the first
 * are named, never silently applied to the wrong axis.
 */
export function readDataZoom(option: Record<string, unknown>, categories: string[], warn: (code: OptionWarning['code'], path: string, message: string) => void): OptionZoom | undefined {
  const raw = option['dataZoom']
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
  let zoom: OptionZoom | undefined
  const n = categories.length
  for (let i = 0; i < list.length; i++) {
    const z = list[i]
    const path = Array.isArray(raw) ? `dataZoom[${i}]` : 'dataZoom'
    if (!isObj(z)) continue
    if (z['yAxisIndex'] !== undefined || z['orient'] === 'vertical' || z['radiusAxisIndex'] !== undefined || z['angleAxisIndex'] !== undefined) {
      warn('series-option-unsupported', path, 'Only a zoom over the category x axis is supported; this dataZoom was ignored.')
      continue
    }
    const xi = z['xAxisIndex']
    if (xi !== undefined && !(xi === 0 || (Array.isArray(xi) && xi.length === 1 && xi[0] === 0))) {
      warn('series-option-unsupported', path + '.xAxisIndex', 'Only the first x axis zooms; this dataZoom was ignored.')
      continue
    }
    const type = z['type'] === 'inside' ? 'inside' : 'slider'
    if (zoom === undefined) {
      const startRow = rowOf(z['startValue'], categories)
      const endRow = rowOf(z['endValue'], categories)
      const start = startRow !== null && n > 0 ? startRow / n : (num(z['start']) ?? 0) / 100
      const end = endRow !== null && n > 0 ? (endRow + 1) / n : (num(z['end']) ?? 100) / 100
      const mode = z['filterMode']
      zoom = {
        inside: false,
        slider: false,
        window: clampWindow({ start: Math.min(start, end), end: Math.max(start, end) }),
        keepY: mode === 'none' || mode === 'empty',
        lock: z['zoomLock'] === true,
        minSpan: (num(z['minSpan']) ?? 0) / 100,
        maxSpan: (num(z['maxSpan']) ?? 100) / 100,
        wheel: true,
        move: true,
      }
    }
    if (type === 'inside') {
      zoom.inside = true
      if (z['zoomOnMouseWheel'] === false) zoom.wheel = false
      if (z['moveOnMouseMove'] === false) zoom.move = false
      if (z['disabled'] === true) zoom.inside = false
    } else if (z['show'] !== false) {
      zoom.slider = true
    }
  }
  return zoom
}

/** A window held to the option's span limits (and to its own span under `zoomLock`). */
export function limitWindow(zoom: OptionZoom, prev: ZoomWindow, next: ZoomWindow): ZoomWindow {
  return limitZoomWindow({ lock: zoom.lock, minSpan: zoom.minSpan, maxSpan: zoom.maxSpan }, prev, next)
}

function sliceSeries(s: Series, from: number, to: number, n: number): Series {
  const out: Record<string, unknown> = { ...s }
  for (const [k, v] of Object.entries(s)) {
    if (Array.isArray(v) && v.length === n && k !== 'dash' && k !== 'corners' && k !== 'symbolOffset') out[k] = v.slice(from, to)
  }
  if (Array.isArray(s.extras)) {
    out['extras'] = s.extras.map((e) => ({
      ...e,
      ...(e.numbers !== undefined && e.numbers.length === n ? { numbers: e.numbers.slice(from, to) } : {}),
      ...(e.texts !== undefined && e.texts.length === n ? { texts: e.texts.slice(from, to) } : {}),
    }))
  }
  return out as unknown as Series
}

/**
 * The spec under a window: the visible rows, and `offset` — the first
 * visible row's global index, which the host adds back to every hit.
 */
export function windowSpec(spec: ChartSpec, win: ZoomWindow, keepY: boolean): { spec: ChartSpec; offset: number } {
  const n = spec.categories.length
  const r = sliceRange(win, n)
  if (n === 0 || (r.from === 0 && r.to === n)) return { spec, offset: 0 }
  const out: ChartSpec = {
    ...spec,
    categories: spec.categories.slice(r.from, r.to),
    series: spec.series.map((s) => sliceSeries(s, r.from, r.to, n)),
    ...(spec.xValues !== undefined && spec.xValues.length === n ? { xValues: spec.xValues.slice(r.from, r.to) } : {}),
    ...(spec.x2Labels !== undefined && spec.x2Labels.length === n ? { x2Labels: spec.x2Labels.slice(r.from, r.to) } : {}),
    ...(spec.markers !== undefined
      ? { markers: spec.markers.flatMap((m) => (m.atIndex === undefined ? [m] : m.atIndex >= r.from && m.atIndex < r.to ? [{ ...m, atIndex: m.atIndex - r.from }] : [])) }
      : {}),
    ...(keepY ? { yDomain: resolveYDomain(spec), ...(spec.series.some((s) => s.axis === 'right') ? { y2Domain: resolveY2Domain(spec) } : {}) } : {}),
  }
  return { spec: out, offset: r.from }
}
