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
import { frameLength, frameRect, frameView } from './frame'
import type { FrameLength, FrameSpec } from './frame'
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


/** An ECharts length as a frame length: a number is px, `'N%'` a percent, a numeric string px; else unset. */
export function lengthOf(v: unknown): FrameLength {
  if (typeof v === 'number' && Number.isFinite(v)) return { mode: 'px', amount: v }
  if (typeof v === 'string') {
    const t = v.trim()
    const n = Number.parseFloat(t)
    if (Number.isFinite(n)) return t.endsWith('%') ? { mode: 'pct', amount: n } : { mode: 'px', amount: n }
  }
  return UNSET
}

const UNSET: FrameLength = { mode: '', amount: 0.0 }
const px = (n: Double): FrameLength => ({ mode: 'px', amount: n })
const pct = (n: Double): FrameLength => ({ mode: 'pct', amount: n })

/** A `left` / `top`: ECharts' keywords, else a length (an unreadable one is 0, as `layoutLength` falls back). */
function edgeOf(v: unknown): FrameLength {
  if (v === undefined) return UNSET
  if (v === 'center' || v === 'middle') return { mode: 'center', amount: 0.0 }
  if (v === 'left' || v === 'top') return { mode: 'start', amount: 0.0 }
  if (v === 'right' || v === 'bottom') return { mode: 'end', amount: 0.0 }
  const l = lengthOf(v)
  return l.mode === '' ? px(0.0) : l
}

/** A length that is 0 when unreadable (`right` / `bottom`), unset when absent. */
function marginOf(v: unknown): FrameLength {
  if (v === undefined) return UNSET
  const l = lengthOf(v)
  return l.mode === '' ? px(0.0) : l
}

/** A `width` / `height`: the whole extent when unreadable, unset when absent. */
function sizeOf(v: unknown): FrameLength {
  if (v === undefined) return UNSET
  const l = lengthOf(v)
  return l.mode === '' ? pct(100.0) : l
}

interface FrameDefaults {
  left?: FrameLength
  top?: FrameLength
  right?: FrameLength
  bottom?: FrameLength
}

/** A series' box keys as a frame spec, a missing side taking its default. */
function boxSpec(s: Obj, defaults: FrameDefaults): FrameSpec {
  return {
    left: s['left'] !== undefined ? edgeOf(s['left']) : defaults.left ?? UNSET,
    top: s['top'] !== undefined ? edgeOf(s['top']) : defaults.top ?? UNSET,
    right: s['right'] !== undefined ? marginOf(s['right']) : defaults.right ?? UNSET,
    bottom: s['bottom'] !== undefined ? marginOf(s['bottom']) : defaults.bottom ?? UNSET,
    width: sizeOf(s['width']),
    height: sizeOf(s['height']),
    round: false,
    centerX: UNSET,
    centerY: UNSET,
    radius: UNSET,
  }
}

const ZERO_MARGINS: FrameDefaults = { left: px(0.0), top: px(0.0), right: px(0.0), bottom: px(0.0) }

/** A round series' spec: its box (the whole chart by default), `center`, and the OUTER `radius`. */
function roundSpec(s: Obj, defaultRadius: string): FrameSpec {
  const c = Array.isArray(s['center']) ? (s['center'] as unknown[]) : s['center'] === undefined ? [] : [s['center'], s['center']]
  const raw = Array.isArray(s['radius']) ? (s['radius'] as unknown[])[1] : s['radius']
  const own = raw === undefined ? UNSET : lengthOf(raw)
  const fallback = lengthOf(defaultRadius)
  return { ...boxSpec(s, ZERO_MARGINS), round: true, centerX: lengthOf(c[0]), centerY: lengthOf(c[1]), radius: own.mode !== '' ? own : fallback.mode !== '' ? fallback : pct(100.0) }
}

/**
 * ECharts' layout length: a number is pixels, `'N%'` a percent of `extent`,
 * anything unreadable the fallback.
 */
export function layoutLength(v: unknown, extent: Double, fallback: Double): Double {
  return frameLength(lengthOf(v), extent, fallback)
}

/**
 * A series' box from ECharts' `left` / `top` / `right` / `bottom` / `width` /
 * `height` (pixels, percents, or `left`/`top` keywords), a missing side
 * taking its default.
 */
export function boxRect(s: Obj, width: Double, height: Double, defaults: { left?: Double; top?: Double; right?: Double; bottom?: Double } = {}): Rect {
  const d: FrameDefaults = {}
  if (defaults.left !== undefined) d.left = px(defaults.left)
  if (defaults.top !== undefined) d.top = px(defaults.top)
  if (defaults.right !== undefined) d.right = px(defaults.right)
  if (defaults.bottom !== undefined) d.bottom = px(defaults.bottom)
  return frameView(boxSpec(s, d), width, height)
}

/**
 * A round series' box from ECharts' `center` (default the middle) and
 * `radius` (the OUTER radius: a length, a percent of half the shorter side,
 * or `[inner, outer]`; default `defaultRadius`). The box is the square the
 * circle fills, which is what the family renderers draw into.
 */
export function circleRect(s: Obj, width: Double, height: Double, defaultRadius: string): Rect {
  return frameRect(roundSpec(s, defaultRadius), width, height)
}

/** The box a circular series lays out in — ECharts' view rect, which its outside labels also keep within. */
export function circleView(s: Obj, width: Double, height: Double): Rect {
  return frameView(boxSpec(s, ZERO_MARGINS), width, height)
}

/** The keys `boxRect` reads off a series. */
const BOX_KEYS = ['left', 'top', 'right', 'bottom', 'width', 'height'] as const

/**
 * Where a standalone family series goes, as a frame spec — ECharts' default
 * placement per type (a pie's 50% radius, a funnel's 80 / 60 margins, …)
 * under the series' own keys. The engine's `frameRect` resolves it at any
 * size, which is how a native host places the chart the same way.
 */
export function familyFrame(s: Obj): FrameSpec {
  const type = s['type']
  if (type === 'pie') return roundSpec(s, '50%')
  if (type === 'gauge' || type === 'sunburst') return roundSpec(s, '75%')
  if (type === 'chord') return roundSpec(s, '80%')
  if (type === 'funnel') return boxSpec(s, { left: px(80.0), top: px(60.0), right: px(80.0), bottom: px(60.0) })
  if (type === 'treemap') return boxSpec(s, { left: pct(10.0), top: pct(10.0), right: pct(10.0), bottom: pct(10.0) })
  if (type === 'tree') return boxSpec(s, { left: pct(12.0), top: pct(12.0), right: pct(12.0), bottom: pct(12.0) })
  if (type === 'sankey') return boxSpec(s, { left: pct(5.0), top: pct(5.0), right: pct(20.0), bottom: pct(5.0) })
  return boxSpec(s, ZERO_MARGINS)
}

/** Where a standalone family series goes. */
export function familyRect(s: Obj, width: Double, height: Double): Rect {
  return frameRect(familyFrame(s), width, height)
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
