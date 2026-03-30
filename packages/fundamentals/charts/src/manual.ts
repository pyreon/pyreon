/**
 * @pyreon/charts/manual — Manual registration entry point.
 *
 * Use this instead of the default entry when you want full tree-shaking
 * control. You explicitly import and register the ECharts modules your
 * app needs — the bundler eliminates everything else.
 *
 * @example
 * ```tsx
 * import { useChart, Chart, use } from '@pyreon/charts/manual'
 * import { BarChart, LineChart } from 'echarts/charts'
 * import { GridComponent, TooltipComponent } from 'echarts/components'
 * import { CanvasRenderer } from 'echarts/renderers'
 *
 * // Register once at app startup
 * use(BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer)
 *
 * // Same API as default entry
 * <Chart
 *   options={() => ({
 *     series: [{ type: 'bar', data: values() }],
 *   })}
 *   style="height: 400px"
 * />
 * ```
 */

export { Chart } from "./chart-component";
export { manualUse as use } from "./loader";
export type { ChartProps, EChartsOption, UseChartConfig, UseChartResult } from "./types";
export { useChart } from "./use-chart";
