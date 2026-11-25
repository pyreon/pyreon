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

import type { HeatSelection } from './heat-chart'
import { transposeCmds, transposeRect } from './rtl'
import { fitCircle, layoutArcs, renderGauge, renderPie } from './arc'
import { paletteAt } from './palette'
import type { ArcConfig, GaugeOptions } from './arc'
import type { PieLabelOptions } from './pie-labels'
import { renderDial } from './gauge-dial'
import type { DialSpec } from './gauge-dial'
import { renderRadar } from './radar'
import type { RadarAxis } from './radar'
import { ohlcExtent, renderCandles } from './candlestick'
import type { CandleOptions, Ohlc } from './candlestick'
import { buildHeatGrid, renderHeat } from './heat'
import { renderFunnel } from './funnel'
import { layoutTreemap, renderTreemap } from './treemap'
import type { TreeNode, TreemapOptions } from './treemap'
import { layoutSunburst, renderSunburst, treeDepth } from './sunburst'
import type { SunburstOptions } from './sunburst'
import { layoutTree, renderTree } from './tree'
import type { TreeOptions } from './tree'
import { layoutChord, renderChord } from './chord'
import type { ChordLink, ChordNode, ChordOptions } from './chord'
import { layoutRiver, renderRiver } from './river'
import type { RiverOptions, RiverSeries } from './river'
import { layoutPolar, renderPolar } from './polar'
import type { PolarAxes, PolarOptions, PolarSeries } from './polar'
import { layoutSankey, renderSankey } from './sankey'
import type { SankeyLink, SankeyNode, SankeyOptions } from './sankey'
import { layoutGraph, renderGraph } from './graph'
import type { GraphLink, GraphNode, GraphOptions } from './graph'
import { calendarDomain, formatIsoDays, layoutCalendar, renderCalendar } from './calendar'
import { layoutGantt, renderGantt } from './gantt'
import type { GanttLayout, GanttOptions, GanttTask } from './gantt'
import { layoutParallel, renderParallel } from './parallel'
import type { ParallelAxis, ParallelOptions } from './parallel'
import { parallelRows } from './parallel-web'
import type { ParallelRow } from './parallel-web'
import type { CalendarOptions } from './calendar'
import { calendarValues } from './calendar-web'
import type { FunnelOptions, FunnelStage } from './funnel'
import type { HeatGrid } from './heat'
import { computeLayout, valueTickTarget } from './layout'
import { niceDomain } from './scale'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { renderLegend } from './legend'
import { describeCandles, describeChart, describeGauge, describeHeatmap } from './a11y'
import type { ChartMessages } from './a11y'
import { groupThousands } from './format'
import type { Formatter } from './format'
import { measureApprox, renderSvg } from './svg'
import { svgLocale, svgNumber, svgSentence } from './svg-locale'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'
import { themedDial } from './dial'

/**
 * The legend options the CANVAS host builds (`canvas-host.tsx`) — same fields,
 * same theme sources. A helper that inlined these instead would render a
 * differently-coloured legend than the same chart drawn on canvas.
 */
function legendOpts(t: ChartTheme) {
  return {
    fontSize: t.fontSize,
    labelColor: t.label,
    swatch: 10.0,
    gap: 12.0,
    orientation: 'horizontal' as const,
  }
}

/** The theme every helper resolves: explicit fields win, the rest default. */
function themeOf(theme: Partial<ChartTheme> | undefined): ChartTheme {
  return { ...defaultTheme, ...theme }
}

/**
 * The TASKS' own extent, not the axis domain.
 *
 * `layout.domain` is the tasks' range padded by a quarter unit so the bars do
 * not touch the frame — reading it out in a sentence that says "1 task from X
 * to Y" describes the padding as if it were the work: a task starting on the
 * 1st was announced as starting on the previous 31st.
 */
function taskExtent(layout: GanttLayout): { min: Double; max: Double } {
  let min = layout.domain.max
  let max = layout.domain.min
  for (const r of layout.rows) {
    if (r.startDay < min) min = r.startDay
    if (r.endDay > max) max = r.endDay
  }
  return min <= max ? { min, max } : { min: layout.domain.min, max: layout.domain.max }
}

