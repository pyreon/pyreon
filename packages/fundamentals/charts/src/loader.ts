/**
 * Lazy loading and auto-detection for ECharts modules.
 *
 * Maps config keys to ECharts modular imports. Only loads what's needed,
 * caches after first load. The echarts/core module itself is lazy-loaded
 * on first use — zero ECharts bytes until a chart actually renders.
 */

/**
 * Loose option type for internal module analysis.
 * The strict EChartsOption type is used at the consumer-facing API level.
 */
type LooseOption = Record<string, unknown> & {
  series?: unknown
}

type ModuleLoader = () => Promise<unknown>

/** The argument type that `echarts/core.use()` accepts. */
type EChartsUseArg = Parameters<typeof import('echarts/core').use>[0]

// ─── Chart type mapping ─────────────────────────────────────────────────────

const CHARTS: Record<string, ModuleLoader> = {
  bar: () => import('echarts/charts').then((m) => m.BarChart),
  line: () => import('echarts/charts').then((m) => m.LineChart),
  pie: () => import('echarts/charts').then((m) => m.PieChart),
  scatter: () => import('echarts/charts').then((m) => m.ScatterChart),
  radar: () => import('echarts/charts').then((m) => m.RadarChart),
  heatmap: () => import('echarts/charts').then((m) => m.HeatmapChart),
  treemap: () => import('echarts/charts').then((m) => m.TreemapChart),
  sunburst: () => import('echarts/charts').then((m) => m.SunburstChart),
  sankey: () => import('echarts/charts').then((m) => m.SankeyChart),
  funnel: () => import('echarts/charts').then((m) => m.FunnelChart),
  gauge: () => import('echarts/charts').then((m) => m.GaugeChart),
  graph: () => import('echarts/charts').then((m) => m.GraphChart),
  tree: () => import('echarts/charts').then((m) => m.TreeChart),
  boxplot: () => import('echarts/charts').then((m) => m.BoxplotChart),
  candlestick: () => import('echarts/charts').then((m) => m.CandlestickChart),
  parallel: () => import('echarts/charts').then((m) => m.ParallelChart),
  themeRiver: () => import('echarts/charts').then((m) => m.ThemeRiverChart),
  effectScatter: () => import('echarts/charts').then((m) => m.EffectScatterChart),
  lines: () => import('echarts/charts').then((m) => m.LinesChart),
  pictorialBar: () => import('echarts/charts').then((m) => m.PictorialBarChart),
  custom: () => import('echarts/charts').then((m) => m.CustomChart),
  map: () => import('echarts/charts').then((m) => m.MapChart),
}

// ─── Component mapping ──────────────────────────────────────────────────────

// Multiple config keys can map to the same component (xAxis/yAxis → Grid)
const COMPONENTS: Record<string, ModuleLoader> = {
  grid: () => import('echarts/components').then((m) => m.GridComponent),
  xAxis: () => import('echarts/components').then((m) => m.GridComponent),
  yAxis: () => import('echarts/components').then((m) => m.GridComponent),
  polar: () => import('echarts/components').then((m) => m.PolarComponent),
  radar: () => import('echarts/components').then((m) => m.RadarComponent),
  geo: () => import('echarts/components').then((m) => m.GeoComponent),
  tooltip: () => import('echarts/components').then((m) => m.TooltipComponent),
  legend: () => import('echarts/components').then((m) => m.LegendComponent),
  toolbox: () => import('echarts/components').then((m) => m.ToolboxComponent),
  title: () => import('echarts/components').then((m) => m.TitleComponent),
  dataZoom: () => import('echarts/components').then((m) => m.DataZoomComponent),
  visualMap: () => import('echarts/components').then((m) => m.VisualMapComponent),
  timeline: () => import('echarts/components').then((m) => m.TimelineComponent),
  graphic: () => import('echarts/components').then((m) => m.GraphicComponent),
  brush: () => import('echarts/components').then((m) => m.BrushComponent),
  calendar: () => import('echarts/components').then((m) => m.CalendarComponent),
  dataset: () => import('echarts/components').then((m) => m.DatasetComponent),
  aria: () => import('echarts/components').then((m) => m.AriaComponent),
}

