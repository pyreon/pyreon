/**
 * `@pyreon/charts` 0.51 → 0.52: the ECharts wrapper is gone.
 *
 * In 0.51, `@pyreon/charts` WAS a wrapper around the ECharts library:
 * `<Chart options>`, `useChart`, and the `/manual`, `/vite` and `/webview`
 * entries. 0.52 replaces it with Pyreon's own engine — `<Chart>` with mark
 * children — and removes the wrapper outright. An ECharts option has no
 * mechanical translation to marks, so this is DETECTED, not rewritten:
 * `detectPyreonPatterns` reports `charts-legacy-import` with the shape to
 * move to, and `migratePyreonCode` leaves the code alone.
 *
 * The root name table is a SNAPSHOT of the charts package's entry; the sync
 * test (`tests/charts-migration.test.ts`) parses the package's real entry files
 * and fails the moment one of them drifts from the table.
 */
import ts from 'typescript'

/** What `@pyreon/charts` (the main entry) exports. */
export const CHARTS_ROOT_NAMES: ReadonlySet<string> = new Set(
  'Arc ArcProps Area AverageProps Axis AxisProps Band BandProps Bar BarProps Bollinger BollingerProps BoxplotChart BoxplotChartProps BoxplotOptions BrushRange CalendarChart CalendarChartProps CalendarOptions CalendarValue Candle CandleOptions CandleProps CandlestickZoom Cell CellProps Channel Chart ChartAction ChartHandle ChartLink ChartProps ChartTheme ChartThemeMode ChartThemeProvider ChartThemeProviderProps ChordChart ChordChartProps ChordLink ChordNode ChordOptions DialSpec Dot DotProps Double Ema FiveNumber Formatter FunnelOptions GanttChart GanttChartProps GanttDependency GanttOptions GanttTask GaugeChart GaugeChartProps GaugeDialOptions GaugeDialValue GaugeOptions GeoHeatPoint GeoJson GeoOptions GeoOverlayOptions GeoOverlayPath GeoOverlayPoint GeoPie GeoShape GeoTrail GeoValue GraphChart GraphChartProps GraphLink GraphNode GraphOptions Histogram HistogramProps Label LabelProps Legend LegendProps Line LocalePack MapChart MapChartProps MapChartValues MarkProps ParallelAxis ParallelChart ParallelChartProps ParallelOptions ParallelRow PolarChart PolarChartProps PolarHit PolarOptions PolarSeries RadarAxis RadarChart RadarChartProps RadarHitIndex RadarOptions RadarSeries RiverChart RiverChartProps RiverOptions RiverSeries Rule RuleProps SankeyChart SankeyChartProps SankeyHit SankeyHitIndex SankeyLink SankeyNode SankeyOptions Scale ScaleProps SingleAxisChart SingleAxisChartProps SingleAxisOptions SingleAxisPoint Sma StackedArea Stage StageProps SunburstChart SunburstChartProps SunburstOptions Toolbox ToolboxProps Tooltip TooltipProps TreeChart TreeChartProps TreeNode TreeOptions TreemapChart TreemapChartProps TreemapOptions Trend TrendProps VisualMapOptions VisualMapPiece VisualMapSpec Zoom ZoomProps ZoomWindow chartThemes compact createChartHandle createChartLink currency fixed gaugeDial geoShapes palettes percent plain registerLocale registerMap smooth step useChartTheme visualMap'.split(' '),
)

/** What `@pyreon/charts/svg` exports. */
export const CHARTS_SVG_NAMES: ReadonlySet<string> = new Set(
  'BoxplotToSvgOptions CalendarToSvgOptions CandlestickToSvgOptions ChartToSvgOptions ChordToSvgOptions FunnelToSvgOptions GanttToSvgOptions GaugeToSvgOptions GeoPointsToSvgOptions GeoToSvgOptions GraphToSvgOptions HeatmapToSvgOptions ParallelToSvgOptions PieToSvgOptions PolarToSvgOptions RadarToSvgOptions RiverToSvgOptions SankeyToSvgOptions SingleAxisToSvgOptions SunburstToSvgOptions TreeToSvgOptions TreemapToSvgOptions boxplotToSvg calendarToSvg candlestickToSvg chartToSvg chordToSvg funnelToSvg ganttToSvg gaugeToSvg geoPointsToSvg geoToSvg graphToSvg heatmapToSvg parallelToSvg pieToSvg polarToSvg radarToSvg riverToSvg sankeyToSvg singleAxisToSvg sunburstToSvg treeToSvg treemapToSvg'.split(' '),
)