/**
 * `1 flow` / `2 flows` — these sentences are READ ALOUD, and "1 flows" is the
 * kind of thing that makes a screen reader sound like a debug log. The plot
 * description already pluralised its series count; the families did not.
 */
function count(n: Double, one: string, many: string, number?: Formatter): string {
  return n === 1 ? `${svgNumber(1, number)} ${one}` : `${svgNumber(n, number)} ${many}`
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
  /** Series colours for rows without one; defaults to the theme palette. */
  palette?: readonly string[] | undefined
  data: readonly T[]
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
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  /** Explicit long description; derived from the data when a title is given. */
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
  /** ECharts' pie layout — start angle, direction, min/pad angles, rose, outside labels — as `<PieChart pie>`. */
  pie?: { arcs: ArcConfig; labels: PieLabelOptions | undefined; empty?: string | undefined } | undefined
  /** Draw the pie in this rect, the legend over it (ECharts' placement); below the legend without it. */
  frame?: Rect | undefined
  /** The rect outside labels keep within; the whole image without it. */
  view?: Rect | undefined
}


/** A pie or donut as a standalone `<svg>` string. */
export function pieToSvg<T>(options: PieToSvgOptions<T>): string {
  const width = options.width ?? 320
  const height = options.height ?? 240
  const t = themeOf(options.theme)
  const slices = options.data.map((d, i) => ({
    value: options.value(d, i),
    label: options.label(d, i),
    color: options.color?.(d, i) ?? paletteAt(options.palette ?? t.palette, i),
  }))
  const measure = options.measure ?? measureApprox()

  let legendH = 0
  const cmds: DrawCmd[] = []
  if (options.showLegend === true) {
    const l = renderLegend(
      slices.map((s) => ({ label: s.label, color: s.color })),
      { x: 8, y: 8, w: width - 16, h: height },
      legendOpts(t),
      measure,
    )
    legendH = l.height
    for (const c of l.cmds) cmds.push(c)
  }
  const labels = options.pie?.labels
  const body = renderPie(slices, options.frame ?? { x: 0, y: legendH, w: width, h: height - legendH }, {
    innerRadius: options.innerRadius ?? 0,
    showLabels: options.showLabels ?? true,
    labelColor: labels !== undefined && labels.position !== 'inside' ? t.label : '#ffffff',
    fontSize: t.fontSize,
    arcs: options.pie?.arcs,
    labels,
    view: options.view ?? { x: 0, y: 0, w: width, h: height },
    empty: options.pie?.empty,
    measure,
  })
  for (const c of body) cmds.push(c)

  const loc = svgLocale(options)
  return renderSvg(cmds, width, height, svgTail(options.svg, options.title, options.description, () =>
    describeChart({
      title: options.title,
      messages: loc.messages,
      number: loc.number,
      format: loc.format,
      categories: slices.map((s) => s.label),
      series: [{ label: loc.messages?.valueLabel ?? 'Value', values: slices.map((s) => s.value), kind: 'pie' }],
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
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
  /** A full dial (`gaugeDial()`), as `<GaugeChart dial>`; the half-circle track without it. */
  dial?: DialSpec | undefined
  /** The square the dial fills; the whole image without it. */
  frame?: Rect | undefined
}

/** A single-value gauge as a standalone `<svg>` string. */
export function gaugeToSvg(options: GaugeToSvgOptions): string {
  const width = options.width ?? 240
  const height = options.height ?? 140
  const min = options.min ?? 0
  const max = options.max ?? 100
  const loc = svgLocale(options)
  const fmt = loc.format ?? groupThousands
  const t = themeOf(options.theme)
  const opts: GaugeOptions = {
    min,
    max,
    sweep: Math.PI,
    thickness: options.thickness ?? 22,
    trackColor: options.trackColor ?? t.grid,
    valueColor: options.valueColor ?? paletteAt(t.palette, 0),
  }
  // A half-circle occupies the top half of its box, so the drawing box is
  // twice the visible height — the same trick the component uses.
  const dial = options.dial
  const frame = options.frame ?? { x: 0, y: 0, w: width, h: height }
  const fit = fitCircle(frame)
  const cmds = dial !== undefined
    ? renderDial(themedDial(dial, t), fit.center, fit.radius, [...t.palette])
    : renderGauge(options.value, { x: 0, y: 0, w: width, h: height * 2 }, opts)
  if (dial === undefined && options.showValue !== false) {
    cmds.push({
      kind: 'text',
      text: fmt(options.value),
      at: { x: width / 2, y: height - 6 },
      fill: t.text,
      size: 20,
      align: 'middle',
      baseline: 'bottom',
    })
  }
  return renderSvg(cmds, width, height, svgTail(options.svg, options.title, options.description, () =>
  /* v8 ignore next — the `?? '<name>'` fallbacks below are unreachable:
     `svgTail` only calls this deriver when `title` is defined. They are
     kept as a guard rather than removed, but an UNTITLED chart derives no
     description at all today, which is worth closing on its own.  */
    describeGauge(options.title ?? loc.messages?.untitled ?? loc.messages?.gaugeLabel ?? 'Gauge', fmt(options.value), fmt(max), loc.messages),
  ))
}

export interface RadarToSvgOptions<T> {
  /** Series colours for rows without one; defaults to the theme palette. */
  palette?: readonly string[] | undefined
  data: readonly T[]
  /** The spokes; each axis normalises by its OWN max — see `radarPolygon`. */
  axes: readonly RadarAxis[]
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
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** A radar/spider chart as a standalone `<svg>` string. */
export function radarToSvg<T>(options: RadarToSvgOptions<T>): string {
  const width = options.width ?? 320
  const height = options.height ?? 260
  const t = themeOf(options.theme)
  const colorAt = (d: T, i: number): string =>
    options.color?.(d, i) ?? paletteAt(options.palette ?? t.palette, i)
  const measure = options.measure ?? measureApprox()

  let legendH = 0
  const cmds: DrawCmd[] = []
  if (options.showLegend === true) {
    const l = renderLegend(
      options.data.map((d, i) => ({ label: options.label(d, i), color: colorAt(d, i) })),
      { x: 8, y: 8, w: width - 16, h: height },
      legendOpts(t),
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
      gridColor: t.grid,
      labelColor: t.label,
      fontSize: t.fontSize,
      showLabels: options.showLabels ?? true,
    },
  )
  for (const c of body) cmds.push(c)

  const loc = svgLocale(options)
  return renderSvg(cmds, width, height, svgTail(options.svg, options.title, options.description, () =>
    describeChart({
      title: options.title,
      messages: loc.messages,
      number: loc.number,
      format: loc.format,
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
  data: readonly T[]
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
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** An OHLC candlestick chart as a standalone `<svg>` string. */
export function candlestickToSvg<T>(options: CandlestickToSvgOptions<T>): string {
  const width = options.width ?? 640
  const height = options.height ?? 320
  const t = themeOf(options.theme)
  const rows = options.data
  const candles: Ohlc[] = rows.map((d, i) => ({
    open: options.open(d, i),
    high: options.high(d, i),
    low: options.low(d, i),
    close: options.close(d, i),
  }))
  const ticks = valueTickTarget(width, height, t.fontSize, false)
  const domain = niceDomain(ohlcExtent(candles), ticks)
  const measure = options.measure ?? measureApprox()
  const loc = svgLocale(options)
  const l = computeLayout(
    {
      width,
      height,
      xDomain: { min: 0.0, max: candles.length > 1 ? candles.length - 1 : 1.0 },
      yDomain: domain,
      categories: options.x !== undefined ? rows.map((d, i) => options.x!(d, i)) : [],
      fontSize: t.fontSize,
      xTickCount: 0.0,
      yTickCount: ticks,
      showXAxis: true,
      showYAxis: true,
      yFormat: loc.format,
      xFormat: loc.format,
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
  for (const c of renderCandles(candles, l.plot, domain, { upColor: t.positive, downColor: t.negative, ...options.candle })) cmds.push(c)

  const fmt = loc.format ?? groupThousands
  return renderSvg(cmds, width, height, svgTail(options.svg, options.title, options.description, () => {
    /* v8 ignore next 2 — the `?? '<name>'` fallbacks here are unreachable:
       `svgTail` only calls this deriver when `title` is defined. Kept as a
       guard; that an UNTITLED chart derives no description at all is a
       separate a11y gap worth closing on its own. */
    const title = options.title ?? loc.messages?.untitled ?? 'Candlestick chart'
    if (candles.length === 0) return describeCandles({ title, count: 0, min: '', max: '', close: '' }, loc.messages, loc.number)
    const ext = ohlcExtent(candles)
    return describeCandles({ title, count: candles.length, min: fmt(ext.min), max: fmt(ext.max), close: fmt(candles[candles.length - 1]!.close) }, loc.messages, loc.number)
  }))
}

export interface HeatmapToSvgOptions<T> {
  data: readonly T[]
  /** Column category per datum. */
  x: (d: T, index: number) => string
  /** Row category per datum. */
  y: (d: T, index: number) => string
  /** The cell value. Duplicate (x, y) observations SUM. */
  value: (d: T, index: number) => Double
  width?: Double
  height?: Double
  /** `#rrggbb` ramp stops, cold to hot. */
  colors?: readonly string[]
  gap?: Double
  /** A visualMap's domain and selection (see `HeatSelection`). */
  selection?: HeatSelection
  theme?: Partial<ChartTheme>
  measure?: MeasureText
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** First-seen category order — the order the data means. */
function firstSeen<T>(data: readonly T[], of: (d: T, i: number) => string): string[] {
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
  const t = themeOf(options.theme)
  const rows = options.data
  const cols = firstSeen(rows, options.x)
  const yCats = firstSeen(rows, options.y)
  const colIdx = new Map(cols.map((c, i) => [c, i]))
  const rowIdx = new Map(yCats.map((r, i) => [r, i]))
  const grid: HeatGrid = buildHeatGrid(
    cols,
    yCats,
    /* v8 ignore next 2 — the `?? -1` misses are unreachable: `cols`/`yCats`
       are built by `firstSeen` over these same rows with these same accessors,
       so every lookup hits. Kept as the guard for a non-deterministic
       accessor. */
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
    stops: options.colors ?? t.ramp,
    gap: options.gap,
    domain: options.selection?.domain,
    inRange: options.selection?.inRange,
    outBands: options.selection?.outBands,
    outColor: options.selection?.outColor,
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
    /* v8 ignore next 2 — the `?? '<name>'` fallbacks here are unreachable:
       `svgTail` only calls this deriver when `title` is defined. Kept as a
       guard; that an UNTITLED chart derives no description at all is a
       separate a11y gap worth closing on its own. */
    const loc = svgLocale(options)
    const v = loc.format ?? String
    return describeHeatmap({ title: options.title ?? loc.messages?.untitled ?? 'Heatmap', columns: nc, rows: nr, cells: grid.cells.length, min: v(grid.min), max: v(grid.max) }, loc.messages, loc.number)
  }))
}

// `fitCircle`/`layoutArcs` are consumed indirectly through renderPie/renderGauge;
// re-listed here so a reviewer sees the composition surface in one place.
export { fitCircle, layoutArcs }

// ---- funnel (svg half; the geometry in funnel.ts is bundled into the native engine) ----

export interface FunnelToSvgOptions<T> {
  /** Series colours for rows without one; defaults to the theme palette. */
  palette?: readonly string[] | undefined
  data: readonly T[]
  value: (d: T, index: number) => Double
  label: (d: T, index: number) => string
  color?: (d: T, index: number) => string
  width?: Double
  height?: Double
  funnel?: FunnelOptions
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}


/** Funnel → `<svg>` string, server-safe. */
export function funnelToSvg<T>(options: FunnelToSvgOptions<T>): string {
  const width = options.width ?? 480.0
  const height = options.height ?? 320.0
  const t = themeOf(options.theme)
  const stages: FunnelStage[] = options.data.map((d, i) => ({
    value: options.value(d, i),
    label: options.label(d, i),
    color: options.color !== undefined ? options.color(d, i) : paletteAt(options.palette ?? t.palette, i),
  }))
  const pad = 8.0
  const cmds = renderFunnel(stages, { x: pad, y: pad, w: width - pad * 2.0, h: height - pad * 2.0 }, options.funnel)
  void (options.measure ?? measureApprox())
  const loc = svgLocale(options)
  const n = (v: number): string => svgNumber(v, loc.number)
  const list = stages.map((s) => `${s.label} ${loc.format === undefined ? `${s.value}` : loc.format(s.value)}`).join(', ')
  const description =
    options.description ??
    (options.title !== undefined
      ? svgSentence(loc.messages?.funnelDescription, () => `${options.title}: ${n(stages.length)} stages, ${list}.`, { title: options.title, count: n(stages.length), list })
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- treemap + sunburst (svg halves; the geometry in treemap.ts / sunburst.ts is bundled into the native engine) ----

export interface TreemapToSvgOptions {
  data: readonly TreeNode[]
  width?: Double
  height?: Double
  treemap?: TreemapOptions
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Treemap → `<svg>` string, server-safe. */
export function treemapToSvg(options: TreemapToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const cells = layoutTreemap(options.data, { x: 0.0, y: 0.0, w: width, h: height }, { palette: t.palette, ...options.treemap })
  const cmds = renderTreemap(cells, { palette: t.palette, ...options.treemap }, options.measure ?? measureApprox())
  const leaves = cells.filter((c) => c.leaf)
  const loc = svgLocale(options)
  const n = (v: number): string => svgNumber(v, loc.number)
  const largest = leaves.length > 0 ? leaves.reduce((a, b) => (b.value > a.value ? b : a)).name : (loc.messages?.noneLabel ?? 'none')
  const description =
    options.description ??
    (options.title !== undefined
      ? svgSentence(loc.messages?.treemapDescription, () => `${options.title}: ${n(leaves.length)} leaves, largest ${largest}.`, { title: options.title, leaves: n(leaves.length), largest })
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

export interface SunburstToSvgOptions {
  data: readonly TreeNode[]
  width?: Double
  height?: Double
  /** Hole radius as a fraction of the outer radius (0 = full disc). */
  innerRatio?: Double
  sunburst?: SunburstOptions
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Sunburst → `<svg>` string, server-safe. */
export function sunburstToSvg(options: SunburstToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 480.0
  const height = options.height ?? 480.0
  const center: Pt = { x: width / 2.0, y: height / 2.0 }
  const outerR = Math.max(0.0, Math.min(width, height) / 2.0 - 4.0)
  const innerR = outerR * (options.innerRatio ?? 0.2)
  const arcs = layoutSunburst(options.data, innerR, outerR, { palette: t.palette, ...options.sunburst })
  const cmds = renderSunburst(arcs, center, { palette: t.palette, ...options.sunburst }, options.measure ?? measureApprox())
  const leaves = arcs.filter((a) => a.leaf)
  const loc = svgLocale(options)
  const n = (v: number): string => svgNumber(v, loc.number)
  const description =
    options.description ??
    (options.title !== undefined
      ? svgSentence(loc.messages?.sunburstDescription, () => `${options.title}: ${n(treeDepth(options.data))} levels, ${n(leaves.length)} leaves.`, { title: options.title, levels: n(treeDepth(options.data)), leaves: n(leaves.length) })
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- tree + theme river (svg halves; the geometry in tree.ts / river.ts is bundled into the native engine) ----

export interface TreeToSvgOptions {
  data: readonly TreeNode[]
  width?: Double
  height?: Double
  tree?: TreeOptions
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Tree → `<svg>` string, server-safe. */
export function treeToSvg(options: TreeToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const layout = layoutTree(options.data, { x: 0.0, y: 0.0, w: width, h: height }, { palette: t.palette, labelColor: t.label, linkColor: t.label, ...options.tree })
  const cmds = renderTree(layout, { palette: t.palette, labelColor: t.label, linkColor: t.label, ...options.tree })
  void (options.measure ?? measureApprox())
  const leaves = layout.nodes.filter((n) => n.leaf).length
  const loc = svgLocale(options)
  const n = (v: number): string => svgNumber(v, loc.number)
  const description =
    options.description ??
    (options.title !== undefined ? svgSentence(loc.messages?.treeDescription, () => `${options.title}: ${n(layout.nodes.length)} nodes, ${n(leaves)} leaves.`, { title: options.title, nodes: n(layout.nodes.length), leaves: n(leaves) }) : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

export interface ChordToSvgOptions {
  nodes: readonly ChordNode[]
  links: readonly ChordLink[]
  width?: Double
  height?: Double
  chord?: ChordOptions
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Chord diagram → `<svg>` string, server-safe. */
export function chordToSvg(options: ChordToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 480.0
  const height = options.height ?? 480.0
  const measure = options.measure ?? measureApprox()
  const box = { x: 8.0, y: 8.0, w: Math.max(0.0, width - 16.0), h: Math.max(0.0, height - 16.0) }
  const chordOpts: ChordOptions = { palette: t.palette, labelColor: t.label, ...options.chord }
  const layout = layoutChord(options.nodes, options.links, box, chordOpts, measure)
  const cmds = renderChord(layout, chordOpts, measure)
  const loc = svgLocale(options)
  const n = (v: number): string => svgNumber(v, loc.number)
  const description =
    options.description ??
    (options.title !== undefined
      ? svgSentence(loc.messages?.chordDescription, () => `${options.title}: ${n(layout.arcs.length)} categories, ${n(layout.ribbons.length)} flows.`, { title: options.title, categories: n(layout.arcs.length), flows: n(layout.ribbons.length) })
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

export interface RiverToSvgOptions {
  series: readonly RiverSeries[]
  width?: Double
  height?: Double
  river?: RiverOptions
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Theme river → `<svg>` string, server-safe. */
export function riverToSvg(options: RiverToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 640.0
  const height = options.height ?? 320.0
  const layout = layoutRiver(options.series, { x: 8.0, y: 8.0, w: Math.max(0.0, width - 16.0), h: Math.max(0.0, height - 16.0) }, { palette: t.palette, ...options.river })
  const cmds = renderRiver(layout, { palette: t.palette, axisColor: t.axis, tickColor: t.label, ...options.river }, options.measure ?? measureApprox())
  const loc = svgLocale(options)
  const n = (v: number): string => svgNumber(v, loc.number)
  const names = options.series.map((s) => s.name).join(', ')
  const description =
    options.description ??
    (options.title !== undefined ? svgSentence(loc.messages?.riverDescription, () => `${options.title}: ${n(options.series.length)} streams over ${n(layout.xs.length)} points (${names}).`, { title: options.title, streams: n(options.series.length), points: n(layout.xs.length), list: names }) : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- polar (svg half; the geometry in polar.ts is bundled into the native engine) ----

export interface PolarToSvgOptions {
  axes: PolarAxes
  series: readonly PolarSeries[]
  width?: Double
  height?: Double
  polar?: PolarOptions
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Polar chart → `<svg>` string, server-safe. */
export function polarToSvg(options: PolarToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 480.0
  const height = options.height ?? 480.0
  const loc = svgLocale(options)
  const layout = layoutPolar(options.axes, options.series, { x: 0.0, y: 0.0, w: width, h: height }, { palette: t.palette, labelColor: t.label, gridColor: t.grid, ...options.polar }, loc.format)
  const cmds = renderPolar(layout, { palette: t.palette, labelColor: t.label, gridColor: t.grid, ...options.polar })
  void (options.measure ?? measureApprox())
  const n = (v: number): string => svgNumber(v, loc.number)
  const v = (x: number): string => (loc.format === undefined ? `${x}` : loc.format(x))
  const description =
    options.description ??
    (options.title !== undefined
      ? svgSentence(loc.messages?.polarDescription, () => `${options.title}: ${n(options.series.length)} series over ${n(options.axes.categories.length)} categories, values ${v(layout.domain.min)} to ${v(layout.domain.max)}.`, { title: options.title, series: n(options.series.length), count: n(options.axes.categories.length), min: v(layout.domain.min), max: v(layout.domain.max) })
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- sankey (svg half; the geometry in sankey.ts is bundled into the native engine) ----

export interface SankeyToSvgOptions {
  nodes: readonly SankeyNode[]
  links: readonly SankeyLink[]
  width?: Double
  height?: Double
  sankey?: SankeyOptions
  /** `'vertical'` — the horizontal layout reflected across the diagonal. */
  orient?: 'horizontal' | 'vertical'
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Sankey → `<svg>` string, server-safe. Leaves a label gutter on both sides. */
export function sankeyToSvg(options: SankeyToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const gutter = 80.0
  const vertical = options.orient === 'vertical'
  const box = vertical ? transposeRect({ x: 0.0, y: 0.0, w: width, h: height }) : { x: 0.0, y: 0.0, w: width, h: height }
  const layout = layoutSankey(options.nodes, options.links, { x: box.x + gutter, y: box.y + 8.0, w: Math.max(0.0, box.w - gutter * 2.0), h: Math.max(0.0, box.h - 16.0) }, { palette: t.palette, labelColor: t.label, ...options.sankey })
  const drawn = renderSankey(layout, { palette: t.palette, labelColor: t.label, ...options.sankey })
  const cmds = vertical ? transposeCmds(drawn) : drawn
  void (options.measure ?? measureApprox())
  let total = 0.0
  for (const l of layout.links) total = total + l.value
  const loc = svgLocale(options)
  const n = (x: number): string => svgNumber(x, loc.number)
  const totalText = loc.format === undefined ? `${total}` : loc.format(total)
  const description =
    options.description ??
    (options.title !== undefined ? svgSentence(loc.messages?.sankeyDescription, () => `${options.title}: ${count(layout.nodes.length, 'node', 'nodes', loc.number)}, ${count(layout.links.length, 'flow', 'flows', loc.number)} totalling ${totalText}.`, { title: options.title, nodes: n(layout.nodes.length), flows: n(layout.links.length), total: totalText }) : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- graph (svg half; the geometry in graph.ts is bundled into the native engine) ----

export interface GraphToSvgOptions {
  nodes: readonly GraphNode[]
  links: readonly GraphLink[]
  width?: Double
  height?: Double
  graph?: GraphOptions
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Graph → `<svg>` string, server-safe. */
export function graphToSvg(options: GraphToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const box: Rect = { x: 0.0, y: 0.0, w: width, h: height }
  const layout = layoutGraph(options.nodes, options.links, box, { palette: t.palette, labelColor: t.label, linkColor: t.label, ...options.graph })
  const cmds = renderGraph(layout, box, { palette: t.palette, labelColor: t.label, linkColor: t.label, ...options.graph })
  void (options.measure ?? measureApprox())
  const loc = svgLocale(options)
  const n = (x: number): string => svgNumber(x, loc.number)
  const description =
    options.description ??
    (options.title !== undefined ? svgSentence(loc.messages?.graphDescription, () => `${options.title}: ${count(layout.nodes.length, 'node', 'nodes', loc.number)}, ${count(layout.links.length, 'link', 'links', loc.number)}.`, { title: options.title, nodes: n(layout.nodes.length), links: n(layout.links.length) }) : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- calendar (svg half; the geometry in calendar.ts is bundled into the native engine) ----

export interface CalendarToSvgOptions {
  start: string
  end: string
  values: Record<string, Double>
  width?: Double
  height?: Double
  calendar?: CalendarOptions
  /** `'vertical'` — the horizontal layout reflected across the diagonal. */
  orient?: 'horizontal' | 'vertical'
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Calendar → `<svg>` string, server-safe. */
export function calendarToSvg(options: CalendarToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 720.0
  const height = options.height ?? 140.0
  const vertical = options.orient === 'vertical'
  const box = vertical ? transposeRect({ x: 0.0, y: 0.0, w: width, h: height }) : { x: 0.0, y: 0.0, w: width, h: height }
  const layout = layoutCalendar(options.start, options.end, { x: box.x + 4.0, y: box.y + 4.0, w: box.w - 8.0, h: box.h - 8.0 }, { labelColor: t.label, emptyColor: t.muted, stops: t.ramp, ...options.calendar })
  const vals = calendarValues(options.values)
  const drawnCal = renderCalendar(layout, vals, { labelColor: t.label, emptyColor: t.muted, stops: t.ramp, ...options.calendar })
  const cmds = vertical ? transposeCmds(drawnCal) : drawnCal
  void (options.measure ?? measureApprox())
  let filled = 0
  for (const c of layout.cells) if (options.values[c.date] !== undefined) filled++
  const dom = calendarDomain(layout, vals)
  const loc = svgLocale(options)
  const n = (x: number): string => svgNumber(x, loc.number)
  const v = (x: number): string => (loc.format === undefined ? `${x}` : loc.format(x))
  const description =
    options.description ??
    (options.title !== undefined ? svgSentence(loc.messages?.calendarDescription, () => `${options.title}: ${n(layout.cells.length)} days from ${options.start} to ${options.end}, ${n(filled)} with values from ${v(dom.min)} to ${v(dom.max)}.`, { title: options.title, days: n(layout.cells.length), start: options.start, end: options.end, filled: n(filled), min: v(dom.min), max: v(dom.max) }) : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- gantt (svg half; the geometry in gantt.ts is bundled into the native engine) ----

export interface GanttToSvgOptions {
  tasks: readonly GanttTask[]
  width?: Double
  height?: Double
  gantt?: GanttOptions
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Gantt → `<svg>` string, server-safe. */
export function ganttToSvg(options: GanttToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 720.0
  const height = options.height ?? 320.0
  const measure = options.measure ?? measureApprox()
  const layout = layoutGantt(options.tasks, { x: 4.0, y: 4.0, w: width - 8.0, h: height - 8.0 }, { palette: t.palette, labelColor: t.label, gridColor: t.grid, laneColor: t.grid, todayColor: t.negative, ...options.gantt }, measure)
  const cmds = renderGantt(layout, { palette: t.palette, labelColor: t.label, gridColor: t.grid, laneColor: t.grid, todayColor: t.negative, ...options.gantt })
  const loc = svgLocale(options)
  const start = formatIsoDays(Math.floor(taskExtent(layout).min))
  const end = formatIsoDays(Math.floor(taskExtent(layout).max))
  const description =
    options.description ??
    (options.title !== undefined
      ? svgSentence(loc.messages?.ganttDescription, () => `${options.title}: ${count(layout.rows.length, 'task', 'tasks', loc.number)} from ${start} to ${end}.`, { title: options.title, tasks: svgNumber(layout.rows.length, loc.number), start, end })
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}

// ---- parallel (svg half; the geometry in parallel.ts is bundled into the native engine) ----

export interface ParallelToSvgOptions {
  axes: readonly ParallelAxis[]
  rows: readonly ParallelRow[]
  width?: Double
  height?: Double
  parallel?: ParallelOptions
  /** `'vertical'` — the horizontal layout reflected across the diagonal. */
  orient?: 'horizontal' | 'vertical'
  measure?: MeasureText
  /** Chart theme; the canvas host reads the same fields. */
  theme?: Partial<ChartTheme>
  title?: string
  description?: string
  /** BCP 47 tag: the registered pack's words (under `messages`) and the locale's digits, as the component's `locale`. */
  locale?: string | undefined
  /** The words of the derived description (`ChartMessages`), for a page that is not in English. */
  messages?: ChartMessages | undefined
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Parallel coordinates → `<svg>` string, server-safe. */
export function parallelToSvg(options: ParallelToSvgOptions): string {
  const t = themeOf(options.theme)
  const width = options.width ?? 640.0
  const height = options.height ?? 360.0
  const gutter = 40.0
  const vertical = options.orient === 'vertical'
  const box = vertical ? transposeRect({ x: 0.0, y: 0.0, w: width, h: height }) : { x: 0.0, y: 0.0, w: width, h: height }
  const loc = svgLocale(options)
  const layout = layoutParallel(options.axes, parallelRows(options.axes, options.rows), { x: box.x + gutter, y: box.y + 8.0, w: Math.max(0.0, box.w - gutter * 2.0), h: Math.max(0.0, box.h - 16.0) }, { palette: t.palette, labelColor: t.label, axisColor: t.axis, ...options.parallel }, loc.format)
  const drawnPar = renderParallel(layout, { palette: t.palette, labelColor: t.label, axisColor: t.axis, highlightColor: t.negative, ...options.parallel })
  const cmds = vertical ? transposeCmds(drawnPar) : drawnPar
  void (options.measure ?? measureApprox())
  const n = (x: number): string => svgNumber(x, loc.number)
  const axisNames = options.axes.map((a) => a.name).join(', ')
  const description =
    options.description ??
    (options.title !== undefined ? svgSentence(loc.messages?.parallelDescription, () => `${options.title}: ${n(options.rows.length)} rows across ${n(options.axes.length)} axes (${axisNames}).`, { title: options.title, rows: n(options.rows.length), axes: n(options.axes.length), list: axisNames }) : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
