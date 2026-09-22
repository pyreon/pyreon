// The ECharts option-compat facade.
//
// Accepts an ECharts-SHAPED option object and compiles it onto the engine:
// series → `Series[]`, axes → domains/categories/formatters, markLine →
// annotations, markPoint → markers, title/legend/tooltip → host hints. It
// exists so that "an ECharts alternative" includes the experience of WRITING
// ECharts options, and so that parity can be MEASURED: the conformance corpus
// runs real gallery-shaped options through here and counts what renders.
//
// Two rules keep it honest. Nothing is silently dropped: every unmapped key,
// series type or value shape becomes a named `OptionWarning` with a JSON-ish
// path, so a caller (or the conformance suite) can see exactly what did not
// cross. And it is DATA in, DATA out — no console, no DOM — so it runs on the
// server and in a test the same way the engine does.

import { applyBrushSelection, brushOnlySeries, brushSelection, renderBrushAreas } from './brush-area'
import type { BrushArea, BrushSeriesSelection } from './brush-area'
import { readBrush } from './option-brush'
import type { OptionBrush } from './option-brush'
import { layoutChart, renderChart } from './render'
import { appendGraphicLayer, graphicCommands, resolveDataset, svgSize } from './option-layer'
import { visualMapCommands } from './visual-map'
import { readDataZoom, windowSpec } from './option-zoom'
import type { OptionZoom } from './option-zoom'
import { readToolbox } from './option-toolbox'
import type { OptionToolbox } from './option-toolbox'
import { renderToolbox } from './toolbox'
import { toolboxTools } from './toolbox-config'
import type { ToolboxTool } from './toolbox-config'
import { renderNavigator } from './navigator'
import type { NavigatorLayout } from './navigator'
import type { ZoomWindow } from './zoom'
import { TIMELINE_HEIGHT, composeSvg, resolveTimeline, splitGrids, timelineCommands, timelineSteps } from './option-composite'
import { customCommands, customExtents } from './custom-series'
import type { LinesSeries } from './lines'
import { unitPolygons } from './svg-path'
import type { CustomRenderItem, CustomSeriesPlan } from './custom-series'
import { resolveTheme } from './theme-registry'
import type { ThemeDefinition } from './theme-registry'
import { dateFormatter, numberFormatter } from './locale'
import type { RichStyle } from './labels'
import type { Annotation, ChartSpec, PointMarker, Series, SeriesExtra } from './render'
import { smooth, step } from './curve'
import { plain } from './format'
import type { Formatter } from './format'
import { renderLegend } from './legend'
import type { LegendEntry } from './legend'
import { measureApprox, renderSvg } from './svg'
import { compileFamily, familyToSvg } from './option-family'
import type { CompiledFamily } from './option-family'
import { decimateShared, samplingRequest } from './sampling'
import type { SamplingRequest } from './sampling'
import type { ChartGradientStop, ChartPattern, DrawCmd, Domain, Double, MeasureText, Pt, Rect } from './types'
import type { SeriesGradient } from './gradient'

/** An ECharts-shaped option. Loosely typed on purpose: the facade VALIDATES. */
export type EChartsOption = Record<string, unknown>

export interface OptionWarning {
  /** Stable, greppable code — what an agent or a test branches on. */
  code:
    | 'option-key-unsupported'
    | 'series-type-unsupported'
    | 'series-data-shape'
    | 'axis-formatter-template'
    | 'axis-count-unsupported'
    | 'series-option-unsupported'
    | 'mark-shape-unsupported'
    | 'timeline-step-out-of-range'
  /** Where in the option, e.g. `series[2].type`. */
  path: string
  message: string
}

export interface CompiledOption {
  spec: ChartSpec
  /** Custom (`renderItem`) series — rendered after the chart, never part of the spec. */
  custom: CustomSeriesPlan[]
  /** Background colour from the theme, painted first by `optionToSvg`; undefined = transparent. */
  background: string | undefined
  /** Title text + sub-text, when the option carries them. */
  title: { text: string; subtext: string | undefined } | null
  /** Legend entries, or null when the option hides the legend. */
  legend: LegendEntry[] | null
  tooltip: boolean
  warnings: OptionWarning[]
  /**
   * False when a series could not be mapped at all. A chart missing one of
   * its series is a different chart, so the whole option is reported as not
   * rendering faithfully — the conformance metric counts it as a miss.
   */
  /** ECharts' series `selectedMode` (true / single / multiple): how a click pins a datum in the host. */
  selectedMode?: 'single' | 'multiple' | 'series' | undefined
  /** `dataZoom` over the category x axis: the initial window, the slider, and the gestures. */
  zoom?: OptionZoom | undefined
  /** `toolbox.feature`, host-shaped. */
  toolbox?: OptionToolbox | undefined
  /** `option.brush`, read. */
  brush?: OptionBrush | undefined
  supported: boolean
}

export interface CompileOptions {
  width?: Double
  height?: Double
  /** Which `timeline` step to render (`options[i]` merged over `baseOption`); defaults to `timeline.currentIndex`. */
  timelineIndex?: number
  /** A registered theme name (`light`, `dark`, or one from `registerTheme`) or an inline definition. */
  theme?: string | ThemeDefinition | undefined
  /** BCP 47 tag for axis-label formatting (see `registerLocale`). */
  locale?: string | undefined
}

const KNOWN_TOP = new Set([
  'aria',
  'series', 'xAxis', 'yAxis', 'title', 'legend', 'tooltip', 'color', 'grid',
  'animation', 'backgroundColor', 'textStyle', 'dataset', 'graphic', 'visualMap', 'dataZoom', 'toolbox', 'brush',
])
const KNOWN_SERIES = new Set([
  'type', 'name', 'data', 'stack', 'smooth', 'step', 'areaStyle', 'itemStyle',
  'lineStyle', 'symbolSize', 'label', 'yAxisIndex', 'xAxisIndex', 'markLine', 'markPoint', 'markArea',
  'color', 'showSymbol', 'symbol', 'emphasis', 'z', 'zlevel', 'silent',
  'symbolRepeat', 'symbolClip', 'symbolMargin', 'symbolBoundingData', 'symbolOffset', 'symbolPosition', 'symbolRotate', 'rippleEffect', 'showEffectOn',
  'renderItem', 'encode', 'dimensions', 'clip', 'datasetIndex', 'tooltipExtras',
  'coordinateSystem', 'polyline', 'effect', 'large', 'largeThreshold', 'progressive', 'progressiveThreshold', 'sampling',
  'select', 'blur', 'selectedMode',
])

/**
 * ECharts' state options as the engine's series fields: `emphasis.focus` and
 * `emphasis.itemStyle.color` (the hover state), `select.itemStyle.color` (the
 * pinned state), `blur.itemStyle.opacity` (what the others fade to). What a
 * state changes beyond its fill — a label, a symbol scale, a line width — has
 * no engine form and is named.
 */
function stateFields(s: Record<string, unknown>, path: string, warn: (code: OptionWarning['code'], path: string, message: string) => void): Partial<Series> {
  const out: Partial<Series> = {}
  const state = (key: 'emphasis' | 'select' | 'blur'): Record<string, unknown> | undefined => (isObj(s[key]) ? (s[key] as Record<string, unknown>) : undefined)
  const emphasis = state('emphasis')
  if (emphasis !== undefined) {
    const focus = emphasis['focus']
    if (focus === 'self' || focus === 'series') out.focus = focus
    // ledger: presentation.states
    else if (focus !== undefined && focus !== 'none') warn('series-option-unsupported', `${path}.emphasis.focus`, `emphasis.focus "${String(focus)}" is not supported (self, series and none are); nothing is blurred.`)
    const item = isObj(emphasis['itemStyle']) ? emphasis['itemStyle'] : {}
    if (typeof item['color'] === 'string') out.emphasisColor = item['color']
    // `scale`: true is ECharts' own 1.1; a number is the factor.
    const scale = emphasis['scale']
    if (scale === true) out.emphasisScale = 1.1
    else if (typeof scale === 'number') out.emphasisScale = Math.max(0.0, scale)
    // ledger: invalid-input
    else if (scale !== undefined && scale !== false) warn('series-option-unsupported', `${path}.emphasis.scale`, 'emphasis.scale takes true or a number; it was ignored.')
    if (emphasis['disabled'] === true) out.emphasisDisabled = true
    const eLine = isObj(emphasis['lineStyle']) ? emphasis['lineStyle'] : {}
    const eWidth = num(eLine['width'])
    if (eWidth !== null) out.emphasisWidth = Math.max(0.0, eWidth)
    const eArea = isObj(emphasis['areaStyle']) ? emphasis['areaStyle'] : {}
    const eOpacity = num(eArea['opacity'])
    if (eOpacity !== null) out.emphasisAreaOpacity = Math.max(0.0, Math.min(1.0, eOpacity))
    if (stateLabelShow(emphasis['label'], `${path}.emphasis.label`, warn)) out.emphasisLabel = true
    // `blurScope`: this engine draws ONE grid, so every scope blurs the same datums.
    const scope = emphasis['blurScope']
    if (scope !== undefined && scope !== 'coordinateSystem' && scope !== 'series' && scope !== 'global') {
      // ledger: invalid-input
      warn('series-option-unsupported', `${path}.emphasis.blurScope`, `emphasis.blurScope "${String(scope)}" is not one ECharts defines; it was ignored.`)
    }
  }
  const select = state('select')
  if (select !== undefined) {
    const item = isObj(select['itemStyle']) ? select['itemStyle'] : {}
    if (typeof item['color'] === 'string') out.selectColor = item['color']
    if (stateLabelShow(select['label'], `${path}.select.label`, warn)) out.selectLabel = true
    // ledger: presentation.states
    if (select['disabled'] === true) warn('series-option-unsupported', `${path}.select.disabled`, 'select.disabled is not supported; leave selectedMode off to stop a datum pinning.')
    // ledger: presentation.states
    for (const key of ['lineStyle', 'areaStyle']) if (select[key] !== undefined) warn('series-option-unsupported', `${path}.select.${key}`, `select.${key} has no engine form (a pinned DATUM takes select.itemStyle.color and a heavy outline, and a stroke belongs to the whole line); it was ignored.`)
  }
  const blur = state('blur')
  if (blur !== undefined) {
    const item = isObj(blur['itemStyle']) ? blur['itemStyle'] : {}
    const opacity = num(item['opacity'])
    if (opacity !== null) out.blurOpacity = Math.max(0.0, Math.min(1.0, opacity))
    const bLine = isObj(blur['lineStyle']) ? blur['lineStyle'] : {}
    const bWidth = num(bLine['width'])
    if (bWidth !== null) out.blurWidth = Math.max(0.0, bWidth)
    const bArea = isObj(blur['areaStyle']) ? blur['areaStyle'] : {}
    const bOpacity = num(bArea['opacity'])
    if (bOpacity !== null) out.blurAreaOpacity = Math.max(0.0, Math.min(1.0, bOpacity))
    // ledger: presentation.states
    if (blur['label'] !== undefined) warn('series-option-unsupported', `${path}.blur.label`, 'blur.label has no engine form (a blurred datum keeps its own label); it was ignored.')
  }
  return out
}

