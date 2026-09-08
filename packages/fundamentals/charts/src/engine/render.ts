// Marks → draw commands. The whole chart, as plain data.

import { computeLayout, layoutBars, layoutBarsH, layoutSeriesPoints, layoutSeriesPointsAt, layoutSeriesPointsH } from './layout'
import { DEFAULT_PALETTE } from './palette'
import { layoutGroupedBars, layoutGroupedBarsH, layoutStackedBars, layoutStackedBarsH, layoutWaterfall, normalizeStack, stackCumulative, stackedExtent, waterfallExtent } from './stack'
import type { Formatter } from './format'
import type { LayoutConfig, PlotLayout } from './layout'
import { extent, niceDomain, scaleLinear } from './scale'
import { percent, plain } from './format'
import { countToDouble } from './brush'
import { polygonCmd, rectCmd } from './corners'
import { seriesGradient } from './gradient'
import type { SeriesGradient } from './gradient'
import { withAlpha } from './radar'
import type { DrawCmd, Domain, MeasureText, Pt, Rect, Double } from './types'

/** One drawable series. */
export interface Series {
  kind: 'bars' | 'line' | 'area' | 'points' | 'stacked' | 'grouped' | 'waterfall' | 'band' | 'stackedArea'
  values: Double[]
  color: string
  /** Stroke width for line/area outlines; ignored by bars and points. */
  width: Double
  /** Point radius; ignored by everything else. */
  radius: Double
  /** Name for the legend, the tooltip and the accessible table. */
  label: string
  /** Densifier applied to line/area points — `smooth`/`step` from ./curve. */
  curve?: ((points: Pt[]) => Pt[]) | undefined
  /**
   * Label each datum with its value.
   *
   * Honoured by EVERY mark kind, with the placement each one allows: outside
   * the free edge for `bars`, `grouped` and `waterfall` (above a positive
   * value, below a negative one), above the point for `line`, `area` and
   * `points`, and INSIDE the segment for `stacked` and `stackedArea`, which
   * have no free edge to hang a label from. The value printed is the
   * datum's OWN — for a stack that is the segment, not the running total the
   * outline already shows.
   */
  showValues?: boolean | undefined
  /** Per-datum radii (the bubble channel), already mapped to pixels. */
  radii?: Double[] | undefined
  /** Which y axis the series scales against; absent = left. See `seriesOnRightAxis`. */
  axis?: 'left' | 'right' | undefined
  /** Halo rings around each point — the effectScatter look; `points` only. */
  effect?: boolean | undefined
  /** Draw bars as a symbol instead of a rect — the pictorialBar look; `bars` only. */
  symbol?: 'rect' | 'circle' | 'diamond' | 'triangle' | undefined
  /** Repeat the symbol along the bar instead of stretching it. */
  symbolRepeat?: boolean | undefined
  /** Corner radii for bar-family series — `[tl, tr, br, bl]`, clamped at paint time. */
  corners?: Double[] | undefined
  /** Linear-gradient fill for bar-family and area series; resolved against the plot box. */
  gradient?: SeriesGradient | undefined
  /** Dash pattern for a line's stroke (`[on, off]` in px) — the target-line look; `line` only. */
  dash?: Double[] | undefined
  /** The fill a `waterfall` step takes when its value is negative; `color` otherwise. */
  negativeColor?: string | undefined
  /**
   * Error-bar bounds, index-aligned with `values` — a whisker from `errLow[i]`
   * to `errHigh[i]` through each bar centre / point. A gap in either bound
   * draws no whisker for that datum. `bars`, `line`, `area` and `points`.
   */
  errLow?: Double[] | undefined
  errHigh?: Double[] | undefined
  /**
   * The SECOND value channel, for marks that span two values per datum.
   *
   * `band` uses it as the lower bound (`values` is the upper), which is what
   * a confidence interval, a min/max range or a forecast cone is. Kept apart
   * from `errLow`/`errHigh` deliberately: those are whiskers DECORATING a
   * value, drawn per datum and never filled, while this is the mark's own
   * geometry — sharing one field would make "draw a whisker" and "draw a
   * region" the same request.
   */
  values2?: Double[] | undefined
}

/**
 * A reference rule or band — the "target line" every dashboard needs.
 *
 * Exactly one of `y`, `x`, or the `yFrom`/`yTo` pair should be set; an
 * annotation with none is skipped rather than guessed at. Values are in DOMAIN
 * units — for a categorical x axis that is the datum INDEX, matching how the
 * points are placed.
 */
export interface Annotation {
  /** Horizontal rule at this y value. */
  y?: Double | undefined
  /** Vertical rule at this x value. */
  x?: Double | undefined
  /** Horizontal band between these two y values. */
  yFrom?: Double | undefined
  yTo?: Double | undefined
  label?: string | undefined
  color?: string | undefined
}

/**
 * A datum-anchored point marker — ECharts' markPoint, engine-shaped.
 *
 * Exactly one of `at` ('max' | 'min') or `atIndex` (a concrete datum index)
 * should be set; a marker with neither is skipped rather than guessed at —
 * the Annotation precedent. Split into two fields rather than one
 * `'max' | 'min' | number` union because a mixed string/number union falls
 * outside the native subset the engine compiles in, and the split costs the
 * caller nothing.
 *
 * Stacked/grouped series are skipped (their geometry is a JOINT layout — a
 * single series' values do not place a point in it), and the marker scales
 * against the series' OWN axis, so a right-axis series marks correctly.
 */
export interface PointMarker {
  /** Which series the marker reads; default 0. */
  seriesIndex?: Double | undefined
  /** Anchor at the series' maximum or minimum datum. */
  at?: 'max' | 'min' | undefined
  /** Anchor at a concrete datum index (clamped into range). */
  atIndex?: Double | undefined
  label?: string | undefined
  /** Marker fill; defaults to the series colour. */
  color?: string | undefined
  /** Marker radius; default 4. */
  radius?: Double | undefined
}

/**
 * The chart's token map — every colour, size and timing a chart draws with.
 *
 * ONE theme feeds every family, the legend, the title, the tooltip and the
 * accessible description; `defaultTheme` is the light theme and
 * `chartThemes.dark` (theme.ts) its dark twin. Hosts resolve a theme from
 * `<ChartThemeProvider>` / the system colour scheme and merge the `theme`
 * prop over it, so a chart with no props already reads right on both grounds.
 *
 * It crosses to native as a struct, which is why every field is a plain
 * string / Double / string list and none is optional: a partial is merged on
 * the web (`resolveChartTheme`) and at COMPILE time on native (`chart-hosts`).
 */
export interface ChartTheme {
  /** Series colours in draw order; marks without a `color` cycle through it. */
  palette: readonly string[]
  /** Chart ground; '' paints nothing (the host's own background shows). */
  background: string
  /** Card surfaces — the tooltip, the legend pager. */
  surface: string
  /** Primary text: titles, tooltip values, value labels. */
  text: string
  /** Secondary text: axis tick labels, legend entries, subtitles. */
  label: string
  /** Axis lines and the crosshair. */
  axis: string
  /** Grid lines and hover bands. */
  grid: string
  /** Font family for every text command; '' inherits the host's font. */
  fontFamily: string
  fontSize: Double
  /** Title size; the subtitle uses `fontSize`. */
  titleSize: Double
  /** Corner radius bars fall back to when a mark sets none. */
  radius: Double
  /** Entrance animation length, ms; 0 disables it. */
  enterMs: Double
  /** Data-update tween length, ms; 0 snaps. */
  updateMs: Double
}

/**
 * Datum emphasis, in VISIBLE-row indices (the crosshair's space).
 *
 * `highlight` is the hovered — or dispatched — datum (-1 = none): its whole
 * column gets a faint band so it reads on every series at once (ECharts' axis
 * shadow), and its bars and points an outline. `selected` are the datums a
 * click or a dispatched `select` pinned: a heavier outline that stays.
 */
export interface Emphasis {
  highlight: number
  selected: number[]
}

