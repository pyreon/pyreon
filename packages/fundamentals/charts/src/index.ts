/**
 * @pyreon/charts — charts on Pyreon's own engine, on the web, iOS and Android.
 *
 * `<Chart>` takes your rows and marks as children. Channels are field names,
 * checked against the row: `<Chart<Row>>` checks its own, and a mark given the
 * row type (`<Bar<Row> y="revenue">`) checks its own too. Axes, palette,
 * tooltip, the accessible data table and a spoken description come for free.
 *
 * @example
 * ```tsx
 * import { Chart, Bar, Line, Legend, Tooltip, currency } from '@pyreon/charts'
 *
 * <Chart data={sales} x="month">
 *   <Bar y="revenue" label="Revenue" />
 *   <Line y="target" label="Target" />
 *   <Axis y format={currency('EUR')} />
 *   <Tooltip /> <Legend />
 * </Chart>
 * ```
 *
 * This is the curated, stable surface. Other entries:
 * - `@pyreon/charts/svg` — `chartToSvg` and the family serializers, for SSR and export.
 * - `@pyreon/charts/engine` — every layout, hit test and draw-list builder; not covered by the stability promise.
 */

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/charts
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

// The chart and its marks.
export { Arc, Area, Axis, Band, Bar, Bollinger, Candle, Cell, Chart, Dot, Ema, Histogram, Label, Legend, Line, Rule, Scale, Sma, StackedArea, Stage, Toolbox, Tooltip, Trend, Zoom } from './engine/grammar'
export type { ArcProps, AverageProps, AxisProps, BandProps, BollingerProps, BarProps, CandleProps, CellProps, Channel, ChartProps, DotProps, HistogramProps, LabelProps, LegendProps, MarkProps, RuleProps, ScaleProps, StageProps, ToolboxProps, TooltipProps, TrendProps, ZoomProps } from './engine/grammar'

// A pie, a funnel, a heatmap and a candlestick are MARKS (<Arc>, <Stage>,
// <Cell>, <Candle>). The families below have no row-per-datum shape to be a
// mark of (a tree, a graph, flows between nodes, a single dial), so each is
// its own component.
export type { CandleOptions } from './engine/candlestick'
export type { FunnelOptions } from './engine/funnel'
export type { GaugeOptions } from './engine/arc'
export { BoxplotChart } from './engine/BoxplotChart'
export type { BoxplotChartProps } from './engine/BoxplotChart'
export { CalendarChart } from './engine/CalendarChart'
export type { CalendarChartProps } from './engine/CalendarChart'
export { ChordChart } from './engine/ChordChart'
export type { ChordChartProps } from './engine/ChordChart'
export { GanttChart } from './engine/GanttChart'
export type { GanttChartProps } from './engine/GanttChart'
export { GaugeChart } from './engine/PieChart'
export { gaugeDial } from './engine/dial'
export type { GaugeDialOptions, GaugeDialValue } from './engine/dial'
export type { DialSpec } from './engine/gauge-dial'
export type { GaugeChartProps } from './engine/PieChart'
export { GraphChart } from './engine/GraphChart'
export type { GraphChartProps } from './engine/GraphChart'
export { MapChart } from './engine/MapChart'
export type { MapChartProps, MapChartValues } from './engine/MapChart'
export { geoShapes, registerMap } from './engine/geo-web'
export type { GeoShape } from './engine/geo'
export type { GeoJson } from './engine/geo-web'
export { ParallelChart } from './engine/ParallelChart'
export type { ParallelChartProps } from './engine/ParallelChart'
export { PolarChart } from './engine/PolarChart'
export type { PolarChartProps } from './engine/PolarChart'
export { RadarChart } from './engine/RadarChart'
export type { RadarChartProps } from './engine/RadarChart'
export { RiverChart } from './engine/RiverChart'
export type { RiverChartProps } from './engine/RiverChart'
export { SankeyChart } from './engine/SankeyChart'
export type { SankeyChartProps } from './engine/SankeyChart'
export { SingleAxisChart } from './engine/SingleAxisChart'
export type { SingleAxisChartProps } from './engine/SingleAxisChart'
export { SunburstChart } from './engine/SunburstChart'
export type { SunburstChartProps } from './engine/SunburstChart'
export { TreeChart } from './engine/TreeChart'
export type { TreeChartProps } from './engine/TreeChart'
export { TreemapChart } from './engine/TreemapChart'
export type { TreemapChartProps } from './engine/TreemapChart'
export type { TreeNode, TreemapOptions } from './engine/treemap'

// The data and option types those components take, and what they report.
export type { BoxplotOptions, FiveNumber } from './engine/boxplot'
export type { CalendarOptions, CalendarValue } from './engine/calendar'
export type { ChordLink, ChordNode, ChordOptions } from './engine/chord'
export type { GanttDependency, GanttOptions, GanttTask } from './engine/gantt'
export type { GeoOptions, GeoValue } from './engine/geo'
export type { GeoHeatPoint, GeoOverlayOptions, GeoOverlayPath, GeoOverlayPoint, GeoPie, GeoTrail } from './engine/geo-overlay'
export type { GraphLink, GraphNode, GraphOptions } from './engine/graph'
export type { ParallelAxis, ParallelOptions } from './engine/parallel'
export type { ParallelRow } from './engine/parallel-web'
export type { PolarOptions, PolarSeries } from './engine/polar'
export type { PolarHit } from './engine/polar-hit'
export type { RadarAxis, RadarHitIndex, RadarOptions, RadarSeries } from './engine/radar'
export type { RiverOptions, RiverSeries } from './engine/river'
export type { SankeyHitIndex, SankeyLink, SankeyNode, SankeyOptions } from './engine/sankey'
export type { SankeyHit } from './engine/sankey-hit'
export type { SingleAxisOptions, SingleAxisPoint } from './engine/single-axis'
export type { SunburstOptions } from './engine/sunburst'
export type { TreeOptions } from './engine/tree'
export type { BrushRange } from './engine/brush'
export { visualMap } from './engine/visual-map'
export type { VisualMapOptions, VisualMapPiece, VisualMapSpec } from './engine/visual-map'
export type { CandlestickZoom } from './engine/CandlestickChart'
export type { ZoomWindow } from './engine/zoom'
export type { Double } from './engine/types'

// Line and area curves — functions, so an unused one tree-shakes: `<Line y curve={smooth} />`.
export { smooth, step } from './engine/curve'

// Formatters: one value feeds the axis, the tooltip and the accessible table.
export { compact, currency, fixed, percent, plain } from './engine/format'
export type { Formatter } from './engine/format'
export { registerLocale } from './engine/locale'
export type { LocalePack } from './engine/locale'

// Theme.
export { ChartThemeProvider, chartThemes, useChartTheme } from './engine/theme'
export type { ChartThemeMode, ChartThemeProviderProps } from './engine/theme'
export { palettes } from './engine/palettes'
export type { ChartTheme } from './engine/render'

// Linking and imperative control.
export { createChartHandle, createChartLink } from './engine/link'
export type { ChartAction, ChartHandle, ChartLink } from './engine/link'