/** Whether a state's `label` asks to be shown; its own styling is named. */
function stateLabelShow(raw: unknown, path: string, warn: (code: OptionWarning['code'], path: string, message: string) => void): boolean {
  if (raw === undefined) return false
  if (!isObj(raw)) return raw === true
  for (const key of Object.keys(raw)) {
    if (key === 'show') continue
    // ledger: presentation.states
    warn('series-option-unsupported', `${path}.${key}`, `a state label takes the series' own label style; ${key} was ignored.`)
  }
  return raw['show'] !== false
}

/** ECharts' `selectedMode` as the host's pin mode. */
function selectedModeOf(s: Record<string, unknown>, path: string, warn: (code: OptionWarning['code'], path: string, message: string) => void): 'single' | 'multiple' | 'series' | undefined {
  const mode = s['selectedMode']
  if (mode === undefined || mode === false) return undefined
  if (mode === true || mode === 'single') return 'single'
  if (mode === 'multiple') return 'multiple'
  if (mode === 'series') return 'series'
  // ledger: presentation.states
  warn('series-option-unsupported', `${path}.selectedMode`, `selectedMode "${String(mode)}" is not supported (true, single and multiple are); clicks do not pin.`)
  return undefined
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}
const first = <T,>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v)

/** ECharts `dashArray`: a number n is dash n + gap n; [dash, gap] as given; a nested array uses its first row. */
function dashPeriod(v: unknown, fallback: Double): { dash: Double; period: Double } {
  const row = Array.isArray(v) && Array.isArray(v[0]) ? (v[0] as unknown[]) : v
  if (Array.isArray(row)) {
    const nums = row.map((x) => num(x) ?? 0)
    const dash = nums[0] ?? fallback
    const gap = nums.length > 1 ? nums.slice(1).reduce((a, b) => a + b, 0) : dash
    return { dash, period: Math.max(2.0, dash + gap) }
  }
  const n = num(v) ?? fallback
  return { dash: n, period: Math.max(2.0, n * 2.0) }
}

const DECAL_SYMBOLS = new Set(['rect', 'roundRect', 'circle', 'triangle', 'diamond', 'pin', 'arrow'])

/** Unit rings as the pattern's flat `shape` + per-ring counts. */
function flatShape(rings: Pt[][]): { shape: Pt[]; shapeRings: Double[] } {
  const shape: Pt[] = []
  const shapeRings: Double[] = []
  for (const r of rings) {
    for (const q of r) shape.push(q)
    shapeRings.push(r.length)
  }
  return { shape, shapeRings }
}

/**
 * An image as the engine's URL: a string as given, or — for the element forms
 * ECharts accepts on the web — the image's `src` or the canvas's data URL.
 */
function imageSource(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (isObj(v) && typeof v['src'] === 'string' && (v['src'] as string) !== '') return v['src'] as string
  if (isObj(v) && typeof v['toDataURL'] === 'function') return (v['toDataURL'] as () => string)()
  return undefined
}

/** ECharts' image fill (`color: { image, repeat }`) as an image pattern, or undefined. */
export function imageFill(raw: unknown, path: string, warn?: (code: OptionWarning['code'], path: string, message: string) => void): ChartPattern | undefined {
  if (!isObj(raw) || raw['image'] === undefined) return undefined
  const image = imageSource(raw['image'])
  if (image === undefined) {
    warn?.('series-option-unsupported', path + '.image', 'An image fill needs a URL, a data URI, an <img> or a <canvas>; the palette colour was used.')
    return undefined
  }
  const repeatRaw = typeof raw['repeat'] === 'string' ? (raw['repeat'] as string) : 'repeat'
  const repeat = ['repeat', 'repeat-x', 'repeat-y', 'no-repeat'].includes(repeatRaw) ? repeatRaw : 'repeat'
  if (repeat !== repeatRaw) warn?.('series-option-unsupported', path + '.repeat', 'repeat must be repeat, repeat-x, repeat-y or no-repeat; it repeats.')
  return { kind: 'image', color: '', spacing: 0.0, width: 0.0, image, repeat }
}

/**
 * An ECharts decal as the engine's tiled-symbol texture: the dash arrays give
 * the cell pitch, `symbolSize` scales the symbol within its dash, `rotation`
 * (radians, counter-clockwise) turns the whole texture. Symbols the engine
 * cannot draw (pin, arrow, a path or image) are named and drawn as rects.
 */
function decalPattern(raw: Record<string, unknown>, path: string, warn?: (code: OptionWarning['code'], path: string, message: string) => void): ChartPattern {
  const symbolRaw = typeof raw['symbol'] === 'string' ? (raw['symbol'] as string) : 'rect'
  const isPath = symbolRaw.startsWith('path://')
  const isImage = symbolRaw.startsWith('image://')
  if (!DECAL_SYMBOLS.has(symbolRaw) && !isPath && !isImage) warn?.('series-option-unsupported', path + '.symbol', 'Decal symbol "' + symbolRaw + '" has no engine shape; rects were tiled instead.')
  const x = dashPeriod(raw['dashArrayX'], 5.0)
  const y = dashPeriod(raw['dashArrayY'], 5.0)
  const size = Math.max(0.5, Math.min(x.dash, y.dash) * (num(raw['symbolSize']) ?? 1.0))
  const rotation = num(raw['rotation']) ?? 0.0
  if (isImage) {
    if (rotation !== 0.0) warn?.('series-option-unsupported', path + '.rotation', 'An image decal is drawn upright; rotation was ignored.')
    return { kind: 'image', color: '', spacing: x.period, width: size, spacingY: y.period, image: symbolRaw.slice('image://'.length), repeat: 'grid' }
  }
  return {
    kind: 'symbols',
    color: typeof raw['color'] === 'string' ? (raw['color'] as string) : 'rgba(0, 0, 0, 0.2)',
    spacing: x.period,
    width: size,
    angle: -rotation * (180.0 / Math.PI),
    symbol: isPath ? 'path' : symbolRaw === 'roundRect' ? 'rect' : DECAL_SYMBOLS.has(symbolRaw) ? symbolRaw : 'rect',
    spacingY: y.period,
    ...(isPath ? flatShape(unitPolygons(symbolRaw.slice('path://'.length))) : {}),
  }
}

export function fillPattern(style: Record<string, unknown>, path = 'itemStyle.decal', warn?: (code: OptionWarning['code'], path: string, message: string) => void): ChartPattern | undefined {
  const raw = isObj(style['decal']) ? style['decal'] : undefined
  if (raw === undefined || raw['show'] === false) return undefined
  return decalPattern(raw, path, warn)
}

/**
 * The textures `aria.decal.show` hands series that have no decal of their own —
 * distinct at a glance (angle, symbol, pitch) so series stay tellable apart
 * without colour. Pyreon's set, not a pixel copy of ECharts' default list.
 */
export const DEFAULT_DECALS: readonly ChartPattern[] = [
  { kind: 'diagonal', color: 'rgba(0, 0, 0, 0.22)', spacing: 6.0, width: 1.5 },
  { kind: 'symbols', color: 'rgba(0, 0, 0, 0.22)', spacing: 7.0, width: 2.5, symbol: 'circle', spacingY: 7.0 },
  { kind: 'diagonal', color: 'rgba(0, 0, 0, 0.22)', spacing: 6.0, width: 1.5, angle: -45.0 },
  { kind: 'symbols', color: 'rgba(0, 0, 0, 0.22)', spacing: 9.0, width: 5.0, symbol: 'triangle', spacingY: 8.0 },
  { kind: 'cross', color: 'rgba(0, 0, 0, 0.18)', spacing: 7.0, width: 1.0 },
  { kind: 'symbols', color: 'rgba(0, 0, 0, 0.22)', spacing: 8.0, width: 4.0, symbol: 'diamond', spacingY: 8.0 },
]

