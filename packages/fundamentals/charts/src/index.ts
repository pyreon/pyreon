/**
 * @pyreon/charts — Reactive ECharts bridge with auto lazy loading.
 *
 * Zero ECharts bytes in your bundle until a chart actually renders.
 * Chart types and components are detected from your config and
 * dynamically imported on demand.
 *
 * @example
 * ```tsx
 * import { Chart } from '@pyreon/charts'
 * import type { EChartsOption } from '@pyreon/charts'
 *
 * <Chart
 *   options={() => ({
 *     xAxis: { type: 'category', data: months() },
 *     yAxis: { type: 'value' },
 *     series: [{ type: 'bar', data: revenue() }],
 *     tooltip: { trigger: 'axis' },
 *   })}
 *   style="height: 400px"
 * />
 * ```
 */

export { Chart } from './chart-component'
// Chart configuration types
// Re-exported ECharts types for consumer convenience —
// consumers get full autocomplete without importing echarts directly
export type {
  // Series option types
  BarSeriesOption,
  BoxplotSeriesOption,
  CandlestickSeriesOption,
  ChartEventParams,
  ChartProps,
  ComposeOption,
  DataZoomComponentOption,
  ECharts,
  // Core option types
  EChartsOption,
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
  SetOptionOpts,
  SunburstSeriesOption,
  // Component option types
  TitleComponentOption,
  ToolboxComponentOption,
  TooltipComponentOption,
  TreemapSeriesOption,
  TreeSeriesOption,
  UseChartConfig,
  UseChartResult,
  VisualMapComponentOption,
} from './types'
export { useChart } from './use-chart'