export interface ChartSpec {
  width: Double
  height: Double
  series: Series[]
  categories: string[]
  theme: ChartTheme
  showXAxis: boolean
  showYAxis: boolean
  showGrid: boolean
  /** Pins the y domain; when absent it is derived from the data. */
  yDomain?: Domain | undefined
  /** Tick label formatting, per axis. See `LayoutConfig` for why it matters. */
  yFormat?: Formatter | undefined
  xFormat?: Formatter | undefined
  /** Pins the RIGHT y domain; derived from the right-axis series when absent. */
  y2Domain?: Domain | undefined
  /** Tick label formatting for the right axis. */
  y2Format?: Formatter | undefined
  /**
   * Per-datum x positions, index-aligned with every series' values.
   *
   * Present for a CONTINUOUS x axis (a time series, a scatter over a numeric
   * x). Absent means the points are spaced evenly by index, which is right for
   * a categorical axis and misstates the data for an irregular one. `xDomain`
   * is derived from these when they are given.
   */
  xValues?: Double[] | undefined
  /** Label the x axis with calendar steps — see `LayoutConfig.xTime`. */
  xTime?: boolean | undefined
  /**
   * Flip the frame: categories on Y, values on X, bars growing rightward.
   *
   * Bar-family series only (bars / stacked / grouped): a horizontal line or
   * scatter is a transposed COORDINATE SYSTEM, not a flipped bar chart, and
   * pretending otherwise would draw something misleading. Non-bar series in
   * a horizontal spec are SKIPPED — asserted, not silent.
   */
  horizontal?: boolean | undefined
  /** Reference rules and bands, drawn between the grid and the series. */
  annotations?: Annotation[] | undefined
  /** Datum-anchored point markers, drawn OVER the series. */
  markers?: PointMarker[] | undefined
  /**
   * Entrance progress, 0..1; absent means 1 (fully drawn).
   *
   * Animation lives in the ENGINE as a parameter, not in the hosts as a
   * effect: `renderChart` at progress 0.4 is a pure function returning the
   * 40%-grown frame — bars part-risen from the zero line, lines revealed
   * left-to-right, points part-sized. That makes every frame testable, keeps
   * the draw list flat, and means the SwiftUI/Compose executors animate the
   * day they exist, with no animation code of their own. The host's whole job
   * is to tween this number.
   */
  progress?: Double | undefined
  /** Hover + selection emphasis; absent draws nothing extra. */
  emphasis?: Emphasis | undefined
  /**
   * The left y scale. `'log'` draws the chart in the LOG VIEW — see
   * `logView`: every mark lays out linearly over `log10(v / lo)`, the ticks
   * are decades labelled with the real values, non-positive values are gaps.
   * Bars grow from the axis floor (`lo`), the only place a log bar can start.
   */
  yScale?: 'linear' | 'log' | undefined
  /** Label the y axis with calendar steps — the y twin of `xTime`. */
  yTime?: boolean | undefined
  /**
   * Draw the stacked series as SHARES of each column (the 100% stacked bar):
   * every column is scaled to its total, the domain is `{0, 1}` and the y
   * labels read as percent unless `yFormat` says otherwise. The tooltip and
   * the accessible table keep the raw values — the share is a view, not a
   * data edit.
   */
  stackNormalize?: boolean | undefined
  /** Axis titles, drawn in a line of their own outside the tick labels. */
  xTitle?: string | undefined
  yTitle?: string | undefined
  y2Title?: string | undefined
  /** How the x tick labels react to running out of room — see `LayoutConfig.xLabels`. */
  xLabels?: 'auto' | 'rotate' | 'thin' | 'all' | undefined
}

/**
 * The corners a plain bar gets from the theme when its mark set none: the
 * two corners AWAY from the baseline (top for a positive vertical bar, right
 * for a positive horizontal one), so the bar still reads as growing from zero.
 * Zero radius returns undefined — a square rect, byte-identical to before.
 * Stacked and grouped bars keep their mark corners only: rounding every
 * segment breaks a stack.
 */
export function themeCorners(radius: Double, positive: boolean, horizontal: boolean): Double[] | undefined {
  if (radius <= 0.0) return undefined
  if (horizontal) return positive ? [0.0, radius, radius, 0.0] : [radius, 0.0, 0.0, radius]
  return positive ? [radius, radius, 0.0, 0.0] : [0.0, 0.0, radius, radius]
}

export const defaultTheme: ChartTheme = {
  palette: DEFAULT_PALETTE,
  background: '',
  surface: '#ffffff',
  text: '#1f2937',
  label: '#5a6b7a',
  axis: '#8496a5',
  grid: 'rgba(132,150,165,0.18)',
  fontFamily: '',
  fontSize: 11.0,
  titleSize: 15.0,
  radius: 3.0,
  enterMs: 700.0,
  updateMs: 350.0,
}

/** 0 = plain, 1 = highlighted (a hover or a dispatched `highlight`), 2 = selected. */
export function emphasisLevel(spec: ChartSpec, index: number): number {
  const e: Emphasis = spec.emphasis ?? { highlight: -1, selected: [] }
  for (const sel of e.selected) if (sel === index) return 2
  return e.highlight === index ? 1 : 0
}

/** The outline a highlighted (1) or selected (2) bar gets — closed, painted over the fill. */
export function emphasisOutline(r: Rect, level: number, stroke: string): DrawCmd {
  return {
    kind: 'polyline',
    points: [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }],
    stroke,
    width: level === 2 ? 2.5 : 1.5,
  }
}

/**
 * The y domain across every series.
 *
 * Bars are measured from zero, so a bar chart's domain must INCLUDE zero even
 * when all its values sit far above it — otherwise the shortest bar renders as
 * a sliver and the chart lies about proportion. Line and point series get no
 * such treatment: forcing zero into a series of temperatures around 300K would
 * flatten every variation that matters.
 */
export function resolveYDomain(spec: ChartSpec): Domain {
  // `?? derive` rather than an early return: Swift does not narrow
  // `spec.yDomain` through the guard, and the coalesce is the same contract.
  return spec.yDomain ?? deriveOver(leftAxisSeries(spec))
}

/**
 * The RIGHT y domain — meaningful only while `hasRightAxis(spec)` is true.
 *
 * Total rather than optional by design: an optional return forces every
 * caller through a narrowing Swift cannot follow, while a caller that asks
 * for a right domain no right series defines was going to draw nothing with
 * it anyway.
 */
export function resolveY2Domain(spec: ChartSpec): Domain {
  return spec.y2Domain ?? deriveOver(rightAxisSeries(spec))
}

/**
 * The positive bounds a log axis spans — the decade floor below the smallest
 * positive left-axis value and the decade ceiling above the largest, or the
 * pinned `yDomain` when it is positive. `{1, 10}` when nothing is positive,
 * so an all-gap chart still draws an axis.
 */
