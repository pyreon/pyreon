// The grammar — `<Plot>` with MARK CHILDREN. (`Plot`, not `Chart`: the package's
// default entry already exports the ECharts bridge as `<Chart>`, and one name
// for two components across two subpaths is the confusion the audit flagged.)
//
//   <Plot data={rows} x="month">
//     <Bar y="revenue" label="Revenue" />
//     <Line y="target" label="Target" />
//     <Axis y format={currency('$')} />
//     <Tip /> <Legend />
//   </Plot>
//
// Channels are FIELD NAMES (`y="revenue"`, typed `keyof T`) or accessors;
// marks are JSX children, so layering is composition and a `<Show>` around a
// mark is ordinary Pyreon. Nothing here is a second engine: `<Plot>` scans its
// children STRUCTURALLY (the `Switch` / `Match` precedent — a mark is a branded
// component that is never invoked; `<Plot>` reads its vnode's props) and
// resolves them into the `marks={[bars(…)]}` props `<PlotChart>` already takes.
// The array form stays the config form and the two are the same spec.
//
// Long-format data: `<Plot color="region">` pivots every `y` mark into one
// series per distinct `region` value, categories from `x` — the Plot / Vega
// idiom — while a chart with no `color` channel is wide-format: one mark, one
// series, exactly as `<PlotChart>`.
//
// The FAMILY marks make the same grammar cover the row-array hosts: `<Arc
// value label>` is a pie or donut, `<Stage value label>` a funnel, `<Cell x y
// value>` a heatmap, `<Candle open high low close>` a candlestick — each is
// the host's own props with channels for its accessors, so `<Plot>` renders
// that host instead of `<PlotChart>`. One family per plot; a family mark
// beside a cartesian one is reported and the family wins.

import { Fragment, Show, h, _rp as reactiveProp } from '@pyreon/core'
import type { VNode, VNodeChild } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import { PlotChart } from './Chart'
import type { AxisLabelMode, PlotChartProps } from './Chart'
import { PieChart } from './PieChart'
import { FunnelChart } from './FunnelChart'
import { HeatmapChart } from './HeatmapChart'
import { CandlestickChart } from './CandlestickChart'
import type { CandleOptions } from './candlestick'
import type { FunnelOptions } from './funnel'
import type { Formatter } from './format'
import { area, band, bars, bubble, groupedBars, histogram, line, points, resolveMarks, stackedArea, stackedBars, waterfall } from './marks'
import type { ErrorOptions, Mark, MarkOptions } from './marks'
import { defaultTheme, logBounds, resolveYDomain } from './render'
import type { Annotation, ChartSpec, ChartTheme, PointMarker } from './render'
import type { LegendPosition } from './canvas-host'
import type { Domain, Double } from './types'
import type { ChartHandle, ChartLink } from './link'

/** A channel: a field name of the row type, or an accessor. */
export type Channel<T, V = Double> = (keyof T & string) | ((d: T, index: number) => V)

const CHART_MARK = Symbol.for('pyreon:chart-mark')

/** A field name or accessor as an accessor. */
export function channel<T, V>(c: Channel<T, V>): (d: T, index: number) => V {
  return typeof c === 'function' ? c : (d: T) => (d as Record<string, unknown>)[c] as V
}

// ---------------------------------------------------------------------------
// Marks — branded components. Never mounted: `<Plot>` reads their vnode props.
// ---------------------------------------------------------------------------

export interface MarkProps<T> extends Omit<MarkOptions, 'color'> {
  /** The value channel. */
  y: Channel<T>
  /** Fixed colour; the theme palette otherwise. */
  color?: string
  /** Error-bar bounds — both needed; a whisker from low to high through each datum. */
  errorLow?: Channel<T>
  errorHigh?: Channel<T>
}
export interface BarProps<T> extends MarkProps<T> {
  /** Stack this bar on the other stacked bars (one segment per mark, or per `color` value in long form). */
  stack?: boolean
  /** Place side by side with the other grouped bars. */
  group?: boolean
  /** Floating bars from running total to running total — the waterfall; `negativeColor` fills the falls. */
  waterfall?: boolean
}
/** `<Band low high>` — the region's two bounds. */
export interface BandProps<T> extends Omit<MarkProps<T>, 'y'> {
  low: Channel<T>
  high: Channel<T>
}

