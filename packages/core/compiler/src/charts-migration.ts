/**
 * The `@pyreon/charts` entry-point migration, as data + one pure planner.
 *
 * The package's main entry became its own engine: `<Chart>` (was `<Plot>` at
 * `/plot`) with marks, and the ECharts wrapper moved to `/echarts` as
 * `<EChart>`. Every rename is mechanical, so `migratePyreonCode` applies it
 * and `detectPyreonPatterns` reports it (`charts-legacy-import`).
 *
 * The name tables below are a SNAPSHOT of the charts package's entries; the
 * sync test (`tests/charts-migration.test.ts`) parses the package's real entry
 * files and fails the moment one of them drifts from the table.
 */
import ts from 'typescript'

/** What `@pyreon/charts` (the main entry) exports. */
export const CHARTS_ROOT_NAMES: ReadonlySet<string> = new Set(
  'Arc ArcProps Area Axis AxisProps Band BandProps Bar BarProps BoxplotChart BoxplotChartProps BoxplotOptions BrushRange CalendarChart CalendarChartProps CalendarOptions CalendarValue Candle CandleOptions CandleProps Cell CellProps Channel Chart ChartAction ChartHandle ChartLink ChartProps ChartTheme ChartThemeMode ChartThemeProvider ChartThemeProviderProps ChordChart ChordChartProps ChordLink ChordNode ChordOptions Dot DotProps Double FiveNumber Formatter FunnelOptions GanttChart GanttChartProps GanttDependency GanttOptions GanttTask GaugeChart GaugeChartProps GaugeOptions GeoHeatPoint GeoJson GeoOptions GeoOverlayOptions GeoOverlayPath GeoOverlayPoint GeoPie GeoShape GeoTrail GeoValue GraphChart GraphChartProps GraphLink GraphNode GraphOptions Histogram HistogramProps Label LabelProps Legend LegendProps Line LocalePack MapChart MapChartProps MapChartValues MarkProps ParallelAxis ParallelChart ParallelChartProps ParallelOptions ParallelRow PolarChart PolarChartProps PolarHit PolarOptions PolarSeries RadarAxis RadarChart RadarChartProps RadarHitIndex RadarOptions RadarSeries RiverChart RiverChartProps RiverOptions RiverSeries Rule RuleProps SankeyChart SankeyChartProps SankeyHit SankeyHitIndex SankeyLink SankeyNode SankeyOptions Scale ScaleProps SingleAxisChart SingleAxisChartProps SingleAxisOptions SingleAxisPoint StackedArea Stage StageProps SunburstChart SunburstChartProps SunburstOptions Toolbox ToolboxProps Tooltip TooltipProps TreeChart TreeChartProps TreeNode TreeOptions TreemapChart TreemapChartProps TreemapOptions Zoom ZoomProps ZoomWindow chartThemes compact createChartHandle createChartLink currency fixed geoShapes palettes percent plain registerLocale registerMap systemChartMode useChartTheme'.split(' '),
)

/** What `@pyreon/charts/option` exports. */
export const CHARTS_OPTION_NAMES: ReadonlySet<string> = new Set(
  'ChartTransform EChartsOption OptionChart OptionChartProps OptionHit OptionToSvgOptions OptionWarning ThemeDefinition optionToSvg registerChartTransform registerTheme unregisterChartTransform'.split(' '),
)

/** What `@pyreon/charts/svg` exports. */
export const CHARTS_SVG_NAMES: ReadonlySet<string> = new Set(
  'BoxplotToSvgOptions CalendarToSvgOptions CandlestickToSvgOptions ChartToSvgOptions ChordToSvgOptions FunnelToSvgOptions GanttToSvgOptions GaugeToSvgOptions GeoPointsToSvgOptions GeoToSvgOptions GraphToSvgOptions HeatmapToSvgOptions ParallelToSvgOptions PieToSvgOptions PolarToSvgOptions RadarToSvgOptions RiverToSvgOptions SankeyToSvgOptions SingleAxisToSvgOptions SunburstToSvgOptions TreeToSvgOptions TreemapToSvgOptions boxplotToSvg calendarToSvg candlestickToSvg chartToSvg chordToSvg funnelToSvg ganttToSvg gaugeToSvg geoPointsToSvg geoToSvg graphToSvg heatmapToSvg parallelToSvg pieToSvg polarToSvg radarToSvg riverToSvg sankeyToSvg singleAxisToSvg sunburstToSvg treeToSvg treemapToSvg'.split(' '),
)

/** What `@pyreon/charts/echarts` exports (the ECharts wrapper). */
export const CHARTS_ECHARTS_NAMES: ReadonlySet<string> = new Set(
  'BarSeriesOption BoxplotSeriesOption CandlestickSeriesOption ChartEventHandler ChartEventParams ComposeOption DataZoomComponentOption EChart EChartProps EChartTheme ECharts EChartsOption FunnelSeriesOption GaugeSeriesOption GraphSeriesOption GridComponentOption HeatmapSeriesOption LegendComponentOption LineSeriesOption PieSeriesOption RadarSeriesOption SankeySeriesOption ScatterSeriesOption SetOptionOpts SunburstSeriesOption TitleComponentOption ToolboxComponentOption TooltipComponentOption TreeSeriesOption TreemapSeriesOption UseChartConfig UseChartResult VisualMapComponentOption connect getCore useChart'.split(' '),
)

/** Names that were the ECharts wrapper's when it owned the main entry. */
const OLD_ROOT_ECHARTS_RENAMES: Readonly<Record<string, string>> = { Chart: 'EChart', ChartProps: 'EChartProps', ChartTheme: 'EChartTheme' }

