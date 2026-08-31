// `@pyreon/charts/plot` — Pyreon's own charting engine.
//
// Distinct from the package's default export, which bridges ECharts. This one
// owns no third-party engine: the geometry is pure TypeScript over plain data,
// and the platform half is a short backend that executes a flat draw list. That
// is what makes it the path to native rendering, and what makes it
// tree-shakeable — every mark and every module here is an imported binding, so
// a bundler drops whatever you never import. A bar chart pays nothing for the
// radial trigonometry, the decimation, or the time scales.

export { PlotChart } from './engine/Chart'
export type { PlotChartProps } from './engine/Chart'
export { GaugeChart, PieChart } from './engine/PieChart'
export type { GaugeChartProps, PieChartProps } from './engine/PieChart'

// Marks
export {
  area,
  bars,
  bubble,
  groupedBars,
  line,
  points,
  resolveCategories,
  resolveMarks,
  stackedBars,
} from './engine/marks'
export type { Accessor, BubbleOptions, Mark, MarkOptions } from './engine/marks'

// Curves — imported bindings, like the marks, so an unused curve tree-shakes.
export { smooth, step } from './engine/curve'

// Core render + layout
export { defaultTheme, layoutChart, renderChart, resolveYDomain, seriesMaxLength } from './engine/render'
export type { Annotation, ChartSpec, ChartTheme, Series } from './engine/render'
export {
  bandTicks,
  computeLayout,
  hitBar,
  hitNearestX,
  layoutBars,
  layoutSeriesPoints,
  layoutSeriesPointsAt,
} from './engine/layout'
export type { Gutters, LayoutConfig, PlotLayout } from './engine/layout'

// Scales
export { extent, formatTick, makeTicks, niceDomain, niceStep, scaleLinear } from './engine/scale'
export { formatTime, logTicks, scaleLog, timeTicks } from './engine/scale-extra'

// Radial family
export { arcPolygon, fitCircle, hitArc, layoutArcs, pointOnCircle, renderGauge, renderPie } from './engine/arc'
export type { ArcGeometry, GaugeOptions, PieOptions, Slice } from './engine/arc'
export { radarAngles, radarPolygon, renderRadar, withAlpha } from './engine/radar'
export type { RadarAxis, RadarOptions, RadarSeries } from './engine/radar'

// Stacked / grouped / scatter
export { layoutGroupedBars, layoutScatter, layoutStackedBars, stackHasNegatives, stackedExtent } from './engine/stack'
export type { StackSegment } from './engine/stack'

// Legend + tooltip
export { renderLegend } from './engine/legend'
export type { LegendEntry, LegendLayout, LegendOptions } from './engine/legend'
export { placeTooltip, tooltipAt, tooltipLines } from './engine/tooltip'
export type { TooltipContent, TooltipRow } from './engine/tooltip'

// Formatting
export { compact, currency, fixed, percent, plain } from './engine/format'
export type { Formatter } from './engine/format'

// Accessibility
export { chartTable, describeChart } from './engine/a11y'
export type { A11yInput, A11ySeries, A11yTable } from './engine/a11y'

// Large-series decimation
export { lttb, minMaxBuckets } from './engine/decimate'

// Web backend — canvas
export { canvasMeasure, paint, prepareCanvas } from './engine/canvas-web'

// SVG backend — a pure DrawCmd[] → string, so it runs on a server as readily
// as in a browser. `chartToSvg` is the one-call form.
export { chartToSvg } from './engine/svg-chart'
export type { ChartToSvgOptions } from './engine/svg-chart'
export { measureApprox, renderSvg, svgCommand } from './engine/svg'
export type { SvgOptions } from './engine/svg'

export type { Domain, DrawCmd, Double, MeasureText, Pt, Rect, Tick } from './engine/types'
