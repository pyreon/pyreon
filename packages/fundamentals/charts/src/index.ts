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

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/charts
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export { Chart } from './chart-component'
// Escape hatch: the lazy-loaded `echarts/core` module — everything the
// wrapper doesn't model (`registerMap` for map charts, `registerTheme`,
// `echarts.connect`/`disconnect`, `getInstanceByDom`, …).
//
// @example map charts (README "Map charts" recipe):
// ```ts
// import { getCore } from '@pyreon/charts'
// const core = await getCore()
// core.registerMap('world', worldGeoJson)
// ```
export { connect, getCore } from './loader'
// Chart configuration types
// Re-exported ECharts types for consumer convenience —
// consumers get full autocomplete without importing echarts directly
export type {
  // Series option types
  BarSeriesOption,
  BoxplotSeriesOption,
  CandlestickSeriesOption,
  ChartEventHandler,
  ChartEventParams,
  ChartProps,
  ChartTheme,
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