export function logBounds(spec: ChartSpec): Domain {
  const pinned = spec.yDomain ?? { min: 0.0, max: 0.0 }
  if (spec.yDomain !== undefined && pinned.min > 0.0 && pinned.max > pinned.min) return pinned
  let lo = 0.0
  let hi = 0.0
  for (const s of leftAxisSeries(spec)) {
    for (const v of s.values) {
      if (!(v > 0.0)) continue
      if (lo === 0.0 || v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  if (lo === 0.0) return { min: 1.0, max: 10.0 }
  const floor = Math.pow(10.0, Math.floor(Math.log10(lo)))
  let ceil = Math.pow(10.0, Math.ceil(Math.log10(hi)))
  if (ceil <= floor) ceil = floor * 10.0
  return { min: floor, max: ceil }
}

/**
 * The spec every geometry function actually lays out — the same spec unless
 * it asks for a VIEW of its data.
 *
 * `yScale: 'log'` replaces each left-axis value with `log10(v / lo)` (a
 * non-positive value becomes a gap) and pins the domain to
 * `{0, log10(hi / lo)}`, so bars, lines, points, hits and the crosshair all
 * lay out through the ordinary linear arithmetic while the axis draws
 * decades. `stackNormalize` replaces the stacked series with each column's
 * shares and pins `{0, 1}`. The transform lives HERE, in one function every
 * entry point calls, rather than in each host: the tooltip and the table
 * read the ORIGINAL spec, which is how they keep showing real values.
 */
export function geometrySpec(spec: ChartSpec): ChartSpec {
  const isLog = spec.yScale === 'log'
  const norm = spec.stackNormalize === true
  if (!isLog && !norm) return spec
  const lb = isLog ? logBounds(spec) : { min: 1.0, max: 10.0 }
  const viewMax = isLog ? Math.log10(lb.max / lb.min) : 1.0
  // Initialised in one expression: a typed empty-array `let` lowers to a
  // `val` on Kotlin, so a later reassignment would not compile there.
  const stacked: Double[][] = norm ? normalizeStack(spec.series.filter((s) => s.kind === 'stacked').map((s) => s.values)) : []
  let si = 0
  const series: Series[] = []
  for (const s of spec.series) {
    if (norm && s.kind === 'stacked') {
      series.push({ ...s, values: si < stacked.length ? stacked[si]! : s.values })
      si = si + 1
    } else if (isLog && !seriesOnRightAxis(s, spec)) {
      const values: Double[] = []
      for (const v of s.values) values.push(v > 0.0 ? Math.log10(v / lb.min) : (0.0 / 0.0))
      const lows: Double[] = []
      const highs: Double[] = []
      for (const v of s.errLow ?? []) lows.push(v > 0.0 ? Math.log10(v / lb.min) : (0.0 / 0.0))
      for (const v of s.errHigh ?? []) highs.push(v > 0.0 ? Math.log10(v / lb.min) : (0.0 / 0.0))
      series.push({ ...s, values, errLow: s.errLow === undefined ? undefined : lows, errHigh: s.errHigh === undefined ? undefined : highs })
    } else {
      series.push(s)
    }
  }
  const notes: Annotation[] = []
  for (const a of spec.annotations ?? []) {
    if (!isLog) {
      notes.push(a)
      continue
    }
    // Coalesce-first (the Swift-narrowing idiom): each bound is read as a
    // plain Double and its presence decided separately; a non-positive bound
    // has no place on a log axis and is dropped like a gap.
    const ay = a.y ?? 0.0
    const yF = a.yFrom ?? 0.0
    const yT = a.yTo ?? 0.0
    notes.push({
      ...a,
      y: a.y !== undefined && ay > 0.0 ? Math.log10(ay / lb.min) : undefined,
      yFrom: a.yFrom !== undefined && yF > 0.0 ? Math.log10(yF / lb.min) : undefined,
      yTo: a.yTo !== undefined && yT > 0.0 ? Math.log10(yT / lb.min) : undefined,
    })
  }
  // The pinned view domain: a normalized stack always spans 0..1; a log
  // view spans its decades; the two together stay a log view of shares.
  const yDomain: Domain = isLog ? { min: 0.0, max: viewMax } : { min: 0.0, max: 1.0 }
  return { ...spec, series, yDomain, annotations: spec.annotations === undefined ? undefined : notes, yScale: 'linear', stackNormalize: false }
}

/**
 * Does this series scale on the RIGHT axis?
 *
 * Three deliberate pins, none silent: stacked/grouped are laid out as ONE set
 * against ONE scale (a stack across two axes is not a stack); the horizontal
 * frame has a single value axis; and when NO left series exists the right
 * ones fall back to left — a chart whose every series is "right" is just a
 * chart, and a left axis with no data to define it would label nothing.
 */
export function seriesOnRightAxis(s: Series, spec: ChartSpec): boolean {
  if (spec.horizontal === true) return false
  if (s.kind === 'stacked' || s.kind === 'grouped' || s.kind === 'stackedArea') return false
  if (s.axis !== 'right') return false
  let hasLeft = false
  for (const q of spec.series) {
    const qRight = q.axis === 'right' && q.kind !== 'stacked' && q.kind !== 'grouped' && q.kind !== 'stackedArea'
    if (!qRight) hasLeft = true
  }
  return hasLeft
}

/** True when at least one series actually scales on the right axis. */
export function hasRightAxis(spec: ChartSpec): boolean {
  for (const s of spec.series) if (seriesOnRightAxis(s, spec)) return true
  return false
}

function leftAxisSeries(spec: ChartSpec): Series[] {
  return spec.series.filter((s) => !seriesOnRightAxis(s, spec))
}

function rightAxisSeries(spec: ChartSpec): Series[] {
  return spec.series.filter((s) => seriesOnRightAxis(s, spec))
}

function deriveOver(series: Series[]): Domain {
  // A STACK's domain is its tallest TOTAL, not its tallest value — taking the
  // max of the individual series would clip the stack at the top.
  const stacked = series.filter((s) => s.kind === 'stacked' || s.kind === 'stackedArea')
  if (stacked.length > 0) {
    const e = stackedExtent(stacked.map((s) => s.values))
    const others: Double[] = []
    for (const s of series) if (s.kind !== 'stacked' && s.kind !== 'stackedArea') for (const v of s.values) if (isFiniteValue(v)) others.push(v)
    const max = others.length > 0 ? Math.max(e.max, extent(others).max) : e.max
    return niceDomain({ min: 0.0, max }, 5.0)
  }
  const all: Double[] = []
  let hasBars = false
  for (const s of series) {
    if (s.kind === 'bars' || s.kind === 'area' || s.kind === 'grouped' || s.kind === 'waterfall' || s.kind === 'stackedArea') hasBars = true
    if (s.kind === 'waterfall') {
      // A waterfall's extent is its RUNNING TOTALS, not its steps — a chart
      // of +5, +5, +5 must reach 15.
      const we = waterfallExtent(s.values)
      all.push(we.min)
      all.push(we.max)
      continue
    }
    // Gaps (NaN) carry no extent — and so do error bars beyond them: the
    // whisker must stay inside the axis.
    for (const v of s.values) if (isFiniteValue(v)) all.push(v)
    // A band's lower bound is data too; without it a band dipping below every
    // `values` entry is clipped at the axis floor.
    for (const v of s.values2 ?? []) if (isFiniteValue(v)) all.push(v)
    for (const v of s.errLow ?? []) if (isFiniteValue(v)) all.push(v)
    for (const v of s.errHigh ?? []) if (isFiniteValue(v)) all.push(v)
  }
  const e = extent(all)
  const withZero: Domain = hasBars
    ? { min: e.min > 0.0 ? 0.0 : e.min, max: e.max < 0.0 ? 0.0 : e.max }
    : e
  return niceDomain(withZero, 5.0)
}

/**
 * Finite check written for the native subset: a NaN is the only value that is
 * not equal to itself, and the engine never produces infinities. `Number.*`
 * has no lowering inside this module, so the comparison IS the check.
 */
function isFiniteValue(v: Double): boolean {
  return v === v
}

/** Longest series length — the x extent for a numeric axis. */
export function seriesMaxLength(series: Series[]): number {
  let n = 0
  for (const s of series) if (s.values.length > n) n = s.values.length
  return n
}

/** Lay the chart out without drawing it — exposed for hit-testing. */
export function layoutChart(raw: ChartSpec, measure: MeasureText): PlotLayout {
  const spec = geometrySpec(raw)
  const n = seriesMaxLength(spec.series)
  const isLog = raw.yScale === 'log'
  const lb = isLog ? logBounds(raw) : { min: 1.0, max: 10.0 }
  const cfg: LayoutConfig = {
    width: spec.width,
    height: spec.height,
    xDomain:
      (spec.xValues ?? []).length > 0
        ? extent(spec.xValues ?? [])
        : { min: 0.0, max: n > 1 ? n - 1 : 1.0 },
    yDomain: resolveYDomain(spec),
    categories: spec.categories,
    fontSize: spec.theme.fontSize,
    xTickCount: 5.0,
    yTickCount: 5.0,
    showXAxis: spec.showXAxis,
    showYAxis: spec.showYAxis,
    // Assigned rather than conditionally SPREAD. `...(cond ? { k } : {})` is
    // the idiomatic TS for an exactOptionalPropertyTypes field, and it emits an
    // EMPTY object literal — which PMTC has no lowering for, so the idiom costs
    // this module its native-readiness for nothing. The engine exists to
    // compile, so it is written in the subset that does.
    // A normalized stack reads as percent unless the caller formats it.
    yFormat: spec.yFormat ?? (raw.stackNormalize === true ? percent(0) : undefined),
    xFormat: spec.xFormat,
    // undefined when unused, so the layout's right gutter stays the slim
    // default for every single-axis chart.
    y2Domain: hasRightAxis(spec) ? resolveY2Domain(spec) : undefined,
    y2Format: spec.y2Format,
    xTime: spec.xTime === true,
    horizontal: spec.horizontal === true,
    xTitle: spec.xTitle,
    yTitle: spec.yTitle,
    y2Title: spec.y2Title,
    yLog: isLog,
    yLogMin: lb.min,
    yLogMax: lb.max,
    yTime: spec.yTime === true,
    xLabels: spec.xLabels,
  }
  return computeLayout(cfg, measure)
}

/**
 * Build the full command list.
 *
 * Order is painter's order and deliberate: grid, then axes, then series, then
 * labels. Series draw over the grid so a bar is never bisected by a gridline,
 * and labels draw last so nothing can cover them.
 */
export function renderChart(spec: ChartSpec, measure: MeasureText): DrawCmd[] {
  return renderChartIn(spec, measure, layoutChart(spec, measure))
}

/**
 * `renderChart` over a layout the caller already computed.
 *
 * A host lays the chart out once per frame and then asks four questions of the
 * same geometry — paint it, hit-test it, place the crosshair, draw the focus
 * ring. Before this every one of those recomputed `layoutChart` (which measures
 * every tick label), so one pointer move cost four to six layouts. The layout
 * is a pure function of the spec, so handing it in changes nothing but the
 * work; `renderChart` is that call with the layout made for you.
 */
export function renderChartIn(raw: ChartSpec, measure: MeasureText, l: PlotLayout): DrawCmd[] {
  // Geometry runs over the VIEW; printed values (value labels) read the
  // original series through `printed`, so a log chart labels a bar "1000",
  // not "3".
  const spec = geometrySpec(raw)
  const printed = (k: number, i: number): Double => {
    const sv = raw.series[k]!.values
    return i < sv.length ? sv[i]! : 0.0 / 0.0
  }
  const yDomain = resolveYDomain(spec)
  // Non-optional on purpose: when no right axis exists this aliases the left
  // domain and is simply never consulted — the binding shape Swift can carry
  // through every branch below without narrowing.
  const useY2 = hasRightAxis(spec)
  const y2Domain = useY2 ? resolveY2Domain(spec) : yDomain
  const plot = l.plot
  const t = spec.theme
  const out: DrawCmd[] = []
  // `?? 1.0` FIRST, then clamp a non-optional. Swift does not narrow an
  // optional through a ternary chain, so the coalesce-then-clamp idiom is
  // what compiles on native — and it reads better on web too.
  const rawProgress = spec.progress ?? 1.0
  const progress = rawProgress < 0.0 ? 0.0 : rawProgress > 1.0 ? 1.0 : rawProgress

  // Grows a bar rect toward its value from the zero line — the edge a bar is
  // measured from, so a negative bar grows DOWNWARD during the entrance
  // instead of sliding in from above.
  const growRect = (r: Rect, dom: Domain): Rect => {
    if (progress >= 1.0) return r
    const zeroY = scaleLinear(dom, plot.y + plot.h, plot.y, dom.min < 0.0 && dom.max > 0.0 ? 0.0 : dom.min)
    const h = r.h * progress
    const top = r.y + r.h <= zeroY + 0.5 ? zeroY - h : zeroY
    return { x: r.x, y: top, w: r.w, h }
  }

  // The horizontal twin: grows a bar toward its value from the zero line,
  // which in this frame is a VERTICAL line — a negative bar grows leftward.
  const growRectH = (r: Rect): Rect => {
    if (progress >= 1.0) return r
    const zeroX = scaleLinear(yDomain, plot.x, plot.x + plot.w, yDomain.min < 0.0 && yDomain.max > 0.0 ? 0.0 : yDomain.min)
    const w = r.w * progress
    const left = r.x >= zeroX - 0.5 ? zeroX : zeroX - w
    return { x: left, y: r.y, w, h: r.h }
  }

  // Reveals a polyline left to right: whole points up to the cut, plus an
  // interpolated point partway along the segment the cut lands in, so the tip
  // advances smoothly instead of popping a segment at a time.
  const reveal = (pts: Pt[]): Pt[] => {
    if (progress >= 1.0 || pts.length < 2) return pts
    const span = pts.length - 1
    const cut = span * progress
    const whole = Math.floor(cut)
    const outPts: Pt[] = []
    for (let i = 0; i <= whole; i++) outPts.push(pts[i]!)
    const frac = cut - whole
    if (frac > 0.0 && whole + 1 < pts.length) {
      const a = pts[whole]!
      const b = pts[whole + 1]!
      outPts.push({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac })
    }
    return outPts
  }

  if (spec.showGrid) {
    if (spec.horizontal === true) {
      // The grid follows the VALUE axis — vertical lines in this frame.
      for (const tick of l.xTicks) {
        out.push({
          kind: 'line',
          from: { x: tick.pos, y: plot.y },
          to: { x: tick.pos, y: plot.y + plot.h },
          stroke: t.grid,
          width: 1.0,
        })
      }
    } else {
      for (const tick of l.yTicks) {
        out.push({
          kind: 'line',
          from: { x: plot.x, y: tick.pos },
          to: { x: plot.x + plot.w, y: tick.pos },
          stroke: t.grid,
          width: 1.0,
        })
      }
    }
  }

  if (spec.showYAxis) {
    out.push({
      kind: 'line',
      from: { x: plot.x, y: plot.y },
      to: { x: plot.x, y: plot.y + plot.h },
      stroke: t.axis,
      width: 1.0,
    })
  }
  if (spec.showXAxis) {
    out.push({
      kind: 'line',
      from: { x: plot.x, y: plot.y + plot.h },
      to: { x: plot.x + plot.w, y: plot.y + plot.h },
      stroke: t.axis,
      width: 1.0,
    })
  }
  if (spec.showYAxis && useY2) {
    out.push({
      kind: 'line',
      from: { x: plot.x + plot.w, y: plot.y },
      to: { x: plot.x + plot.w, y: plot.y + plot.h },
      stroke: t.axis,
      width: 1.0,
    })
  }

  // Reference bands and rules sit BETWEEN the grid and the series: a band is
  // context the data draws over, and a rule must not be buried under a filled
  // area — dashing is what keeps it legible crossing the data. Bands first,
  // rules second, so a rule bounding its own band stays visible.
  const notes = spec.annotations ?? []
  for (const a of notes) {
    // Coalesced before use: Swift does not narrow `a.yFrom` through the
    // guard, and the guard still decides whether the band draws at all.
    const yFrom = a.yFrom ?? 0.0
    const yTo = a.yTo ?? 0.0
    if (a.yFrom !== undefined && a.yTo !== undefined) {
      const y1 = scaleLinear(yDomain, plot.y + plot.h, plot.y, yFrom)
      const y2 = scaleLinear(yDomain, plot.y + plot.h, plot.y, yTo)
      const top = y1 < y2 ? y1 : y2
      out.push({
        kind: 'rect',
        rect: { x: plot.x, y: top, w: plot.w, h: Math.abs(y2 - y1) },
        fill: withAlpha(a.color ?? t.axis, 0.12),
      })
    }
  }
  for (const a of notes) {
    const ay = a.y ?? 0.0
    if (a.y !== undefined) {
      const yPos = scaleLinear(yDomain, plot.y + plot.h, plot.y, ay)
      out.push({
        kind: 'line',
        from: { x: plot.x, y: yPos },
        to: { x: plot.x + plot.w, y: yPos },
        stroke: a.color ?? t.axis,
        width: 1.0,
        dash: [4.0, 4.0],
      })
      const yLabel = a.label ?? ''
      if (a.label !== undefined) {
        out.push({
          kind: 'text',
          text: yLabel,
          at: { x: plot.x + plot.w, y: yPos - 4.0 },
          fill: a.color ?? t.label,
          size: t.fontSize,
          align: 'end',
          baseline: 'bottom',
        })
      }
    }
    const ax = a.x ?? 0.0
    if (a.x !== undefined) {
      const xPos = scaleLinear(l.xDomainUsed, plot.x, plot.x + plot.w, ax)
      out.push({
        kind: 'line',
        from: { x: xPos, y: plot.y },
        to: { x: xPos, y: plot.y + plot.h },
        stroke: a.color ?? t.axis,
        width: 1.0,
        dash: [4.0, 4.0],
      })
      const xLabel = a.label ?? ''
      if (a.label !== undefined) {
        out.push({
          kind: 'text',
          text: xLabel,
          at: { x: xPos + 4.0, y: plot.y },
          fill: a.color ?? t.label,
          size: t.fontSize,
          align: 'start',
          baseline: 'top',
        })
      }
    }
  }

  // Emphasis band: the highlighted datum's column, UNDER every series, so a
  // hover or a dispatched `highlight` reads on all of them at once.
  //
  // Two native-subset rules decide the shape here. The emitter coerces both
  // operands of a DIVISION (`Double(plot.w) / Double(nb)`) and a LOOP variable
  // (`band * Double(i)`), but not a plain int local in a multiplication — so
  // the width can be written inline while the offset goes through the engine's
  // own `countToDouble`. Swift has no implicit Int/Double promotion, so this
  // is a compile error rather than a style choice; `countToDouble` is O(index)
  // and runs once per frame only while something is highlighted.
  const emph: Emphasis = spec.emphasis ?? { highlight: -1, selected: [] }
  if (emph.highlight >= 0 && spec.horizontal !== true) {
    const xsE = spec.xValues ?? []
    const hi = emph.highlight
    if (xsE.length > emph.highlight) {
      const cx = scaleLinear(l.xDomainUsed, plot.x, plot.x + plot.w, xsE[emph.highlight]!)
      out.push({ kind: 'rect', rect: { x: cx - 6.0, y: plot.y, w: 12.0, h: plot.h }, fill: withAlpha(t.axis, 0.14) })
    } else if (spec.categories.length > emph.highlight) {
      const nb = spec.categories.length
      const bandW = plot.w / nb
      out.push({ kind: 'rect', rect: { x: plot.x + bandW * countToDouble(hi), y: plot.y, w: bandW, h: plot.h }, fill: withAlpha(t.axis, 0.14) })
    }
  }

  // Stacked and grouped series are laid out TOGETHER — each needs to know the
  // others to place its bars — so they are drawn as a set before the
  // independent marks rather than one at a time in the loop below.
  // The flipped frame gets the SAME marks, through the horizontal twins.
  // Before this, `horizontal` simply filtered stacked and grouped series out:
  // the chart drew its axes and nothing else, with no warning — a population
  // pyramid or a ranked breakdown rendered as an empty box.
  const stackedSeries = spec.series.filter((s) => s.kind === 'stacked')
  if (stackedSeries.length > 0) {
    const stackSegs = spec.horizontal === true
      ? layoutStackedBarsH(stackedSeries.map((s) => s.values), plot, yDomain, 0.25)
      : layoutStackedBars(stackedSeries.map((s) => s.values), plot, yDomain, 0.25)
    const fmtS = spec.yFormat ?? plain
    for (const seg of stackSegs) {
      const rS = growRect(seg.rect, yDomain)
      const gS = seriesGradient(stackedSeries[seg.seriesIndex]!.gradient, plot)
      out.push(rectCmd(rS, stackedSeries[seg.seriesIndex]!.color, stackedSeries[seg.seriesIndex]!.corners, gS.stops.length === 0 ? undefined : gS))
      const lvlS = emphasisLevel(spec, seg.datumIndex)
      if (lvlS > 0) out.push(emphasisOutline(rS, lvlS, t.label))
      // A stacked segment labels INSIDE itself: its value is the segment's
      // own, not the running total, and there is no outside edge to hang it
      // from that would not collide with the segment above.
      if (stackedSeries[seg.seriesIndex]!.showValues === true && progress >= 1.0) {
        out.push({
          kind: 'text',
          text: fmtS(seg.value),
          at: { x: rS.x + rS.w / 2.0, y: rS.y + rS.h / 2.0 },
          fill: t.label,
          size: t.fontSize,
          align: 'middle',
          baseline: 'middle',
        })
      }
    }
  }
  const groupedSeries = spec.series.filter((s) => s.kind === 'grouped')
  if (groupedSeries.length > 0) {
    const groupSegs = spec.horizontal === true
      ? layoutGroupedBarsH(groupedSeries.map((s) => s.values), plot, yDomain, 0.25)
      : layoutGroupedBars(groupedSeries.map((s) => s.values), plot, yDomain, 0.25)
    const fmtG = spec.yFormat ?? plain
    for (const seg of groupSegs) {
      const rG = growRect(seg.rect, yDomain)
      const gG = seriesGradient(groupedSeries[seg.seriesIndex]!.gradient, plot)
      out.push(rectCmd(rG, groupedSeries[seg.seriesIndex]!.color, groupedSeries[seg.seriesIndex]!.corners, gG.stops.length === 0 ? undefined : gG))
      const lvlG = emphasisLevel(spec, seg.datumIndex)
      if (lvlG > 0) out.push(emphasisOutline(rG, lvlG, t.label))
      // A grouped bar has a free outer edge, so it labels OUTSIDE like a
      // plain bar — above a positive one, below a negative one.
      if (groupedSeries[seg.seriesIndex]!.showValues === true && progress >= 1.0) {
        out.push({
          kind: 'text',
          text: fmtG(seg.value),
          at: { x: rG.x + rG.w / 2.0, y: seg.value < 0.0 ? rG.y + rG.h + 4.0 : rG.y - 4.0 },
          fill: t.label,
          size: t.fontSize,
          align: 'middle',
          baseline: seg.value < 0.0 ? 'top' : 'bottom',
        })
      }
    }
  }

  // Stacked areas are laid out as a SET, like stacked bars: each band is
  // filled between the running total below it and its own top, so the
  // outline of the topmost series is the total.
  const areaStack = spec.horizontal === true ? [] : spec.series.filter((s) => s.kind === 'stackedArea')
  if (areaStack.length > 0) {
    const tops = stackCumulative(areaStack.map((s) => s.values))
    for (let k = 0; k < areaStack.length; k++) {
      const sA = areaStack[k]!
      const top = tops[k]!
      const below = k === 0 ? [] : tops[k - 1]!
      const upper: Pt[] = []
      const lower: Pt[] = []
      for (let i = 0; i < top.length; i++) {
        const xAt = plot.x + (plot.w / Math.max(1.0, countToDouble(top.length))) * (countToDouble(i) + 0.5)
        upper.push({ x: xAt, y: scaleLinear(yDomain, plot.y + plot.h, plot.y, top[i]!) })
        lower.push({ x: xAt, y: scaleLinear(yDomain, plot.y + plot.h, plot.y, k === 0 ? yDomain.min : below[i]!) })
      }
      if (upper.length > 1) {
        const poly: Pt[] = []
        for (const p of upper) poly.push(p)
        for (let i = lower.length - 1; i >= 0; i--) poly.push(lower[i]!)
        const gA = seriesGradient(sA.gradient, plot)
        out.push(polygonCmd(poly, sA.color, gA.stops.length === 0 ? undefined : gA))
        // Like a stacked SEGMENT, a stacked band labels inside itself with
        // its OWN value — the running total is what the outline already
        // shows, and a label repeating it would say nothing per series.
        if (sA.showValues === true && progress >= 1.0) {
          const fmtA = spec.yFormat ?? plain
          for (let i = 0; i < upper.length; i++) {
            const v = i < sA.values.length ? sA.values[i]! : 0.0 / 0.0
            if (!isFiniteValue(v)) continue
            out.push({
              kind: 'text',
              text: fmtA(v),
              at: { x: upper[i]!.x, y: (upper[i]!.y + lower[i]!.y) / 2.0 },
              fill: t.label,
              size: t.fontSize,
              align: 'middle',
              baseline: 'middle',
            })
          }
        }
      }
    }
  }

  for (let sIdx = 0; sIdx < spec.series.length; sIdx++) {
    const s = spec.series[sIdx]!
    if (s.kind === 'stacked' || s.kind === 'grouped' || s.kind === 'stackedArea') continue
    // One helper rather than three call-site conditionals: line, area and
    // points must agree about placement, or an area fill drifts away from the
    // line it is meant to sit under.
    // Coalesced to a sentinel: an EMPTY array means "place by index", and a
    // non-optional binding is what Swift can use on both sides of the branch.
    const xs = spec.xValues ?? []
    // Each independent series scales against ITS axis — the whole point of a
    // dual-axis chart, and the line that decides it.
    const sDomain = seriesOnRightAxis(s, spec) ? y2Domain : yDomain
    const place = (values: Double[]): Pt[] =>
      xs.length > 0
        ? layoutSeriesPointsAt(values, xs, plot, sDomain, l.xDomainUsed)
        : layoutSeriesPoints(values, plot, sDomain)

    // The curve shapes line AND area from the same densified points — an
    // area whose fill followed straight segments under a smoothed outline
    // would show slivers of background between the two.
    // Coalesced to identity: calling through the optional needs a lowering
    // Swift lacks, and "no curve" IS the identity curve.
    const curveFn = s.curve ?? ((q: Pt[]): Pt[] => q)
    // Resolved once per series: the ramp spans the plot, not the shape.
    const sGradAll = seriesGradient(s.gradient, plot)
    const sGrad = sGradAll.stops.length === 0 ? undefined : sGradAll
    const shape = (pts: Pt[]): Pt[] => curveFn(pts)

    if (spec.horizontal === true) {
      if (s.kind !== 'bars') continue
      const rects = layoutBarsH(s.values, plot, yDomain, 0.25)
      for (let ri = 0; ri < rects.length; ri++) {
        const r = rects[ri]!
        const grown = growRectH(r)
        if (s.symbol === undefined) {
          out.push(rectCmd(grown, s.color, s.corners ?? themeCorners(spec.theme.radius, (s.values[ri] ?? 0.0) >= 0.0, true), sGrad))
        } else if (s.symbolRepeat === true) {
          // Repeat a unit symbol along the bar (left to right); a partial last symbol is dropped.
          const unit = grown.h
          let count = 0
          let acc = unit
          for (let k = 0; k < 400; k++) {
            if (unit > 0.0 && acc <= grown.w + 0.001) count = k + 1
            acc = acc + unit
          }
          let kf = 0.0
          for (let k = 0; k < count; k++) {
            out.push(symbolCommand({ x: grown.x + unit * kf, y: grown.y, w: unit, h: unit }, s.symbol ?? 'rect', s.color))
            kf = kf + 1.0
          }
        } else {
          out.push(symbolCommand(grown, s.symbol ?? 'rect', s.color))
        }
      }
      for (let i = 0; i < rects.length; i++) {
        const lvl = emphasisLevel(spec, i)
        if (lvl > 0) out.push(emphasisOutline(growRectH(rects[i]!), lvl, t.label))
      }
      if (s.showValues === true && progress >= 1.0) {
        const fmt = spec.yFormat ?? plain
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]!
          const v = printed(sIdx, i)
          // A gap has no value to print.
          if (!isFiniteValue(v)) continue
          // The label sits just past the bar's far end — right of a positive
          // bar, left of a negative one.
          out.push({
            kind: 'text',
            text: fmt(v),
            at: {
              x: v < 0.0 ? r.x - 4.0 : r.x + r.w + 4.0,
              y: r.y + r.h / 2.0,
            },
            fill: t.label,
            size: t.fontSize,
            align: v < 0.0 ? 'end' : 'start',
            baseline: 'middle',
          })
        }
      }
      continue
    }

    if (s.kind === 'bars') {
      const rects = layoutBars(s.values, plot, sDomain, 0.25)
      for (let ri = 0; ri < rects.length; ri++) {
        const r = rects[ri]!
        const grown = growRect(r, sDomain)
        if (s.symbol === undefined) {
          out.push(rectCmd(grown, s.color, s.corners ?? themeCorners(spec.theme.radius, (s.values[ri] ?? 0.0) >= 0.0, false), sGrad))
        } else if (s.symbolRepeat === true) {
          // Repeat a unit symbol up the bar; a partial last symbol is dropped.
          // (Horizontal charts left this loop above, so the bar is vertical.)
          const unit = grown.w
          const length = grown.h
          let count = 0
          let acc = unit
          for (let k = 0; k < 400; k++) {
            if (unit > 0.0 && acc <= length + 0.001) count = k + 1
            acc = acc + unit
          }
          let kf = 0.0
          for (let k = 0; k < count; k++) {
            const cell: Rect = { x: grown.x, y: grown.y + grown.h - unit * (kf + 1.0), w: unit, h: unit }
            out.push(symbolCommand(cell, s.symbol ?? 'rect', s.color))
            kf = kf + 1.0
          }
        } else {
          out.push(symbolCommand(grown, s.symbol ?? 'rect', s.color))
        }
      }
      for (let i = 0; i < rects.length; i++) {
        const lvl = emphasisLevel(spec, i)
        if (lvl > 0) out.push(emphasisOutline(growRect(rects[i]!, sDomain), lvl, t.label))
      }
      if (s.showValues === true && progress >= 1.0) {
        const fmt = spec.yFormat ?? plain
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]!
          const v = printed(sIdx, i)
          if (!isFiniteValue(v)) continue
          // A negative bar hangs below the zero line, so its label goes under
          // its bottom edge — above the top would sit ON the zero line.
          out.push({
            kind: 'text',
            text: fmt(v),
            at: { x: r.x + r.w / 2.0, y: v < 0.0 ? r.y + r.h + 4.0 : r.y - 4.0 },
            fill: t.label,
            size: t.fontSize,
            align: 'middle',
            baseline: v < 0.0 ? 'top' : 'bottom',
          })
        }
      }
    } else if (s.kind === 'waterfall') {
      // Floating bars from running total to running total, joined by a thin
      // dashed connector so the eye carries the level across each gap.
      const steps = layoutWaterfall(s.values, plot, sDomain, 0.25)
      for (let si = 0; si < steps.length; si++) {
        const st = steps[si]!
        const fill = st.value < 0.0 ? s.negativeColor ?? withAlpha(s.color, 0.55) : s.color
        // Grows from its START level, not the axis zero: a step that begins
        // at 40 and adds 5 must rise from 40.
        const startY = scaleLinear(sDomain, plot.y + plot.h, plot.y, st.start)
        const grownH = st.rect.h * progress
        const grown: Rect = progress >= 1.0 ? st.rect : { x: st.rect.x, y: st.value >= 0.0 ? startY - grownH : startY, w: st.rect.w, h: grownH }
        out.push(rectCmd(grown, fill, s.corners, sGrad))
        const lvlW = emphasisLevel(spec, st.datumIndex)
        if (lvlW > 0) out.push(emphasisOutline(grown, lvlW, t.label))
        if (si + 1 < steps.length && progress >= 1.0) {
          const next = steps[si + 1]!
          const level = scaleLinear(sDomain, plot.y + plot.h, plot.y, st.end)
          out.push({ kind: 'line', from: { x: st.rect.x + st.rect.w, y: level }, to: { x: next.rect.x, y: level }, stroke: t.axis, width: 1.0, dash: [2.0, 2.0] })
        }
        if (s.showValues === true && progress >= 1.0) {
          const fmt = spec.yFormat ?? plain
          const v = printed(sIdx, st.datumIndex)
          out.push({
            kind: 'text',
            text: fmt(v),
            at: { x: st.rect.x + st.rect.w / 2.0, y: v < 0.0 ? st.rect.y + st.rect.h + 4.0 : st.rect.y - 4.0 },
            fill: t.label,
            size: t.fontSize,
            align: 'middle',
            baseline: v < 0.0 ? 'top' : 'bottom',
          })
        }
      }
    } else if (s.kind === 'line') {
      // A non-finite value is a GAP: the line breaks into runs rather than
      // drawing a zero or bridging the hole (ECharts' connectNulls: false).
      for (const run of splitRuns(s.values, place)) {
        const pts = reveal(shape(run))
        if (pts.length > 1) {
          out.push({ kind: 'polyline', points: pts, stroke: s.color, width: s.width, dash: s.dash })
        }
      }
    } else if (s.kind === 'band') {
      // A region between two value channels — a confidence interval, a
      // min/max range, a forecast cone. The polygon runs along the UPPER
      // bound and back along the LOWER one, so the two edges are the data
      // rather than the plot floor an `area` closes to.
      //
      // Gap handling is deliberately joint: a datum is part of the band only
      // when BOTH bounds are finite, because half a bound is not a region.
      const lows = s.values2 ?? []
      const paired: Double[] = []
      for (let i = 0; i < s.values.length; i++) {
        const lo = i < lows.length ? lows[i]! : 0.0 / 0.0
        paired.push(isFiniteValue(s.values[i]!) && isFiniteValue(lo) ? s.values[i]! : 0.0 / 0.0)
      }
      for (const run of splitRuns(paired, place)) {
        const upper = reveal(shape(run))
        if (upper.length < 2) continue
        // The lower edge is placed through the SAME pipeline (curve, reveal)
        // so a smoothed band's two edges cannot drift apart.
        const loRun: Double[] = []
        for (let i = 0; i < paired.length; i++) loRun.push(isFiniteValue(paired[i]!) ? (i < lows.length ? lows[i]! : 0.0 / 0.0) : 0.0 / 0.0)
        const lowerRuns = splitRuns(loRun, place)
        const lower = lowerRuns.length > 0 ? reveal(shape(lowerRuns[0]!)) : []
        const poly: Pt[] = []
        for (const p of upper) poly.push(p)
        for (let i = lower.length - 1; i >= 0; i--) poly.push(lower[i]!)
        if (poly.length > 2) out.push(polygonCmd(poly, s.color, sGrad))
      }
    } else if (s.kind === 'area') {
      // Gap-splitting (a non-finite value breaks the fill into runs, same
      // as the line branch above) combined with gradient fill support — two
      // independent fixes to this branch that landed as separate PRs.
      for (const run of splitRuns(s.values, place)) {
        const pts = reveal(shape(run))
        if (pts.length > 1) {
          const poly: Pt[] = []
          for (const p of pts) poly.push(p)
          // Close down to the baseline so the fill is a band under the line
          // rather than a polygon between the first and last data points.
          poly.push({ x: pts[pts.length - 1]!.x, y: plot.y + plot.h })
          poly.push({ x: pts[0]!.x, y: plot.y + plot.h })
          out.push(polygonCmd(poly, s.color, sGrad))
        }
      }
    } else {
      const pts = place(s.values)
      const radii = s.radii ?? []
      for (let i = 0; i < pts.length; i++) {
        // A gap draws no dot.
        if (!isFiniteValue(s.values[i]!)) continue
        const fullR = radii.length > 0 ? radii[i] ?? s.radius : s.radius
        if (s.effect === true) {
          // Two translucent halos under the dot — the ripple, frozen at a frame.
          out.push({ kind: 'circle', center: pts[i]!, radius: fullR * 2.6 * progress, fill: withAlpha(s.color, 0.12) })
          out.push({ kind: 'circle', center: pts[i]!, radius: fullR * 1.7 * progress, fill: withAlpha(s.color, 0.25) })
        }
        const lvlP = emphasisLevel(spec, i)
        if (lvlP > 0) {
          // A halo UNDER the dot: emphasis that never hides the value.
          out.push({ kind: 'circle', center: pts[i]!, radius: fullR * progress + (lvlP === 2 ? 4.0 : 3.0), fill: withAlpha(t.label, 0.35) })
        }
        out.push({
          kind: 'circle',
          center: pts[i]!,
          radius: fullR * progress,
          fill: s.color,
        })
      }
    }

    // `showValues` on the POINT-LIKE kinds: a label above each datum.
    //
    // Bars have carried this since the beginning; line, area and points
    // silently ignored it, which read as "the option does not apply" and was
    // really "nobody wrote the branch" — labelling the points of a line is as
    // ordinary a request as labelling bars. Bars keep their own placement
    // (below a negative bar, above a positive one, measured from the rect);
    // here the anchor is the placed point itself.
    if (
      s.showValues === true &&
      progress >= 1.0 &&
      (s.kind === 'line' || s.kind === 'area' || s.kind === 'points')
    ) {
      const fmtP = spec.yFormat ?? plain
      const labelPts = place(s.values)
      for (let i = 0; i < labelPts.length; i++) {
        const v = printed(sIdx, i)
        // A gap has no value to print — same rule as the bars.
        if (!isFiniteValue(v)) continue
        out.push({
          kind: 'text',
          text: fmtP(v),
          // Above the point, clear of a dot of the series' own radius.
          at: { x: labelPts[i]!.x, y: labelPts[i]!.y - (s.radius + 5.0) },
          fill: t.label,
          size: t.fontSize,
          align: 'middle',
          baseline: 'bottom',
        })
      }
    }

    // Error bars: a whisker through each datum's centre from its low bound
    // to its high one, capped, once the entrance has settled — a whisker
    // growing with its bar would misstate the bounds along the way. Bars
    // centre on their rects, the point-like kinds on their placed points.
    const eLow = s.errLow ?? []
    const eHigh = s.errHigh ?? []
    if (eLow.length > 0 && eHigh.length > 0 && progress >= 1.0 && s.kind !== 'waterfall') {
      const centres: Double[] = []
      if (s.kind === 'bars') {
        for (const r of layoutBars(s.values, plot, sDomain, 0.25)) centres.push(r.x + r.w / 2.0)
      } else {
        for (const p of place(s.values)) centres.push(p.x)
      }
      const cap = 4.0
      for (let i = 0; i < centres.length; i++) {
        // Bounds-checked rather than coalesced: a Swift array subscript is
        // never optional, so `?? ` there is a warning and a dead branch.
        const lo = i < eLow.length ? eLow[i]! : 0.0 / 0.0
        const hi = i < eHigh.length ? eHigh[i]! : 0.0 / 0.0
        if (!isFiniteValue(lo) || !isFiniteValue(hi)) continue
        const cx = centres[i]!
        const yLo = scaleLinear(sDomain, plot.y + plot.h, plot.y, lo)
        const yHi = scaleLinear(sDomain, plot.y + plot.h, plot.y, hi)
        out.push({ kind: 'line', from: { x: cx, y: yLo }, to: { x: cx, y: yHi }, stroke: t.text, width: 1.0 })
        out.push({ kind: 'line', from: { x: cx - cap, y: yLo }, to: { x: cx + cap, y: yLo }, stroke: t.text, width: 1.0 })
        out.push({ kind: 'line', from: { x: cx - cap, y: yHi }, to: { x: cx + cap, y: yHi }, stroke: t.text, width: 1.0 })
      }
    }
  }

  // Point markers draw OVER the series (painter's order — a marker buried
  // under an area fill marks nothing) and UNDER the axis labels.
  const markers = spec.markers ?? []
  for (const m of markers) {
    const rawSeriesIndex = m.seriesIndex ?? 0.0
    const s = spec.series[Math.floor(rawSeriesIndex)]
    if (s === undefined) continue
    const n = s.values.length
    if (n === 0) continue
    let idx = -1
    if (m.at === 'max') {
      idx = 0
      for (let i = 1; i < n; i++) if (s.values[i]! > s.values[idx]!) idx = i
    } else if (m.at === 'min') {
      idx = 0
      for (let i = 1; i < n; i++) if (s.values[i]! < s.values[idx]!) idx = i
    } else {
      const rawAt = m.atIndex ?? -1.0
      if (m.atIndex !== undefined) {
        // Floor AND clamp in one int-typed scan. The direct forms both fall
        // outside the native subset's Int/Double rules: Math.floor assigns a
        // Double into the Int the argmax branches established, and a
        // rawAt-greater-than-n-minus-one clamp mixes an Int length into
        // Double arithmetic. The scan stops at the last j at-or-below rawAt
        // (the floor), never exceeds n-1 (the high clamp), and the fallback
        // is the low clamp. O(n) over a series the render already walks.
        // jf mirrors j as a Double: Swift rejects an Int-loop-var compared
        // against a Double, and Double-vs-Double is clean on both targets.
        let jf = 0.0
        for (let j = 0; j < n; j++) {
          if (jf <= rawAt) idx = j
          jf = jf + 1.0
        }
        if (idx < 0) idx = 0
      }
    }
    if (idx < 0) continue
    const mDomain = seriesOnRightAxis(s, spec) ? y2Domain : yDomain
    const xsM = spec.xValues ?? []
    // The anchor is whatever the mark's own geometry put there. Markers used
    // to skip the flipped frame and the set-laid-out kinds entirely — a
    // silent no-op on three shapes, while annotations drew on all of them.
    //
    //   * stacked / grouped: the TOP CENTRE of that series' own segment, so
    //     the marker sits on the piece it names rather than at the raw value,
    //     which is not where a stacked datum is drawn at all.
    //   * horizontal: the band-centred placement the flipped bars use.
    const segMarker = markerAnchor(spec, rawSeriesIndex, idx, plot, yDomain)
    const p =
      segMarker.length > 0
        ? segMarker[0]
        : spec.horizontal === true
          ? layoutSeriesPointsH(s.values, plot, mDomain)[idx]
          : xsM.length > 0
            ? layoutSeriesPointsAt(s.values, xsM, plot, mDomain, l.xDomainUsed)[idx]
            : layoutSeriesPoints(s.values, plot, mDomain)[idx]
    if (p === undefined) continue
    const mColor = m.color ?? s.color
    out.push({ kind: 'circle', center: p, radius: (m.radius ?? 4.0) * progress, fill: mColor })
    const mLabel = m.label ?? ''
    if (m.label !== undefined && progress >= 1.0) {
      out.push({
        kind: 'text',
        text: mLabel,
        at: { x: p.x, y: p.y - (m.radius ?? 4.0) - 4.0 },
        fill: mColor,
        size: t.fontSize,
        align: 'middle',
        baseline: 'bottom',
      })
    }
  }

  // The anchors hold in BOTH frames: y-side labels sit left of the plot,
  // x-side labels below it — only what the ticks CONTAIN differs (categories
  // vs values in the horizontal frame).
  for (let ti = 0; ti < l.yTicks.length; ti++) {
    const tick = l.yTicks[ti]!
    // The horizontal frame's category labels thin like x labels do.
    if (l.yLabelEvery > 1 && ti % l.yLabelEvery !== 0) continue
    out.push({
      kind: 'text',
      text: tick.label,
      at: { x: plot.x - 6.0, y: tick.pos },
      fill: t.label,
      size: t.fontSize,
      align: 'end',
      baseline: 'middle',
    })
  }
  for (const tick of l.y2Ticks) {
    out.push({
      kind: 'text',
      text: tick.label,
      at: { x: plot.x + plot.w + 6.0, y: tick.pos },
      fill: t.label,
      size: t.fontSize,
      align: 'start',
      baseline: 'middle',
    })
  }
  for (let ti = 0; ti < l.xTicks.length; ti++) {
    const tick = l.xTicks[ti]!
    if (l.xLabelEvery > 1 && ti % l.xLabelEvery !== 0) continue
    if (l.xLabelRotate !== 0.0) {
      // Slanted: the label's END sits at the tick and the text hangs
      // down-left along the rotation, which is where the gutter made room.
      out.push({
        kind: 'text',
        text: tick.label,
        at: { x: tick.pos, y: plot.y + plot.h + 6.0 },
        fill: t.label,
        size: t.fontSize,
        align: 'end',
        baseline: 'middle',
        rotate: l.xLabelRotate,
      })
    } else {
      out.push({
        kind: 'text',
        text: tick.label,
        at: { x: tick.pos, y: plot.y + plot.h + 6.0 },
        fill: t.label,
        size: t.fontSize,
        align: 'middle',
        baseline: 'top',
      })
    }
  }

  // Axis titles sit in the line the layout reserved outside the tick
  // labels: the x title centred under the plot, the y titles rotated to run
  // along their axes.
  const xTitle = spec.xTitle ?? ''
  if (xTitle !== '' && spec.showXAxis) {
    out.push({ kind: 'text', text: xTitle, at: { x: plot.x + plot.w / 2.0, y: spec.height - 2.0 }, fill: t.label, size: t.fontSize, align: 'middle', baseline: 'bottom' })
  }
  const yTitle = spec.yTitle ?? ''
  if (yTitle !== '' && spec.showYAxis) {
    out.push({ kind: 'text', text: yTitle, at: { x: t.fontSize * 0.9, y: plot.y + plot.h / 2.0 }, fill: t.label, size: t.fontSize, align: 'middle', baseline: 'middle', rotate: -90.0 })
  }
  const y2Title = spec.y2Title ?? ''
  if (y2Title !== '' && useY2 && spec.showYAxis) {
    out.push({ kind: 'text', text: y2Title, at: { x: spec.width - t.fontSize * 0.9, y: plot.y + plot.h / 2.0 }, fill: t.label, size: t.fontSize, align: 'middle', baseline: 'middle', rotate: 90.0 })
  }

  return out
}

