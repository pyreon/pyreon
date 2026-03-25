import type { Props } from "@pyreon/core"
import type { Signal } from "@pyreon/reactivity"
import type { ComposeOption, EChartsOption, SetOptionOpts } from "echarts"
import type { ECharts } from "echarts/core"

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
} from "echarts"
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

// ─── Chart config ────────────────────────────────────────────────────────────

/**
 * Configuration for useChart.
 */
export interface UseChartConfig {
  /** ECharts theme — 'dark', a registered theme name, or a theme object */
  theme?: string | Record<string, unknown>
  /** Renderer — 'canvas' (default, best performance) or 'svg' */
  renderer?: "canvas" | "svg"
  /** ECharts locale — 'EN' (default), 'ZH', etc. */
  locale?: string
  /** Whether to replace all options instead of merging — default: false */
  notMerge?: boolean
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
  renderer?: "canvas" | "svg"
  /** CSS style for the container div */
  style?: string
  /** CSS class for the container div */
  class?: string
  /** Click event handler */
  onClick?: (params: ChartEventParams) => void
  /** Mouseover event handler */
  onMouseover?: (params: ChartEventParams) => void
  /** Mouseout event handler */
  onMouseout?: (params: ChartEventParams) => void
}
