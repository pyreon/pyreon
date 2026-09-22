/**
 * Several charts in one option — ECharts' layering, as data.
 *
 * ECharts draws every series of an option in one canvas: two pies side by
 * side, a pie in the corner of a line chart, a gauge beside a radar. The
 * facade used to route on `series[0]` alone, so everything after the first
 * family series was dropped with a warning. This module partitions an
 * option's series into LAYERS — each an ordinary single-chart sub-option with
 * the pixel rect it occupies — and the caller plans and draws each one:
 *
 *  - the CARTESIAN series (and everything on a `grid`) form one layer over
 *    the whole box; several grids split further, inside it, exactly as before;
 *  - series that SHARE a coordinate system form one layer each — every radar
 *    series, every polar series, every series on the geo, on a single axis,
 *    on a parallel system or on a calendar;
 *  - every other family series (pie, funnel, gauge, sunburst, treemap, tree,
 *    sankey, graph, chord, map, river) is its own layer, placed where ECharts
 *    places it: `center` + `radius` for the round ones, the
 *    `left`/`top`/`right`/`bottom`/`width`/`height` box for the rest.
 *
 * The first layer keeps the option's `title`; the `legend` stays with the
 * cartesian layer when there is one, else with the first layer. Overlays that
 * belong to the whole canvas (`graphic`, `visualMap`, `timeline`) are the
 * caller's, not a layer's.
 */
import type { Double, Rect } from './types'

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const toArr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : isObj(v) ? [v] : [])

/** Series types drawn on a cartesian grid (and so on the cartesian layer). */
const CARTESIAN_TYPES = new Set(['line', 'bar', 'scatter', 'effectScatter', 'pictorialBar', 'lines', 'custom', 'candlestick', 'boxplot', 'heatmap'])

/** Coordinate systems whose series share one layer. */
const SHARED_COORDS = ['radar', 'polar', 'geo', 'singleAxis', 'parallel', 'calendar'] as const
type SharedCoord = (typeof SHARED_COORDS)[number]

/** A series' coordinate system, as ECharts resolves it. */
function coordOf(s: Obj): string {
  const type = typeof s['type'] === 'string' ? (s['type'] as string) : ''
  const explicit = typeof s['coordinateSystem'] === 'string' ? (s['coordinateSystem'] as string) : ''
  if (type === 'radar') return 'radar'
  if (type === 'parallel') return 'parallel'
  if (type === 'themeRiver') return 'singleAxis'
  if (type === 'map') return explicit === 'geo' ? 'geo' : 'map'
  if (explicit === 'polar' || explicit === 'geo' || explicit === 'singleAxis' || explicit === 'parallel' || explicit === 'calendar') return explicit
  if (explicit === 'cartesian2d' || CARTESIAN_TYPES.has(type)) return 'cartesian2d'
  return 'none'
}

export interface LayerPart {
  /** The layer's single-chart sub-option. */
  option: Obj
  /** Where it is drawn, in the chart's box. */
  rect: Rect
  /** What the layer is: the cartesian grid(s), a shared coordinate system, or one standalone family series. */
  kind: 'cartesian' | SharedCoord | 'family'
}