export interface DotProps<T> extends MarkProps<T> {
  /** A radius channel turns dots into bubbles (area-mapped). */
  r?: Channel<T>
  minRadius?: Double
  maxRadius?: Double
}
export interface RuleProps {
  /** A horizontal reference line at this value. */
  y?: Double
  /** A vertical reference line at this x value (a continuous `xValue` position). */
  x?: Double
  /** A band between two values. */
  from?: Double
  to?: Double
  label?: string
  color?: string
}
export interface AxisProps {
  /** Which axis this configures; default y. */
  x?: boolean
  y?: boolean
  y2?: boolean
  format?: Formatter
  domain?: Domain
  /** x or y: the tick labels are calendar steps (epoch-ms values). */
  time?: boolean
  /** Hide the axis. */
  hidden?: boolean
  /** A title in its own line outside the tick labels. */
  title?: string
  /** x only: what the labels do when they run out of room (`auto` rotates categories, thins numbers). */
  labels?: AxisLabelMode
  /** y only: the scale type; `<Scale y="log">` is the same switch. */
  scale?: 'linear' | 'log'
}
/**
 * The scales, as one element: `<Scale y="log" />`, `<Scale x="time" />`,
 * `<Scale normalize />` for a 100% stack. `<Axis>` carries the same switches
 * per axis; this is the place to state them together.
 */
export interface ScaleProps {
  y?: 'linear' | 'log' | 'time'
  x?: 'linear' | 'time'
  /** Draw the stacked bars as shares of each column. */
  normalize?: boolean
}
/**
 * A histogram of one value channel: the rows are binned and the plot draws
 * one bar per bin (count on y, the bin's range as its category). Replaces
 * the data the way the long-format pivot does; other marks are ignored.
 */
export interface HistogramProps<T> {
  x: Channel<T>
  /** Target bin count; default 10. */
  bins?: number
  label?: string
  color?: string
  /** Formats the bin edges in the category labels. */
  format?: Formatter
}
export interface TipProps {
  /** Custom lines; default is the engine's category + one line per series. */
  format?: PlotChartProps<never>['tooltipFormatter']
  crosshair?: boolean
}
export interface LegendProps {
  /** Click toggles series (default on). */
  toggle?: boolean
  maxRows?: number
  /** Where the legend sits; `top` by default. */
  position?: LegendPosition
}
/**
 * A datum-anchored label — the engine's point marker (ECharts' markPoint).
 * `Label`, not `Text`: `<Text>` is the canonical primitive, and the native
 * compiler dispatches on the tag name.
 */
export interface LabelProps {
  /** Which series the marker reads; default the first. */
  series?: number
  /** Anchor at the series' maximum / minimum datum, or at a concrete index. */
  at?: 'max' | 'min' | number
  text: string
  color?: string
  radius?: Double
}
/** A pie or donut: one slice per row. */
export interface ArcProps<T> {
  value: Channel<T>
  label: Channel<T, string>
  /** Per-slice colour channel; the theme palette otherwise. */
  color?: Channel<T, string>
  /** 0 is a pie; up to 1 is a donut. */
  innerRadius?: Double
  showLabels?: boolean
}
/** A funnel: one stage per row, sorted descending by default. */
export interface StageProps<T> extends Omit<FunnelOptions, 'progress'> {
  value: Channel<T>
  label: Channel<T, string>
  color?: Channel<T, string>
}
/** A heatmap: one cell per row at (x, y); duplicates sum. */
export interface CellProps<T> {
  x: Channel<T, string>
  y: Channel<T, string>
  value: Channel<T>
  /** The colour ramp, low to high. */
  colors?: string[]
  gap?: Double
}
/** A candlestick: one period per row; the plot's `x` channel labels it. */
export interface CandleProps<T> extends CandleOptions {
  open: Channel<T>
  high: Channel<T>
  low: Channel<T>
  close: Channel<T>
}
export interface ZoomProps {
  /** Wheel zoom + drag pan with a mouse, pinch zoom + drag pan on touch (default). */
  inside?: boolean
  /** The slider strip under the plot. */
  navigator?: boolean
  /** Preset buttons: `[{ label: '1M', count: 30 }]`. */
  presets?: { label: string; count: number }[]
  /** Share the window and hover across charts. */
  link?: ChartLink
  /** Range brush; reports a global inclusive index range. */
  brush?: (range: { start: number; end: number } | null) => void
}

function brand<P>(name: string): (props: P) => VNode | null {
  const fn = (_props: P): VNode | null => null
  Object.defineProperty(fn, CHART_MARK, { value: name, configurable: true })
  Object.defineProperty(fn, 'displayName', { value: name, configurable: true })
  return fn
}

