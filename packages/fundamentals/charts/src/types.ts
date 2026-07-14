import type { Props } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import type { ComposeOption, EChartsOption, SetOptionOpts } from 'echarts'
import type { ECharts } from 'echarts/core'

// ─── Re-export ECharts types for consumer convenience ────────────────────────

// Re-export series option types
// Re-export component option types
export type {
  BarSeriesOption,
  BoxplotSeriesOption,
  CandlestickSeriesOption,
  DataZoomComponentOption,
  FunnelSeriesOption,
  GaugeSeriesOption,
  GraphSeriesOption,
  GridComponentOption,
  HeatmapSeriesOption,
  LegendComponentOption,
  LineSeriesOption,
  PieSeriesOption,
  RadarSeriesOption,
  SankeySeriesOption,
  ScatterSeriesOption,
  SunburstSeriesOption,
  TitleComponentOption,
  ToolboxComponentOption,
  TooltipComponentOption,
  TreemapSeriesOption,
  TreeSeriesOption,
  VisualMapComponentOption,
} from 'echarts'
export type { ComposeOption, ECharts, EChartsOption, SetOptionOpts }

// ─── Event types (duck-typed to avoid echarts dual-package type conflicts) ───

/** Chart event params — duck-typed to work across echarts entry points */
export interface ChartEventParams {
  componentType?: string
  seriesType?: string
  seriesIndex?: number
  seriesName?: string
  name?: string
  dataIndex?: number
  data?: unknown
  dataType?: string
  value?: unknown
  color?: string
  event?: Event
  [key: string]: unknown
}

/**
 * A chart event handler. Receives the ECharts event params plus the live
 * ECharts instance (so a handler can call `instance.dispatchAction(...)`
 * without capturing the ref). Mirrors echarts-for-react's `onEvents`
 * handler shape `(params, instance) => void`.
 */
export type ChartEventHandler = (params: ChartEventParams, instance: ECharts) => void

// ─── Chart config ────────────────────────────────────────────────────────────

/**
 * Configuration for useChart.
 */
export interface UseChartConfig {
  /** ECharts theme — 'dark', a registered theme name, or a theme object */
  theme?: string | Record<string, unknown>
  /** Renderer — 'canvas' (default, best performance) or 'svg' */
  renderer?: 'canvas' | 'svg'
  /** ECharts locale — 'EN' (default), 'ZH', etc. */
  locale?: string
  /** Whether to replace all options instead of merging — default: false */
  notMerge?: boolean
  /**
   * Component types to REPLACE (rather than merge) on each reactive update —
   * ECharts `setOption` `replaceMerge`. Use when a signal change should drop
   * removed components/series instead of leaving stale merged state (e.g.
   * `'series'`). Distinct from `notMerge` (which replaces everything).
   */
  replaceMerge?: string | string[]
  /** Whether to batch updates — default: true */
  lazyUpdate?: boolean
  /** Device pixel ratio — default: window.devicePixelRatio */
  devicePixelRatio?: number
  /** Width override — default: container width */
  width?: number
  /** Height override — default: container height */
  height?: number
  /** Called when chart instance is created */
  onInit?: (instance: ECharts) => void
}

/**
 * Return type of useChart.
 */
export interface UseChartResult {
  /** Bind to container element via ref */
  ref: (el: Element | null) => void
  /** The ECharts instance — null until mounted and modules loaded */
  instance: Signal<ECharts | null>
  /** True while ECharts modules are being dynamically imported */
  loading: Signal<boolean>
  /** Error signal — set if chart init or setOption throws */
  error: Signal<Error | null>
  /** Manually trigger resize */
  resize: () => void
}

/**
 * Props for the <Chart /> component.
 * Generic parameter narrows the option type for exact autocomplete.
 */
export interface ChartProps<TOption extends EChartsOption = EChartsOption> extends Props {
  /** Reactive ECharts option config — fully typed */
  options: () => TOption
  /** ECharts theme */
  theme?: string | Record<string, unknown>
  /** Renderer — 'canvas' (default) or 'svg' */
  renderer?: 'canvas' | 'svg'
  /** ECharts locale — 'EN' (default), 'ZH', etc. */
  locale?: string
  /** Replace options instead of merging — default false */
  notMerge?: boolean
  /**
   * Component types to REPLACE (not merge) on each reactive update — ECharts
   * `setOption` `replaceMerge`. E.g. `'series'` drops removed series instead
   * of leaving stale merged state.
   */
  replaceMerge?: string | string[]
  /** Batch updates — default true */
  lazyUpdate?: boolean
  /** Called once when the ECharts instance is created */
  onInit?: (instance: ECharts) => void
  /**
   * Show the ECharts built-in loading overlay. Reactive — pass a signal read
   * (`showLoading={loading()}`) to toggle it while your data is in flight.
   * This is ECharts' `showLoading()`/`hideLoading()`, distinct from the
   * `loading` signal on `useChart` (which tracks lazy MODULE loading before
   * the instance exists).
   */
  showLoading?: boolean
  /**
   * Options for the loading overlay (text, color, spinnerRadius, …), passed to
   * ECharts `showLoading('default', loadingOption)`. Only applies while
   * `showLoading` is true.
   */
  loadingOption?: Record<string, unknown>
  /** CSS style for the container div */
  style?: string
  /** CSS class for the container div */
  class?: string
  /**
   * Accessible name for the chart. A chart renders to canvas/SVG, which is
   * opaque to screen readers — without a text alternative it's invisible. When
   * set, the container becomes `role="img"` with this as its `aria-label`
   * (the WAI pattern for presenting a complex graphic as one labeled image).
   * Provide a concise description of what the chart conveys, e.g.
   * "Bar chart: monthly revenue, trending up from January to June".
   */
  ariaLabel?: string
  /**
   * Arbitrary ECharts event handlers, keyed by event name — the general form
   * that covers every ECharts event (`'legendselectchanged'`, `'datazoom'`,
   * `'finished'`, `'brushselected'`, `'click'`, …). Mirrors echarts-for-react's
   * `onEvents`. Each handler receives `(params, instance)`. Reactive: if a
   * handler prop changes, the old listener is removed and the new one bound
   * (no listener pile-up). The `onClick`/`onMouseover`/`onMouseout` shorthands
   * below are merged in and WIN on a key collision.
   *
   * @example
   * onEvents={{
   *   legendselectchanged: (p) => console.log('legend', p.name),
   *   datazoom: (p, inst) => syncOtherChart(inst.getOption()),
   * }}
   */
  onEvents?: Record<string, ChartEventHandler>
  /** Click event handler (shorthand for `onEvents.click`) */
  onClick?: ChartEventHandler
  /** Mouseover event handler (shorthand for `onEvents.mouseover`) */
  onMouseover?: ChartEventHandler
  /** Mouseout event handler (shorthand for `onEvents.mouseout`) */
  onMouseout?: ChartEventHandler
}