/** A length in ECharts' units — a number of pixels, or a percent string of `extent`. */
export function layoutLength(v: unknown, extent: Double, fallback: Double): Double {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const t = v.trim()
    if (t.endsWith('%')) {
      const p = Number.parseFloat(t)
      if (Number.isFinite(p)) return (p / 100.0) * extent
    }
    const n = Number.parseFloat(t)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

/** ECharts' position keywords for `left` / `top`: 'center', 'left', 'right', 'top', 'bottom'. */
function edge(v: unknown, extent: Double, size: Double): Double | undefined {
  if (v === 'center' || v === 'middle') return (extent - size) / 2.0
  if (v === 'left' || v === 'top') return 0.0
  if (v === 'right' || v === 'bottom') return extent - size
  if (v === undefined) return undefined
  return layoutLength(v, extent, 0.0)
}

/**
 * A series' box from ECharts' `left`/`top`/`right`/`bottom`/`width`/`height`
 * (each a pixel number or a percent of the chart), with the defaults ECharts
 * gives that family where a key is absent.
 */
export function boxRect(s: Obj, width: Double, height: Double, defaults: { left?: Double; top?: Double; right?: Double; bottom?: Double } = {}): Rect {
  const w0 = s['width'] !== undefined ? layoutLength(s['width'], width, width) : undefined
  const h0 = s['height'] !== undefined ? layoutLength(s['height'], height, height) : undefined
  const left = s['left'] !== undefined ? edge(s['left'], width, w0 ?? 0.0) : defaults.left
  const top = s['top'] !== undefined ? edge(s['top'], height, h0 ?? 0.0) : defaults.top
  const right = s['right'] !== undefined ? layoutLength(s['right'], width, 0.0) : defaults.right
  const bottom = s['bottom'] !== undefined ? layoutLength(s['bottom'], height, 0.0) : defaults.bottom
  const x = left ?? (w0 !== undefined && right !== undefined ? width - right - w0 : 0.0)
  const y = top ?? (h0 !== undefined && bottom !== undefined ? height - bottom - h0 : 0.0)
  const w = w0 ?? Math.max(0.0, width - x - (right ?? 0.0))
  const h = h0 ?? Math.max(0.0, height - y - (bottom ?? 0.0))
  return { x, y, w: Math.max(0.0, w), h: Math.max(0.0, h) }
}

/**
 * A round series' box from ECharts' `center` (default the middle) and
 * `radius` (the OUTER radius: a length, a percent of half the shorter side,
 * or `[inner, outer]`; default `defaultRadius`). The box is the square the
 * circle fills, which is what the family renderers draw into.
 */
export function circleRect(s: Obj, width: Double, height: Double, defaultRadius: string): Rect {
  // ECharts places a circle inside the series' own box (left / top / right / bottom / width / height, the whole chart by default).
  const view = circleView(s, width, height)
  const c = Array.isArray(s['center']) ? (s['center'] as unknown[]) : s['center'] === undefined ? [] : [s['center'], s['center']]
  const cx = view.x + layoutLength(c[0], view.w, view.w / 2.0)
  const cy = view.y + layoutLength(c[1], view.h, view.h / 2.0)
  const raw = Array.isArray(s['radius']) ? (s['radius'] as unknown[])[1] : s['radius']
  const half = Math.min(view.w, view.h) / 2.0
  const r = layoutLength(raw ?? defaultRadius, half, layoutLength(defaultRadius, half, half))
  return { x: cx - r, y: cy - r, w: r * 2.0, h: r * 2.0 }
}

/** The box a circular series lays out in — ECharts' view rect, which its outside labels also keep within. */
export function circleView(s: Obj, width: Double, height: Double): Rect {
  return boxRect(s, width, height, { left: 0.0, top: 0.0, right: 0.0, bottom: 0.0 })
}

/** The keys `boxRect` reads off a series. */
const BOX_KEYS = ['left', 'top', 'right', 'bottom', 'width', 'height'] as const

/** Where a standalone family series goes. */
export function familyRect(s: Obj, width: Double, height: Double): Rect {
  const type = s['type']
  if (type === 'pie') return circleRect(s, width, height, '50%')
  if (type === 'gauge') return circleRect(s, width, height, '75%')
  if (type === 'sunburst') return circleRect(s, width, height, '75%')
  if (type === 'chord') return circleRect(s, width, height, '80%')
  if (type === 'funnel') return boxRect(s, width, height, { left: 80, top: 60, right: 80, bottom: 60 })
  if (type === 'treemap') return boxRect(s, width, height, { left: width * 0.1, top: height * 0.1, right: width * 0.1, bottom: height * 0.1 })
  if (type === 'tree') return boxRect(s, width, height, { left: width * 0.12, top: height * 0.12, right: width * 0.12, bottom: height * 0.12 })
  if (type === 'sankey') return boxRect(s, width, height, { left: width * 0.05, top: height * 0.05, right: width * 0.2, bottom: height * 0.05 })
  if (type === 'graph') return boxRect(s, width, height, { left: 0, top: 0, right: 0, bottom: 0 })
  return boxRect(s, width, height, { left: 0, top: 0, right: 0, bottom: 0 })
}

/**
 * Partition an option into layers, or null when it draws one chart (a single
 * layer is the ordinary path, unchanged).
 */
export function splitLayers(option: Obj, width: Double, height: Double): LayerPart[] | null {
  const series = toArr(option['series'])
  if (series.length < 2) return null
  const cartesian: Obj[] = []
  const shared = new Map<SharedCoord, Obj[]>()
  const standalone: Obj[] = []
  for (const s of series) {
    const coord = coordOf(s)
    if (coord === 'cartesian2d') cartesian.push(s)
    else if ((SHARED_COORDS as readonly string[]).includes(coord)) {
      const key = coord as SharedCoord
      shared.set(key, [...(shared.get(key) ?? []), s])
    } else standalone.push(s)
  }
  const count = (cartesian.length > 0 ? 1 : 0) + shared.size + standalone.length
  if (count < 2) return null

  const whole: Rect = { x: 0.0, y: 0.0, w: width, h: height }
  const parts: LayerPart[] = []
  const base = (own: Obj[]): Obj => ({ ...option, series: own })
  if (cartesian.length > 0) parts.push({ option: base(cartesian), rect: whole, kind: 'cartesian' })
  for (const coord of SHARED_COORDS) {
    const own = shared.get(coord)
    if (own !== undefined) parts.push({ option: base(own), rect: whole, kind: coord })
  }
  for (const s of standalone) {
    // The box keys are consumed HERE (they place the layer); left on the
    // series, the family compiler would name them as unmapped.
    const placed: Obj = { ...s }
    for (const key of BOX_KEYS) delete placed[key]
    parts.push({ option: base([placed]), rect: familyRect(s, width, height), kind: 'family' })
  }

  // Title on the first layer; the legend on the cartesian layer, else the first.
  const legendHolder = parts.findIndex((p) => p.kind === 'cartesian')
  const keepLegend = legendHolder >= 0 ? legendHolder : 0
  parts.forEach((p, i) => {
    const sub = p.option
    // Whole-canvas overlays are drawn once, by the caller.
    delete sub['graphic']
    delete sub['visualMap']
    delete sub['timeline']
    delete sub['options']
    delete sub['baseOption']
    if (i !== 0) delete sub['title']
    if (i !== keepLegend) delete sub['legend']
    // A family layer carries no cartesian axes, and a layer that is not the
    // cartesian one keeps no grid or dataZoom (they would misplace it).
    if (p.kind !== 'cartesian') {
      delete sub['xAxis']
      delete sub['yAxis']
      delete sub['grid']
      delete sub['dataZoom']
      delete sub['brush']
    }
  })
  return parts
}