/** Vertical bars; `stack` / `group` combine several. */
export const Bar = /* @__PURE__ */ brand<BarProps<any>>('Bar') as <T>(props: BarProps<T>) => VNode | null
/** A polyline through the values. */
export const Line = /* @__PURE__ */ brand<MarkProps<any>>('Line') as <T>(props: MarkProps<T>) => VNode | null
/** A filled area under the line. */
export const Area = /* @__PURE__ */ brand<MarkProps<any>>('Area') as <T>(props: MarkProps<T>) => VNode | null
/** Dots; with `r`, area-mapped bubbles. */
export const Dot = /* @__PURE__ */ brand<DotProps<any>>('Dot') as <T>(props: DotProps<T>) => VNode | null

/** Areas stacked on one another — `stackedArea`'s grammar form. */
export const Layer = /* @__PURE__ */ brand<MarkProps<any>>('Layer') as <T>(props: MarkProps<T>) => VNode | null

/**
 * A filled REGION between two channels — `band`'s grammar form.
 *
 * Two channels rather than one, so it takes `low` and `high` instead of `y`;
 * every other mark's single `y` would have nothing to be.
 */
export const Band = /* @__PURE__ */ brand<BandProps<any>>('Band') as <T>(props: BandProps<T>) => VNode | null
/** A reference line or band. */
export const Rule = /* @__PURE__ */ brand<RuleProps>('Rule')
/** Axis configuration. */
export const Axis = /* @__PURE__ */ brand<AxisProps>('Axis')
/** The pointer tooltip (+ crosshair). */
export const Tip = /* @__PURE__ */ brand<TipProps>('Tip')
/** The legend. */
export const Legend = /* @__PURE__ */ brand<LegendProps>('Legend')
/** Zoom, navigator, presets, brush, linking. */
export const Zoom = /* @__PURE__ */ brand<ZoomProps>('Zoom')
/** A datum-anchored label (the engine's point marker). */
export const Label = /* @__PURE__ */ brand<LabelProps>('Label')
/** The scale switches — see {@link ScaleProps}. */
export const Scale = /* @__PURE__ */ brand<ScaleProps>('Scale')
/** A binned value channel drawn as bars — see {@link HistogramProps}. */
export const Histogram = /* @__PURE__ */ brand<HistogramProps<any>>('Histogram') as <T>(props: HistogramProps<T>) => VNode | null
/** A pie or donut — the family mark for `<PieChart>`. */
export const Arc = /* @__PURE__ */ brand<ArcProps<any>>('Arc') as <T>(props: ArcProps<T>) => VNode | null
/** A funnel — the family mark for `<FunnelChart>`. */
export const Stage = /* @__PURE__ */ brand<StageProps<any>>('Stage') as <T>(props: StageProps<T>) => VNode | null
/** A heatmap — the family mark for `<HeatmapChart>`. */
export const Cell = /* @__PURE__ */ brand<CellProps<any>>('Cell') as <T>(props: CellProps<T>) => VNode | null
/** A candlestick — the family mark for `<CandlestickChart>`. */
export const Candle = /* @__PURE__ */ brand<CandleProps<any>>('Candle') as <T>(props: CandleProps<T>) => VNode | null

/** The family a mark belongs to, and the host `<Plot>` renders for it. */
export type FamilyHost = 'pie' | 'funnel' | 'heatmap' | 'candlestick'
const FAMILY_OF: Readonly<Record<string, FamilyHost>> = { Arc: 'pie', Stage: 'funnel', Cell: 'heatmap', Candle: 'candlestick' }

const markName = (type: unknown): string | undefined =>
  typeof type === 'function' ? ((type as unknown as Record<symbol, string>)[CHART_MARK] as string | undefined) : undefined

/** The children as a flat vnode list — a compiled sole child arrives through a getter, several as an array, a `.map()` nested. */
function flatChildren(children: VNodeChild): VNode[] {
  const out: VNode[] = []
  const walk = (c: VNodeChild): void => {
    if (c === null || c === undefined || typeof c === 'boolean' || typeof c === 'string' || typeof c === 'number') return
    if (typeof c === 'function') {
      walk((c as () => VNodeChild)())
      return
    }
    if (Array.isArray(c)) {
      for (const x of c) walk(x as VNodeChild)
      return
    }
    const v = c as VNode
    // `<Show when>` around a mark: read the condition here (tracked by the
    // resolving computed) and descend; a fragment is transparent.
    if (v.type === Show) {
      const when = (v.props as { when?: unknown }).when
      const on = typeof when === 'function' ? (when as () => unknown)() : when
      if (on) for (const x of v.children) walk(x)
      return
    }
    if (v.type === Fragment) {
      for (const x of v.children) walk(x)
      return
    }
    out.push(v)
  }
  walk(children)
  return out
}

