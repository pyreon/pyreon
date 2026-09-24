/**
 * @pyreon/charts/option — `<OptionChart>`: an ECharts option object, drawn by
 * Pyreon's own engine. No ECharts in your bundle.
 *
 * For moving an existing ECharts chart over as-is. Coverage of the option
 * format is partial and measured; unsupported keys warn by path. New charts
 * are nicer to write with `<Chart>` from `@pyreon/charts`.
 */
export { OptionChart } from './engine/OptionChart'
export type { OptionChartProps, OptionHit } from './engine/OptionChart'
export { optionToSvg } from './engine/option'
export type { EChartsOption, OptionToSvgOptions, OptionWarning } from './engine/option'
export { registerTheme } from './engine/theme-registry'
export type { ThemeDefinition } from './engine/theme-registry'
export { registerChartTransform, unregisterChartTransform } from './engine/option-layer'
export type { ChartTransform } from './engine/option-layer'
