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
export { CandlestickChart } from './engine/CandlestickChart'
export type { CandlestickChartProps } from './engine/CandlestickChart'
export { ohlcExtent, renderCandles } from './engine/candlestick'
export type { CandleOptions, Ohlc } from './engine/candlestick'
export { HeatmapChart } from './engine/HeatmapChart'
export type { HeatmapChartProps } from './engine/HeatmapChart'

// Heat geometry — usable standalone, like the rest of the engine.
export { buildHeatGrid, colorRamp, HEAT_RAMP, renderHeat } from './engine/heat'
export type { HeatCell, HeatGrid, HeatmapOptions } from './engine/heat'
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
  bandTicksY,
  computeLayout,
  hitBar,
  hitNearestX,
  layoutBars,
  layoutBarsH,
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
export { RadarChart } from './engine/RadarChart'
export type { RadarChartProps } from './engine/RadarChart'

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

// Server-side SVG for the whole family — pure, measureApprox by default
export {
  candlestickToSvg,
  gaugeToSvg,
  heatmapToSvg,
  pieToSvg,
  radarToSvg,
} from './engine/family-svg'
export type {
  CandlestickToSvgOptions,
  GaugeToSvgOptions,
  HeatmapToSvgOptions,
  PieToSvgOptions,
  RadarToSvgOptions,
} from './engine/family-svg'

// ---------------------------------------------------------------------------
// Interaction + component geometry (dataZoom, brush, title)
export { brushRange, clampWindow, isFullWindow, panWindow, sliceRange, zoomWindow } from './engine/zoom'
export type { ZoomWindow } from './engine/zoom'
export { renderTitle } from './engine/title'

// Hierarchy families — one TreeNode shape shared by treemap / sunburst / tree
export { hitTreemap, layoutTreemap, nodeValue, renderTreemap, treemapToSvg } from './engine/treemap'
export type { TreeNode, TreemapCell, TreemapOptions, TreemapToSvgOptions } from './engine/treemap'
export { TreemapChart } from './engine/TreemapChart'
export type { TreemapChartProps } from './engine/TreemapChart'
export { hitSunburst, layoutSunburst, renderSunburst, sunburstToSvg, treeDepth } from './engine/sunburst'
export type { SunburstArc, SunburstOptions, SunburstToSvgOptions } from './engine/sunburst'
export { SunburstChart } from './engine/SunburstChart'
export type { SunburstChartProps } from './engine/SunburstChart'
export { hitTree, layoutTree, linkPoints, renderTree, treeToSvg } from './engine/tree'
export type { TreeLayout, TreeLayoutNode, TreeLink, TreeOptions, TreeOrient, TreeToSvgOptions } from './engine/tree'
export { TreeChart } from './engine/TreeChart'
export type { TreeChartProps } from './engine/TreeChart'

// Relational families
export { hitSankey, layoutSankey, renderSankey, ribbonPoints, sankeyToSvg } from './engine/sankey'
export type { SankeyHit, SankeyLayout, SankeyLayoutLink, SankeyLayoutNode, SankeyLink, SankeyNode, SankeyOptions, SankeyToSvgOptions } from './engine/sankey'
export { SankeyChart } from './engine/SankeyChart'
export type { SankeyChartProps } from './engine/SankeyChart'
export { graphToSvg, hitGraph, layoutGraph, renderGraph } from './engine/graph'
export type { GraphLayout, GraphLayoutLink, GraphLayoutNode, GraphLink, GraphNode, GraphOptions, GraphToSvgOptions } from './engine/graph'
export { GraphChart } from './engine/GraphChart'
export type { GraphChartProps } from './engine/GraphChart'

// Funnel + boxplot
export { funnelToSvg, hitFunnel, layoutFunnel, renderFunnel } from './engine/funnel'
export type { FunnelOptions, FunnelStage } from './engine/funnel'
export { FunnelChart } from './engine/FunnelChart'