/**
 * Split a series into runs of finite values, each already placed. A run is
 * the piece of a line between two gaps; placing the WHOLE series first keeps
 * every point at the x it would have had, so a gap removes a segment without
 * shifting its neighbours.
 */
function splitRuns(values: Double[], place: (values: Double[]) => Pt[]): Pt[][] {
  const runs: Pt[][] = []
  let hasGap = false
  for (const v of values) if (!isFiniteValue(v)) hasGap = true
  if (!hasGap) {
    runs.push(place(values))
    return runs
  }
  // Placement needs finite inputs: substitute zero, then drop those points
  // out of the runs — their x positions are still the right ones.
  const filled: Double[] = []
  for (const v of values) filled.push(isFiniteValue(v) ? v : 0.0)
  const pts = place(filled)
  // Track each run by its start index rather than re-assigning a fresh array
  // (a reassigned array binding has no native lowering).
  let runStart = -1
  for (let i = 0; i < pts.length; i++) {
    if (isFiniteValue(values[i]!)) {
      if (runStart < 0) runStart = i
    } else if (runStart >= 0) {
      const run: Pt[] = []
      for (let j = runStart; j < i; j++) run.push(pts[j]!)
      runs.push(run)
      runStart = -1
    }
  }
  if (runStart >= 0) {
    const run: Pt[] = []
    for (let j = runStart; j < pts.length; j++) run.push(pts[j]!)
    runs.push(run)
  }
  return runs
}

