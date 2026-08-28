// `@pyreon/charts/plot` — Pyreon's own charting engine.
//
// Distinct from the package's default export, which bridges ECharts. This one
// owns no third-party engine: the geometry is pure TypeScript and the platform
// half is a short backend that executes a flat draw list. That is what makes it
// the path to native rendering, and what makes it tree-shakeable — every mark
// is an imported binding, so a bundler drops the ones you never import.

export { PlotChart } from './engine/Chart'
export type { PlotChartProps } from './engine/Chart'

export { area, bars, line, points, resolveCategories, resolveMarks } from './engine/marks'
export type { Accessor, Mark, MarkOptions } from './engine/marks'

export { defaultTheme, layoutChart, renderChart, resolveYDomain, seriesMaxLength } from './engine/render'
export type { ChartSpec, ChartTheme, Series } from './engine/render'

export { bandTicks, computeLayout, hitBar, hitNearestX, layoutBars, layoutSeriesPoints } from './engine/layout'
export type { Gutters, LayoutConfig, PlotLayout } from './engine/layout'

export { extent, formatTick, makeTicks, niceDomain, niceStep, scaleLinear } from './engine/scale'

export { canvasMeasure, paint, prepareCanvas } from './engine/canvas-web'

export type { Domain, DrawCmd, Double, MeasureText, Pt, Rect, Tick } from './engine/types'