/** Engine renames: the grammar component and the tooltip mark. */
const ENGINE_RENAMES: Readonly<Record<string, string>> = { Plot: 'Chart', PlotProps: 'ChartProps', Tip: 'Tooltip', TipProps: 'TooltipProps' }

const ROOT = '@pyreon/charts'
const MOVED_SUBPATHS: Readonly<Record<string, string>> = {
  '@pyreon/charts/manual': '@pyreon/charts/echarts/manual',
  '@pyreon/charts/vite': '@pyreon/charts/echarts/vite',
}

export interface ChartsImportPlan {
  /** The import declaration being replaced. */
  node: ts.ImportDeclaration
  /** The replacement import statement(s). */
  replacement: string
  /** Local bindings to rename throughout the file: old → new. */
  renames: ReadonlyMap<string, string>
}

/**
 * Whether the file uses the OLD root `Chart` — the ECharts wrapper — rather
 * than the new grammar `<Chart>`: an `options` attribute on a `<Chart>`, or a
 * name only the wrapper ever exported, imported from the same statement.
 */
function usesEChartsRoot(sf: ts.SourceFile, decl: ts.ImportDeclaration): boolean {
  const named = decl.importClause?.namedBindings
  if (named !== undefined && ts.isNamedImports(named)) {
    for (const el of named.elements) {
      const name = (el.propertyName ?? el.name).text
      if (CHARTS_ECHARTS_NAMES.has(name) && !CHARTS_ROOT_NAMES.has(name)) return true
    }
  }
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

function targetOf(name: string): string {
  if (CHARTS_ROOT_NAMES.has(name)) return ROOT
  if (CHARTS_OPTION_NAMES.has(name)) return `${ROOT}/option`
  if (CHARTS_SVG_NAMES.has(name)) return `${ROOT}/svg`
  if (CHARTS_ECHARTS_NAMES.has(name)) return `${ROOT}/echarts`
  return `${ROOT}/engine`
}

/**
 * Plan the rewrite of every `@pyreon/charts` import that the entry-point
 * change broke. An import that is already correct gets no plan.
 */
export function planChartsImports(sf: ts.SourceFile): ChartsImportPlan[] {
  const plans: ChartsImportPlan[] = []
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const src = stmt.moduleSpecifier.text
    const isPlot = src === `${ROOT}/plot`
    const moved = MOVED_SUBPATHS[src]
    if (src !== ROOT && !isPlot && moved === undefined) continue
    const clause = stmt.importClause
    const named = clause?.namedBindings
    if (clause === undefined || named === undefined || !ts.isNamedImports(named) || clause.name !== undefined) continue
    const echartsRoot = src === ROOT && usesEChartsRoot(sf, stmt)
    const q = stmt.moduleSpecifier.getText(sf)[0] ?? "'"
    const groups = new Map<string, string[]>()
    const renames = new Map<string, string>()
    let changed = isPlot || moved !== undefined
    for (const el of named.elements) {
      const imported = (el.propertyName ?? el.name).text
      const local = el.name.text
      let newName: string
      let target: string
      if (moved !== undefined) {
        newName = OLD_ROOT_ECHARTS_RENAMES[imported] ?? imported
        target = moved
      } else if (echartsRoot && (OLD_ROOT_ECHARTS_RENAMES[imported] !== undefined || (CHARTS_ECHARTS_NAMES.has(imported) && !CHARTS_ROOT_NAMES.has(imported)))) {
        newName = OLD_ROOT_ECHARTS_RENAMES[imported] ?? imported
        target = `${ROOT}/echarts`
      } else {
        newName = ENGINE_RENAMES[imported] ?? imported
        target = targetOf(newName)
      }
      if (target !== src || newName !== imported) changed = true
      const aliased = el.propertyName !== undefined
      if (newName !== imported && !aliased) renames.set(local, newName)
      const spec = (el.isTypeOnly ? 'type ' : '') + (aliased ? `${newName} as ${local}` : newName)
      const list = groups.get(target) ?? []
      list.push(spec)
      groups.set(target, list)
    }
    if (!changed) continue
    const typeOnly = clause.isTypeOnly ? 'type ' : ''
    const replacement = [...groups]
      .map(([target, specs]) => `import ${typeOnly}{ ${specs.join(', ')} } from ${q}${target}${q}`)
      .join('\n')
    plans.push({ node: stmt, replacement, renames })
  }
  return plans
}

/**
 * Every identifier a rename applies to: references to the imported local
 * binding — expressions, JSX tag names, type references — but never a
 * property name, an object-literal key, a JSX attribute name or the import
 * specifier itself (which the replacement statement already covers).
 */
export function renameSites(sf: ts.SourceFile, renames: ReadonlyMap<string, string>): { start: number; end: number; replacement: string }[] {
  if (renames.size === 0) return []
  const out: { start: number; end: number; replacement: string }[] = []
  const walk = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n)) return
    if (ts.isIdentifier(n) && renames.has(n.text)) {
      const p = n.parent
      const isProperty =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isQualifiedName(p) && p.right === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isJsxAttribute(p) && p.name === n) ||
        (ts.isPropertySignature(p) && p.name === n) ||
        (ts.isMethodDeclaration(p) && p.name === n) ||
        ts.isShorthandPropertyAssignment(p)
      if (!isProperty) out.push({ start: n.getStart(sf), end: n.getEnd(), replacement: renames.get(n.text)! })
    }
    ts.forEachChild(n, walk)
  }
  walk(sf)
  return out
}