/** One symbol filling `cell` — rect, circle, diamond, or triangle. */
function symbolCommand(cell: Rect, symbol: 'rect' | 'circle' | 'diamond' | 'triangle', fill: string): DrawCmd {
  if (symbol === 'circle') {
    const r = (cell.w < cell.h ? cell.w : cell.h) / 2.0
    return { kind: 'circle', center: { x: cell.x + cell.w / 2.0, y: cell.y + cell.h / 2.0 }, radius: r, fill }
  }
  if (symbol === 'diamond') {
    return {
      kind: 'polygon',
      points: [
        { x: cell.x + cell.w / 2.0, y: cell.y },
        { x: cell.x + cell.w, y: cell.y + cell.h / 2.0 },
        { x: cell.x + cell.w / 2.0, y: cell.y + cell.h },
        { x: cell.x, y: cell.y + cell.h / 2.0 },
      ],
      fill,
    }
  }
  if (symbol === 'triangle') {
    return {
      kind: 'polygon',
      points: [
        { x: cell.x + cell.w / 2.0, y: cell.y },
        { x: cell.x + cell.w, y: cell.y + cell.h },
        { x: cell.x, y: cell.y + cell.h },
      ],
      fill,
    }
  }
  return { kind: 'rect', rect: cell, fill }
}

