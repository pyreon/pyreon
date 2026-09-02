// One call from data to an `<svg>` string, for the whole chart family.
//
// The radial/finance siblings of `chartToSvg`: pie, gauge, radar,
// candlestick, heatmap. Same contract — pure functions, no DOM and no canvas,
// `measureApprox` by default — so every chart type in the engine renders in
// an SSG build, a serverless function, or an email pipeline, and every
// output is a string a test can assert on directly.
//
// Each helper composes ONLY the geometry modules (arc/radar/candlestick/
// heat + layout/scale), never the canvas components: the components own
// pointer handlers and reactivity, which have no meaning on a server.

import { fitCircle, layoutArcs, renderGauge, renderPie } from './arc'
import type { GaugeOptions } from './arc'
import { renderRadar } from './radar'
import type { RadarAxis } from './radar'
import { ohlcExtent, renderCandles } from './candlestick'
import type { CandleOptions, Ohlc } from './candlestick'
import { buildHeatGrid, HEAT_RAMP, renderHeat } from './heat'
import { renderFunnel } from './funnel'
import { layoutTreemap, renderTreemap } from './treemap'
import type { TreeNode, TreemapOptions } from './treemap'
import { layoutSunburst, renderSunburst, treeDepth } from './sunburst'
import type { SunburstOptions } from './sunburst'
import { layoutTree, renderTree } from './tree'
import type { TreeOptions } from './tree'
import { layoutRiver, renderRiver } from './river'
import type { RiverOptions, RiverSeries } from './river'
import { layoutPolar, renderPolar } from './polar'
import type { PolarAxes, PolarOptions, PolarSeries } from './polar'
import { layoutSankey, renderSankey } from './sankey'
import type { SankeyLink, SankeyNode, SankeyOptions } from './sankey'
import { layoutGraph, renderGraph } from './graph'
import type { GraphLink, GraphNode, GraphOptions } from './graph'
import type { FunnelOptions, FunnelStage } from './funnel'
import type { HeatGrid } from './heat'
import { computeLayout } from './layout'
import { niceDomain } from './scale'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { renderLegend } from './legend'
import { describeChart } from './a11y'
import { plain } from './format'
import type { Formatter } from './format'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const LEGEND_OPTS = {
  fontSize: 11.0,
  labelColor: '#5a6b7a',
  swatch: 10.0,
  gap: 12.0,
  orientation: 'horizontal' as const,
}

/** The a11y tail every helper shares: explicit wins, else derive from data. */
function svgTail(
  base: Omit<SvgOptions, 'title' | 'description'> | undefined,
  title: string | undefined,
  description: string | undefined,
  derived: () => string,
): SvgOptions {
  const d = description ?? (title !== undefined ? derived() : undefined)
  return {
    ...base,
    ...(title !== undefined ? { title } : {}),
    ...(d !== undefined && d !== '' ? { description: d } : {}),
  }
}