export interface PlotProps<T> {
  data: T[] | (() => T[])
  /** The category channel (evenly spaced). */
  x?: Channel<T, string>
  /** The continuous x channel (spacing follows the values). */
  xValue?: Channel<T>
  /** Long-format split: one series per distinct value of this channel, for every `y` mark. */
  color?: Channel<T, string>
  width?: Double
  height?: Double
  theme?: Partial<ChartTheme>
  title?: string
  subtitle?: string
  showTitle?: boolean
  /** One formatter for the y axis, tooltip and description (an `<Axis y format>` overrides it). */
  format?: Formatter
  horizontal?: boolean
  animate?: boolean
  /** Tween data changes (default on); `updateDuration` in ms. */
  updateAnimation?: boolean
  updateDuration?: Double
  showGrid?: boolean
  maxPoints?: number
  onSelect?: (index: number) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (identical here). */
  onSelectIndex?: (index: number) => void
  keyboard?: boolean
  accessibleTable?: boolean
  class?: string
  /** The events/actions model — see `<PlotChart>`: an imperative handle, click-to-pin selection and the change callbacks. */
  handle?: ChartHandle
  selectedMode?: 'single' | 'multiple'
  onSelectChange?: (selected: number[]) => void
  onHighlight?: (index: number) => void
  onLegendChange?: (hidden: number[]) => void
  onZoom?: (window: { start: number; end: number } | null) => void
  emphasis?: boolean
  /** Names for the tooltip, the legend and the accessible table when a mark sets no `label`. */
  seriesLabels?: string[]
  toolbox?: PlotChartProps<T>['toolbox']
  onSaveImage?: PlotChartProps<T>['onSaveImage']
  /** A BCP 47 tag formatting numbers and dates through Intl — see `<PlotChart locale>`. */
  locale?: string
  /**
   * Small multiples: one panel per distinct value of this channel, in a
   * grid, every panel sharing the y domain (a facet whose axis differs from
   * its neighbour's cannot be compared to it). Each panel is titled with its
   * value. The other channels, marks and switches apply to every panel.
   */
  facet?: Channel<T, string>
  /** Panels per row; default 2. */
  facetColumns?: number
  children?: VNodeChild
}

/** What `<Plot>` resolved its children into — exported so the equivalence with the array form is testable. */
export interface ResolvedGrammar<T> {
  marks: Mark<T>[]
  props: Partial<PlotChartProps<T>>
  /** Long-format pivot (or a histogram's bins): the synthesized rows replace `data`, and `x` labels them. */
  pivot: { rows: unknown[]; x: (d: unknown, index: number) => string } | null
  /** A family mark was given: the host to render and the props (channels as accessors) it takes instead of `<PlotChart>`. */
  family: { host: FamilyHost; props: Record<string, unknown> } | null
}

const warnGrammar = (m: string): void => {
  if (process.env.NODE_ENV !== 'production') console.warn(`[Pyreon] <Plot>: ${m}`)
}

/** A family mark's props with every channel turned into an accessor. */
function familyProps<T>(name: string, p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const channels: readonly string[] = name === 'Arc' || name === 'Stage' ? ['value', 'label', 'color'] : name === 'Cell' ? ['x', 'y', 'value'] : ['open', 'high', 'low', 'close']
  const options: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(p)) {
    if (k === 'children' || v === undefined) continue
    if (channels.includes(k)) out[k] = channel(v as Channel<T, unknown>)
    else if (name === 'Stage' || name === 'Candle') options[k] = v
    else out[k] = v
  }
  if (name === 'Stage' && Object.keys(options).length > 0) out.funnel = options
  if (name === 'Candle' && Object.keys(options).length > 0) out.candle = options
  return out
}

