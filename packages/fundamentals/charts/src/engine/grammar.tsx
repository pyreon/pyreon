// The grammar — `<Chart>` with MARK CHILDREN, the package's main entry.
//
//   <Chart data={rows} x="month">
//     <Bar y="revenue" label="Revenue" />
//     <Line y="target" label="Target" />
//     <Axis y format={currency('$')} />
//     <Tooltip /> <Legend />
//   </Chart>
//
// Channels are FIELD NAMES (`y="revenue"`, `keyof T` — checked when the mark
// is given the row type, `<Bar<Row> y>`, since JSX cannot pass a type argument
// from `<Chart<Row>>` to its children) or accessors;
// marks are JSX children, so layering is composition and a `<Show>` around a
// mark is ordinary Pyreon. Nothing here is a second engine: `<Chart>` scans its
// children STRUCTURALLY (the `Switch` / `Match` precedent — a mark is a branded
// component that is never invoked; `<Chart>` reads its vnode's props) and
// resolves them into the `marks={[bars(…)]}` props `<PlotChart>` already takes.
// The array form stays the config form and the two are the same spec.
//
// Long-format data: `<Chart color="region">` pivots every `y` mark into one
// series per distinct `region` value, categories from `x` — the Observable Plot / Vega
// idiom — while a chart with no `color` channel is wide-format: one mark, one
// series, exactly as `<PlotChart>`.
//
// The FAMILY marks make the same grammar cover the row-array hosts: `<Arc
// value label>` is a pie or donut, `<Stage value label>` a funnel, `<Cell x y
// value>` a heatmap, `<Candle open high low close>` a candlestick — each is
// the host's own props with channels for its accessors, so `<Chart>` renders
// that host instead of `<PlotChart>`. One family per chart; a family mark
// beside a cartesian one is reported and the family wins.