export interface PieToSvgOptions<T> {
  data: T[]
  /** The slice magnitude. */
  value: (d: T, index: number) => Double
  /** The slice name — labels, legend and the derived description. */
  label: (d: T, index: number) => string
  color?: (d: T, index: number) => string
  width?: Double
  height?: Double
  /** 0 for a pie, 0..1 for a donut hole. */
  innerRadius?: Double
  showLabels?: boolean
  showLegend?: boolean
  measure?: MeasureText
  title?: string
  /** Explicit long description; derived from the data when a title is given. */
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

/** A pie or donut as a standalone `<svg>` string. */
export function pieToSvg<T>(options: PieToSvgOptions<T>): string {
  const width = options.width ?? 320
  const height = options.height ?? 240
  const slices = options.data.map((d, i) => ({
    value: options.value(d, i),
    label: options.label(d, i),
    color: options.color?.(d, i) ?? PALETTE[i % PALETTE.length]!,
  }))
  const measure = options.measure ?? measureApprox()

  let legendH = 0
  const cmds: DrawCmd[] = []
  if (options.showLegend === true) {
    const l = renderLegend(
      slices.map((s) => ({ label: s.label, color: s.color })),
      { x: 8, y: 8, w: width - 16, h: height },
      LEGEND_OPTS,
      measure,
    )
    legendH = l.height
    for (const c of l.cmds) cmds.push(c)
  }
  const body = renderPie(slices, { x: 0, y: legendH, w: width, h: height - legendH }, {
    innerRadius: options.innerRadius ?? 0,
    showLabels: options.showLabels ?? true,
    labelColor: '#ffffff',
    fontSize: 11,
  })
  for (const c of body) cmds.push(c)

  return renderSvg(cmds, width, height, svgTail(options.svg, options.title, options.description, () =>
    describeChart({
      title: options.title,
      categories: slices.map((s) => s.label),
      series: [{ label: 'Value', values: slices.map((s) => s.value), kind: 'pie' }],
    }),
  ))
}

export interface GaugeToSvgOptions {
  value: Double
  min?: Double
  max?: Double
  width?: Double
  height?: Double
  thickness?: Double
  trackColor?: string
  valueColor?: string
  /** Print the value in the middle. */
  showValue?: boolean
  format?: Formatter
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** A single-value gauge as a standalone `<svg>` string. */
export function gaugeToSvg(options: GaugeToSvgOptions): string {
  const width = options.width ?? 240
  const height = options.height ?? 140
  const min = options.min ?? 0
  const max = options.max ?? 100
  const fmt = options.format ?? plain
  const opts: GaugeOptions = {
    min,
    max,
    sweep: Math.PI,
    thickness: options.thickness ?? 22,
    trackColor: options.trackColor ?? 'rgba(132,150,165,0.22)',
    valueColor: options.valueColor ?? '#0f766e',
  }
  // A half-circle occupies the top half of its box, so the drawing box is
  // twice the visible height — the same trick the component uses.
  const cmds = renderGauge(options.value, { x: 0, y: 0, w: width, h: height * 2 }, opts)
  if (options.showValue !== false) {
    cmds.push({
      kind: 'text',
      text: fmt(options.value),
      at: { x: width / 2, y: height - 6 },
      fill: '#10161d',
      size: 20,
      align: 'middle',
      baseline: 'bottom',
    })
  }
  return renderSvg(cmds, width, height, svgTail(options.svg, options.title, options.description, () =>
    `${options.title ?? 'Gauge'}: ${fmt(options.value)} of ${fmt(max)}.`,
  ))
}

export interface RadarToSvgOptions<T> {
  data: T[]
  /** The spokes; each axis normalises by its OWN max — see `radarPolygon`. */
  axes: RadarAxis[]
  /** A row's value per axis, index-aligned with `axes`. */
  values: (d: T, index: number) => Double[]
  label: (d: T, index: number) => string
  color?: (d: T, index: number) => string
  fillAlpha?: Double
  rings?: number
  showLabels?: boolean
  showLegend?: boolean
  width?: Double
  height?: Double
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** A radar/spider chart as a standalone `<svg>` string. */
export function radarToSvg<T>(options: RadarToSvgOptions<T>): string {
  const width = options.width ?? 320
  const height = options.height ?? 260
  const colorAt = (d: T, i: number): string =>
    options.color?.(d, i) ?? PALETTE[i % PALETTE.length]!
  const measure = options.measure ?? measureApprox()

  let legendH = 0
  const cmds: DrawCmd[] = []
  if (options.showLegend === true) {
    const l = renderLegend(
      options.data.map((d, i) => ({ label: options.label(d, i), color: colorAt(d, i) })),
      { x: 8, y: 8, w: width - 16, h: height },
      LEGEND_OPTS,
      measure,
    )
    legendH = l.height
    for (const c of l.cmds) cmds.push(c)
  }
  const body = renderRadar(
    options.axes,
    options.data.map((d, i) => ({
      values: options.values(d, i),
      color: colorAt(d, i),
      fillAlpha: options.fillAlpha ?? 0.25,
    })),
    { x: 0, y: legendH, w: width, h: height - legendH },
    {
      rings: options.rings ?? 4,
      gridColor: 'rgba(132,150,165,0.35)',
      labelColor: '#5a6b7a',
      fontSize: 11,
      showLabels: options.showLabels ?? true,
    },
  )
  for (const c of body) cmds.push(c)

  return renderSvg(cmds, width, height, svgTail(options.svg, options.title, options.description, () =>
    describeChart({
      title: options.title,
      categories: options.axes.map((a) => a.label),
      series: options.data.map((d, i) => ({
        label: options.label(d, i),
        values: options.values(d, i),
        kind: 'radar',
      })),
    }),
  ))
}

export interface CandlestickToSvgOptions<T> {
  data: T[]
  open: (d: T, index: number) => Double
  high: (d: T, index: number) => Double
  low: (d: T, index: number) => Double
  close: (d: T, index: number) => Double
  /** Period label per datum, shown on the x axis. */
  x?: (d: T, index: number) => string
  width?: Double
  height?: Double
  theme?: Partial<ChartTheme>
  candle?: CandleOptions
  format?: Formatter
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** An OHLC candlestick chart as a standalone `<svg>` string. */
export function candlestickToSvg<T>(options: CandlestickToSvgOptions<T>): string {
  const width = options.width ?? 640
  const height = options.height ?? 320
  const t = { ...defaultTheme, ...options.theme }
  const rows = options.data
  const candles: Ohlc[] = rows.map((d, i) => ({
    open: options.open(d, i),
    high: options.high(d, i),
    low: options.low(d, i),
    close: options.close(d, i),
  }))
  const domain = niceDomain(ohlcExtent(candles), 5.0)
  const measure = options.measure ?? measureApprox()
  const l = computeLayout(
    {
      width,
      height,
      xDomain: { min: 0.0, max: candles.length > 1 ? candles.length - 1 : 1.0 },
      yDomain: domain,
      categories: options.x !== undefined ? rows.map((d, i) => options.x!(d, i)) : [],
      fontSize: t.fontSize,
      xTickCount: 5.0,
      yTickCount: 5.0,
      showXAxis: true,
      showYAxis: true,
      yFormat: options.format,
    },
    measure,
  )
  const cmds: DrawCmd[] = []
  for (const tick of l.yTicks) {
    cmds.push({
      kind: 'line',
      from: { x: l.plot.x, y: tick.pos },
      to: { x: l.plot.x + l.plot.w, y: tick.pos },
      stroke: t.grid,
      width: 1.0,
    })
    cmds.push({
      kind: 'text',
      text: tick.label,
      at: { x: l.plot.x - 6.0, y: tick.pos },
      fill: t.label,
      size: t.fontSize,
      align: 'end',
      baseline: 'middle',
    })
  }
  for (const tick of l.xTicks) {
    cmds.push({
      kind: 'text',
      text: tick.label,
      at: { x: tick.pos, y: l.plot.y + l.plot.h + 6.0 },
      fill: t.label,
      size: t.fontSize,
      align: 'middle',
      baseline: 'top',
    })
  }
  for (const c of renderCandles(candles, l.plot, domain, options.candle ?? {})) cmds.push(c)

  const fmt = options.format ?? plain
  return renderSvg(cmds, width, height, svgTail(options.svg, options.title, options.description, () => {
    if (candles.length === 0) return `${options.title ?? 'Candlestick chart'}: no data.`
    const ext = ohlcExtent(candles)
    const last = candles[candles.length - 1]!
    return `${options.title ?? 'Candlestick chart'}: ${candles.length} periods, range ${fmt(ext.min)} to ${fmt(ext.max)}, last close ${fmt(last.close)}.`
  }))
}

export interface HeatmapToSvgOptions<T> {
  data: T[]
  /** Column category per datum. */
  x: (d: T, index: number) => string
  /** Row category per datum. */
  y: (d: T, index: number) => string
  /** The cell value. Duplicate (x, y) observations SUM. */
  value: (d: T, index: number) => Double
  width?: Double
  height?: Double
  /** `#rrggbb` ramp stops, cold to hot. */
  colors?: string[]
  gap?: Double
  theme?: Partial<ChartTheme>
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** First-seen category order — the order the data means. */
function firstSeen<T>(data: T[], of: (d: T, i: number) => string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (let i = 0; i < data.length; i++) {
    const k = of(data[i]!, i)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

/** A heatmap as a standalone `<svg>` string. */
export function heatmapToSvg<T>(options: HeatmapToSvgOptions<T>): string {
  const width = options.width ?? 640
  const height = options.height ?? 320
  const t = { ...defaultTheme, ...options.theme }
  const rows = options.data
  const cols = firstSeen(rows, options.x)
  const yCats = firstSeen(rows, options.y)
  const colIdx = new Map(cols.map((c, i) => [c, i]))
  const rowIdx = new Map(yCats.map((r, i) => [r, i]))
  const grid: HeatGrid = buildHeatGrid(
    cols,
    yCats,
    rows.map((d, i) => colIdx.get(options.x(d, i)) ?? -1),
    rows.map((d, i) => rowIdx.get(options.y(d, i)) ?? -1),
    rows.map((d, i) => {
      const v = options.value(d, i)
      return Number.isFinite(v) ? v : 0
    }),
  )
  const measure = options.measure ?? measureApprox()
  let widest = 0.0
  for (const r of grid.rows) {
    const lw = measure(r, t.fontSize)
    if (lw > widest) widest = lw
  }
  const left = widest + 8.0
  const bottom = t.fontSize + 8.0
  const plot: Rect = {
    x: left,
    y: 4.0,
    w: Math.max(0, width - left - 4.0),
    h: Math.max(0, height - 4.0 - bottom),
  }
  const cmds: DrawCmd[] = renderHeat({
    grid,
    plot,
    stops: options.colors ?? HEAT_RAMP,
    gap: options.gap,
  })
  const nc = grid.cols.length
  const nr = grid.rows.length
  for (let i = 0; i < nr; i++) {
    cmds.push({
      kind: 'text',
      text: grid.rows[i]!,
      at: { x: plot.x - 4.0, y: plot.y + (plot.h / Math.max(1, nr)) * (i + 0.5) },
      fill: t.label,
      size: t.fontSize,
      align: 'end',
      baseline: 'middle',
    })
  }
  for (let i = 0; i < nc; i++) {
    cmds.push({
      kind: 'text',
      text: grid.cols[i]!,
      at: { x: plot.x + (plot.w / Math.max(1, nc)) * (i + 0.5), y: plot.y + plot.h + 4.0 },
      fill: t.label,
      size: t.fontSize,
      align: 'middle',
      baseline: 'top',
    })
  }
  return renderSvg(cmds, width, height, svgTail(options.svg, options.title, options.description, () => {
    if (grid.cells.length === 0) return `${options.title ?? 'Heatmap'}: no data.`
    return `${options.title ?? 'Heatmap'}: ${nc} columns by ${nr} rows, values ${grid.min} to ${grid.max}.`
  }))
}

// `fitCircle`/`layoutArcs` are consumed indirectly through renderPie/renderGauge;
// re-listed here so a reviewer sees the composition surface in one place.
export { fitCircle, layoutArcs }

// ---- funnel (svg half; the geometry in funnel.ts is bundled into the native engine) ----

export interface FunnelToSvgOptions<T> {
  data: T[]
  value: (d: T, index: number) => Double
  label: (d: T, index: number) => string
  color?: (d: T, index: number) => string
  width?: Double
  height?: Double
  funnel?: FunnelOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

const FUNNEL_PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

/** Funnel → `<svg>` string, server-safe. */
export function funnelToSvg<T>(options: FunnelToSvgOptions<T>): string {
  const width = options.width ?? 480.0
  const height = options.height ?? 320.0
  const stages: FunnelStage[] = options.data.map((d, i) => ({
    value: options.value(d, i),
    label: options.label(d, i),
    color: options.color !== undefined ? options.color(d, i) : FUNNEL_PALETTE[i % FUNNEL_PALETTE.length]!,
  }))
  const pad = 8.0
  const cmds = renderFunnel(stages, { x: pad, y: pad, w: width - pad * 2.0, h: height - pad * 2.0 }, options.funnel)
  void (options.measure ?? measureApprox())
  const description =
    options.description ??
    (options.title !== undefined
      ? `${options.title}: ${stages.length} stages, ${stages.map((s) => `${s.label} ${s.value}`).join(', ')}.`
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- treemap + sunburst (svg halves; the geometry in treemap.ts / sunburst.ts is bundled into the native engine) ----

export interface TreemapToSvgOptions {
  data: TreeNode[]
  width?: Double
  height?: Double
  treemap?: TreemapOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Treemap → `<svg>` string, server-safe. */
export function treemapToSvg(options: TreemapToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const cells = layoutTreemap(options.data, { x: 0.0, y: 0.0, w: width, h: height }, options.treemap)
  const cmds = renderTreemap(cells, options.treemap, options.measure ?? measureApprox())
  const leaves = cells.filter((c) => c.leaf)
  const description =
    options.description ??
    (options.title !== undefined
      ? `${options.title}: ${leaves.length} leaves, largest ${leaves.length > 0 ? leaves.reduce((a, b) => (b.value > a.value ? b : a)).name : 'none'}.`
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

export interface SunburstToSvgOptions {
  data: TreeNode[]
  width?: Double
  height?: Double
  /** Hole radius as a fraction of the outer radius (0 = full disc). */
  innerRatio?: Double
  sunburst?: SunburstOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Sunburst → `<svg>` string, server-safe. */
export function sunburstToSvg(options: SunburstToSvgOptions): string {
  const width = options.width ?? 480.0
  const height = options.height ?? 480.0
  const center: Pt = { x: width / 2.0, y: height / 2.0 }
  const outerR = Math.max(0.0, Math.min(width, height) / 2.0 - 4.0)
  const innerR = outerR * (options.innerRatio ?? 0.2)
  const arcs = layoutSunburst(options.data, innerR, outerR, options.sunburst)
  const cmds = renderSunburst(arcs, center, options.sunburst, options.measure ?? measureApprox())
  const leaves = arcs.filter((a) => a.leaf)
  const description =
    options.description ??
    (options.title !== undefined
      ? `${options.title}: ${treeDepth(options.data)} levels, ${leaves.length} leaves.`
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- tree + theme river (svg halves; the geometry in tree.ts / river.ts is bundled into the native engine) ----

export interface TreeToSvgOptions {
  data: TreeNode[]
  width?: Double
  height?: Double
  tree?: TreeOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Tree → `<svg>` string, server-safe. */
export function treeToSvg(options: TreeToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const layout = layoutTree(options.data, { x: 0.0, y: 0.0, w: width, h: height }, options.tree)
  const cmds = renderTree(layout, options.tree)
  void (options.measure ?? measureApprox())
  const leaves = layout.nodes.filter((n) => n.leaf).length
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${layout.nodes.length} nodes, ${leaves} leaves.` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

export interface RiverToSvgOptions {
  series: RiverSeries[]
  width?: Double
  height?: Double
  river?: RiverOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Theme river → `<svg>` string, server-safe. */
export function riverToSvg(options: RiverToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 320.0
  const layout = layoutRiver(options.series, { x: 8.0, y: 8.0, w: Math.max(0.0, width - 16.0), h: Math.max(0.0, height - 16.0) }, options.river)
  const cmds = renderRiver(layout, options.river, options.measure ?? measureApprox())
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${options.series.length} streams over ${layout.xs.length} points (${options.series.map((s) => s.name).join(', ')}).` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- polar (svg half; the geometry in polar.ts is bundled into the native engine) ----

export interface PolarToSvgOptions {
  axes: PolarAxes
  series: PolarSeries[]
  width?: Double
  height?: Double
  polar?: PolarOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Polar chart → `<svg>` string, server-safe. */
export function polarToSvg(options: PolarToSvgOptions): string {
  const width = options.width ?? 480.0
  const height = options.height ?? 480.0
  const layout = layoutPolar(options.axes, options.series, { x: 0.0, y: 0.0, w: width, h: height }, options.polar)
  const cmds = renderPolar(layout, options.polar)
  void (options.measure ?? measureApprox())
  const description =
    options.description ??
    (options.title !== undefined
      ? `${options.title}: ${options.series.length} series over ${options.axes.categories.length} categories, values ${layout.domain.min} to ${layout.domain.max}.`
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- sankey (svg half; the geometry in sankey.ts is bundled into the native engine) ----

export interface SankeyToSvgOptions {
  nodes: SankeyNode[]
  links: SankeyLink[]
  width?: Double
  height?: Double
  sankey?: SankeyOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Sankey → `<svg>` string, server-safe. Leaves a label gutter on both sides. */
export function sankeyToSvg(options: SankeyToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const gutter = 80.0
  const layout = layoutSankey(options.nodes, options.links, { x: gutter, y: 8.0, w: Math.max(0.0, width - gutter * 2.0), h: Math.max(0.0, height - 16.0) }, options.sankey)
  const cmds = renderSankey(layout, options.sankey)
  void (options.measure ?? measureApprox())
  let total = 0.0
  for (const l of layout.links) total = total + l.value
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${layout.nodes.length} nodes, ${layout.links.length} flows totalling ${total}.` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- graph (svg half; the geometry in graph.ts is bundled into the native engine) ----

export interface GraphToSvgOptions {
  nodes: GraphNode[]
  links: GraphLink[]
  width?: Double
  height?: Double
  graph?: GraphOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Graph → `<svg>` string, server-safe. */
export function graphToSvg(options: GraphToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const box: Rect = { x: 0.0, y: 0.0, w: width, h: height }
  const layout = layoutGraph(options.nodes, options.links, box, options.graph)
  const cmds = renderGraph(layout, box, options.graph)
  void (options.measure ?? measureApprox())
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${layout.nodes.length} nodes, ${layout.links.length} links.` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
