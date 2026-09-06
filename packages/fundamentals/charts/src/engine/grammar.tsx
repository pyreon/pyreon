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

import { Fragment, Show, h, _rp as reactiveProp } from '@pyreon/core'
import type { VNode, VNodeChild } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import { PlotChart } from './Chart'
import type { PlotChartProps } from './Chart'
import type { Formatter } from './format'
import { area, bars, bubble, groupedBars, line, points, stackedBars } from './marks'
import type { Mark, MarkOptions } from './marks'
import type { Annotation, ChartTheme } from './render'
import type { Domain, Double } from './types'
import type { ChartLink } from './link'

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
}
export interface BarProps<T> extends MarkProps<T> {
  /** Stack this bar on the other stacked bars (one segment per mark, or per `color` value in long form). */
  stack?: boolean
  /** Place side by side with the other grouped bars. */
  group?: boolean
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
  /** x only: the tick labels are calendar steps (epoch-ms `xValue`). */
  time?: boolean
  /** Hide the axis. */
  hidden?: boolean
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
}
export interface ZoomProps {
  /** Pinch / wheel zoom + drag pan (default). */
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
export const Bar = brand<BarProps<any>>('Bar') as <T>(props: BarProps<T>) => VNode | null
/** A polyline through the values. */
export const Line = brand<MarkProps<any>>('Line') as <T>(props: MarkProps<T>) => VNode | null
/** A filled area under the line. */
export const Area = brand<MarkProps<any>>('Area') as <T>(props: MarkProps<T>) => VNode | null
/** Dots; with `r`, area-mapped bubbles. */
export const Dot = brand<DotProps<any>>('Dot') as <T>(props: DotProps<T>) => VNode | null
/** A reference line or band. */
export const Rule = brand<RuleProps>('Rule')
/** Axis configuration. */
export const Axis = brand<AxisProps>('Axis')
/** The pointer tooltip (+ crosshair). */
export const Tip = brand<TipProps>('Tip')
/** The legend. */
export const Legend = brand<LegendProps>('Legend')
/** Zoom, navigator, presets, brush, linking. */
export const Zoom = brand<ZoomProps>('Zoom')

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
  keyboard?: boolean
  accessibleTable?: boolean
  class?: string
  children?: VNodeChild
}

/** What `<Plot>` resolved its children into — exported so the equivalence with the array form is testable. */
export interface ResolvedGrammar<T> {
  marks: Mark<T>[]
  props: Partial<PlotChartProps<T>>
  /** Long-format pivot: the synthesized category rows replace `data`. */
  pivot: { rows: string[]; x: (d: string) => string } | null
}

/** Resolve mark children + chart channels into `<PlotChart>` props. Pure; called inside the host's effects so channel reads track. */
export function resolveGrammar<T>(rows: T[], chart: PlotProps<T>, children: VNodeChild): ResolvedGrammar<T> {
  const nodes = flatChildren(children)
  const props: Partial<PlotChartProps<T>> = {}
  const annotations: Annotation[] = []
  const rawMarks: { vnode: VNode; name: string }[] = []
  for (const v of nodes) {
    const name = markName(v.type)
    if (name === undefined) continue
    const p = v.props as Record<string, unknown>
    switch (name) {
      case 'Bar':
      case 'Line':
      case 'Area':
      case 'Dot':
        rawMarks.push({ vnode: v, name })
        break
      case 'Rule': {
        const r = p as RuleProps
        const extra: Partial<Annotation> = { ...(r.label !== undefined ? { label: r.label } : {}), ...(r.color !== undefined ? { color: r.color } : {}) }
        if (r.from !== undefined && r.to !== undefined) annotations.push({ yFrom: r.from, yTo: r.to, ...extra })
        else if (r.y !== undefined) annotations.push({ y: r.y, ...extra })
        break
      }
      case 'Axis': {
        const a = p as AxisProps
        if (a.x === true) {
          if (a.format !== undefined) props.xFormat = a.format
          if (a.time === true) props.xTime = true
          if (a.hidden === true) props.showXAxis = false
        } else if (a.y2 === true) {
          if (a.format !== undefined) props.y2Format = a.format
          if (a.domain !== undefined) props.y2Domain = a.domain
        } else {
          if (a.format !== undefined) props.format = a.format
          if (a.hidden === true) props.showYAxis = false
        }
        break
      }
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

  const colorOf = chart.color === undefined ? null : channel<T, string>(chart.color)
  if (colorOf === null) {
    return { marks: rawMarks.map(({ vnode, name }) => toMark<T>(name, vnode.props as Record<string, unknown>, undefined)), props, pivot: null }
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
  return { marks, props, pivot: { rows: categories, x: (d) => d } }
}

function toMark<T>(name: string, p: Record<string, unknown>, yOverride: ((d: T, i: number) => Double) | undefined): Mark<T> {
  const y = yOverride ?? channel<T, Double>(p.y as Channel<T>)
  const { y: _y, r, stack, group, minRadius, maxRadius, ...rest } = p as Record<string, unknown> & { r?: Channel<T>; stack?: boolean; group?: boolean; minRadius?: Double; maxRadius?: Double }
  const options = rest as MarkOptions
  switch (name) {
    case 'Bar':
      return stack === true ? stackedBars<T>(y, options) : group === true ? groupedBars<T>(y, options) : bars<T>(y, options)
    case 'Line':
      return line<T>(y, options)
    case 'Area':
      return area<T>(y, options)
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
export function Plot<T>(props: PlotProps<T>): VNode {
  const readRows = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  // One scan per change, not one per prop read: every forwarded prop below
  // reads through this computed, which re-resolves when the data, a channel or
  // a child's props change and is otherwise cached.
  const resolved = computed<ResolvedGrammar<T>>(() => resolveGrammar(readRows(), props, props.children))
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
  const forwarded = ['format', 'xFormat', 'xTime', 'showXAxis', 'showYAxis', 'y2Format', 'y2Domain', 'tooltip', 'crosshair', 'tooltipFormatter', 'showLegend', 'legendToggle', 'legendMaxRows', 'dataZoom', 'navigator', 'zoomPresets', 'link', 'brush', 'onBrush', 'annotations'] as const
  for (const key of forwarded) plotProps[key] = reactiveProp(() => (props as unknown as Record<string, unknown>)[key] ?? (resolved().props as Record<string, unknown>)[key])
  for (const key of ['width', 'height', 'theme', 'title', 'subtitle', 'showTitle', 'showGrid', 'horizontal', 'animate', 'updateAnimation', 'updateDuration', 'maxPoints', 'onSelect', 'keyboard', 'accessibleTable', 'class'] as const) {
    plotProps[key] = reactiveProp(() => (props as unknown as Record<string, unknown>)[key])
  }
  return h(PlotChart as unknown as (p: Record<string, unknown>) => VNode, plotProps)
}