/** Resolve mark children + chart channels into `<PlotChart>` props. Pure; called inside the host's effects so channel reads track. */
export function resolveGrammar<T>(rows: T[], chart: PlotProps<T>, children: VNodeChild): ResolvedGrammar<T> {
  const nodes = flatChildren(children)
  const props: Partial<PlotChartProps<T>> = {}
  const annotations: Annotation[] = []
  const markers: PointMarker[] = []
  const rawMarks: { vnode: VNode; name: string }[] = []
  let family: ResolvedGrammar<T>['family'] = null
  for (const v of nodes) {
    const name = markName(v.type)
    if (name === undefined) continue
    const p = v.props as Record<string, unknown>
    const familyHost = FAMILY_OF[name]
    if (familyHost !== undefined) {
      if (family === null) family = { host: familyHost, props: familyProps<T>(name, p) }
      else warnGrammar(`one family per plot — <${name}> is ignored beside the ${family.host} mark.`)
      continue
    }
    switch (name) {
      case 'Bar':
      case 'Line':
      case 'Area':
      case 'Dot':
      case 'Layer':
      case 'Band':
        rawMarks.push({ vnode: v, name })
        break
      case 'Rule': {
        const r = p as RuleProps
        const extra: Partial<Annotation> = { ...(r.label !== undefined ? { label: r.label } : {}), ...(r.color !== undefined ? { color: r.color } : {}) }
        if (r.from !== undefined && r.to !== undefined) annotations.push({ yFrom: r.from, yTo: r.to, ...extra })
        else if (r.y !== undefined) annotations.push({ y: r.y, ...extra })
        else if (r.x !== undefined) annotations.push({ x: r.x, ...extra })
        break
      }
      case 'Label': {
        const t = p as unknown as LabelProps
        const m: PointMarker = { label: t.text }
        if (t.series !== undefined) m.seriesIndex = t.series
        if (typeof t.at === 'number') m.atIndex = t.at
        else if (t.at !== undefined) m.at = t.at
        if (t.color !== undefined) m.color = t.color
        if (t.radius !== undefined) m.radius = t.radius
        markers.push(m)
        break
      }
      case 'Axis': {
        const a = p as AxisProps
        if (a.x === true) {
          if (a.format !== undefined) props.xFormat = a.format
          if (a.time === true) props.xTime = true
          if (a.hidden === true) props.showXAxis = false
          if (a.title !== undefined) props.xTitle = a.title
          if (a.labels !== undefined) props.xLabels = a.labels
        } else if (a.y2 === true) {
          if (a.format !== undefined) props.y2Format = a.format
          if (a.domain !== undefined) props.y2Domain = a.domain
          if (a.title !== undefined) props.y2Title = a.title
        } else {
          if (a.format !== undefined) props.format = a.format
          if (a.domain !== undefined) props.yDomain = a.domain
          if (a.hidden === true) props.showYAxis = false
          if (a.title !== undefined) props.yTitle = a.title
          if (a.time === true) props.yTime = true
          if (a.scale !== undefined) props.yScale = a.scale
        }
        break
      }
      case 'Scale': {
        const sc = p as ScaleProps
        if (sc.y === 'log' || sc.y === 'linear') props.yScale = sc.y
        if (sc.y === 'time') props.yTime = true
        if (sc.x === 'time') props.xTime = true
        if (sc.normalize === true) props.stackNormalize = true
        break
      }
      case 'Histogram':
        rawMarks.push({ vnode: v, name })
        break
      case 'Tip': {
        const t = p as TipProps
        props.tooltip = true
        if (t.crosshair === true) props.crosshair = true
        if (t.format !== undefined) props.tooltipFormatter = t.format as NonNullable<PlotChartProps<T>['tooltipFormatter']>
        break
      }
      case 'Legend': {
        const l = p as LegendProps
        props.showLegend = true
        if (l.toggle === false) props.legendToggle = false
        if (l.maxRows !== undefined) props.legendMaxRows = l.maxRows
        if (l.position !== undefined) props.legendPosition = l.position
        break
      }
      case 'Zoom': {
        const z = p as ZoomProps
        if (z.inside !== false) props.dataZoom = true
        if (z.navigator === true) props.navigator = true
        if (z.presets !== undefined) props.zoomPresets = z.presets
        if (z.link !== undefined) props.link = z.link
        if (z.brush !== undefined) {
          props.brush = true
          props.onBrush = z.brush
        }
        break
      }
    }
  }
  if (annotations.length > 0) props.annotations = annotations
  if (markers.length > 0) props.markers = markers
  if (family !== null) {
    if (rawMarks.length > 0) warnGrammar(`a ${family.host} mark beside <${rawMarks[0]!.name}> — the plot renders the ${family.host}; the cartesian marks are ignored.`)
    return { marks: [], props, pivot: null, family }
  }

  // A histogram replaces the rows with its bins; it is the whole plot.
  const hist = rawMarks.find((m) => m.name === 'Histogram')
  if (hist !== undefined) {
    if (rawMarks.length > 1) warnGrammar(`<Histogram> beside another mark — the plot draws the histogram; the other marks are ignored.`)
    const hp = hist.vnode.props as unknown as HistogramProps<T>
    const opts: Parameters<typeof histogram>[2] = {}
    if (hp.bins !== undefined) opts.bins = hp.bins
    if (hp.label !== undefined) opts.label = hp.label
    if (hp.color !== undefined) opts.color = hp.color
    if (hp.format !== undefined) opts.format = hp.format
    const built = histogram(rows, channel<T, Double>(hp.x), opts)
    return { marks: built.marks as unknown as Mark<T>[], props, pivot: { rows: built.data, x: (d) => built.x(d as (typeof built.data)[number]) }, family: null }
  }

  const colorOf = chart.color === undefined ? null : channel<T, string>(chart.color)
  if (colorOf === null) {
    return { marks: rawMarks.map(({ vnode, name }) => toMark<T>(name, vnode.props as Record<string, unknown>, undefined)), props, pivot: null, family: null }
  }
  // Long format: pivot rows into (category × series) per `y` mark.
  const xOf = chart.x === undefined ? (_d: T, i: number) => String(i) : channel<T, string>(chart.x)
  const categories: string[] = []
  const catIndex = new Map<string, number>()
  const seriesNames: string[] = []
  const seriesIndex = new Map<string, number>()
  for (let i = 0; i < rows.length; i++) {
    const c = xOf(rows[i]!, i)
    if (!catIndex.has(c)) {
      catIndex.set(c, categories.length)
      categories.push(c)
    }
    const s = colorOf(rows[i]!, i)
    if (!seriesIndex.has(s)) {
      seriesIndex.set(s, seriesNames.length)
      seriesNames.push(s)
    }
  }
  const marks: Mark<T>[] = []
  for (const { vnode, name } of rawMarks) {
    const p = vnode.props as Record<string, unknown>
    const yOf = channel<T, Double>(p.y as Channel<T>)
    const table: Double[][] = seriesNames.map(() => categories.map(() => NaN))
    for (let i = 0; i < rows.length; i++) {
      const ci = catIndex.get(xOf(rows[i]!, i))!
      const si = seriesIndex.get(colorOf(rows[i]!, i))!
      table[si]![ci] = yOf(rows[i]!, i)
    }
    const many = seriesNames.length > 1
    for (let si = 0; si < seriesNames.length; si++) {
      const values = table[si]!
      // The placeholder accessor is replaced wholesale by the pivoted column
      // through `transform`, whose NaNs the engine keeps as GAPS (a raw
      // accessor's NaN is zeroed — the transform hook is the gap channel).
      const m = toMark<T>(name, { ...p, label: p.label ?? seriesNames[si], ...(many && name === 'Bar' && p.stack !== true ? { group: true } : {}) }, () => 0)
      m.transform = () => values
      marks.push(m)
    }
  }
  return { marks, props, pivot: { rows: categories, x: (d) => d as string }, family: null }
}