import { For, Fragment, Show, h, _rp as reactiveProp } from '@pyreon/core'
import type { VNode, VNodeChild } from '@pyreon/core'
import { computed, signal, untrack } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import { plotCore } from './Chart'
import { toolboxFeature, zoomFeature } from './plot-features'
import type { PlotFeatures, ToolboxFeature, ZoomFeature } from './plot-features'
import type { ToolboxConfig } from './toolbox-config'
import type { AxisLabelMode, PlotChartProps } from './Chart'
import { PieChart } from './PieChart'
import { FunnelChart } from './FunnelChart'
import { HeatmapChart } from './HeatmapChart'
import { CandlestickChart } from './CandlestickChart'
import type { CandleOptions } from './candlestick'
import type { FunnelOptions } from './funnel'
import type { Formatter } from './format'
import { area, band, bars, bubble, groupedBars, histogram, line, points, resolveMarks, stackedArea, stackedBars, waterfall } from './marks'
import type { Accessor, ErrorOptions, Mark, MarkOptions } from './marks'
import { bollinger, ema, sma, trend } from './indicators'
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
// Marks — branded components. Never mounted: `<Chart>` reads their vnode props.
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
/** `<Sma>` / `<Ema>` — a moving average of `y` over `window` points. */
export interface AverageProps<T> extends Omit<MarkProps<T>, 'errorLow' | 'errorHigh'> {
  /** Points in the window; rounded down. */
  window: number
}
/** `<Trend>` — the least-squares line through `y`. */
export type TrendProps<T> = Omit<MarkProps<T>, 'errorLow' | 'errorHigh'>
/** `<Bollinger>` — a filled envelope `k` standard deviations wide, plus its middle line. */
export interface BollingerProps<T> extends AverageProps<T> {
  /** Width in standard deviations; 2 by default. */
  k?: Double
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
export interface TooltipProps {
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
/**
 * The tool strip: save-as-image, restore, magic type (switch line and bar,
 * stacked and tiled), a box-select zoom, a data view and the area brushes.
 * Each is opt-in, and so is the code: a chart without `<Toolbox>` does not
 * bundle any of it.
 */
export interface ToolboxProps extends ToolboxConfig {}

function brand<P>(name: string): (props: P) => VNode | null {
  const fn = (_props: P): VNode | null => null
  Object.defineProperty(fn, CHART_MARK, { value: name, configurable: true })
  Object.defineProperty(fn, 'displayName', { value: name, configurable: true })
  return fn
}

/**
 * The interaction feature a chrome mark carries — `<Zoom>` the navigator,
 * presets and range brush, `<Toolbox>` the tool strip. Same mechanism as a
 * family mark's host: the implementation rides on the mark, so a chart
 * without the mark leaves it unreferenced and a bundler drops it.
 */
const MARK_FEATURE = Symbol.for('pyreon.charts.markFeature')

function featureMark<P>(name: string, feature: unknown): (props: P) => VNode | null {
  const fn = brand<P>(name)
  Object.defineProperty(fn, MARK_FEATURE, { value: feature, configurable: true })
  return fn
}

/**
 * The cartesian plot host, carried by every cartesian mark. `<Chart>` takes
 * it from its children rather than importing it, for the same reason a
 * family mark carries its own host: a pie is `<Chart><Arc/></Chart>`, and a
 * chart with no cartesian mark must not bundle the whole cartesian plot.
 */
const PLOT_HOST = Symbol.for('pyreon.charts.plotHost')

type PlotHost = typeof plotCore

function plotMark<P>(name: string, host: PlotHost): (props: P) => VNode | null {
  const fn = brand<P>(name)
  Object.defineProperty(fn, PLOT_HOST, { value: host, configurable: true })
  return fn
}

/**
 * An indicator's factory, carried ON its component for the same reason a
 * family mark carries its host: the resolver reaches `sma` / `bollinger` only
 * through a component the app imported, so an unused indicator leaves its
 * arithmetic unreferenced and a `<Chart>` without one does not bundle it.
 */
const INDICATOR = Symbol.for('pyreon.charts.indicator')

type IndicatorBuild = (y: Accessor<unknown>, window: number, k: Double, options: MarkOptions) => Mark<unknown>[]

function indicatorMark<P>(name: string, host: PlotHost, build: IndicatorBuild): (props: P) => VNode | null {
  const fn = plotMark<P>(name, host)
  Object.defineProperty(fn, INDICATOR, { value: build, configurable: true })
  return fn
}

/**
 * The host component a family mark renders through, carried ON the mark.
 *
 * Load-bearing for tree-shaking: `<Plot>` looks the host up on the child's
 * component instead of importing all four hosts itself, so a plot that never
 * uses `<Arc>` never pulls the pie renderer in. Each family mark is created
 * by a `@__PURE__` call whose argument is its host — unused mark, dropped
 * call, unreferenced host, shaken out.
 */
const FAMILY_HOST = Symbol.for('pyreon.charts.familyHost')

type HostComponent = (props: Record<string, unknown>) => VNode | null

function familyMark<P>(name: string, host: unknown): (props: P) => VNode | null {
  const fn = brand<P>(name)
  Object.defineProperty(fn, FAMILY_HOST, { value: host, configurable: true })
  return fn
}

/** Vertical bars; `stack` / `group` combine several. */
export const Bar = /* @__PURE__ */ plotMark<BarProps<any>>('Bar', plotCore) as <T>(props: BarProps<T>) => VNode | null
/** A polyline through the values. */
export const Line = /* @__PURE__ */ plotMark<MarkProps<any>>('Line', plotCore) as <T>(props: MarkProps<T>) => VNode | null
/** A filled area under the line. */
export const Area = /* @__PURE__ */ plotMark<MarkProps<any>>('Area', plotCore) as <T>(props: MarkProps<T>) => VNode | null
/** Dots; with `r`, area-mapped bubbles. */
export const Dot = /* @__PURE__ */ plotMark<DotProps<any>>('Dot', plotCore) as <T>(props: DotProps<T>) => VNode | null

/**
 * Areas stacked on one another — `stackedArea`'s grammar form.
 *
 * NOT `<Layer>`: that name is taken by the canonical `@pyreon/primitives`
 * z-stack, and one canonical name means one concept. Naming it after its own
 * mark also matches every sibling (`bars`→`<Bar>`, `band`→`<Band>`).
 */
export const StackedArea = /* @__PURE__ */ plotMark<MarkProps<any>>('StackedArea', plotCore) as <T>(props: MarkProps<T>) => VNode | null

/**
 * A filled REGION between two channels — `band`'s grammar form.
 *
 * Two channels rather than one, so it takes `low` and `high` instead of `y`;
 * every other mark's single `y` would have nothing to be.
 */
export const Band = /* @__PURE__ */ plotMark<BandProps<any>>('Band', plotCore) as <T>(props: BandProps<T>) => VNode | null
/**
 * Indicators — each is a line derived from its `y` series rather than read
 * off each datum, so the whole series is in view when it is computed. The
 * arithmetic is the engine's (`indicator-values.ts`), which also crosses to
 * native, so `<Chart>` on iOS and Android draws the same values.
 */
/** A simple moving average of `y` over `window` points. */
export const Sma = /* @__PURE__ */ indicatorMark<AverageProps<any>>('Sma', plotCore, (y, w, _k, o) => [sma(y, w, o)]) as <T>(props: AverageProps<T>) => VNode | null
/** An exponential moving average of `y` over `window` points. */
export const Ema = /* @__PURE__ */ indicatorMark<AverageProps<any>>('Ema', plotCore, (y, w, _k, o) => [ema(y, w, o)]) as <T>(props: AverageProps<T>) => VNode | null
/** The least-squares trend line through `y`. */
export const Trend = /* @__PURE__ */ indicatorMark<TrendProps<any>>('Trend', plotCore, (y, _w, _k, o) => [trend(y, o)]) as <T>(props: TrendProps<T>) => VNode | null
/** Bollinger bands: a filled envelope `k` standard deviations wide, plus its middle line. */
export const Bollinger = /* @__PURE__ */ indicatorMark<BollingerProps<any>>('Bollinger', plotCore, (y, w, k, o) => bollinger(y, w, k, o)) as <T>(props: BollingerProps<T>) => VNode | null
/** A reference line or band. */
export const Rule = /* @__PURE__ */ brand<RuleProps>('Rule')
/** Axis configuration. */
export const Axis = /* @__PURE__ */ brand<AxisProps>('Axis')
/** The pointer tooltip (+ crosshair). */
export const Tooltip = /* @__PURE__ */ brand<TooltipProps>('Tooltip')
/** The legend. */
export const Legend = /* @__PURE__ */ brand<LegendProps>('Legend')
/** Zoom, navigator, presets, brush, linking. */
export const Zoom = /* @__PURE__ */ featureMark<ZoomProps>('Zoom', zoomFeature)
/** The tool strip — see {@link ToolboxProps}. */
export const Toolbox = /* @__PURE__ */ featureMark<ToolboxProps>('Toolbox', toolboxFeature)
/** A datum-anchored label (the engine's point marker). */
export const Label = /* @__PURE__ */ brand<LabelProps>('Label')
/** The scale switches — see {@link ScaleProps}. */
export const Scale = /* @__PURE__ */ brand<ScaleProps>('Scale')
/** A binned value channel drawn as bars — see {@link HistogramProps}. */
export const Histogram = /* @__PURE__ */ plotMark<HistogramProps<any>>('Histogram', plotCore) as <T>(props: HistogramProps<T>) => VNode | null
/** A pie or donut — the family mark for `<PieChart>`. */
export const Arc = /* @__PURE__ */ familyMark<ArcProps<any>>('Arc', PieChart) as <T>(props: ArcProps<T>) => VNode | null
/** A funnel — the family mark for `<FunnelChart>`. */
export const Stage = /* @__PURE__ */ familyMark<StageProps<any>>('Stage', FunnelChart) as <T>(props: StageProps<T>) => VNode | null
/** A heatmap — the family mark for `<HeatmapChart>`. */
export const Cell = /* @__PURE__ */ familyMark<CellProps<any>>('Cell', HeatmapChart) as <T>(props: CellProps<T>) => VNode | null
/** A candlestick — the family mark for `<CandlestickChart>`. */
export const Candle = /* @__PURE__ */ familyMark<CandleProps<any>>('Candle', CandlestickChart) as <T>(props: CandleProps<T>) => VNode | null

/** The family a mark belongs to, and the host `<Chart>` renders for it. */
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
    // `<For each>` around marks: resolve its items through the render callback
    // here, exactly as a `.map()` child already resolves — the whole walk runs
    // inside the resolving computed, so an accessor `each` tracks. (The runtime
    // `<For>` never mounts here: a mark is data, not DOM.)
    if ((v.type as unknown) === For) {
      const fp = v.props as { each?: unknown; children?: unknown }
      const each = typeof fp.each === 'function' ? (fp.each as () => unknown)() : fp.each
      const render = typeof fp.children === 'function' ? fp.children : v.children[0]
      if (Array.isArray(each) && typeof render === 'function') {
        for (const item of each) walk((render as (item: unknown) => VNodeChild)(item))
      }
      return
    }
    out.push(v)
  }
  walk(children)
  return out
}