// Coordinates — calendar, parallel, polar, single axis, theme river, geo
export { calendarDomain, calendarToSvg, formatIsoDate, hitCalendar, layoutCalendar, parseIsoDate, renderCalendar } from './engine/calendar'
export type { CalendarCell, CalendarLayout, CalendarOptions, CalendarToSvgOptions } from './engine/calendar'
export { CalendarChart } from './engine/CalendarChart'
export type { CalendarChartProps } from './engine/CalendarChart'
export { hitParallel, layoutParallel, lineRuns, parallelToSvg, renderParallel } from './engine/parallel'
export type { ParallelAxis, ParallelLayout, ParallelLine, ParallelOptions, ParallelRow, ParallelToSvgOptions } from './engine/parallel'
export { ParallelChart } from './engine/ParallelChart'
export type { ParallelChartProps } from './engine/ParallelChart'
export { hitPolar, layoutPolar, polarToSvg, renderPolar } from './engine/polar'
export type { PolarAxes, PolarHit, PolarLayout, PolarOptions, PolarPoint, PolarSector, PolarSeries, PolarToSvgOptions } from './engine/polar'
export { PolarChart } from './engine/PolarChart'
export type { PolarChartProps } from './engine/PolarChart'
export { hitSingleAxis, layoutSingleAxis, renderSingleAxis, singleAxisToSvg } from './engine/single-axis'
export type { SingleAxisLayout, SingleAxisOptions, SingleAxisPoint, SingleAxisSpec, SingleAxisToSvgOptions } from './engine/single-axis'
export { hitRiver, layerPolygon, layoutRiver, renderRiver, riverToSvg, smoothPoints } from './engine/river'
export type { RiverLayer, RiverLayout, RiverOptions, RiverSeries, RiverToSvgOptions } from './engine/river'
export { RiverChart } from './engine/RiverChart'
export type { RiverChartProps } from './engine/RiverChart'
export { geoDomain, geoToSvg, getMap, hitGeo, layoutGeo, listMaps, projectLonLat, registerMap, renderGeo } from './engine/geo'
export type { GeoFeature, GeoJson, GeoLayout, GeoOptions, GeoProjection, GeoRegion, GeoToSvgOptions } from './engine/geo'
export { MapChart } from './engine/MapChart'
export type { MapChartProps } from './engine/MapChart'
export { geoPointRadii, geoPointsToSvg, hitGeoPoint, renderGeoPaths, renderGeoPoints } from './engine/geo-points'
export type { GeoPath, GeoPoint, GeoPointsOptions, GeoPointsToSvgOptions } from './engine/geo-points'

// ECharts option compatibility — the facade, its layers, and the registries
export { compileOption, optionToSvg, planOption } from './engine/option'
export type { CompileOptions, CompiledOption, EChartsOption, OptionPlan, OptionToSvgOptions, OptionWarning } from './engine/option'
export { compileFamily, familyToSvg, isFamilyOption } from './engine/option-family'
export type { CompiledFamily, FamilyPlan } from './engine/option-family'
export { appendGraphicLayer, applyTransforms, graphicCommands, readSource, resolveDataset, svgSize } from './engine/option-layer'
export { domainFromSeries, renderVisualMap, visualMapCommands, visualMapSpec } from './engine/visual-map'
export type { VisualMapPiece, VisualMapSpec } from './engine/visual-map'
export { customCommands, customExtents } from './engine/custom-series'
export type { CustomRenderApi, CustomRenderItem, CustomRenderParams, CustomSeriesPlan } from './engine/custom-series'
export { getTheme, listThemes, registerTheme, resolveTheme } from './engine/theme-registry'
export type { ResolvedTheme, ThemeDefinition } from './engine/theme-registry'
export { dateFormatter, getLocale, numberFormatter, registerLocale } from './engine/locale'
export type { LocalePack } from './engine/locale'
export { ganttDurationDays, ganttTicks, ganttToSvg, hitGantt, layoutGantt, renderGantt } from './engine/gantt'
export type { GanttDependency, GanttLane, GanttLayout, GanttOptions, GanttRow, GanttTask, GanttTick, GanttTickUnit, GanttToSvgOptions } from './engine/gantt'
export { GanttChart } from './engine/GanttChart'
export type { GanttChartProps } from './engine/GanttChart'
export { createChartLink } from './engine/link'
export type { ChartLink } from './engine/link'
export { sonifyValues, valueToHz } from './engine/sonify'
export type { Sonification, SonifyOptions } from './engine/sonify'
