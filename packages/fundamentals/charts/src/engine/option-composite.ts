// The COMPOSITE half of the ECharts facade: `timeline` (baseOption + options
// steps) and multi-`grid` layouts. Both are pure functions over the option —
// `resolveTimeline` picks and merges one step, `splitGrids` carves a
// multi-grid option into per-grid sub-options with pixel rects, and
// `composeSvg` lays already-rendered `<svg>` strings into one document. The
// facade's `optionToSvg` / `planOption` call these first, so every family and
// the cartesian compiler see a plain single-grid option and need no awareness.
import type { DrawCmd, Double, Rect } from './types'
import { renderTimeline } from './timeline-strip'
import type { TimelineStrip } from './timeline-strip'
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

/**
 * How a reactive option update lands — `setOption`'s `opts`, in Pyreon's and
 * in ECharts' spelling (`notMerge`, `replaceMerge`, `lazyUpdate`, `silent`).
 */
export interface OptionUpdatePolicy {
  /** Replace the whole previous option instead of merging the update. */
  mode?: 'merge' | 'replace'
  /** ECharts' spelling of `mode: 'replace'`. */
  notMerge?: boolean
  /** Top-level component keys replaced as a unit while the rest still merges. */
  replaceKeys?: string | readonly string[]
  /**
   * ECharts' `replaceMerge`: for these component keys, components in the
   * update merge into their id/name matches and every component the update
   * does NOT name is removed (a plain merge keeps them). Distinct from
   * `replaceKeys`, which takes the update's array verbatim.
   */
  replaceMerge?: string | readonly string[]
  /**
   * ECharts' `lazyUpdate` — defer the redraw to the next frame. The canvas
   * host already paints once per frame for any number of option writes, so
   * this is accepted for parity and changes nothing.
   */
  lazyUpdate?: boolean
  /**
   * ECharts' `silent` — do not emit events for the option change itself.
   * Applying an option never emits an event in this engine (selection and
   * hover events are pointer-driven), so this is accepted and changes nothing.
   */
  silent?: boolean
}

const INDEXED_COMPONENTS = new Set([
  'series', 'xAxis', 'yAxis', 'grid', 'polar', 'radiusAxis', 'angleAxis',
  'calendar', 'parallel', 'parallelAxis', 'singleAxis', 'dataset', 'visualMap',
  'dataZoom', 'title', 'legend', 'graphic',
])

const componentKey = (value: unknown): string | null => {
  if (!isObj(value)) return null
  if (typeof value['id'] === 'string' || typeof value['id'] === 'number') return `id:${String(value['id'])}`
  if (typeof value['name'] === 'string') return `name:${value['name']}`
  return null
}

const mergeComponentArray = (before: unknown[], after: unknown[]): unknown[] => {
  const out = before.slice()
  const claimed = new Set<number>()
  for (let i = 0; i < after.length; i++) {
    const next = after[i]
    const key = componentKey(next)
    let at = key === null ? -1 : out.findIndex((candidate, index) => !claimed.has(index) && componentKey(candidate) === key)
    if (at < 0 && i < out.length && !claimed.has(i)) at = i
    if (at < 0) {
      out.push(next)
      claimed.add(out.length - 1)
      continue
    }
    claimed.add(at)
    out[at] = isObj(out[at]) && isObj(next) ? mergeObjects(out[at] as Obj, next) : next
  }
  return out
}

/**
 * Merge a reactive option update without mutating either input. Objects merge
 * recursively; component arrays match stable ids, then names, then indices.
 * Ordinary arrays are values and replace as a unit.
 */
export function mergeChartOptions(previous: Obj | undefined, update: Obj, policy: OptionUpdatePolicy = {}): Obj {
  if (previous === undefined || policy.mode === 'replace' || policy.notMerge === true) return update
  const keys = (v: string | readonly string[] | undefined): Set<string> => new Set(typeof v === 'string' ? [v] : v ?? [])
  const replace = keys(policy.replaceKeys)
  const replaceMerge = keys(policy.replaceMerge)
  const out: Obj = { ...previous }
  for (const key of Object.keys(update)) {
    const before = previous[key]
    const after = update[key]
    if (replace.has(key)) out[key] = after
    else if (replaceMerge.has(key) && Array.isArray(before) && Array.isArray(after)) out[key] = replaceMergeComponentArray(before, after)
    else if (INDEXED_COMPONENTS.has(key) && Array.isArray(before) && Array.isArray(after)) out[key] = mergeComponentArray(before, after)
    else out[key] = isObj(before) && isObj(after) ? mergeObjects(before, after) : after
  }
  return out
}