/** Bar rects for a series index — what a hit test runs against. */
export function barsFor(spec: ChartSpec, index: number, measure: MeasureText): Rect[] {
  return barsForIn(spec, index, layoutChart(spec, measure).plot)
}

/** `barsFor` over a plot rect the caller already laid out. */
export function barsForIn(raw: ChartSpec, index: number, plot: Rect): Rect[] {
  const spec = geometrySpec(raw)
  const s = spec.series[index]
  if (s === undefined || (s.kind !== 'bars' && s.kind !== 'waterfall')) return []
  // The hit rects must come from the SAME domain the bars were drawn with,
  // or a right-axis bar reports hits where the left-axis geometry would be.
  const dom = seriesOnRightAxis(s, spec) ? resolveY2Domain(spec) : resolveYDomain(spec)
  if (s.kind === 'waterfall') {
    // Index-aligned with the values: a gap's slot is an empty rect nothing
    // can land in, so the datum index a hit reports stays the row's.
    const rects: Rect[] = []
    for (let i = 0; i < s.values.length; i++) rects.push({ x: 0.0, y: 0.0, w: -1.0, h: -1.0 })
    for (const st of layoutWaterfall(s.values, plot, dom, 0.25)) rects[st.datumIndex] = st.rect
    return rects
  }
  return layoutBars(s.values, plot, dom, 0.25)
}