/** What 0.51's `@pyreon/charts` main entry exported — the ECharts wrapper. */
export const CHARTS_051_WRAPPER_NAMES: ReadonlySet<string> = new Set(
  'BarSeriesOption BoxplotSeriesOption CandlestickSeriesOption Chart ChartEventHandler ChartEventParams ChartProps ChartTheme ComposeOption DataZoomComponentOption ECharts EChartsOption FunnelSeriesOption GaugeSeriesOption GraphSeriesOption GridComponentOption HeatmapSeriesOption LegendComponentOption LineSeriesOption PieSeriesOption RadarSeriesOption SankeySeriesOption ScatterSeriesOption SetOptionOpts SunburstSeriesOption TitleComponentOption ToolboxComponentOption TooltipComponentOption TreeSeriesOption TreemapSeriesOption UseChartConfig UseChartResult VisualMapComponentOption connect getCore useChart'.split(' '),
)

const ROOT = '@pyreon/charts'
/** The 0.51 entries that no longer exist. */
const REMOVED_SUBPATHS: ReadonlySet<string> = new Set([`${ROOT}/manual`, `${ROOT}/vite`, `${ROOT}/webview`])

export interface ChartsLegacyImport {
  /** The import declaration that still targets the removed ECharts wrapper. */
  node: ts.ImportDeclaration
  /** Why: a removed entry, or wrapper-only names from the main entry. */
  reason: string
}

/**
 * Whether the file renders the OLD root `<Chart>` — the ECharts wrapper — rather
 * than the grammar `<Chart>`: the wrapper took an `options` attribute, the
 * grammar never does.
 */
function rendersEChartsRoot(sf: ts.SourceFile): boolean {
  let found = false
  const walk = (n: ts.Node): void => {
    if (found) return
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName) && n.tagName.text === 'Chart') {
      for (const a of n.attributes.properties) if (ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === 'options') found = true
    }
    ts.forEachChild(n, walk)
  }
  walk(sf)
  return found
}

/** Every `@pyreon/charts` import that still targets the removed ECharts wrapper. */
export function findChartsLegacyImports(sf: ts.SourceFile): ChartsLegacyImport[] {
  const out: ChartsLegacyImport[] = []
  let rendersWrapper: boolean | undefined
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const src = stmt.moduleSpecifier.text
    if (REMOVED_SUBPATHS.has(src)) {
      out.push({ node: stmt, reason: `\`${src}\` no longer exists` })
      continue
    }
    if (src !== ROOT) continue
    const named = stmt.importClause?.namedBindings
    if (named === undefined || !ts.isNamedImports(named)) continue
    const gone = named.elements
      .map((el) => (el.propertyName ?? el.name).text)
      .filter((name) => CHARTS_051_WRAPPER_NAMES.has(name) && !CHARTS_ROOT_NAMES.has(name))
    if (gone.length > 0) {
      out.push({ node: stmt, reason: gone.map((n) => `\`${n}\``).join(', ') + (gone.length === 1 ? ' was' : ' were') + ' part of the removed ECharts wrapper' })
      continue
    }
    const importsChart = named.elements.some((el) => (el.propertyName ?? el.name).text === 'Chart')
    if (importsChart && (rendersWrapper ??= rendersEChartsRoot(sf))) {
      out.push({ node: stmt, reason: '`<Chart options>` is the removed ECharts wrapper; the new `<Chart>` takes rows and marks' })
    }
  }
  return out
}