// Series-level features
const SERIES_FEATURES: Record<string, ModuleLoader> = {
  markPoint: () => import('echarts/components').then((m) => m.MarkPointComponent),
  markLine: () => import('echarts/components').then((m) => m.MarkLineComponent),
  markArea: () => import('echarts/components').then((m) => m.MarkAreaComponent),
}

// ─── Renderers ──────────────────────────────────────────────────────────────

const RENDERERS: Record<string, ModuleLoader> = {
  canvas: () => import('echarts/renderers').then((m) => m.CanvasRenderer),
  svg: () => import('echarts/renderers').then((m) => m.SVGRenderer),
}

// ─── Core loading ───────────────────────────────────────────────────────────

let coreModule: typeof import('echarts/core') | null = null
let corePromise: Promise<typeof import('echarts/core')> | null = null

/**
 * Lazily load echarts/core. Cached after first call.
 */
export async function getCore(): Promise<typeof import('echarts/core')> {
  if (coreModule) return coreModule
  if (!corePromise) {
    corePromise = import('echarts/core').then((m) => {
      coreModule = m
      return m
    })
  }
  return corePromise
}

/**
 * Get the cached core module (null if not yet loaded).
 */
export function getCoreSync(): typeof import('echarts/core') | null {
  return coreModule
}

// ─── Module registration ────────────────────────────────────────────────────

const registered = new Set<string>()
const inflight = new Map<string, Promise<void>>()

async function loadAndRegister(
  core: typeof import('echarts/core'),
  key: string,
  loader: ModuleLoader,
): Promise<void> {
  if (registered.has(key)) return
  if (inflight.has(key)) return inflight.get(key)

  const promise = loader().then((mod) => {
    core.use(mod as EChartsUseArg)
    registered.add(key)
    inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}

/**
 * Analyze an ECharts option object and dynamically import only the
 * required chart types, components, and renderer. All imports are
 * cached — subsequent calls with the same types are instant.
 */
export async function ensureModules(
  option: LooseOption,
  renderer: 'canvas' | 'svg' = 'canvas',
): Promise<typeof import('echarts/core')> {
  const core = await getCore()
  const loads: Promise<void>[] = []

  // Renderer (always needed)
  const rendererLoader = RENDERERS[renderer]
  if (rendererLoader) loads.push(loadAndRegister(core, `renderer:${renderer}`, rendererLoader))

  // Normalize series to array for analysis
  const rawSeries = option.series
  const seriesList: Record<string, unknown>[] = rawSeries
    ? ((Array.isArray(rawSeries) ? rawSeries : [rawSeries]) as Record<string, unknown>[])
    : []

  // Chart types from series[].type
  for (const s of seriesList) {
    const type = s.type as string | undefined
    const chartLoader = type ? CHARTS[type] : undefined
    if (chartLoader) {
      loads.push(loadAndRegister(core, `chart:${type}`, chartLoader))
    }
  }

  // Components from top-level config keys
  for (const key of Object.keys(option)) {
    const compLoader = COMPONENTS[key]
    if (compLoader) {
      loads.push(loadAndRegister(core, `component:${key}`, compLoader))
    }
  }

  // Series-level features (markPoint, markLine, markArea)
  for (const s of seriesList) {
    for (const key of Object.keys(s)) {
      const featureLoader = SERIES_FEATURES[key]
      if (featureLoader) {
        loads.push(loadAndRegister(core, `feature:${key}`, featureLoader))
      }
    }
  }

  await Promise.all(loads)
  return core
}

/**
 * Manually register ECharts modules (for tree-shaking entry point).
 * Call this at app startup instead of relying on auto-detection.
 *
 * @example
 * ```ts
 * import { use } from '@pyreon/charts/manual'
 * import { BarChart } from 'echarts/charts'
 * import { GridComponent, TooltipComponent } from 'echarts/components'
 * import { CanvasRenderer } from 'echarts/renderers'
 *
 * use(BarChart, GridComponent, TooltipComponent, CanvasRenderer)
 * ```
 */
export function manualUse(...modules: unknown[]): void {
  const core = getCoreSync()
  if (core) {
    core.use(modules as EChartsUseArg)
  } else {
    // Core not loaded yet — queue for when it loads
    getCore().then((c) => c.use(modules as any))
  }
}

// ─── Reset (for testing) ────────────────────────────────────────────────────

export function _resetLoader(): void {
  registered.clear()
  inflight.clear()
  coreModule = null
  corePromise = null
}