function toMark<T>(name: string, p: Record<string, unknown>, yOverride: ((d: T, i: number) => Double) | undefined): Mark<T> {
  const y = yOverride ?? channel<T, Double>(p.y as Channel<T>)
  const { y: _y, r, stack, group, waterfall: isWaterfall, minRadius, maxRadius, errorLow, errorHigh, ...rest } = p as Record<string, unknown> & { r?: Channel<T>; stack?: boolean; group?: boolean; waterfall?: boolean; minRadius?: Double; maxRadius?: Double; errorLow?: Channel<T>; errorHigh?: Channel<T> }
  const options = rest as ErrorOptions<T>
  if (errorLow !== undefined) options.errorLow = channel<T, Double>(errorLow)
  if (errorHigh !== undefined) options.errorHigh = channel<T, Double>(errorHigh)
  switch (name) {
    case 'Bar':
      return isWaterfall === true ? waterfall<T>(y, options) : stack === true ? stackedBars<T>(y, options) : group === true ? groupedBars<T>(y, options) : bars<T>(y, options)
    case 'Line':
      return line<T>(y, options)
    case 'Area':
      return area<T>(y, options)
    case 'Layer':
      return stackedArea<T>(y, options)
    case 'Band':
      // `low`/`high` rather than `y`: a region has two bounds and no single
      // value, so the shared `y` channel has nothing to carry here.
      return band<T>(channel<T, Double>(p.low as Channel<T>), channel<T, Double>(p.high as Channel<T>), options)
    default:
      return r === undefined ? points<T>(y, options) : bubble<T>(y, channel<T, Double>(r), { ...options, ...(minRadius !== undefined ? { minRadius } : {}), ...(maxRadius !== undefined ? { maxRadius } : {}) })
  }
}

