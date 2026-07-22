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

/** An ECharts theme — 'dark', a registered theme name, or a theme object. */
export type ChartTheme = string | Record<string, unknown>

/**
 * Configuration for useChart.
 */
export interface UseChartConfig {
  /**
   * ECharts theme — 'dark', a registered theme name, or a theme object.
   *
   * Accepts a VALUE (applied once at init) or an ACCESSOR
   * `() => theme` — signal reads inside the accessor are tracked, and when
   * they change the chart is disposed and re-initialized with the new theme,
   * preserving the current option (re-applied from `optionsFn`) and `group`.
   * ECharts has no in-place theme swap — dispose + re-init IS the mechanism
   * (same as vue-echarts). The `instance` signal publishes the new instance,
   * so event bindings / loading overlay / consumers rebind automatically.
   */
  theme?: ChartTheme | (() => ChartTheme | null | undefined)
  /** Renderer — 'canvas' (default, best performance) or 'svg' */
  renderer?: 'canvas' | 'svg'
  /** ECharts locale — 'EN' (default), 'ZH', etc. */
  locale?: string
  /**
   * ECharts group id for `connect()` — charts sharing a group id sync
   * tooltips/dataZoom/actions once `connect(groupId)` is called. Set on the
   * instance right after init (and re-applied across a theme re-init).
   */
  group?: string
  /**
   * Extra `echarts.init` options spread into the init call — the escape
   * hatch for init flags this config doesn't model (`useDirtyRect`,
   * `useCoarsePointer`, `pointerSize`, `ssr`, …). Spread LAST, so on a key
   * collision with the named config (`renderer`, `locale`, `width`, …) the
   * `initOptions` value wins.
   */
  initOptions?: Record<string, unknown>
  /**
   * Auto-resize behavior. `true` (default) observes the container with a
   * ResizeObserver and calls `chart.resize()` on size changes. `false`
   * disables the observer entirely (call `resize()` yourself). Pass
   * `{ throttle: ms }` to rate-limit resize calls (leading + trailing) —
   * useful when the container resizes continuously (drag handles,
   * animated layouts).
   */
  autoresize?: boolean | { throttle?: number }
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
  /**
   * Whether reactive `setOption` updates are silent (no event dispatch /
   * animation triggers) — ECharts `setOption` `silent`. Default: false.
   */
  silent?: boolean
  /**
   * Transition config for reactive updates — ECharts `setOption`
   * `transition` (e.g. `{ duration: 300 }` shapes per the ECharts docs).
   */
  transition?: SetOptionOpts['transition']
  /** Device pixel ratio — default: window.devicePixelRatio */
  devicePixelRatio?: number
  /** Width override — default: container width */
  width?: number
  /** Height override — default: container height */
  height?: number
  /**
   * Called when an ECharts instance is created — at first init AND after a
   * reactive-theme re-init (theme swap disposes + re-creates the instance).
   * Use it for per-instance imperative setup; it may run more than once.
   */
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
  /**
   * ECharts theme — a value OR an accessor `() => theme`. The accessor form
   * is REACTIVE: signal reads inside it are tracked and a change disposes +
   * re-initializes the chart with the new theme (option and group
   * preserved). A signal-read VALUE (`theme={mode()}`) is also live — the
   * component re-reads the reactive prop per swap check.
   */
  theme?: string | Record<string, unknown> | (() => string | Record<string, unknown> | null | undefined)
  /** Renderer — 'canvas' (default) or 'svg' */
  renderer?: 'canvas' | 'svg'
  /** ECharts locale — 'EN' (default), 'ZH', etc. */
  locale?: string
  /** ECharts group id for `connect()` cross-chart syncing */
  group?: string
  /**
   * Extra `echarts.init` options (`useDirtyRect`, `useCoarsePointer`,
   * `pointerSize`, …) — spread last into the init call (wins on collision).
   */
  initOptions?: Record<string, unknown>
  /**
   * Auto-resize — `true` (default) ResizeObserver-driven, `false` off,
   * `{ throttle: ms }` rate-limited.
   */
  autoresize?: boolean | { throttle?: number }
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
  /** Silent reactive updates (no events/animation triggers) — default false */
  silent?: boolean
  /** Transition config for reactive updates — ECharts `setOption` `transition` */
  transition?: SetOptionOpts['transition']
  /**
   * Called when an ECharts instance is created — at first init AND after a
   * reactive-theme re-init. May run more than once.
   */
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