/** `symbol` + `symbolRepeat` for a pictorialBar series; a path/image symbol falls back to a rect with a warning. */
/**
 * ECharts' `symbol` / `showSymbol` on line and scatter series. A scatter
 * datum is a circle unless named otherwise; a line draws its datum symbols
 * only when `showSymbol` is true (ECharts' default there is a hover-only
 * `emptyCircle`, which this engine states as "no symbols"). `roundRect` is a
 * rect, `emptyCircle` a circle; `pin`, `arrow`, `none` and paths warn by name.
 */
function seriesSymbol(s: Record<string, unknown>, kind: 'line' | 'points', warn: (code: OptionWarning['code'], path: string, message: string) => void, path: string): { symbol?: Series['symbol'] } {
  if (kind === 'line' && s['showSymbol'] !== true) return {}
  const raw = typeof s['symbol'] === 'string' ? (s['symbol'] as string) : kind === 'line' ? 'circle' : ''
  if (raw === '') return {}
  const symbol: Series['symbol'] | undefined =
    raw === 'circle' || raw === 'emptyCircle' ? 'circle' : raw === 'rect' || raw === 'roundRect' ? 'rect' : raw === 'diamond' ? 'diamond' : raw === 'triangle' ? 'triangle' : undefined
  if (symbol === undefined) {
    // ledger: presentation.symbols
    warn('mark-shape-unsupported', `${path}.symbol`, `symbol "${raw}" is not supported (circle, emptyCircle, rect, roundRect, diamond, triangle are); drawn as a circle.`)
    return kind === 'line' ? { symbol: 'circle' } : {}
  }
  return kind === 'points' && symbol === 'circle' ? {} : { symbol }
}

/**
 * An ECharts gradient colour (`{ type: 'linear', x, y, x2, y2, colorStops }`)
 * as the engine's series gradient. The ramp direction is the dominant axis
 * of the (x, y) → (x2, y2) vector: horizontal when it runs along x, else
 * vertical (the engine draws exactly those two). A radial gradient keeps its
 * stops and ramps out from the plot's centre.
 */
function readGradient(raw: unknown, path: string, warn: (code: OptionWarning['code'], path: string, message: string) => void): SeriesGradient | undefined {
  if (!isObj(raw)) return undefined
  if (!Array.isArray(raw['colorStops'])) {
    // ECharts' other colour object: an IMAGE pattern. It has no engine form
    // (the engine's patterns are the geometric decals), so it is named rather
    // than silently painting the palette colour.
    // ECharts' other colour object — an IMAGE pattern — is read by `imageFill`.
    // ledger: presentation.gradients-patterns
    if (raw['image'] !== undefined && path.endsWith('lineStyle.color')) warn('series-option-unsupported', path, 'A line stroke cannot be an image pattern (fills can); the palette colour was used.')
    return undefined
  }
  const stops: ChartGradientStop[] = []
  for (const st of raw['colorStops'] as unknown[]) {
    if (isObj(st) && num(st['offset']) !== null && typeof st['color'] === 'string') stops.push({ offset: num(st['offset']) as number, color: st['color'] as string })
  }
  if (stops.length === 0) return undefined
  if (raw['type'] === 'radial') return { stops, shape: 'radial' }
  const dx = (num(raw['x2']) ?? 0.0) - (num(raw['x']) ?? 0.0)
  const dy = (num(raw['y2']) ?? 1.0) - (num(raw['y']) ?? 0.0)
  // A ramp read "backwards" (bottom → top, right → left) reverses its stops
  // so the colour at offset 0 still sits where the author put it.
  const horizontal = Math.abs(dx) > Math.abs(dy)
  const ordered = (horizontal ? dx < 0 : dy < 0) ? stops.map((st) => ({ offset: 1.0 - st.offset, color: st.color })).reverse() : stops
  return { stops: ordered, ...(horizontal ? { direction: 'horizontal' } : {}) }
}

function pictorialFields(s: Record<string, unknown>, warn: (code: OptionWarning['code'], path: string, message: string) => void, path: string): Partial<Series> & { symbol: Series['symbol']; symbolRepeat: boolean } {
  const raw = typeof s['symbol'] === 'string' ? (s['symbol'] as string) : 'rect'
  let symbol: Series['symbol'] = 'rect'
  if (raw === 'circle') symbol = 'circle'
  else if (raw === 'diamond') symbol = 'diamond'
  else if (raw === 'triangle') symbol = 'triangle'
  // ledger: series.pictorial-bar
  else if (raw !== 'rect' && raw !== 'roundRect') warn('mark-shape-unsupported', `${path}.symbol`, `pictorialBar symbol "${raw}" is not supported (rect, roundRect, circle, diamond, triangle are); drawn as a rect.`)
  const rep = s['symbolRepeat']
  const out: Partial<Series> & { symbol: Series['symbol']; symbolRepeat: boolean } = { symbol, symbolRepeat: rep === true || rep === 'fixed' || (typeof rep === 'number' && rep > 0) }
  // The six geometry keys, in px / degrees. ECharts also takes percent
  // strings for margin and offset; those have no engine form and are named.
  const px = (key: string): Double | undefined => {
    const v = s[key]
    if (v === undefined) return undefined
    const n = num(v)
    if (n !== null) return n
    // ledger: series.pictorial-bar
    warn('series-option-unsupported', `${path}.${key}`, `pictorialBar ${key} takes a number of pixels here (a percent string is not supported); it was ignored.`)
    return undefined
  }
  const margin = px('symbolMargin')
  if (margin !== undefined) out.symbolMargin = Math.max(0.0, margin)
  const rotate = px('symbolRotate')
  if (rotate !== undefined) out.symbolRotate = rotate
  const bounding = px('symbolBoundingData')
  if (bounding !== undefined) out.symbolBoundingData = bounding
  if (s['symbolClip'] !== undefined) out.symbolClip = s['symbolClip'] === true
  const position = s['symbolPosition']
  if (position === 'start' || position === 'end' || position === 'center') out.symbolPosition = position
  // ledger: invalid-input
  else if (position !== undefined) warn('series-option-unsupported', `${path}.symbolPosition`, `symbolPosition "${String(position)}" is not supported (start, end and center are); it was ignored.`)
  const offset = s['symbolOffset']
  if (offset !== undefined) {
    if (Array.isArray(offset) && offset.length === 2 && num(offset[0]) !== null && num(offset[1]) !== null) out.symbolOffset = [num(offset[0]) as number, num(offset[1]) as number]
    // ledger: series.pictorial-bar
    else warn('series-option-unsupported', `${path}.symbolOffset`, 'symbolOffset takes [dx, dy] in pixels here (a percent string is not supported); it was ignored.')
  }
  return out
}


/**
 * A series' `label` as the engine's label fields.
 *
 * The `{a}` / `{b}` / `{c}` / `{d}` template is resolved HERE, per datum,
 * because this is the only layer that knows the series name, the category and
 * the share of the total. A FUNCTION formatter is called with ECharts'
 * callback params. Rich styles pass through to the engine, which owns the
 * `{name|text}` segmentation and the line breaks.
 */
export function labelFields(
  label: Record<string, unknown>,
  seriesName: string,
  categories: string[],
  values: Double[],
  path: string,
  warn: (code: OptionWarning['code'], path: string, message: string) => void,
  fmt: Formatter,
): Partial<Series> {
  const out: Partial<Series> = {}
  if (typeof label['color'] === 'string') out.labelColor = label['color'] as string
  const size = num(label['fontSize'])
  if (size !== null) out.labelSize = size
  const rich = isObj(label['rich']) ? (label['rich'] as Record<string, unknown>) : undefined
  if (rich !== undefined) {
    const styles: RichStyle[] = []
    for (const name of Object.keys(rich)) {
      const spec = isObj(rich[name]) ? (rich[name] as Record<string, unknown>) : {}
      styles.push({
        name,
        color: typeof spec['color'] === 'string' ? (spec['color'] as string) : '',
        fontSize: num(spec['fontSize']) ?? 0.0,
      })
      for (const key of Object.keys(spec)) {
        // ledger: presentation.labels-rich-text
        if (key !== 'color' && key !== 'fontSize') warn('series-option-unsupported', `${path}.rich.${name}.${key}`, `label.rich ${key} has no engine form (a rich segment takes a colour and a size); it was ignored.`)
      }
    }
    if (styles.length > 0) out.labelRich = styles
  }
  const formatter = label['formatter']
  if (formatter === undefined) return out
  let total = 0.0
  for (const v of values) if (Number.isFinite(v)) total = total + Math.abs(v)
  const texts: string[] = []
  if (typeof formatter === 'function') {
    const fn = formatter as (params: { seriesName: string; name: string; value: Double; dataIndex: number; percent: Double }) => unknown
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!
      texts.push(String(fn({ seriesName, name: categories[i] ?? String(i), value: v, dataIndex: i, percent: total > 0.0 ? (Math.abs(v) / total) * 100.0 : 0.0 })))
    }
    out.labelTexts = texts
    return out
  }
  if (typeof formatter !== 'string') {
    // ledger: invalid-input
    warn('series-option-unsupported', `${path}.formatter`, 'label.formatter takes a template string or a function; it was ignored.')
    return out
  }
  const tpl = formatter as string
  // ECharts' label placeholders. `{d}` is a percentage of the series total,
  // which is what it means for a pie and the closest honest reading here.
  for (const key of ['{a1}', '{b1}', '{c1}', '{e}', '{f}', '{g}']) {
    // ledger: presentation.labels-rich-text
    if (tpl.includes(key)) warn('series-option-unsupported', `${path}.formatter`, `label.formatter placeholder "${key}" is not supported ({a}, {b}, {c} and {d} are); it was left as written.`)
  }
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    const percent = total > 0.0 ? (Math.abs(v) / total) * 100.0 : 0.0
    texts.push(
      tpl
        .split('{a}').join(seriesName)
        .split('{b}').join(categories[i] ?? String(i))
        .split('{c}').join(fmt(v))
        .split('{d}').join(fmt(Math.round(percent * 10.0) / 10.0)),
    )
  }
  out.labelTexts = texts
  return out
}