/** ECharts `replaceMerge`: the update's components, each merged into its id/name match; unmatched previous components are dropped. */
const replaceMergeComponentArray = (before: unknown[], after: unknown[]): unknown[] => {
  const claimed = new Set<number>()
  return after.map((next) => {
    const key = componentKey(next)
    const at = key === null ? -1 : before.findIndex((candidate, index) => !claimed.has(index) && componentKey(candidate) === key)
    if (at < 0) return next
    claimed.add(at)
    return isObj(before[at]) && isObj(next) ? mergeObjects(before[at] as Obj, next) : next
  })
}

/** Height reserved under the chart for the timeline strip. */
export const TIMELINE_HEIGHT = 40.0

export interface TimelineSteps {
  labels: string[]
  /** The step the option asks for (`timeline.currentIndex`), clamped. */
  current: number
  autoPlay: boolean
  /** `timeline.playInterval` in ms; default 2000 like ECharts. */
  playInterval: Double
  /** The strip: labels, loop / rewind and which controls show; default ECharts'. */
  strip?: TimelineStrip | undefined
}

/** ECharts' default timeline strip over some labels. */
export function defaultTimelineStrip(labels: string[]): TimelineStrip {
  return { labels, loop: true, rewind: false, showPlay: true, showPrev: true, showNext: true, label: '#374151', accent: '#2563eb', line: '#d1d5db', fontSize: 11.0 }
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
  const control = isObj(tl['controlStyle']) ? tl['controlStyle'] : {}
  const checkpoint = isObj(tl['checkpointStyle']) ? tl['checkpointStyle'] : {}
  const lineStyle = isObj(tl['lineStyle']) ? tl['lineStyle'] : {}
  const labelStyle = isObj(tl['label']) ? tl['label'] : {}
  const defaults = defaultTimelineStrip(labels)
  const strip: TimelineStrip = {
    ...defaults,
    loop: tl['loop'] !== false,
    rewind: tl['rewind'] === true,
    showPlay: control['show'] !== false && control['showPlayBtn'] !== false,
    showPrev: control['show'] !== false && control['showPrevBtn'] !== false,
    showNext: control['show'] !== false && control['showNextBtn'] !== false,
    accent: typeof checkpoint['color'] === 'string' ? (checkpoint['color'] as string) : defaults.accent,
    line: typeof lineStyle['color'] === 'string' ? (lineStyle['color'] as string) : defaults.line,
    label: typeof labelStyle['color'] === 'string' ? (labelStyle['color'] as string) : defaults.label,
    fontSize: num(labelStyle['fontSize']) ?? defaults.fontSize,
  }
  return { labels, current, autoPlay: tl['autoPlay'] === true, playInterval: num(tl['playInterval']) ?? 2000.0, strip }
}

const mergeObjects = (base: Obj, override: Obj): Obj => {
  const out: Obj = { ...base }
  for (const key of Object.keys(override)) {
    const before = base[key]
    const after = override[key]
    out[key] = isObj(before) && isObj(after) ? mergeObjects(before, after) : after
  }
  return out
}

/** A step recursively merges objects over the base; series entries merge by index. */
function mergeStep(base: Obj, step: Obj): Obj {
  const out = mergeObjects(base, step)
  if (!Object.prototype.hasOwnProperty.call(step, 'series')) return out
  const baseSeries = toArr(base['series'])
  const stepValue = step['series']
  const stepSeries = Array.isArray(stepValue) ? stepValue : isObj(stepValue) ? [stepValue] : []
  const merged: unknown[] = baseSeries.slice()
  for (let index = 0; index < stepSeries.length; index++) {
    const before = merged[index]
    const after = stepSeries[index]
    merged[index] = isObj(before) && isObj(after) ? mergeObjects(before, after) : after
  }
  out['series'] = merged
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
/** The timeline strip's commands along the bottom band `y`…`y + h`; `playing` shows the pause control. */
export function timelineCommands(steps: TimelineSteps, width: Double, y: Double, h: Double, playing = false): DrawCmd[] {
  const strip = steps.strip ?? defaultTimelineStrip(steps.labels)
  return renderTimeline({ ...strip, labels: steps.labels }, { x: 0.0, y, w: width, h }, steps.current, playing)
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