/**
 * The plot — mark children over one data set.
 *
 * Renders `<PlotChart>` with props that are ACCESSORS over the children, so a
 * signal read in a channel or a `<Show>` around a mark repaints like any other
 * reactive input; the children are scanned again each time.
 */
export function Plot<T>(props: PlotProps<T>): VNodeChild {
  const readRows = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  // One scan per change, not one per prop read: every forwarded prop below
  // reads through this computed, which re-resolves when the data, a channel or
  // a child's props change and is otherwise cached.
  const resolved = computed<ResolvedGrammar<T>>(() => resolveGrammar(readRows(), props, props.children))
  // Which host: the family a mark names, else the plot. Its own computed, so a
  // data change repaints the host in place and only a family flip (a `<Show>`
  // around the family mark) remounts.
  const hostKind = computed<FamilyHost | 'plot'>(() => resolved().family?.host ?? 'plot')
  const read = (key: string): unknown => (props as unknown as Record<string, unknown>)[key]
  const familyNode = (kind: FamilyHost): VNode => {
    const p: Record<string, unknown> = { data: reactiveProp(readRows) }
    // The canvas host's shared props, then the child-declared switches, then the mark's own channels.
    for (const key of ['width', 'height', 'theme', 'title', 'subtitle', 'showTitle', 'animate', 'updateAnimation', 'updateDuration', 'keyboard', 'onSelect', 'onSelectIndex', 'accessibleTable', 'class', 'onSaveImage'] as const) p[key] = reactiveProp(() => read(key))
    for (const key of ['tooltip', 'showLegend', 'legendPosition', 'format'] as const) p[key] = reactiveProp(() => read(key) ?? (resolved().props as Record<string, unknown>)[key])
    // The family hosts take a PNG-only toolbox; the plot's `'svg'` form maps to it.
    p.toolbox = reactiveProp(() => {
      const tb = read('toolbox') as PlotProps<T>['toolbox']
      return tb === undefined ? undefined : { saveAsImage: tb.saveAsImage !== undefined && tb.saveAsImage !== false }
    })
    if (kind === 'candlestick') p.x = reactiveProp(() => (props.x === undefined ? undefined : channel<T, string>(props.x)))
    const own = resolved().family!.props
    for (const key of Object.keys(own)) p[key] = reactiveProp(() => resolved().family?.props[key])
    const host = kind === 'pie' ? PieChart : kind === 'funnel' ? FunnelChart : kind === 'heatmap' ? HeatmapChart : CandlestickChart
    return h(host as unknown as (p: Record<string, unknown>) => VNode, p)
  }
  const plotProps: Record<string, unknown> = {
    data: reactiveProp(() => {
      const r = resolved()
      return r.pivot === null ? readRows() : r.pivot.rows
    }),
    marks: reactiveProp(() => resolved().marks),
    x: reactiveProp(() => {
      const r = resolved()
      if (r.pivot !== null) return r.pivot.x
      return props.x === undefined ? undefined : channel<T, string>(props.x)
    }),
    xValue: reactiveProp(() => (props.xValue === undefined ? undefined : channel<T, Double>(props.xValue))),
  }
  // Every `<PlotChart>` prop a child can set, forwarded as an accessor; the chart's own props win when both are given.
  const forwarded = ['format', 'xFormat', 'xTime', 'showXAxis', 'showYAxis', 'yDomain', 'y2Format', 'y2Domain', 'tooltip', 'crosshair', 'tooltipFormatter', 'showLegend', 'legendToggle', 'legendMaxRows', 'legendPosition', 'dataZoom', 'navigator', 'zoomPresets', 'link', 'brush', 'onBrush', 'annotations', 'markers', 'xTitle', 'yTitle', 'y2Title', 'xLabels', 'yScale', 'yTime', 'stackNormalize'] as const
  for (const key of forwarded) plotProps[key] = reactiveProp(() => (props as unknown as Record<string, unknown>)[key] ?? (resolved().props as Record<string, unknown>)[key])
  // Every other `<PlotChart>` prop, the events/actions model included — the grammar reaches the whole host.
  for (const key of ['width', 'height', 'theme', 'title', 'subtitle', 'showTitle', 'showGrid', 'horizontal', 'animate', 'updateAnimation', 'updateDuration', 'maxPoints', 'keyboard', 'accessibleTable', 'class', 'handle', 'selectedMode', 'onSelectChange', 'onHighlight', 'onLegendChange', 'onZoom', 'emphasis', 'seriesLabels', 'toolbox', 'onSaveImage', 'locale'] as const) {
    plotProps[key] = reactiveProp(() => (props as unknown as Record<string, unknown>)[key])
  }
  // `onSelect` and `onSelectIndex` are one callback on the plot host.
  plotProps.onSelect = reactiveProp(() => {
    const a = props.onSelect
    const b = props.onSelectIndex
    if (a === undefined) return b
    if (b === undefined) return a
    return (i: number): void => {
      a(i)
      b(i)
    }
  })
  if (props.facet !== undefined) return facetGrid(props, readRows, plotProps)
  return () => {
    const kind = hostKind()
    return kind === 'plot' ? h(PlotChart as unknown as (p: Record<string, unknown>) => VNode, plotProps) : familyNode(kind)
  }
}