/** The internal renderItem for a `lines` series: a polyline through every [x, y] pair of the flattened datum. */

/** Compile an ECharts-shaped option onto the engine. Pure. */
export function compileOption(rawOption: EChartsOption, opts: CompileOptions = {}): CompiledOption {
  const warnings: OptionWarning[] = []
  const warn = (code: OptionWarning['code'], path: string, message: string): void => {
    warnings.push({ code, path, message })
  }
  let supported = true
  // The dataset pre-pass materialises series data before anything reads it.
  const resolved = resolveDataset(rawOption)
  for (const w of resolved.warnings) warnings.push(w)
  const option = resolved.option as EChartsOption

  for (const key of Object.keys(option)) {
    if (!KNOWN_TOP.has(key)) {
      // ledger: data.key-totality
      warn('option-key-unsupported', key, `"${key}" has no mapping yet; it was ignored.`)
    }
  }

  // ---- axes -----------------------------------------------------------
  const xAxisRaw = option['xAxis']
  // A second x axis maps when it labels the SAME categories count (a second
  // naming of the same bands); a value axis or a different count is named.
  const xAxisList: unknown[] = Array.isArray(xAxisRaw) ? (xAxisRaw as unknown[]) : []
  const x2Axis = xAxisList.length > 1 && isObj(xAxisList[1]) ? (xAxisList[1] as Record<string, unknown>) : undefined
  const x2Data = x2Axis !== undefined && Array.isArray(x2Axis['data']) ? (x2Axis['data'] as unknown[]).map((c) => (isObj(c) ? String(c['value'] ?? '') : String(c))) : []
  const x0Count = Array.isArray(xAxisList[0] as unknown) ? 0 : isObj(xAxisList[0]) && Array.isArray((xAxisList[0] as Record<string, unknown>)['data']) ? ((xAxisList[0] as Record<string, unknown>)['data'] as unknown[]).length : 0
  const x2Type = x2Axis !== undefined && typeof x2Axis['type'] === 'string' ? (x2Axis['type'] as string) : ''
  const x2Continuous = x2Axis !== undefined && (x2Type === 'value' || x2Type === 'time')
  const x2Mapped = x2Continuous || (x2Axis !== undefined && x2Data.length > 0 && x2Data.length === x0Count)
  if (xAxisList.length > 2 || (xAxisList.length === 2 && !x2Mapped)) {
    // ledger: coordinates.axes
    warn('axis-count-unsupported', 'xAxis', 'A second x axis maps as a value axis, or as a second set of category labels with the same count; other x axes were ignored.')
  }
  const xAxis = first(xAxisRaw as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const xType = isObj(xAxis) && typeof xAxis['type'] === 'string' ? (xAxis['type'] as string) : undefined
  const categories: string[] = []
  if (isObj(xAxis) && Array.isArray(xAxis['data'])) {
    for (const c of xAxis['data'] as unknown[]) categories.push(isObj(c) ? String(c['value'] ?? '') : String(c))
  }
  const xTime = xType === 'time'
  const xContinuous = xType === 'value' || xTime
  const xFormat = axisFormatter(xAxis, 'xAxis', warn)

  const yAxisRaw = option['yAxis']
  const yAxesDeclared: Record<string, unknown>[] = Array.isArray(yAxisRaw)
    ? (yAxisRaw as unknown[]).filter(isObj)
    : isObj(yAxisRaw)
      ? [yAxisRaw]
      : []
  // Two axes whose first is placed on the right swap sides: the engine's left
  // axis is the one ECharts put on the left, and yAxisIndex follows the swap.
  const swapY = yAxesDeclared.length >= 2 && yAxesDeclared[0]!['position'] === 'right' && yAxesDeclared[1]!['position'] !== 'right'
  const yAxes: Record<string, unknown>[] = swapY ? [yAxesDeclared[1]!, yAxesDeclared[0]!, ...yAxesDeclared.slice(2)] : yAxesDeclared
  for (let ai = 0; ai < Math.min(2, yAxesDeclared.length); ai++) {
    const pos = yAxesDeclared[ai]!['position']
    const natural = ai === 0 ? 'left' : 'right'
    const honoured = pos === undefined || pos === natural || swapY || (ai === 0 && yAxesDeclared.length === 1 && pos === 'right')
    // ledger: coordinates.axes
    if (!honoured) warn('option-key-unsupported', Array.isArray(yAxisRaw) ? `yAxis[${ai}].position` : 'yAxis.position', 'Both y axes cannot share a side; the axis keeps its default side.')
  }
  const yDomain = axisDomain(yAxes[0])
  const y2Domain = axisDomain(yAxes[1])
  const yFormat = axisFormatter(yAxes[0], 'yAxis[0]', warn)
  const y2Format = axisFormatter(yAxes[1], 'yAxis[1]', warn)
  // Per-axis keys: name, show and the grid switch map; anything else is named
  // rather than silently dropped.
  if (isObj(xAxis)) axisKeys(xAxis, 'xAxis', warn)
  for (let ai = 0; ai < yAxes.length; ai++) axisKeys(yAxes[ai]!, Array.isArray(yAxisRaw) ? `yAxis[${ai}]` : 'yAxis', warn)
  const axisName = (axis: Record<string, unknown> | undefined): string | undefined => (isObj(axis) && typeof axis['name'] === 'string' ? (axis['name'] as string) : undefined)
  const shown = (axis: Record<string, unknown> | undefined): boolean => !(isObj(axis) && axis['show'] === false)
  const gridShown = !(isObj(yAxes[0]) && isObj(yAxes[0]['splitLine']) && yAxes[0]['splitLine']['show'] === false)

  // ---- palette --------------------------------------------------------
  const themed = resolveTheme(opts.theme, warnings)
  const optionPalette: string[] = Array.isArray(option['color'])
    ? (option['color'] as unknown[]).filter((c): c is string => typeof c === 'string')
    : []
  const palette: readonly string[] = optionPalette.length > 0 ? optionPalette : themed.palette ?? []
  const localeNumber = opts.locale !== undefined ? numberFormatter(opts.locale) : undefined
  const localeDate = opts.locale !== undefined ? dateFormatter(opts.locale) : undefined

  // ---- series ---------------------------------------------------------
  const rawSeries = Array.isArray(option['series'])
    ? (option['series'] as unknown[])
    : isObj(option['series'])
      ? [option['series']]
      : []
  // `aria.decal.show`: every series without its own decal gets a distinct default texture.
  const ariaDecals = isObj(option['aria']) && isObj(option['aria']['decal']) && option['aria']['decal']['show'] === true
  const series: Series[] = []
  const customPlans: CustomSeriesPlan[] = []
  const linesList: LinesSeries[] = []
  const annotations: Annotation[] = []
  const markers: PointMarker[] = []
  let xValues: Double[] | undefined = undefined
  // Large-data requests per compiled cartesian series (see the sampling pass).
  const sampleRequests: SamplingRequest[] = []
  // The first series' `selectedMode` decides how the host pins a click.
  let selectedMode: 'single' | 'multiple' | 'series' | undefined = undefined
  // Running totals per `stack` name for stacked LINES.
  const lineStacks = new Map<string, Double[]>()
  const barCount = rawSeries.filter((s) => isObj(s) && s['type'] === 'bar' && s['stack'] === undefined).length

  for (let i = 0; i < rawSeries.length; i++) {
    const s = rawSeries[i]
    const path = `series[${i}]`
    if (!isObj(s)) {
      warn('series-data-shape', path, 'A series must be an object.')
      supported = false
      continue
    }
    for (const key of Object.keys(s)) {
      // ledger: data.key-totality
      if (!KNOWN_SERIES.has(key)) warn('series-option-unsupported', `${path}.${key}`, `"${key}" has no mapping yet; it was ignored.`)
    }
    const type = typeof s['type'] === 'string' ? (s['type'] as string) : ''
    if (type === 'lines') {
      const lineStyle = isObj(s['lineStyle']) ? s['lineStyle'] : {}
      const seriesColor = typeof lineStyle['color'] === 'string' ? (lineStyle['color'] as string) : palette[i % Math.max(1, palette.length)] ?? defaultPalette[i % defaultPalette.length]!
      const seriesWidth = num(lineStyle['width']) ?? 1.5
      const rows = Array.isArray(s['data']) ? (s['data'] as unknown[]) : []
      const coords: Double[][] = []
      const colors: string[] = []
      const widths: Double[] = []
      for (let j = 0; j < rows.length; j++) {
        const d = rows[j]
        const raw = Array.isArray(d) ? d : isObj(d) && Array.isArray(d['coords']) ? (d['coords'] as unknown[]) : null
        const pairs = raw === null ? [] : raw.filter((c): c is unknown[] => Array.isArray(c) && c.length >= 2)
        if (raw === null || pairs.length < 2) {
          warn('series-data-shape', `${path}.data[${j}]`, 'A lines datum needs coords with at least two [x, y] pairs; it was skipped.')
          continue
        }
        const row: Double[] = []
        for (const c of pairs) {
          row.push(num(c[0]) ?? 0)
          row.push(num(c[1]) ?? 0)
        }
        coords.push(row)
        const ls = isObj(d) && isObj(d['lineStyle']) ? d['lineStyle'] : {}
        colors.push(typeof ls['color'] === 'string' ? (ls['color'] as string) : seriesColor)
        widths.push(num(ls['width']) ?? seriesWidth)
      }
      const effect = isObj(s['effect']) ? s['effect'] : {}
      for (const key of Object.keys(effect)) {
        // ledger: series.lines
        if (!['show', 'period', 'trailLength', 'color', 'symbolSize', 'symbol', 'loop'].includes(key)) warn('series-option-unsupported', `${path}.effect.${key}`, `"${key}" has no trail mapping yet; it was ignored.`)
      }
      // ledger: series.lines
      if (typeof effect['symbol'] === 'string' && effect['symbol'] !== 'circle') warn('series-option-unsupported', `${path}.effect.symbol`, 'The trail head is drawn as a circle.')
      linesList.push({
        coords,
        colors,
        widths,
        effect: effect['show'] === true,
        period: num(effect['period']) ?? 4.0,
        trailLength: num(effect['trailLength']) ?? 0.2,
        effectColor: typeof effect['color'] === 'string' ? (effect['color'] as string) : '',
        symbolSize: num(effect['symbolSize']) ?? 3.0,
      })
      continue
    }
    if (type === 'custom') {
      const ri = s['renderItem']
      if (typeof ri !== 'function') {
        warn('series-data-shape', path + '.renderItem', 'A custom series needs a renderItem function; the series was skipped.')
        continue
      }
      const enc = isObj(s['encode']) ? s['encode'] : {}
      const yRaw = enc['y']
      const yDims = (Array.isArray(yRaw) ? yRaw : yRaw === undefined ? [1] : [yRaw]).map((d) => num(d) ?? 1)
      const xRaw = Array.isArray(enc['x']) ? enc['x'][0] : enc['x']
      const item = isObj(s['itemStyle']) ? s['itemStyle'] : {}
      customPlans.push({
        name: typeof s['name'] === 'string' ? (s['name'] as string) : 'Series ' + String(i + 1),
        color: typeof item['color'] === 'string' ? (item['color'] as string) : palette[i % Math.max(1, palette.length)] ?? defaultPalette[i % defaultPalette.length]!,
        data: Array.isArray(s['data']) ? (s['data'] as unknown[]) : [],
        renderItem: ri as CustomRenderItem,
        yDims,
        xDim: num(xRaw) ?? 0,
      })
      continue
    }
    let kind: Series['kind']
    if (type === 'bar') kind = s['stack'] !== undefined ? 'stacked' : barCount > 1 ? 'grouped' : 'bars'
    else if (type === 'line') kind = isObj(s['areaStyle']) || s['areaStyle'] === true ? (s['stack'] !== undefined ? 'stackedArea' : 'area') : 'line'
    else if (type === 'scatter' || type === 'effectScatter') kind = 'points'
    else if (type === 'pictorialBar') kind = s['stack'] !== undefined ? 'stacked' : barCount > 1 ? 'grouped' : 'bars'
    else {
      // ledger: invalid-input
      warn('series-type-unsupported', `${path}.type`, `Series type "${type}" is not mapped by this facade yet (cartesian family only).`)
      supported = false
      continue
    }

    // Data: number[] | {value}[] | [x, y][] (pairs feed a continuous x).
    const values: Double[] = []
    const xs: Double[] = []
    const data = Array.isArray(s['data']) ? (s['data'] as unknown[]) : []
    if (!Array.isArray(s['data'])) warn('series-data-shape', `${path}.data`, 'Series data must be an array; treated as empty.')
    for (let j = 0; j < data.length; j++) {
      const d = data[j]
      if (Array.isArray(d) && d.length >= 2) {
        const x = num(d[0])
        const y = num(d[1])
        if (x === null || y === null) {
          warn('series-data-shape', `${path}.data[${j}]`, 'A [x, y] pair must be numeric; the point was zeroed.')
          xs.push(j)
          values.push(0.0)
        } else {
          xs.push(x)
          values.push(y)
        }
      } else if (d === null || d === undefined || d === '-') {
        // ECharts' empty datum: a GAP in the line, not a zero and not an error.
        values.push(NaN)
      } else if (isObj(d)) {
        const v = d['value'] === null || d['value'] === '-' ? NaN : num(d['value'])
        if (v === null) warn('series-data-shape', `${path}.data[${j}].value`, 'Non-numeric value; the point was zeroed.')
        values.push(v ?? 0.0)
      } else {
        const v = num(d)
        if (v === null) warn('series-data-shape', `${path}.data[${j}]`, 'Non-numeric datum; the point was zeroed.')
        values.push(v ?? 0.0)
      }
    }
    const onX2 = x2Continuous && num(s['xAxisIndex']) === 1 && xs.length === values.length && xs.length > 0
    if (!onX2 && xContinuous && xs.length === values.length && xs.length > 0 && xValues === undefined) xValues = xs
    // ledger: data.progressive-large
    const request = samplingRequest(s, opts.width ?? 640.0, (message) => warn('series-option-unsupported', `${path}.sampling`, message))
    if (request !== null) sampleRequests.push(request)
    // Stacked LINES: each line sits on the running total of the lines that
    // share its `stack` name (ECharts' stacked line chart). The total is
    // carried across a gap so a missing datum does not drop the lines above
    // it to zero; the gap itself stays a gap. Stacked AREAS are the engine's
    // own `stackedArea` kind (fills between levels), so their values stay raw.
    if (type === 'line' && kind === 'line' && s['stack'] !== undefined) {
      const key = String(s['stack'])
      const below = lineStacks.get(key)
      const total: Double[] = []
      for (let j = 0; j < values.length; j++) {
        const under = below?.[j] ?? 0.0
        const v = values[j]!
        if (!Number.isNaN(v)) values[j] = v + under
        total.push(Number.isNaN(v) ? under : v + under)
      }
      lineStacks.set(key, total)
    }

    const itemStyle = isObj(s['itemStyle']) ? s['itemStyle'] : {}
    const lineStyle = isObj(s['lineStyle']) ? s['lineStyle'] : {}
    const areaStyle = isObj(s['areaStyle']) ? s['areaStyle'] : {}
    // ECharts' gradient objects on any colour slot: the ramp becomes the
    // series gradient, its first stop the solid colour everything else reads.
    const gradient = readGradient(itemStyle['color'], `${path}.itemStyle.color`, warn) ?? readGradient(areaStyle['color'], `${path}.areaStyle.color`, warn) ?? readGradient(lineStyle['color'], `${path}.lineStyle.color`, warn) ?? readGradient(s['color'], `${path}.color`, warn)
    const color =
      typeof itemStyle['color'] === 'string'
        ? (itemStyle['color'] as string)
        : typeof lineStyle['color'] === 'string'
          ? (lineStyle['color'] as string)
          : typeof s['color'] === 'string'
            ? (s['color'] as string)
            : gradient !== undefined && gradient.stops.length > 0
              ? gradient.stops[0]!.color
              : palette[series.length % Math.max(1, palette.length)] ?? defaultPalette[series.length % defaultPalette.length]!
    const label = isObj(s['label']) ? s['label'] : {}
    const yAxisIndex = num(s['yAxisIndex']) ?? 0
    const extraAxis = yAxisIndex >= 2 && yAxisIndex < yAxes.length
    // ledger: invalid-input
    if (yAxisIndex >= yAxes.length && yAxisIndex > 1) warn('axis-count-unsupported', `${path}.yAxisIndex`, `yAxisIndex ${yAxisIndex} names no declared y axis; the series uses the left axis.`)

    const entry: Series = {
      kind,
      values,
      color,
      width: num(lineStyle['width']) ?? 2.0,
      radius: num(s['symbolSize']) !== null ? (num(s['symbolSize']) as number) / 2.0 : 3.0,
      label: typeof s['name'] === 'string' ? (s['name'] as string) : `Series ${i + 1}`,
      curve: s['smooth'] === true || (num(s['smooth']) ?? 0) > 0 ? smooth : s['step'] !== undefined && s['step'] !== false ? step : undefined,
      showValues: label['show'] === true,
      radii: undefined,
      axis: !extraAxis && (yAxisIndex === 1) !== swapY ? 'right' : undefined,
      ...(extraAxis ? { axisExtra: yAxisIndex - 2 } : {}),
      ...(onX2 ? { onX2: true, xs } : {}),
      pattern: imageFill(itemStyle['color'], `${path}.itemStyle.color`, warn) ?? imageFill(areaStyle['color'], `${path}.areaStyle.color`, warn) ?? imageFill(s['color'], `${path}.color`, warn) ?? fillPattern(itemStyle, `${path}.itemStyle.decal`, warn) ?? (ariaDecals ? DEFAULT_DECALS[series.length % DEFAULT_DECALS.length] : undefined),
      ...(type === 'effectScatter' ? { effect: true } : {}),
      ...(type === 'pictorialBar' ? pictorialFields(s, warn, path) : {}),
      ...(kind === 'line' || kind === 'points' ? seriesSymbol(s, kind, warn, path) : {}),
      ...(gradient !== undefined && gradient.stops.length > 0 ? { gradient } : {}),
      ...(Array.isArray(s['tooltipExtras']) ? { extras: s['tooltipExtras'] as SeriesExtra[] } : {}),
      ...stateFields(s, path, warn),
      ...labelFields(label, typeof s['name'] === 'string' ? (s['name'] as string) : `Series ${i + 1}`, categories, values, `${path}.label`, warn, localeNumber ?? plain),
    }
    series.push(entry)
    const pinMode = selectedModeOf(s, path, warn)
    if (pinMode !== undefined && selectedMode === undefined) selectedMode = pinMode
    const seriesIndex = series.length - 1

    // markLine / markArea → annotations; markPoint → markers.
    // Datum x in annotation units: the continuous x when the series has one,
    // else the datum index (the engine's categorical contract).
    const xOfIndex = (j: number): number => (xs.length === values.length && xs.length > 0 ? xs[j]! : j)
    const nearestIndex = (target: number): number => {
      let best = 0
      for (let j = 1; j < values.length; j++) if (Math.abs(values[j]! - target) < Math.abs(values[best]! - target)) best = j
      return best
    }
    const argIndex = (which: string): number => {
      if (values.length === 0) return -1
      if (which === 'max' || which === 'min') {
        let best = 0
        for (let j = 1; j < values.length; j++) if (which === 'max' ? values[j]! > values[best]! : values[j]! < values[best]!) best = j
        return best
      }
      if (which === 'average') return nearestIndex(values.reduce((a, b) => a + b, 0.0) / values.length)
      return -1
    }
    const statOf = (which: string): number | null => {
      if (values.length === 0) return null
      if (which === 'average') return values.reduce((a, b) => a + b, 0.0) / values.length
      if (which === 'max') return Math.max(...values)
      if (which === 'min') return Math.min(...values)
      if (which === 'median') {
        const sorted = [...values].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
      }
      return null
    }
    // A category NAME in a `coord` resolves to its index; a number on a
    // continuous x resolves to the nearest datum's x (so the mark sits where
    // that datum was drawn), else it is the index itself.
    const xOfCoord = (raw: unknown): number | null => {
      if (typeof raw === 'string') {
        const at = categories.indexOf(raw)
        return at >= 0 ? at : null
      }
      return num(raw)
    }
    // One markLine endpoint: a datum picked by statistic, a `coord`, or an axis pair.
    const endpoint = (e: Record<string, unknown>): { x: number; y: number } | null => {
      if (typeof e['type'] === 'string') {
        const at = argIndex(e['type'] as string)
        return at < 0 ? null : { x: xOfIndex(at), y: values[at]! }
      }
      if (Array.isArray(e['coord'])) {
        const cx = xOfCoord((e['coord'] as unknown[])[0])
        const cy = num((e['coord'] as unknown[])[1])
        return cx !== null && cy !== null ? { x: cx, y: cy } : null
      }
      const ex = num(e['xAxis'])
      const ey = num(e['yAxis'])
      return ex !== null && ey !== null ? { x: ex, y: ey } : null
    }
    const styleColor = (o: Record<string, unknown> | undefined, key: string, fallback: string | undefined): string | undefined => {
      const st = o !== undefined && isObj(o[key]) ? o[key] : undefined
      return st !== undefined && typeof st['color'] === 'string' ? (st['color'] as string) : fallback
    }
    const markLine = isObj(s['markLine']) ? s['markLine'] : undefined
    const ml = markLine !== undefined && Array.isArray(markLine['data']) ? (markLine['data'] as unknown[]) : []
    const mlColor = styleColor(markLine, 'lineStyle', color)
    for (let k = 0; k < ml.length; k++) {
      const m = ml[k]
      if (Array.isArray(m)) {
        // Point-to-point: `[{ from }, { to }]` — a segment between two data-space points.
        const from = isObj(m[0]) ? endpoint(m[0]) : null
        const to = isObj(m[1]) ? endpoint(m[1]) : null
        if (from === null || to === null) {
          // ledger: invalid-input
          warn('mark-shape-unsupported', `${path}.markLine.data[${k}]`, 'A point-to-point markLine needs two endpoints, each a type (max/min/average), a coord, or an xAxis + yAxis pair; it was skipped.')
          continue
        }
        const head = m[0] as Record<string, unknown>
        annotations.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, label: typeof head['name'] === 'string' ? (head['name'] as string) : undefined, color: styleColor(head, 'lineStyle', mlColor) })
        continue
      }
      if (!isObj(m)) continue
      const name = typeof m['name'] === 'string' ? (m['name'] as string) : undefined
      const lineColor = styleColor(m, 'lineStyle', mlColor)
      const stat = typeof m['type'] === 'string' ? statOf(m['type'] as string) : null
      if (stat !== null) {
        annotations.push({ y: stat, label: name ?? String(m['type']), color: lineColor })
      } else if (num(m['yAxis']) !== null) {
        annotations.push({ y: num(m['yAxis']) as number, label: name, color: lineColor })
      } else if (num(m['xAxis']) !== null) {
        annotations.push({ x: num(m['xAxis']) as number, label: name, color: lineColor })
      } else {
        // ledger: coordinates.mark-line
        warn('mark-shape-unsupported', `${path}.markLine.data[${k}]`, 'Only average/max/min/median, yAxis, xAxis, and point-to-point markLines are mapped.')
      }
    }
    const markArea = isObj(s['markArea']) ? s['markArea'] : undefined
    const ma = markArea !== undefined && Array.isArray(markArea['data']) ? (markArea['data'] as unknown[]) : []
    const maColor = styleColor(markArea, 'itemStyle', color)
    for (let k = 0; k < ma.length; k++) {
      const pair = ma[k]
      if (!Array.isArray(pair) || pair.length < 2 || !isObj(pair[0]) || !isObj(pair[1])) {
        // ledger: invalid-input
        warn('mark-shape-unsupported', `${path}.markArea.data[${k}]`, 'A mark area needs two boundary objects; it was skipped.')
        continue
      }
      const name = typeof pair[0]['name'] === 'string' ? (pair[0]['name'] as string) : undefined
      const yFrom = num(pair[0]['yAxis'])
      const yTo = num(pair[1]['yAxis'])
      const xFrom = num(pair[0]['xAxis'])
      const xTo = num(pair[1]['xAxis'])
      if (yFrom !== null && yTo !== null) annotations.push({ yFrom, yTo, label: name, color: maColor })
      else if (xFrom !== null && xTo !== null) annotations.push({ xFrom, xTo, label: name, color: maColor })
      // ledger: coordinates.mark-area
      else warn('mark-shape-unsupported', `${path}.markArea.data[${k}]`, 'A mark area needs matching numeric xAxis or yAxis boundaries; it was skipped.')
    }
    const markPoint = isObj(s['markPoint']) ? s['markPoint'] : undefined
    const mp = markPoint !== undefined && Array.isArray(markPoint['data']) ? (markPoint['data'] as unknown[]) : []
    const mpColor = styleColor(markPoint, 'itemStyle', undefined)
    const mpSize = markPoint !== undefined ? num(markPoint['symbolSize']) : null
    for (let k = 0; k < mp.length; k++) {
      const m = mp[k]
      if (!isObj(m)) continue
      // `name` labels the marker; ECharts shows `value` when there is no name.
      const name = typeof m['name'] === 'string' ? (m['name'] as string) : m['value'] !== undefined && m['value'] !== null ? String(m['value']) : undefined
      const pointColor = styleColor(m, 'itemStyle', mpColor)
      const size = num(m['symbolSize']) ?? mpSize
      const extra = { label: name, ...(pointColor !== undefined ? { color: pointColor } : {}), ...(size !== null ? { radius: size / 2.0 } : {}) }
      const dim = m['valueDim'] ?? m['valueIndex']
      if (dim !== undefined && dim !== 'y' && dim !== 1) {
        // ledger: coordinates.mark-point
        warn('mark-shape-unsupported', `${path}.markPoint.data[${k}].valueDim`, 'markPoint statistics run over the y values only; a valueDim/valueIndex other than y was ignored.')
      }
      if (m['type'] === 'max' || m['type'] === 'min' || m['type'] === 'average') {
        markers.push({ seriesIndex, at: m['type'] as 'max' | 'min' | 'average', ...extra })
      } else if (Array.isArray(m['coord']) && xOfCoord((m['coord'] as unknown[])[0]) !== null) {
        const cx = xOfCoord((m['coord'] as unknown[])[0]) as number
        // On a continuous x the coord names a position; the marker anchors to the nearest datum.
        const atIndex = xs.length === values.length && xs.length > 0 ? xs.reduce((best, x, j) => (Math.abs(x - cx) < Math.abs(xs[best]! - cx) ? j : best), 0) : cx
        markers.push({ seriesIndex, atIndex, ...extra })
      } else {
        // ledger: coordinates.mark-point
        warn('mark-shape-unsupported', `${path}.markPoint.data[${k}]`, 'Only max/min/average and coord markPoints are mapped.')
      }
    }
  }

  // ---- title / legend / tooltip ----------------------------------------
  const titleRaw = first(option['title'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const title =
    isObj(titleRaw) && typeof titleRaw['text'] === 'string'
      ? { text: titleRaw['text'] as string, subtext: typeof titleRaw['subtext'] === 'string' ? (titleRaw['subtext'] as string) : undefined }
      : null
  const legendRaw = option['legend']
  const legend =
    legendRaw === undefined || (isObj(legendRaw) && legendRaw['show'] === false)
      ? null
      : series.map((s) => ({ label: s.label, color: s.color }))
  const tooltipRaw = option['tooltip']
  const tooltip = tooltipRaw !== undefined && !(isObj(tooltipRaw) && tooltipRaw['show'] === false)

  // A custom-only chart still needs axes: seed them from the custom extents.
  let customY: { min: Double; max: Double } | undefined = undefined
  let customX: Double[] | undefined = undefined
  // A lines series seeds the axes from every vertex, like a custom plan does.
  if (series.length === 0) {
    for (const ls of linesList) {
      for (const row of ls.coords) {
        for (let k = 0; k + 1 < row.length; k = k + 2) {
          const x = row[k]!
          const y = row[k + 1]!
          customY = customY === undefined ? { min: Math.min(0.0, y), max: y } : { min: Math.min(customY.min, y), max: Math.max(customY.max, y) }
          if (categories.length === 0) customX = customX === undefined ? [x, x] : [Math.min(customX[0]!, x), Math.max(customX[1]!, x)]
        }
      }
    }
  }
  if (series.length === 0 && customPlans.length > 0) {
    for (const plan of customPlans) {
      const ext = customExtents(plan)
      if (ext.y !== null) customY = customY === undefined ? { min: Math.min(0.0, ext.y[0]), max: ext.y[1] } : { min: Math.min(customY.min, ext.y[0]), max: Math.max(customY.max, ext.y[1]) }
      if (ext.x !== null && categories.length === 0) customX = [ext.x[0], ext.x[1]]
    }
  }
  // ---- large data: sampling / large / progressive ----------------------
  // ECharts thins a `sampling` series to the pixel width, gives a `large`
  // series past `largeThreshold` (2000) a cheaper draw, and draws a
  // `progressive` series in chunks past `progressiveThreshold` (3000). This
  // engine has ONE large-data mechanism — decimation to a bounded point count,
  // LTTB unless `sampling` names an aggregate, with every series and the
  // category axis thinned on the SAME rows so a hit still names a real datum —
  // and each of those keys resolves to that count. It applies only when every
  // cartesian series has the same length: thinning one would misalign the
  // shared x.
  // A series on a second value x axis carries its own positions, which the
  // shared thinning does not see, so large-data sampling is skipped (named).
  const hasOwnXs = series.some((entry) => entry.onX2 === true)
  // ledger: data.progressive-large
  if (sampleRequests.length > 0 && hasOwnXs) warn('series-option-unsupported', 'series', 'Large-data sampling is skipped when a series uses a second value x axis.')
  if (sampleRequests.length > 0 && series.length > 0 && !hasOwnXs) {
    const thinned = decimateShared(sampleRequests, { columns: series.map((entry) => entry.values), categories, xValues })
    for (let k = 0; k < series.length; k++) series[k]!.values = thinned.columns[k]!
    if (thinned.categories !== categories) categories.splice(0, categories.length, ...thinned.categories)
    xValues = thinned.xValues
  }
  const spec: ChartSpec = {
    width: opts.width ?? 640.0,
    height: opts.height ?? 320.0,
    series,
    categories,
    theme: themed.chartTheme,
    showXAxis: shown(xAxis),
    showYAxis: shown(yAxes[0]),
    showGrid: gridShown,
    yDomain,
    y2Domain,
    yFormat: yFormat ?? localeNumber,
    y2Format: y2Format ?? localeNumber,
    xFormat: xFormat ?? (xTime ? localeDate : undefined),
    xValues,
    xTime: xTime ? true : undefined,
    annotations: annotations.length > 0 ? annotations : undefined,
    markers: markers.length > 0 ? markers : undefined,
    lines: linesList.length > 0 ? linesList : undefined,
    xTitle: axisName(xAxis),
    yTitle: axisName(yAxes[0]),
    y2Title: axisName(yAxes[1]),
    ...(isObj(yAxes[0]) && yAxes[0]['type'] === 'log' ? { yScale: 'log' as const } : {}),
    ...(isObj(yAxes[0]) && yAxes[0]['inverse'] === true ? { yInverse: true } : {}),
    ...(isObj(xAxis) && xAxis['inverse'] === true ? { xInverse: true } : {}),
    ...(isObj(xAxis) && xAxis['position'] === 'top' ? { xTop: true } : {}),
    ...(num(isObj(xAxis) ? xAxis['offset'] : undefined) !== null ? { xOffset: num((xAxis as Record<string, unknown>)['offset']) as number } : {}),
    ...(num(isObj(yAxes[0]) ? yAxes[0]['offset'] : undefined) !== null ? { yOffset: num(yAxes[0]!['offset']) as number } : {}),
    ...(num(isObj(yAxes[1]) ? yAxes[1]['offset'] : undefined) !== null ? { y2Offset: num(yAxes[1]!['offset']) as number } : {}),
    ...(x2Mapped && !x2Continuous ? { x2Labels: x2Data } : {}),
    ...(x2Continuous && axisDomain(x2Axis) !== undefined ? { x2Domain: axisDomain(x2Axis) } : {}),
    ...(x2Mapped && typeof x2Axis!['name'] === 'string' ? { x2Title: x2Axis!['name'] as string } : {}),
    ...(yAxes.length > 2
      ? {
          extraYAxes: yAxes.slice(2).map((a) => ({
            side: a['position'] === 'left' ? 'left' : 'right',
            domain: axisDomain(a),
            title: axisName(a),
            offset: num(a['offset']) ?? undefined,
          })),
        }
      : {}),
    ...(yAxes.length === 1 && yAxes[0]!['position'] === 'right' ? { yRight: true } : {}),
  }
  if (customY !== undefined && spec.yDomain === undefined) spec.yDomain = customY
  if (customX !== undefined && (spec.xValues === undefined || spec.xValues.length === 0)) spec.xValues = customX
  const brush = option['brush'] === undefined ? undefined : readBrush(option as Record<string, unknown>, warn)
  const toolbox = option['toolbox'] === undefined ? undefined : readToolbox(option as Record<string, unknown>, warn, brush)
  let zoom = option['dataZoom'] === undefined ? undefined : readDataZoom(option as Record<string, unknown>, spec.categories, warn)
  // The toolbox's box zoom needs a window even when the option has no dataZoom component.
  if (zoom === undefined && toolbox?.dataZoom === true) zoom = { inside: false, slider: false, window: { start: 0.0, end: 1.0 }, keepY: false, lock: false, minSpan: 0.0, maxSpan: 1.0, wheel: false, move: false }
  return { spec, custom: customPlans, background: themed.background, title, legend, tooltip, warnings, supported, ...(selectedMode === undefined ? {} : { selectedMode }), ...(zoom === undefined ? {} : { zoom }), ...(toolbox === undefined ? {} : { toolbox }), ...(brush === undefined ? {} : { brush }) }
}

/** The selection a compiled option's brush makes over `spec`, restricted to `brush.seriesIndex`. */
export function optionBrushSelection(compiled: CompiledOption, spec: ChartSpec, measure: MeasureText, areas: BrushArea[]): BrushSeriesSelection[] {
  return brushOnlySeries(brushSelection(spec, layoutChart(spec, measure), areas), compiled.brush?.seriesIndex ?? [])
}

function applyOptionBrush(compiled: CompiledOption, spec: ChartSpec, measure: MeasureText, areas: BrushArea[]): ChartSpec {
  return applyBrushSelection(spec, optionBrushSelection(compiled, spec, measure, areas), true, compiled.brush?.outOpacity ?? 0.1)
}

const defaultPalette = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

const AXIS_KEYS = new Set(['type', 'data', 'name', 'show', 'min', 'max', 'splitLine', 'axisLabel', 'boundaryGap', 'gridIndex', 'inverse', 'position', 'offset'])

function axisKeys(
  axis: Record<string, unknown>,
  path: string,
  warn: (code: OptionWarning['code'], path: string, message: string) => void,
): void {
  for (const key of Object.keys(axis)) {
    // ledger: coordinates.axes
    if (!AXIS_KEYS.has(key)) warn('option-key-unsupported', `${path}.${key}`, `"${key}" has no axis mapping yet; it was ignored.`)
  }
  if ((axis['min'] === undefined) !== (axis['max'] === undefined)) {
    // ledger: coordinates.axes
    warn('option-key-unsupported', `${path}.${axis['min'] === undefined ? 'max' : 'min'}`, 'An axis domain needs both min and max; the data range is used.')
  }
}

function axisDomain(axis: Record<string, unknown> | undefined): Domain | undefined {
  if (axis === undefined) return undefined
  const lo = num(axis['min'])
  const hi = num(axis['max'])
  if (lo === null || hi === null) return undefined
  return { min: lo, max: hi }
}

function axisFormatter(
  axis: Record<string, unknown> | undefined,
  path: string,
  warn: (code: OptionWarning['code'], path: string, message: string) => void,
): Formatter | undefined {
  if (!isObj(axis) || !isObj(axis['axisLabel'])) return undefined
  const f = axis['axisLabel']['formatter']
  if (typeof f === 'function') return f as Formatter
  if (typeof f === 'string') {
    // The `{value}` template is the common case and maps exactly.
    const tpl = f
    if (tpl.includes('{value}')) return (v: Double): string => tpl.replace('{value}', String(v))
    // ledger: coordinates.axes
    warn('axis-formatter-template', `${path}.axisLabel.formatter`, 'Only function formatters and the {value} template are supported.')
  }
  return undefined
}

function shift(c: DrawCmd, dy: Double): DrawCmd {
  switch (c.kind) {
    case 'rect':
      return { ...c, rect: { ...c.rect, y: c.rect.y + dy } }
    case 'line':
      return { ...c, from: { ...c.from, y: c.from.y + dy }, to: { ...c.to, y: c.to.y + dy } }
    case 'polyline':
    case 'polygon':
      return { ...c, points: c.points.map((p) => ({ ...p, y: p.y + dy })) }
    case 'circle':
      return { ...c, center: { ...c.center, y: c.center.y + dy } }
    default:
      return { ...c, at: { ...c.at, y: c.at.y + dy } }
  }
}

export interface OptionToSvgOptions extends CompileOptions {
  measure?: MeasureText
}

/** Either half of the facade, chosen by the first series' type. */
export type OptionPlan =
  | { kind: 'cartesian'; compiled: CompiledOption }
  | { kind: 'family'; compiled: CompiledFamily }
  /** A multi-`grid` option: one plan per grid, each with its pixel rect. */
  | { kind: 'grids'; parts: { plan: OptionPlan; rect: Rect }[]; warnings: OptionWarning[] }

/** Route an option to the cartesian or the family compiler (a `timeline` step is resolved first; several `grid`s become one plan each). */
export function planOption(rawOption: EChartsOption, opts: CompileOptions = {}): OptionPlan {
  const tl = resolveTimeline(rawOption, opts.timelineIndex)
  const option = tl.option as EChartsOption
  const parts = splitGrids(option, opts.width ?? 640.0, opts.height ?? 320.0)
  if (parts !== null) {
    return { kind: 'grids', parts: parts.map((p) => ({ plan: planOption(p.option as EChartsOption, { ...opts, width: p.rect.w, height: p.rect.h }), rect: p.rect })), warnings: tl.warnings }
  }
  const fam = compileFamily(option)
  if (fam !== null) {
    if (tl.warnings.length > 0) fam.warnings.unshift(...tl.warnings)
    return { kind: 'family', compiled: fam }
  }
  const compiled = compileOption(option, opts)
  if (tl.warnings.length > 0) compiled.warnings.unshift(...tl.warnings)
  return { kind: 'cartesian', compiled }
}

/**
 * ECharts option → `<svg>` string, server-safe. The chart, its title and its
 * legend are composed the way the host component composes them: title on
 * top, legend under it, the plot shrunk by exactly what those consumed.
 */
export function optionToSvg(rawOption: EChartsOption, opts: OptionToSvgOptions = {}): string {
  const option = resolveTimeline(rawOption, opts.timelineIndex).option as EChartsOption
  const steps = timelineSteps(rawOption)
  const width = opts.width ?? 640.0
  const height = opts.height ?? 320.0
  const stripH = steps === null ? 0.0 : TIMELINE_HEIGHT
  const parts = splitGrids(option, width, height - stripH)
  if (parts === null && steps === null) return optionToSvgSingle(option, opts)
  // Composite: each grid (or the whole chart) rendered on its own, laid into one document.
  const rects: { option: EChartsOption; rect: Rect }[] =
    parts === null ? [{ option, rect: { x: 0.0, y: 0.0, w: width, h: height - stripH } }] : parts.map((p) => ({ option: p.option as EChartsOption, rect: p.rect }))
  const rendered = rects.map((r) => ({ svg: optionToSvgSingle(r.option, { ...opts, width: r.rect.w, height: r.rect.h }), x: r.rect.x, y: r.rect.y }))
  const overlay: DrawCmd[] = []
  if (parts !== null) {
    // The parts carry no overlays (splitGrids strips them) — they belong to the whole canvas.
    for (const c of visualMapCommands(option, width, height - stripH).cmds) overlay.push(c)
    for (const c of graphicCommands(option, width, height - stripH).cmds) overlay.push(c)
  }
  if (steps !== null) for (const c of timelineCommands(steps, width, height - stripH, stripH)) overlay.push(c)
  const titleRaw = first(option['title'] as Record<string, unknown> | Record<string, unknown>[] | undefined)
  return composeSvg(rendered, overlay, width, height, {
    ...(isObj(titleRaw) && typeof titleRaw['text'] === 'string' ? { title: titleRaw['text'] as string } : {}),
    ...(typeof option['backgroundColor'] === 'string' ? { background: option['backgroundColor'] as string } : {}),
  })
}

/** One single-grid, single-step option → `<svg>`: the family half or the cartesian half. */
function optionToSvgSingle(option: EChartsOption, opts: OptionToSvgOptions): string {
  const fam = compileFamily(option)
  if (fam !== null) {
    const svg = familyToSvg(fam.plan, { width: opts.width, height: opts.height })
    const size = svgSize(svg)
    if (size === null) return svg
    // Overlays above the chart: the visualMap strip, then free-form graphics.
    const overlay = [...visualMapCommands(option, size.width, size.height).cmds, ...graphicCommands(option, size.width, size.height).cmds]
    return appendGraphicLayer(svg, overlay, size.width, size.height)
  }
  const compiled = compileOption(option, opts)
  const composed = compiledCommands(compiled, option, opts.measure ?? measureApprox())
  return renderSvg(composed.cmds, compiled.spec.width, compiled.spec.height, {
    ...(compiled.title !== null ? { title: compiled.title.text } : {}),
  })
}

/**
 * The composed picture of a compiled cartesian option as flat commands —
 * background, title, legend, the plot shrunk by what those consumed, custom
 * series, then the visualMap strip and free-form graphics. `top` is the plot's
 * y offset, which a host needs to hit-test against the same geometry.
 * `optionToSvg` and `<OptionChart>` both paint exactly this.
 */
/**
 * The chart the option draws under a zoom window: the rows in view, the
 * global index of the first (`offset`), and the navigator strip the slider
 * takes from the bottom. Without a `dataZoom` it is the compiled spec itself.
 */
export function zoomedView(compiled: CompiledOption, top: Double, win?: ZoomWindow): { spec: ChartSpec; offset: number; navigator: NavigatorLayout | null } {
  const zoom = compiled.zoom
  const height = Math.max(0.0, compiled.spec.height - top)
  if (zoom === undefined) return { spec: { ...compiled.spec, height }, offset: 0, navigator: null }
  const w = win ?? zoom.window
  const lead = compiled.spec.series[0]
  const t = compiled.spec.theme
  const navigator = zoom.slider ? renderNavigator(lead?.values ?? [], lead?.color ?? t.palette[0] ?? '#5470c6', w, { x: 0.0, y: top, w: compiled.spec.width, h: height }, t.grid) : null
  const view = windowSpec({ ...compiled.spec, height: Math.max(0.0, height - (navigator?.height ?? 0.0)) }, w, zoom.keepY)
  return { spec: view.spec, offset: view.offset, navigator }
}

export function compiledCommands(compiled: CompiledOption, option: EChartsOption, measure: MeasureText, win?: ZoomWindow, actives: ToolboxTool[] = [], areas: BrushArea[] = []): { cmds: DrawCmd[]; top: Double } {
  const width = compiled.spec.width
  const height = compiled.spec.height
  const t = compiled.spec.theme
  let top = 0.0
  const cmds: DrawCmd[] = []
  if (compiled.background !== undefined) cmds.push({ kind: 'rect', rect: { x: 0.0, y: 0.0, w: width, h: height }, fill: compiled.background })
  if (compiled.title !== null) {
    cmds.push({ kind: 'text', text: compiled.title.text, at: { x: 0.0, y: 0.0 }, fill: t.label, size: t.fontSize + 4.0, align: 'start', baseline: 'top' })
    top = top + t.fontSize + 4.0
    if (compiled.title.subtext !== undefined) {
      cmds.push({ kind: 'text', text: compiled.title.subtext, at: { x: 0.0, y: top + 2.0 }, fill: t.label, size: t.fontSize, align: 'start', baseline: 'top' })
      top = top + t.fontSize + 2.0
    }
    top = top + 8.0
  }
  if (compiled.legend !== null && compiled.legend.length > 0) {
    const l = renderLegend(compiled.legend, { x: 0.0, y: top, w: width, h: height - top }, { fontSize: t.fontSize, labelColor: t.label, swatch: 10.0, gap: 12.0, orientation: 'horizontal' }, measure)
    for (const c of l.cmds) cmds.push(c)
    top = top + l.height
  }
  const view = zoomedView(compiled, top, win)
  // Brush areas are in PLOT-frame pixels (above the title / legend offset): they dim what they miss.
  const brushed = areas.length === 0 ? view.spec : applyOptionBrush(compiled, view.spec, measure, areas)
  const chart = renderChart(brushed, measure)
  for (const c of chart) cmds.push(top === 0.0 ? c : shift(c, top))
  for (const c of renderBrushAreas(areas, 'rgba(120,120,140,0.18)', t.axis)) cmds.push(top === 0.0 ? c : shift(c, top))
  if (view.navigator !== null) for (const c of view.navigator.cmds) cmds.push(c)
  const customOut = customCommands(compiled.custom, view.spec, measure, width, height)
  for (const c of customOut.cmds) cmds.push(top === 0.0 ? c : shift(c, top))
  for (const c of visualMapCommands(option, width, height).cmds) cmds.push(c)
  for (const c of graphicCommands(option, width, height).cmds) cmds.push(c)
  // ECharts' toolbox sits over the chart's top-right corner; it reserves no room.
  if (compiled.toolbox !== undefined) for (const c of renderToolbox(toolboxTools(compiled.toolbox), { x: 0.0, y: 0.0, w: width, h: height }, { fontSize: t.fontSize, color: t.label, actives }).cmds) cmds.push(c)
  return { cmds, top }
}
