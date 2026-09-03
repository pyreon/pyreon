// The COMPOSITE half of the ECharts facade: `timeline` (baseOption + options
// steps) and multi-`grid` layouts. Both are pure functions over the option —
// `resolveTimeline` picks and merges one step, `splitGrids` carves a
// multi-grid option into per-grid sub-options with pixel rects, and
// `composeSvg` lays already-rendered `<svg>` strings into one document. The
// facade's `optionToSvg` / `planOption` call these first, so every family and
// the cartesian compiler see a plain single-grid option and need no awareness.
import type { DrawCmd, Double, Rect } from './types'
import { renderSvg } from './svg'
import type { OptionWarning } from './option'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}
const toArr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : isObj(v) ? [v] : [])

/** Height reserved under the chart for the timeline strip. */
export const TIMELINE_HEIGHT = 40.0

export interface TimelineSteps {
  labels: string[]
  /** The step the option asks for (`timeline.currentIndex`), clamped. */
  current: number
  autoPlay: boolean
  /** `timeline.playInterval` in ms; default 2000 like ECharts. */
  playInterval: Double
}

/** The step list of an option's `timeline`, or null when there is none. */
export function timelineSteps(option: Obj): TimelineSteps | null {
  // ECharts accepts the timeline at the top level OR inside baseOption (its docs use the latter).
  const base = option['baseOption']
  const tl = isObj(option['timeline']) ? option['timeline'] : isObj(base) && isObj(base['timeline']) ? base['timeline'] : null
  if (!isObj(tl)) return null
  const labels: string[] = []
  for (const d of Array.isArray(tl['data']) ? (tl['data'] as unknown[]) : []) {
    labels.push(isObj(d) ? String(d['value'] ?? d['name'] ?? '') : String(d))
  }
  const max = Math.max(0, labels.length - 1)
  const want = num(tl['currentIndex']) ?? 0
  const current = Math.min(max, Math.max(0, Math.floor(want)))
  return { labels, current, autoPlay: tl['autoPlay'] === true, playInterval: num(tl['playInterval']) ?? 2000.0 }
}

/** ECharts' timeline merge: a step's top-level objects merge shallowly over the base; series merge BY INDEX. */
function mergeStep(base: Obj, step: Obj): Obj {
  const out: Obj = { ...base }
  for (const key of Object.keys(step)) {
    const sv = step[key]
    const bv = base[key]
    if (key === 'series') {
      const bs = toArr(bv)
      const ss = Array.isArray(sv) ? (sv as unknown[]) : isObj(sv) ? [sv] : []
      const merged: unknown[] = bs.slice()
      for (let i = 0; i < ss.length; i++) {
        const s = ss[i]
        merged[i] = isObj(s) && isObj(merged[i]) ? { ...(merged[i] as Obj), ...s } : s
      }
      out[key] = merged
    } else if (isObj(sv) && isObj(bv)) {
      out[key] = { ...bv, ...sv }
    } else {
      out[key] = sv
    }
  }
  return out
}

/**
 * Resolve a `timeline` option (`baseOption` + `options[]`) to the plain option
 * of ONE step. Without a timeline the option comes back untouched. An index
 * past the step list warns by name and falls back to the base option — never
 * a silent blank chart.
 */
export function resolveTimeline(option: Obj, index?: number): { option: Obj; warnings: OptionWarning[] } {
  const warnings: OptionWarning[] = []
  const hasBase = isObj(option['baseOption'])
  const steps = timelineSteps(option)
  if (!hasBase && steps === null) return { option, warnings }
  const base: Obj = hasBase ? { ...(option['baseOption'] as Obj) } : {}
  // Top-level keys beside the timeline machinery still apply (ECharts reads them as base).
  for (const key of Object.keys(option)) {
    if (key === 'baseOption' || key === 'options' || key === 'timeline') continue
    if (!(key in base)) base[key] = option[key]
  }
  const options = Array.isArray(option['options']) ? (option['options'] as unknown[]).filter(isObj) : []
  const idx = index ?? steps?.current ?? 0
  // The timeline component itself never reaches the compilers.
  delete base['timeline']
  if (options.length === 0) {
    if (hasBase || (steps !== null && steps.labels.length > 0)) warnings.push({ code: 'timeline-step-out-of-range', path: 'options', message: 'timeline has no options[] steps; the base option was rendered.' })
    return { option: base, warnings }
  }
  if (idx < 0 || idx >= options.length) {
    warnings.push({ code: 'timeline-step-out-of-range', path: 'options[' + String(idx) + ']', message: 'timeline step ' + String(idx) + ' does not exist (' + String(options.length) + ' steps); the base option was rendered.' })
    return { option: base, warnings }
  }
  const merged = mergeStep(base, options[idx]!)
  delete merged['timeline']
  return { option: merged, warnings }
}

const side = (v: unknown, total: Double, fallback: Double): Double => {
  if (typeof v === 'string' && v.endsWith('%')) {
    const p = num(v.slice(0, -1))
    return p === null ? fallback : (total * p) / 100.0
  }
  const n = num(v)
  return n === null ? fallback : n
}

/** Pixel rect of one ECharts `grid` entry (left/right/top/bottom/width/height, px or `%`). Defaults mirror ECharts (10% / 10% / 60 / 60). */
export function gridRect(grid: Obj, width: Double, height: Double): Rect {
  const left = side(grid['left'], width, width * 0.1)
  const top = side(grid['top'], height, 60.0)
  const w = grid['width'] !== undefined ? side(grid['width'], width, width - left - width * 0.1) : width - left - side(grid['right'], width, width * 0.1)
  const h = grid['height'] !== undefined ? side(grid['height'], height, height - top - 60.0) : height - top - side(grid['bottom'], height, 60.0)
  return { x: left, y: top, w: Math.max(0.0, w), h: Math.max(0.0, h) }
}