/**
 * The datum index under a point for the STACKED and GROUPED bar sets, or -1.
 *
 * `barsFor` answers only for `kind === 'bars'`, because a plain bar series is
 * laid out on its own. Stacked and grouped series are laid out TOGETHER — each
 * needs the others to place its bars — so they cannot be asked one series at a
 * time, which is why the host's hit test skipped them entirely and every click
 * on a stacked or grouped chart reported a miss. They draw real rects, and
 * `onSelect`'s contract is "the datum index when a bar is tapped".
 *
 * The segment carries both indices; the DATUM index is returned, matching what
 * a plain bar series reports and what the tooltip renders. Which SERIES a
 * segment belongs to is not expressible through a single-index callback, so it
 * is deliberately not surfaced here rather than guessed at.
 */
export function stackedHitAt(
  spec: ChartSpec,
  measure: MeasureText,
  px: Double,
  py: Double,
): number {
  return stackedHitIn(spec, layoutChart(spec, measure).plot, px, py)
}

/** `stackedHitAt` over a plot rect the caller already laid out. */
/**
 * Where a marker sits on a SET-laid-out series (`stacked` / `grouped`).
 *
 * Addressed by SERIES INDEX, and returning a 0- or 1-element list rather than
 * an optional. Both are the engine's native subset speaking, and both were
 * found by the generator rather than by review: an optional return lowers to
 * nothing, and comparing two `Series` with `===` cannot lower at all, because
 * a Series is a STRUCT on Swift and Kotlin — there is no identity to compare.
 * Everything here is index arithmetic for that reason.
 *
 * The anchor matters because a stacked datum is NOT drawn at its raw value:
 * it is drawn at its running total, in a segment whose x is a band centre.
 * Putting a marker through the point-like placement would land it where the
 * data never appears, which is why markers used to skip these kinds outright
 * rather than land in the wrong place. Reading the segment back from the same
 * layout the paint used is what makes the anchor honest.
 */