export interface ChartProps<T> {
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
  /** Morph updates across differing mark or item shapes. */
  universalTransition?: boolean
  showGrid?: boolean
  maxPoints?: number
  /**
   * A click or tap on a datum, with the index of the drawn item: the row for
   * the cartesian marks, `<Arc>`, `<Stage>` and `<Candle>`, the cell for
   * `<Cell>` (duplicate observations sum into one cell). The same callback,
   * with the same argument, on the web, iOS and Android.
   */
  onSelect?: (index: number) => void
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

/** What `<Chart>` resolved its children into — exported so the equivalence with the array form is testable. */
export interface ResolvedGrammar<T> {
  marks: Mark<T>[]
  props: Partial<PlotChartProps<T>>
  /** Long-format pivot (or a histogram's bins): the synthesized rows replace `data`, and `x` labels them. */
  pivot: { rows: unknown[]; x: (d: unknown, index: number) => string } | null
  /** A family mark was given: the host to render and the props (channels as accessors) it takes instead of `<PlotChart>`. */
  family: { host: FamilyHost; component: HostComponent; props: Record<string, unknown> } | null
  /** The interaction features the children asked for (`<Zoom>`, `<Toolbox>`). */
  features: { zoom?: ZoomFeature | undefined; toolbox?: ToolboxFeature | undefined }
  /** The cartesian plot host, taken from the first cartesian mark; absent for a family-only or empty chart. */
  plotHost: PlotHost | undefined
}

const describeChild = (v: VNode): string => {
  const t = v.type as unknown
  if (typeof t === 'string') return `<${t}>`
  if (typeof t === 'function') return `<${(t as { name?: string }).name || 'Component'}>`
  return String(t)
}

const warnGrammar = (m: string): void => {
  if (process.env.NODE_ENV !== 'production') console.warn(`[Pyreon] <Chart>: ${m}`)
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
export function resolveGrammar<T>(rows: T[], chart: ChartProps<T>, children: VNodeChild): ResolvedGrammar<T> {
  const nodes = flatChildren(children)
  const props: Partial<PlotChartProps<T>> = {}
  const annotations: Annotation[] = []
  const markers: PointMarker[] = []
  const rawMarks: { vnode: VNode; name: string }[] = []
  let family: ResolvedGrammar<T>['family'] = null
  const features: ResolvedGrammar<T>['features'] = {}
  let plotHost: PlotHost | undefined
  for (const v of nodes) {
    const name = markName(v.type)
    if (name === undefined) {
      // A child that is not a mark renders NOTHING here, so say so: a silent
      // skip reads as "my chart is empty" rather than "wrong child".
      warnGrammar(`unrecognized child ${describeChild(v)} — only mark components (<Bar>, <Line>, <Rule>, …) render inside <Chart>; it is ignored.`)
      continue
    }
    const p = v.props as Record<string, unknown>
    if (plotHost === undefined) plotHost = (v.type as unknown as Record<symbol, PlotHost | undefined>)[PLOT_HOST]
    const familyHost = FAMILY_OF[name]
    if (familyHost !== undefined) {
      if (family === null) family = { host: familyHost, component: (v.type as unknown as Record<symbol, HostComponent>)[FAMILY_HOST]!, props: familyProps<T>(name, p) }
      else warnGrammar(`one family per plot — <${name}> is ignored beside the ${family.host} mark.`)
      continue
    }
    switch (name) {
      case 'Bar':
      case 'Line':
      case 'Area':
      case 'Dot':
      case 'StackedArea':
      case 'Band':
      case 'Sma':
      case 'Ema':
      case 'Trend':
      case 'Bollinger':
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
      case 'Tooltip': {
        const t = p as TooltipProps
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
      case 'Toolbox': {
        const cfg: ToolboxConfig = {}
        for (const [k, val] of Object.entries(p)) if (k !== 'children' && val !== undefined) (cfg as Record<string, unknown>)[k] = val
        props.toolbox = cfg
        features.toolbox = (v.type as unknown as Record<symbol, ToolboxFeature>)[MARK_FEATURE]
        break
      }
      case 'Zoom': {
        features.zoom = (v.type as unknown as Record<symbol, ZoomFeature>)[MARK_FEATURE]
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
    return { marks: [], props, pivot: null, family, features, plotHost }
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
    return { marks: built.marks as unknown as Mark<T>[], props, pivot: { rows: built.data, x: (d) => built.x(d as (typeof built.data)[number]) }, family: null, features, plotHost }
  }

  const colorOf = chart.color === undefined ? null : channel<T, string>(chart.color)
  if (colorOf === null) {
    return { marks: rawMarks.flatMap(({ vnode, name }) => toMarks<T>(vnode, name, vnode.props as Record<string, unknown>, undefined)), props, pivot: null, family: null, features, plotHost }
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
      for (const m of toMarks<T>(vnode, name, { ...p, label: p.label ?? seriesNames[si], ...(many && name === 'Bar' && p.stack !== true ? { group: true } : {}) }, () => 0)) {
        // An indicator already derives its values from the series; feed it the
        // pivoted column instead of the placeholder accessor's zeros.
        const derive = m.transform
        const derive2 = m.transform2
        m.transform = derive === undefined ? () => values : () => derive(values)
        if (derive2 !== undefined) m.transform2 = () => derive2(values)
        marks.push(m)
      }
    }
  }
  return { marks, props, pivot: { rows: categories, x: (d) => d as string }, family: null, features, plotHost }
}

function toMarks<T>(vnode: VNode, name: string, p: Record<string, unknown>, yOverride: ((d: T, i: number) => Double) | undefined): Mark<T>[] {
  const build = (vnode.type as unknown as Record<symbol, IndicatorBuild | undefined>)[INDICATOR]
  if (build === undefined) return [toMark<T>(name, p, yOverride)]
  const y = yOverride ?? channel<T, Double>(p.y as Channel<T>)
  const { y: _y, window: span, k, ...options } = p as Record<string, unknown> & Partial<BollingerProps<T>>
  if (name !== 'Trend' && (typeof span !== 'number' || !(span >= 1))) {
    warnGrammar(`<${name}> needs a \`window\` of at least 1 point; the mark is skipped.`)
    return []
  }
  return build(y as Accessor<unknown>, span ?? 0, k ?? 2.0, options as MarkOptions) as Mark<T>[]
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
    case 'StackedArea':
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
export function Chart<T>(props: ChartProps<T>): VNodeChild {
  const readRows = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  // One scan per change, not one per prop read: every forwarded prop below
  // reads through this computed, which re-resolves when the data, a channel or
  // a child's props change and is otherwise cached.
  const resolved = computed<ResolvedGrammar<T>>(() => resolveGrammar(readRows(), props, props.children))
  // Which host: the family a mark names, else the plot. Its own computed, so a
  // data change repaints the host in place and only a family flip (a `<Show>`
  // around the family mark) remounts.
  const hostKind = computed<FamilyHost | 'plot'>(() => resolved().family?.host ?? 'plot')
  // The interaction features the children asked for, read at call time so a
  // `<Zoom>` added later (a `<Show>` around it) is picked up.
  const features: PlotFeatures = {
    get zoom() {
      return resolved().features.zoom
    },
    get toolbox() {
      return resolved().features.toolbox
    },
  }
  const GrammarPlot = (p: PlotChartProps<T>): VNode | null => {
    const host = untrack(() => resolved().plotHost)
    return host === undefined ? null : host(p, features)
  }
  const read = (key: string): unknown => (props as unknown as Record<string, unknown>)[key]
  const familyNode = (kind: FamilyHost): VNode => {
    const p: Record<string, unknown> = { data: reactiveProp(readRows) }
    // The canvas host's shared props, then the child-declared switches, then the mark's own channels.
    for (const key of ['width', 'height', 'theme', 'title', 'subtitle', 'showTitle', 'animate', 'updateAnimation', 'updateDuration', 'universalTransition', 'keyboard', 'accessibleTable', 'class', 'onSaveImage'] as const) p[key] = reactiveProp(() => read(key))
    // A family host's `onSelect` is shaped per family (a heatmap reports its
    // cell); its `onSelectIndex` is the index every host reports on every
    // target, which is what `<Chart onSelect>` promises.
    p.onSelectIndex = reactiveProp(() => props.onSelect)
    for (const key of ['tooltip', 'showLegend', 'legendPosition', 'format'] as const) p[key] = reactiveProp(() => read(key) ?? (resolved().props as Record<string, unknown>)[key])
    // The family hosts take a PNG-only toolbox; the plot's `'svg'` form maps to it.
    p.toolbox = reactiveProp(() => {
      const tb = (resolved().props as Record<string, unknown>).toolbox as ToolboxConfig | undefined
      return tb === undefined ? undefined : { saveAsImage: tb.saveAsImage !== undefined && tb.saveAsImage !== false }
    })
    if (kind === 'candlestick') p.x = reactiveProp(() => (props.x === undefined ? undefined : channel<T, string>(props.x)))
    const own = resolved().family!.props
    for (const key of Object.keys(own)) p[key] = reactiveProp(() => resolved().family?.props[key])
    return h(resolved().family!.component as unknown as (p: Record<string, unknown>) => VNode, p)
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
  const forwarded = ['format', 'xFormat', 'xTime', 'showXAxis', 'showYAxis', 'yDomain', 'y2Format', 'y2Domain', 'tooltip', 'crosshair', 'tooltipFormatter', 'showLegend', 'legendToggle', 'legendMaxRows', 'legendPosition', 'dataZoom', 'navigator', 'initialZoom', 'zoomLimits', 'zoomPresets', 'link', 'brush', 'onBrush', 'annotations', 'markers', 'toolbox', 'xTitle', 'yTitle', 'y2Title', 'xLabels', 'yScale', 'yTime', 'stackNormalize'] as const
  for (const key of forwarded) plotProps[key] = reactiveProp(() => (props as unknown as Record<string, unknown>)[key] ?? (resolved().props as Record<string, unknown>)[key])
  // Every other `<PlotChart>` prop, the events/actions model included — the grammar reaches the whole host.
  for (const key of ['width', 'height', 'theme', 'title', 'subtitle', 'showTitle', 'showGrid', 'horizontal', 'animate', 'updateAnimation', 'updateDuration', 'universalTransition', 'maxPoints', 'keyboard', 'accessibleTable', 'class', 'handle', 'selectedMode', 'onSelectChange', 'onHighlight', 'onLegendChange', 'onZoom', 'onClick', 'onDoubleClick', 'onContextMenu', 'onRendered', 'emphasis', 'seriesLabels', 'onSaveImage', 'locale'] as const) {
    plotProps[key] = reactiveProp(() => (props as unknown as Record<string, unknown>)[key])
  }
  plotProps.onSelect = reactiveProp(() => props.onSelect)
  if (props.facet !== undefined) return facetGrid(props, readRows, plotProps, GrammarPlot)
  return () => {
    const kind = hostKind()
    return kind === 'plot' ? h(GrammarPlot as unknown as (p: Record<string, unknown>) => VNode, plotProps) : familyNode(kind)
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
function facetGrid<T>(props: ChartProps<T>, readRows: () => T[], base: Record<string, unknown>, host: (p: PlotChartProps<T>) => VNode | null): VNodeChild {
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
    return h(host as unknown as (p: Record<string, unknown>) => VNode, p)
  }
  return h('div', { class: 'pyreon-plot-facets', style: `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:12px` }, () => keys().map(panel))
}