/**
 * Small multiples. The rows split by the facet channel into panels, each an
 * ordinary `<PlotChart>` over ITS rows (re-resolving the marks per panel, so
 * a long-format pivot works inside a facet) and titled with its value. Every
 * panel takes the SHARED y domain derived over ALL rows — the point of a
 * facet grid is comparison, and panels on their own scales cannot be
 * compared. A new value adds a panel; panels whose value persists keep
 * their identity across data changes (each reads its rows through a signal).
 */
function facetGrid<T>(props: PlotProps<T>, readRows: () => T[], base: Record<string, unknown>): VNodeChild {
  const facetOf = channel<T, string>(props.facet!)
  const panelRows = new Map<string, Signal<T[]>>()
  /**
   * The panel's rows signal — created once per facet VALUE, then written.
   * A helper rather than an inline `signal(...)` in the grouping loop: one
   * signal per panel is the point (the panel keeps its identity across data
   * changes), but a bare `signal()` in a loop body is the shape that usually
   * means a signal per RENDER, so `pyreon/no-signal-in-loop` flags it — and
   * the named helper says which of the two this is.
   */
  const writePanel = (key: string, rows: T[]): void => {
    const existing = panelRows.get(key)
    if (existing === undefined) panelRows.set(key, signal(rows))
    else existing.set(rows)
  }
  // The keys, in first-seen order; rows land in each panel's signal.
  const keys = computed<string[]>(() => {
    const rows = readRows()
    const groups = new Map<string, T[]>()
    for (let i = 0; i < rows.length; i++) {
      const k = facetOf(rows[i]!, i)
      const g = groups.get(k)
      if (g === undefined) groups.set(k, [rows[i]!])
      else g.push(rows[i]!)
    }
    const out: string[] = []
    for (const [k, g] of groups) {
      writePanel(k, g)
      out.push(k)
    }
    return out
  }, { equals: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]) })
  // The shared y domain over every row, through the same marks each panel
  // draws — the log view pins its decades, the ordinary view its extent.
  const shared = computed<Domain | undefined>(() => {
    const r = resolveGrammar(readRows(), props, props.children)
    if (r.props.yDomain !== undefined) return r.props.yDomain
    if (r.family !== null || r.marks.length === 0) return undefined
    const rows = r.pivot === null ? readRows() : (r.pivot.rows as T[])
    const spec: ChartSpec = {
      width: 1.0, height: 1.0, series: resolveMarks(rows, r.marks), categories: [], theme: defaultTheme,
      showXAxis: true, showYAxis: true, showGrid: false,
      yScale: r.props.yScale,
      stackNormalize: r.props.stackNormalize,
    }
    return spec.yScale === 'log' ? logBounds(spec) : resolveYDomain(spec)
  })
  const cols = props.facetColumns ?? 2
  const panel = (key: string): VNode => {
    const rows = panelRows.get(key)!
    const resolved = computed<ResolvedGrammar<T>>(() => resolveGrammar(rows(), props, props.children))
    const p: Record<string, unknown> = { ...base }
    p.data = reactiveProp(() => {
      const r = resolved()
      return r.pivot === null ? rows() : r.pivot.rows
    })
    p.marks = reactiveProp(() => resolved().marks)
    p.x = reactiveProp(() => {
      const r = resolved()
      if (r.pivot !== null) return r.pivot.x
      return props.x === undefined ? undefined : channel<T, string>(props.x)
    })
    p.yDomain = reactiveProp(() => shared())
    p.title = key
    p.showTitle = true
    return h(PlotChart as unknown as (p: Record<string, unknown>) => VNode, p)
  }
  return h('div', { class: 'pyreon-plot-facets', style: `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:12px` }, () => keys().map(panel))
}