export function markerAnchor(spec: ChartSpec, seriesIdx: Double, idx: number, plot: Rect, yDomain: Domain): Pt[] {
  const out: Pt[] = []
  // `seriesIdx` stays a DOUBLE and is matched by a Double counter rather than
  // used as a subscript: the caller has it as `Math.floor(...)`, which lowers
  // to a Swift `Double`, and handing that to an Int parameter is the same
  // Int/Double slip the argmax branches above already document. Scanning
  // costs one pass over a series list the render is walking anyway.
  let kind = ''
  let f = 0.0
  for (const q of spec.series) {
    if (f === seriesIdx) kind = q.kind
    f = f + 1.0
  }
  if (kind !== 'stacked' && kind !== 'grouped') return out
  // Which of the same-kind peers this series is — counted by position, since
  // the peers list is what the joint layout is built from.
  let which = -1
  let seen = 0
  let g = 0.0
  for (const q of spec.series) {
    if (q.kind === kind) {
      if (g === seriesIdx) which = seen
      seen = seen + 1
    }
    g = g + 1.0
  }
  if (which < 0) return out
  const values = spec.series.filter((q) => q.kind === kind).map((q) => q.values)
  const flipped = spec.horizontal === true
  const segs =
    kind === 'stacked'
      ? flipped
        ? layoutStackedBarsH(values, plot, yDomain, 0.25)
        : layoutStackedBars(values, plot, yDomain, 0.25)
      : flipped
        ? layoutGroupedBarsH(values, plot, yDomain, 0.25)
        : layoutGroupedBars(values, plot, yDomain, 0.25)
  for (const seg of segs) {
    if (seg.seriesIndex !== which) continue
    if (seg.datumIndex !== idx) continue
    // The FAR edge of the segment, centred on its other axis — the top of a
    // vertical bar, the right end of a horizontal one.
    if (flipped) out.push({ x: seg.rect.x + seg.rect.w, y: seg.rect.y + seg.rect.h / 2.0 })
    else out.push({ x: seg.rect.x + seg.rect.w / 2.0, y: seg.rect.y })
  }
  return out
}

export function stackedHitIn(raw: ChartSpec, plot: Rect, px: Double, py: Double): number {
  const spec = geometrySpec(raw)
  const yDomain = resolveYDomain(spec)
  // The hit reads the SAME layout the paint used, per orientation. It used to
  // bail on the horizontal frame — correct while nothing was drawn there, and
  // a silently dead tap the moment something was.
  const flipped = raw.horizontal === true
  for (const kind of ['stacked', 'grouped'] as const) {
    const series = spec.series.filter((s) => s.kind === kind)
    if (series.length === 0) continue
    const values = series.map((s) => s.values)
    const segs =
      kind === 'stacked'
        ? flipped
          ? layoutStackedBarsH(values, plot, yDomain, 0.25)
          : layoutStackedBars(values, plot, yDomain, 0.25)
        : flipped
          ? layoutGroupedBarsH(values, plot, yDomain, 0.25)
          : layoutGroupedBars(values, plot, yDomain, 0.25)
    for (const seg of segs) {
      const r = seg.rect
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return seg.datumIndex
    }
  }
  return -1
}