export interface GridPart {
  index: number
  rect: Rect
  /** A single-grid option: its axes, its series (axis indices relocalised), title/legend on part 0 only. */
  option: Obj
}

/**
 * Carve a multi-`grid` option into one single-grid sub-option per grid. Axes
 * belong to a grid by `gridIndex`; a series belongs to the grid of its x axis
 * (`xAxisIndex`). Returns null for zero or one grid — the plain path.
 */
export function splitGrids(option: Obj, width: Double, height: Double): GridPart[] | null {
  const grids = Array.isArray(option['grid']) ? (option['grid'] as unknown[]).filter(isObj) : []
  if (grids.length < 2) return null
  const xAxes = toArr(option['xAxis'])
  const yAxes = toArr(option['yAxis'])
  const series = toArr(option['series'])
  const gridOf = (axis: Obj | undefined): number => (axis === undefined ? 0 : (num(axis['gridIndex']) ?? 0))
  const parts: GridPart[] = []
  for (let g = 0; g < grids.length; g++) {
    const xs = xAxes.filter((a) => gridOf(a) === g)
    const ys = yAxes.filter((a) => gridOf(a) === g)
    const own: Obj[] = []
    for (const s of series) {
      const xi = num(s['xAxisIndex']) ?? 0
      if (gridOf(xAxes[xi]) !== g) continue
      const yi = num(s['yAxisIndex']) ?? 0
      const localY = Math.max(0, ys.indexOf(yAxes[yi]!))
      const copy: Obj = { ...s }
      delete copy['xAxisIndex']
      if (localY > 0) copy['yAxisIndex'] = localY
      else delete copy['yAxisIndex']
      own.push(copy)
    }
    const sub: Obj = { ...option }
    delete sub['grid']
    delete sub['graphic']
    delete sub['visualMap']
    if (g > 0) {
      delete sub['title']
      delete sub['legend']
    }
    sub['grid'] = grids[g]
    if (xs.length > 0) sub['xAxis'] = xs.length === 1 ? { ...xs[0]!, gridIndex: undefined } : xs
    else delete sub['xAxis']
    if (ys.length > 0) sub['yAxis'] = ys.length === 1 ? { ...ys[0]!, gridIndex: undefined } : ys
    else delete sub['yAxis']
    sub['series'] = own
    parts.push({ index: g, rect: gridRect(grids[g]!, width, height), option: sub })
  }
  return parts
}

/** The timeline strip: an axis line, one dot per step, the current step filled and labelled bold. */
export function timelineCommands(steps: TimelineSteps, width: Double, y: Double, h: Double, colors: { label: string; accent: string; grid: string } = { label: '#374151', accent: '#2563eb', grid: '#d1d5db' }): DrawCmd[] {
  const out: DrawCmd[] = []
  const n = steps.labels.length
  if (n === 0) return out
  const pad = 24.0
  const cy = y + h * 0.4
  const x0 = pad
  const x1 = Math.max(pad, width - pad)
  out.push({ kind: 'line', from: { x: x0, y: cy }, to: { x: x1, y: cy }, stroke: colors.grid, width: 1.0 })
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (x0 + x1) / 2.0 : x0 + ((x1 - x0) * i) / (n - 1)
    const current = i === steps.current
    out.push({ kind: 'circle', center: { x, y: cy }, radius: current ? 5.0 : 3.5, fill: colors.accent })
    if (!current) out.push({ kind: 'circle', center: { x, y: cy }, radius: 2.5, fill: '#ffffff' })
    out.push({ kind: 'text', text: steps.labels[i]!, at: { x, y: cy + 8.0 }, fill: current ? colors.accent : colors.label, size: 11.0, align: 'middle', baseline: 'top' })
  }
  return out
}

const inner = (svg: string): string => {
  const open = svg.indexOf('>')
  const close = svg.lastIndexOf('</svg>')
  if (open < 0 || close < 0) return ''
  // Nested <title>/<desc> ids would duplicate the root's; the root names the graphic.
  return svg
    .slice(open + 1, close)
    .replace(/^<title[^>]*>[\s\S]*?<\/title>/, '')
    .replace(/^<desc[^>]*>[\s\S]*?<\/desc>/, '')
}

/** Lay rendered `<svg>` strings into one document at pixel offsets, with an overlay command layer on top. */
export function composeSvg(parts: { svg: string; x: Double; y: Double }[], overlay: DrawCmd[], width: Double, height: Double, options: { title?: string | undefined; background?: string | undefined } = {}): string {
  const root = renderSvg([], width, height, {
    idPrefix: 'pyreon-composite',
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.background !== undefined ? { background: options.background } : {}),
  })
  const n = (v: Double): string => String(Math.round(v * 100.0) / 100.0)
  const body: string[] = []
  for (const p of parts) {
    const content = inner(p.svg)
    if (content === '') continue
    body.push(p.x === 0.0 && p.y === 0.0 ? '<g>' + content + '</g>' : '<g transform="translate(' + n(p.x) + ' ' + n(p.y) + ')">' + content + '</g>')
  }
  if (overlay.length > 0) body.push(inner(renderSvg(overlay, width, height, { idPrefix: 'pyreon-composite-overlay' })))
  const at = root.lastIndexOf('</svg>')
  return root.slice(0, at) + body.join('') + root.slice(at)
}
