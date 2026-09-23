// `@pyreon/charts/plot` family hosts on native — the table both emitters lower
// from.
//
// Every plot family's GEOMETRY is generated into the native runtimes
// (PyreonChartEngine.swift / .kt, see gen-chart-engine.ts), and both runtimes
// ship `PyreonChartCanvas`, a Canvas that walks the engine's flat draw list.
// What was missing was the HOST: on the web `<SankeyChart nodes links>` is a
// component that lays out into its canvas element; natively that component
// does not exist. This table says, per host, which props are the engine's
// data arguments, which prop is the options struct, how the LAYOUT is built
// from them (the same box arithmetic the web host uses, so a chart lays out
// identically on all three targets for the same size), how the draw list is
// rendered from that layout, and how a tap is answered — the engine's INDEX
// hit (`hitSankeyIndex`, …), which is what the multiplatform-safe
// `onSelectIndex` callback receives on every target.
//
// The hosts NOT here take accessor callbacks (`value={(d) => d.total}`),
// records, mixed-type rows or marks — shapes with no native form. They warn
// BY NAME (`UNLOWERED_CHART_HOSTS`) rather than falling through to the generic
// component emit, which would name a SwiftUI/Compose view that does not exist.

import { compileFamily, familyFrame, GAUGE_DIAL_KEYS, PIE_SHAPE_KEYS, compileOption, readBrush, readToolbox, defaultTimelineStrip, resolveYDomain, timelineSteps, DEFAULT_DECALS, visualMapSpec, visualStripOf, fillPattern, imageFill, decimateShared, graphicElements, labelFields, plain, resolveDataset, samplingRequest } from '@pyreon/charts/option-layer'
import type { ChartPattern, VisualMapSpec, GraphicElement, RichStyle, SamplingRequest } from '@pyreon/charts/option-layer'
import type { AttrIR, ChildIR, ExprIR, TypeIR } from './types'
import { kotlinStr, swiftStr } from './string-literals'
import { CHART_ENGINE_STRUCTS } from './chart-engine-structs'

/** Per-target expression helpers the host specs build their draw list with. */
export interface ChartHostTarget {
  /** `PyreonChartRect(x, y, w, h)` in the target's constructor syntax. */
  rect: (x: string, y: string, w: string, h: string) => string
  /** `PyreonChartPt(x, y)`. */
  pt: (x: string, y: string) => string
  /** `max(0.0, e)`. */
  max0: (e: string) => string
  /** `min(a, b)`. */
  min: (a: string, b: string) => string
  /** The absent-options literal (`nil` / `null`). */
  nil: string
  /** The NaN literal (`Double.nan` / `Double.NaN`) — the engine's gap marker. */
  nan: string
  /** `[a, b]` / `listOf(a, b)`. */
  list: (items: readonly string[]) => string
  /** `Name(f: v, …)` / `Name(f = v, …)`. */
  struct: (name: string, fields: readonly (readonly [string, string])[]) => string
  /** `PieOptions(innerRadius: <innerRatio>, showLabels: true, labelColor: "#ffffff", fontSize: 11.0)` — the web host's fixed pie options. */
  pieOptions: (a: ChartHostArgs) => string
  /** The web hosts' default ChartTheme literal. */
  theme: () => string
  /** `a ?? b` / `a ?: b`. */
  coalesce: (a: string, b: string) => string
  /**
   * The options struct with `progress` set to the entrance: `Struct(progress: p)`
   * when no options were given, else a copy of the user's value with the one
   * field replaced (Swift mutates a `var` copy, Kotlin `.copy(progress = p)`).
   */
  withProgress: (options: string, struct: string, progress: string) => string
  /**
   * The options with the theme's values as DEFAULTS — `Struct(palette: p)`
   * when no options were given, else a copy whose named fields are filled
   * only where the user left them unset (the web host's merge; an explicit
   * value in the options wins).
   */
  withThemeDefaults: (options: string, struct: string, fields: ReadonlyArray<readonly [string, string]>) => string
}

/** An option field the theme supplies a default for, and the theme field it reads. */
export type ChartThemeField =
  | 'palette'
  | 'labelColor'
  | 'gridColor'
  | 'axisColor'
  | 'laneColor'
  | 'linkColor'
  | 'upColor'
  | 'downColor'
  | 'todayColor'
  | 'highlightColor'
  | 'emptyColor'
  | 'stops'
  | 'borderColor'

/** The `ChartTheme` field each option field defaults from — one place, both emitters. */
export const CHART_THEME_SOURCE: Readonly<
  Record<ChartThemeField, 'palette' | 'label' | 'grid' | 'axis' | 'positive' | 'negative' | 'muted' | 'ramp' | 'pageGround'>
> = {
  palette: 'palette',
  labelColor: 'label',
  gridColor: 'grid',
  axisColor: 'axis',
  // The gantt lane band, for the same reason its label is themed.
  laneColor: 'grid',
  // A graph/tree edge is DATA, not chrome, so it reads `label` rather than
  // `axis`: the two families are unreadable without their links, and the
  // hardcoded value this replaced (#94a3b8) was already dark's own label
  // (#9aa5b5) to within (6, 2, -3) — so dark is visually unchanged and only
  // light, where the fixed grey sat at 2.56:1, actually moves.
  linkColor: 'label',
  // Semantic, not palette: a candle's direction, today's rule, a highlighted
  // line. Their old constants were tuned on a white page — `#b42318` reads
  // 2.70:1 on the dark ground, under 1.4.11's 3:1.
  upColor: 'positive',
  downColor: 'negative',
  todayColor: 'negative',
  highlightColor: 'negative',
  // A cell with NO data has to recede into the ground, which is definitionally
  // theme-relative: `#e2e8f0` recedes on white (1.23:1) and GLOWS on dark
  // (14.41:1), where it became the loudest mark on the chart.
  emptyColor: 'muted',
  // The value ramp must rise in contrast against its OWN ground, or a higher
  // value reads as quieter — the light ramp ran 16.32:1 down to 2.04:1 on dark.
  stops: 'ramp',
  // The geo border SEPARATES two filled regions, so it reads the PAGE rather
  // than a token of its own — `pageGround`, which is `background` with its
  // "inherit the page" empty string already resolved to white.
  borderColor: 'pageGround',
}

export interface ChartHostArgs {
  /** The emitted data-prop expressions, in `ChartHostSpec.data` order. */
  data: readonly string[]
  /** The emitted options expression (`nil` / `null` when absent). */
  options: string
  /** Width / height expressions (Doubles). */
  W: string
  H: string
  /** `gutter` (Sankey) — a Double expression. */
  gutter: string
  /** `innerRatio` (Sunburst) — a Double expression. */
  innerRatio: string
  /** Pie slice-label visibility. */
  showLabels?: string
  /** The theme's font size as emitted text (the pie's label size); the default when absent. */
  fontSize?: string
  /** The pie's box when an OptionChart placed it (ECharts' center / radius / box keys), in plot space. */
  frame?: string
  /** The pie's `ArcConfig` literal (ECharts' angles, direction, rose, gaps); the classic pie without it. */
  pieArcs?: string
  /** Trailing `PieOptions` arguments (arcs, labels, view, empty, measure), each already `, name: value`. */
  pieExtra?: string
  /**
   * An option pie's tooltip header (its series name, '' for none): present,
   * the tooltip takes ECharts' default rows — swatch, name, bold grouped value —
   * through `pieTipRowsWith` / `renderTooltipRows`.
   */
  tipHeader?: string
  /** The pie's label colour; white (inside the slices) without it. */
  pieLabelColor?: string
}

/**
 * A GaugeChart's full ECharts dial, from the `dial` / `frameSpec` attributes
 * an OptionChart's desugar attaches: `renderDialIn` over the web-compiled
 * `DialSpec`, in its frame (the whole canvas without one), a datum without
 * its own colour taking the palette's. Undefined when there is no dial.
 */
export function chartDialCmds(e: Extract<ExprIR, { kind: 'jsx-element' }>, target: 'swift' | 'kotlin', W: string, H: string): string | undefined {
  const dialAttr = attrOf(e, 'dial')
  const dial = dialAttr === undefined ? undefined : irToValue(dialAttr, () => undefined)
  const dialLit = dial?.ok === true ? engineStructLiteral('DialSpec', dial.value, target) : undefined
  if (dialLit === undefined) return undefined
  const frameAttr = attrOf(e, 'frameSpec')
  const frame = frameAttr === undefined ? undefined : irToValue(frameAttr, () => undefined)
  const frameLit = frame?.ok === true ? engineStructLiteral('FrameSpec', frame.value, target) : undefined
  const box = frameLit !== undefined ? `frameRectAt(${frameLit}, ${W}, ${H}, 0.0, 0.0)` : target === 'swift' ? `PyreonChartRect(x: 0.0, y: 0.0, w: ${W}, h: ${H})` : `PyreonChartRect(0.0, 0.0, ${W}, ${H})`
  const palette = CHART_HOST_PALETTE.map((c) => (target === 'swift' ? swiftStr(c) : kotlinStr(c)))
  return `renderDialIn(${dialLit}, ${box}, ${target === 'swift' ? `[${palette.join(', ')}]` : `listOf(${palette.join(', ')})`})`
}

/**
 * The pie host's placement and shape, from the `pie` / `frameSpec` attributes
 * an OptionChart's desugar attaches (the web facade's compiled `PieShape` and
 * frame). `W` / `H` are the whole canvas; `left` / `top` the chrome's offset,
 * so the frame lands in plot space exactly where the web draws it.
 */
/**
 * An option family host's ECharts tooltip header (its series name, '' when
 * unnamed) as a target string literal — present only when the desugar set it
 * (the option's tooltip has no formatter), which switches the host to
 * ECharts' default rows.
 */
export function chartTipHeader(e: Extract<ExprIR, { kind: 'jsx-element' }>, target: 'swift' | 'kotlin'): string | undefined {
  const header = attrOf(e, 'tooltipHeader')
  if (header?.kind !== 'literal' || typeof header.value !== 'string') return undefined
  return target === 'swift' ? swiftStr(header.value) : kotlinStr(header.value)
}

export function chartPieArgs(e: Extract<ExprIR, { kind: 'jsx-element' }>, target: 'swift' | 'kotlin', W: string, H: string, left: string, top: string, themeLabel: string): Partial<ChartHostArgs> {
  const out: Partial<ChartHostArgs> = {}
  const named = (k: string, v: string): string => (target === 'swift' ? `, ${k}: ${v}` : `, ${k} = ${v}`)
  const frameAttr = attrOf(e, 'frameSpec')
  const frame = frameAttr === undefined ? undefined : irToValue(frameAttr, () => undefined)
  const frameLit = frame?.ok === true ? engineStructLiteral('FrameSpec', frame.value, target) : undefined
  let extra = ''
  if (frameLit !== undefined) {
    out.frame = `frameRectAt(${frameLit}, ${W}, ${H}, ${left}, ${top})`
  }
  const pieAttr = attrOf(e, 'pie')
  const pie = pieAttr === undefined ? undefined : irToValue(pieAttr, () => undefined)
  if (pie?.ok === true && isPlainRecord(pie.value)) {
    const arcs = engineStructLiteral('ArcConfig', pie.value['arcs'], target)
    if (arcs !== undefined) {
      out.pieArcs = arcs
      extra += named('arcs', arcs)
    }
    const labels = pie.value['labels'] === undefined ? undefined : engineStructLiteral('PieLabelOptions', pie.value['labels'], target)
    if (labels !== undefined) {
      extra += named('labels', labels)
      // Outside labels read on the background, so they take the theme's text; inside ones sit on the slice.
      if (isPlainRecord(pie.value['labels']) && pie.value['labels']['position'] !== 'inside') out.pieLabelColor = themeLabel
    }
    // Outside labels keep within the view (the whole chart unless the box keys say otherwise), as the web's.
    if (frameLit !== undefined) extra += named('view', `frameViewAt(${frameLit}, ${W}, ${H}, ${left}, ${top})`)
    if (typeof pie.value['empty'] === 'string' && pie.value['empty'] !== '') extra += named('empty', target === 'swift' ? swiftStr(pie.value['empty']) : kotlinStr(pie.value['empty']))
    extra += named('measure', target === 'swift' ? 'pyreonChartMeasure' : '::pyreonChartMeasure')
  }
  if (extra !== '') out.pieExtra = extra
  const header = chartTipHeader(e, target)
  if (out.pieArcs !== undefined && header !== undefined) out.tipHeader = header
  return out
}

export interface ChartHostSpec {
  /** The host accepts `roam` (pan / pinch-zoom over a `GeoView` merged into its `GeoOptions`). */
  readonly roam?: boolean
  /** The host accepts `visualMap` (the strip, its dragged range / toggled pieces merged into the options). */
  readonly visualMap?: boolean
  /**
   * A prop that, when present, animates the host: the emit wraps it in the
   * effect clock and feeds the clock's seconds to the `effectTime` data slot.
   */
  readonly clock?: string
  /** Required data props, in engine argument order. */
  readonly data: readonly string[]
  /** Optional engine arguments and the target expression used when their prop is absent. */
  readonly dataDefaults?: Readonly<Record<string, (t: ChartHostTarget) => string>>
  /** The options prop (an `XOptions` struct); optional. */
  readonly options: string
  /** The engine struct the options prop holds — steers an inline literal and names the entrance copy. */
  readonly optionsStruct: string
  /**
   * Option fields whose default is the THEME's value — the web host's
   * `{ palette: theme.palette, labelColor: theme.label, ...props.x }` merge,
   * field for field. An explicit value in the user's options still wins.
   * A family that draws its labels ON its own fill (treemap, sunburst, river)
   * defaults only `palette`: white-on-block is deliberate, not a theme value.
   */
  readonly themeDefaults?: readonly ChartThemeField[]
  /** The web host's default `height`. */
  readonly defaultHeight: number
  /** Builds the layout expression (`layoutX(...)`). */
  readonly layout: (a: ChartHostArgs, t: ChartHostTarget) => string
  /** Builds the `[PyreonDrawCmd]` expression from a layout expression. */
  readonly render: (layout: string, a: ChartHostArgs, t: ChartHostTarget) => string
  /** Hoist a layout that the render expression consumes more than once. */
  readonly reuseLayout?: boolean
  /** The host takes `orient="vertical"`: its layout runs in the transposed box and its draw list is transposed back (`pyreonTransposeCmds`). */
  readonly transposable?: boolean
  /** Builds the index-hit expression for a tap at (x, y) — what `onSelectIndex` receives. */
  readonly hit: (layout: string, x: string, y: string, a: ChartHostArgs, t: ChartHostTarget) => string
  /** Additional index-only events that use the same painted layout. */
  readonly extraHits?: readonly {
    event: string
    hit: (layout: string, x: string, y: string, a: ChartHostArgs, t: ChartHostTarget) => string
  }[]
  /** Per-prop literal adapters for props whose web shape has no native form (see the adapters below). */
  readonly adapt?: Readonly<Record<string, ChartHostAdapter>>
  /** The `gutter` default when the web host's differs from Sankey's 80. */
  readonly gutterDefault?: number
  /** Props that exist on the web but are not lowered — warned BY NAME when present. */
  readonly warnProps?: readonly string[]
  /** Builds the `[LegendEntry]` expression from a layout — the crossing `xLegend` (absent: the family has no legend, as on the web). */
  readonly legend?: (layout: string, a: ChartHostArgs, t: ChartHostTarget) => string
  /** Builds the `[String]` tooltip-lines expression for a tap at (x, y) — the crossing `xTip` (empty = miss). */
  readonly tooltip?: (layout: string, x: string, y: string, a: ChartHostArgs, t: ChartHostTarget) => string
}

/**
 * Turns one data prop's IR (with every data prop's IR to hand) into an engine
 * argument, or `'unsupported'` after warning.
 *
 * `emit` is the host emitter's own expression emitter — an adapter that only
 * has to REFUSE a web-only literal shape (geo) hands everything else straight
 * through, rather than re-deriving the emit for the shapes that already cross.
 */
export type ChartHostAdapter = (
  attrs: Readonly<Record<string, ExprIR>>,
  t: ChartHostTarget,
  warn: (msg: string) => void,
  resolve: (name: string) => ExprIR | undefined,
  emit: (e: ExprIR) => string,
) => string | 'unsupported'

// ---------------------------------------------------------------------------
// Literal adapters. Two hosts take props with no native form — a RECORD
// (`<CalendarChart values={{ '2026-01-05': 3 }}>`) and rows MIXING strings and
// nulls (`<ParallelChart rows={[['4', 30], ['8', null]]}>`). Both are literal-
// shaped in practice, so the adapter turns the literal IR into the engine's
// own arguments (what `calendarValues` / `parallelRows` compute on the web at
// runtime): `[CalendarValue(date:value:)]`, `[[Double]]` with a category
// resolved to its index through the `axes` literal and every gap a NaN.
// Anything else warns BY NAME and emits nothing.
// ---------------------------------------------------------------------------

function litString(e: ExprIR | undefined): string | undefined {
  return e !== undefined && e.kind === 'literal' && typeof e.value === 'string' ? e.value : undefined
}

/**
 * A literal option IR as the plain value the web facade reads, or `undefined`
 * where anything is not a literal (an identifier, a call, a spread).
 */
/** A resolved IR value that is a plain object — what the web facade's readers take. */
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function irToValue(e: ExprIR | undefined, resolve: (name: string) => ExprIR | undefined): { ok: true; value: unknown } | { ok: false } {
  const lit = literalOf(e, resolve)
  if (lit === undefined) return { ok: false }
  if (lit.kind === 'literal') return { ok: true, value: lit.value }
  // `-2` parses as a unary minus over a literal, not a literal: fold it, or any option with a negative number reads as non-literal.
  if (lit.kind === 'unary' && (lit.op === '-' || lit.op === '+')) {
    const inner = irToValue(lit.argument, resolve)
    if (inner.ok && typeof inner.value === 'number') return { ok: true, value: lit.op === '-' ? -inner.value : inner.value }
    return { ok: false }
  }
  if (lit.kind === 'array') {
    const out: unknown[] = []
    for (const el of lit.elements) {
      const v = irToValue(el, resolve)
      if (!v.ok) return v
      out.push(v.value)
    }
    return { ok: true, value: out }
  }
  if (lit.kind === 'object') {
    if (lit.spreads !== undefined && lit.spreads.length > 0) return { ok: false }
    const out: Record<string, unknown> = {}
    for (const f of lit.fields) {
      const v = irToValue(f.value, resolve)
      if (!v.ok) return v
      out[f.name] = v.value
    }
    return { ok: true, value: out }
  }
  return { ok: false }
}

/** The inverse of `irToValue`: a plain JSON-ish value as literal IR (fractions keep their `float` mark). */
function valueToIr(v: unknown): ExprIR {
  if (Array.isArray(v)) return { kind: 'array', elements: v.map(valueToIr) }
  if (v !== null && typeof v === 'object') {
    return { kind: 'object', fields: Object.entries(v as Record<string, unknown>).filter(([, val]) => val !== undefined).map(([name, val]) => ({ name, value: valueToIr(val) })) }
  }
  if (typeof v === 'number') return Number.isInteger(v) ? { kind: 'literal', value: v } : { kind: 'literal', value: v, float: true }
  if (typeof v === 'string' || typeof v === 'boolean' || v === null) return { kind: 'literal', value: v }
  return { kind: 'literal', value: null }
}

/**
 * Resolve a literal `dataset` at COMPILE time with the web facade's own
 * `resolveDataset`: `source` / `dimensions` / `sourceHeader`, `encode`
 * (x / y / itemName / seriesName / tooltip), `datasetIndex` / `datasetId`,
 * and the built-in `filter` / `sort` transforms — so the series data and the
 * category axis a dataset implies are the SAME on every target. Registered
 * transforms live in the page's registry and cannot run here; the resolver
 * names them. An option without a dataset passes through untouched.
 */
function resolveStaticDataset(raw: Extract<ExprIR, { kind: 'object' }>, resolve: (name: string) => ExprIR | undefined, warn: (m: string) => void): Extract<ExprIR, { kind: 'object' }> {
  if (objectField(raw, 'dataset') === undefined) return raw
  const value = irToValue(raw, resolve)
  if (!value.ok || value.value === null || typeof value.value !== 'object') {
    warn('<OptionChart option.dataset>: a native dataset needs a fully literal option (source rows, encode and transforms); native renders without the dataset.')
    return raw
  }
  const resolved = resolveDataset(value.value as Record<string, unknown>)
  for (const w of resolved.warnings) warn(`<OptionChart option.${w.path}>: ${w.message}`)
  const { dataset: _dropped, ...rest } = resolved.option
  const out = valueToIr(rest)
  return out.kind === 'object' ? out : raw
}

function litBoolean(e: ExprIR | undefined): boolean | undefined {
  return e !== undefined && e.kind === 'literal' && typeof e.value === 'boolean' ? e.value : undefined
}

function litNumber(e: ExprIR | undefined): number | undefined {
  if (e === undefined) return undefined
  // A negative datum parses as unary minus over a literal (`-2`), which an
  // option is full of; folding it here keeps every literal reader honest.
  if (e.kind === 'unary' && (e.op === '-' || e.op === '+') && e.argument.kind === 'literal' && typeof e.argument.value === 'number') return e.op === '-' ? -e.argument.value : e.argument.value
  return e.kind === 'literal' && typeof e.value === 'number' ? e.value : undefined
}

function litNull(e: ExprIR): boolean {
  return e.kind === 'literal' && e.value === null
}

/** The literal behind a prop: the expression itself, or a module const's initializer. */
function literalOf(e: ExprIR | undefined, resolve: (name: string) => ExprIR | undefined): ExprIR | undefined {
  if (e === undefined) return undefined
  return e.kind === 'identifier' ? resolve(e.name) : e
}

/** `values={{ 'YYYY-MM-DD': n, … }}` → `[CalendarValue(date:value:)]`. */
export const calendarValuesAdapter: ChartHostAdapter = (attrs, t, warn, resolve) => {
  const values = literalOf(attrs['values'], resolve)
  if (values === undefined || values.kind !== 'object' || (values.spreads !== undefined && values.spreads.length > 0)) {
    warn("<CalendarChart values>: must be an inline `{ 'YYYY-MM-DD': n }` literal, or a module const holding one, on native (a record does not cross); emitting nothing.")
    return 'unsupported'
  }
  const items: string[] = []
  for (const f of values.fields) {
    const n = litNumber(f.value)
    if (n === undefined) {
      warn(`<CalendarChart values>: the value for "${f.name}" must be a number literal on native; emitting nothing.`)
      return 'unsupported'
    }
    items.push(t.struct('CalendarValue', [['date', JSON.stringify(f.name)], ['value', chartDouble(n)]]))
  }
  return t.list(items)
}

const singleAxisSpecAdapter: ChartHostAdapter = (attrs, t, warn, resolve, emit) => {
  const axis = literalOf(attrs['axis'], resolve)
  if (axis?.kind !== 'object') return emit(attrs['axis']!)
  const fields: [string, string][] = []
  const type = litString(objectField(axis, 'type'))
  fields.push(['type', type === undefined ? t.nil : JSON.stringify(type)])
  const categories = literalOf(objectField(axis, 'categories'), resolve)
  fields.push(['categories', categories?.kind === 'array' ? emit(categories) : t.nil])
  const domain = literalOf(objectField(axis, 'domain'), resolve)
  if (domain?.kind === 'object') {
    const min = litNumber(objectField(domain, 'min'))
    const max = litNumber(objectField(domain, 'max'))
    if (min === undefined || max === undefined) {
      warn('<SingleAxisChart axis.domain>: needs literal min/max numbers on native; emitting nothing.')
      return 'unsupported'
    }
    fields.push(['domain', t.struct('Domain', [['min', chartDouble(min)], ['max', chartDouble(max)]])])
  } else fields.push(['domain', t.nil])
  const name = litString(objectField(axis, 'name'))
  fields.push(['name', name === undefined ? t.nil : JSON.stringify(name)])
  return t.struct('SingleAxisSpec', fields)
}

/** Preserve the declared `ParallelAxis[]` element type when optional fields differ between axes. */
const parallelAxesAdapter: ChartHostAdapter = (attrs, t, warn, resolve, emit) => {
  const axes = literalOf(attrs['axes'], resolve)
  if (axes?.kind !== 'array') return emit(attrs['axes']!)
  const items: string[] = []
  for (const item of axes.elements) {
    if (item.kind !== 'object') return emit(attrs['axes']!)
    const name = litString(objectField(item, 'name')) ?? `Axis ${items.length + 1}`
    const fields: [string, string][] = [['name', JSON.stringify(name)]]
    const type = litString(objectField(item, 'type'))
    fields.push(['type', type === undefined ? t.nil : JSON.stringify(type)])
    const categories = literalOf(objectField(item, 'categories'), resolve)
    fields.push(['categories', categories?.kind === 'array' ? emit(categories) : t.nil])
    const domain = literalOf(objectField(item, 'domain'), resolve)
    if (domain?.kind === 'object') {
      const min = litNumber(objectField(domain, 'min'))
      const max = litNumber(objectField(domain, 'max'))
      if (min === undefined || max === undefined) {
        warn('<ParallelChart axes.domain>: needs literal min/max numbers on native; emitting nothing.')
        return 'unsupported'
      }
      fields.push(['domain', t.struct('Domain', [['min', chartDouble(min)], ['max', chartDouble(max)]])])
    } else fields.push(['domain', t.nil])
    const inverse = objectField(item, 'inverse')
    fields.push(['inverse', inverse === undefined ? t.nil : emit(inverse)])
    items.push(t.struct('ParallelAxis', fields))
  }
  return t.list(items)
}

/** `rows={[[…], …]}` → `[[Double]]`, categories resolved through the `axes` literal, gaps as NaN. */
export const parallelRowsAdapter: ChartHostAdapter = (attrs, t, warn, resolve) => {
  const rows = literalOf(attrs['rows'], resolve)
  const axes = literalOf(attrs['axes'], resolve)
  if (rows === undefined || rows.kind !== 'array') {
    warn('<ParallelChart rows>: must be an inline array literal, or a module const holding one, on native (mixed rows do not cross); emitting nothing.')
    return 'unsupported'
  }
  // The categories of axis `a`, read from the axes literal: [] for a value
  // axis (a string there is a gap, as on the web), undefined when unreadable.
  const catsOf = (a: number): string[] | undefined => {
    if (axes === undefined || axes.kind !== 'array') return undefined
    const ax = axes.elements[a]
    if (ax === undefined || ax.kind !== 'object') return undefined
    if (litString(ax.fields.find((f) => f.name === 'type')?.value) !== 'category') return []
    const cats = ax.fields.find((f) => f.name === 'categories')?.value
    if (cats === undefined || cats.kind !== 'array') return undefined
    const out: string[] = []
    for (const c of cats.elements) {
      const s = litString(c)
      if (s === undefined) return undefined
      out.push(s)
    }
    return out
  }
  const out: string[] = []
  for (const row of rows.elements) {
    if (row.kind !== 'array') {
      warn('<ParallelChart rows>: every row must be an inline array literal on native; emitting nothing.')
      return 'unsupported'
    }
    const cells: string[] = []
    for (let a = 0; a < row.elements.length; a++) {
      const cell = row.elements[a]!
      const n = litNumber(cell)
      if (n !== undefined) {
        cells.push(chartDouble(n))
      } else if (litNull(cell)) {
        cells.push(t.nan)
      } else {
        const s = litString(cell)
        if (s === undefined) {
          warn('<ParallelChart rows>: cells must be number, string or null literals on native; emitting nothing.')
          return 'unsupported'
        }
        const cats = catsOf(a)
        if (cats === undefined) {
          warn('<ParallelChart rows>: a category value needs an `axes` literal (inline or a module const) with `categories` on native; emitting nothing.')
          return 'unsupported'
        }
        const idx = cats.indexOf(s)
        cells.push(idx < 0 ? t.nan : chartDouble(idx))
      }
    }
    out.push(t.list(cells))
  }
  return t.list(out)
}

/**
 * The fields an engine struct types as `Double` (bare or `Double | undefined`).
 * A number LITERAL headed for one of them must be written as a Double: Kotlin
 * will not widen `8` to `Double`, so `SankeyLink(value = 8)` does not compile.
 */
function engineDoubleFields(structName: string): ReadonlySet<string> {
  type TypeShape = { kind: string; name?: string; branches?: readonly TypeShape[] }
  const isDouble = (t: TypeShape): boolean =>
    (t.kind === 'typeRef' && t.name === 'Double') || (t.kind === 'union' && (t.branches ?? []).some(isDouble))
  const struct = CHART_ENGINE_STRUCTS.find((s) => s.name === structName)
  return new Set((struct?.fields ?? []).filter((f) => isDouble(f.type as never)).map((f) => f.name))
}

/** A number literal, or a negated one, as a Double literal; undefined for anything else. */
function doubleLiteral(e: ExprIR): string | undefined {
  const n = litNumber(e)
  if (n !== undefined) return chartDouble(n)
  if (e.kind === 'unary' && e.op === '-') {
    const m = litNumber(e.argument)
    if (m !== undefined) return chartDouble(-m)
  }
  return undefined
}

function literalStructArrayAdapter(
  prop: string,
  structName: string,
  required: readonly string[],
  optional: readonly string[],
): ChartHostAdapter {
  const doubles = engineDoubleFields(structName)
  return (attrs, t, warn, resolve, emit) => {
    const emitField = (name: string, field: ExprIR): string => (doubles.has(name) ? (doubleLiteral(field) ?? emit(field)) : emit(field))
    const value = literalOf(attrs[prop], resolve)
    if (value?.kind !== 'array') return emit(attrs[prop]!)
    const rows: string[] = []
    for (let i = 0; i < value.elements.length; i++) {
      const row = literalOf(value.elements[i], resolve)
      if (row?.kind !== 'object') {
        warn(`<${structName} ${prop}[${i}]>: native needs a literal object; emitting nothing.`)
        return 'unsupported'
      }
      const fields: [string, string][] = []
      for (const name of required) {
        const field = objectField(row, name)
        if (field === undefined) {
          warn(`<${structName} ${prop}[${i}].${name}>: required by the native engine; emitting nothing.`)
          return 'unsupported'
        }
        fields.push([name, emitField(name, field)])
      }
      for (const name of optional) fields.push([name, objectField(row, name) === undefined ? t.nil : emitField(name, objectField(row, name)!)])
      rows.push(t.struct(structName, fields))
    }
    return t.list(rows)
  }
}

const sankeyNodesAdapter = literalStructArrayAdapter('nodes', 'SankeyNode', ['name'], ['color'])
const sankeyLinksAdapter = literalStructArrayAdapter('links', 'SankeyLink', ['source', 'target', 'value'], [])
const graphNodesAdapter = literalStructArrayAdapter('nodes', 'GraphNode', ['id'], ['name', 'value', 'category', 'color', 'x', 'y'])
const graphLinksAdapter = literalStructArrayAdapter('links', 'GraphLink', ['source', 'target'], ['value'])

// ---------------------------------------------------------------------------
// Geo. Two of `<MapChart map>`'s three shapes are web-only and one crosses, so
// the adapter's job is to REFUSE the two by name rather than to translate: a
// registry name reads a module map that exists only in the web bundle, and raw
// GeoJSON's `geometry` is a `Polygon | MultiPolygon` union whose `coordinates`
// are `number[][][]` and `number[][][][]` — one field at two depths, which the
// fat-struct lowering correctly refuses to merge. `GeoShape[]` is that union
// already normalised to rings, so it crosses and is handed through untouched.
//
// `geoShapes()` itself reads GeoJSON, so it does not cross either — shared
// source passes a PRECOMPUTED `GeoShape[]`, projected on the web or in a build
// step.
//
// `values` is the opposite case: the web shape is a RECORD, which does not
// cross, but an inline one is literal enough to become the crossing list here
// (what `geoValues` computes at runtime on the web).
// ---------------------------------------------------------------------------

export const geoShapesAdapter: ChartHostAdapter = (attrs, _t, warn, resolve, emit) => {
  const raw = attrs['map']!
  const lit = literalOf(raw, resolve)
  if (lit !== undefined && litString(lit) !== undefined) {
    warn(
      '<MapChart map="…">: the map REGISTRY is web-only — `registerMap` fills a module map that no native target has. '
        + 'Pass a `GeoShape[]` const instead (project the GeoJSON once with `geoShapes(json)` on the web or in a build step); that shape lowers. Emitting nothing.',
    )
    return 'unsupported'
  }
  if (lit !== undefined && lit.kind === 'object') {
    warn(
      "<MapChart map={…}>: raw GeoJSON does not cross — `geometry` is a `Polygon | MultiPolygon` union whose `coordinates` are `number[][][]` and `number[][][][]`, one field at two depths. "
        + 'Normalise it first, OUTSIDE the shared source: `geoShapes(json)` (web-only itself) yields the `GeoShape[]` const that lowers. Emitting nothing.',
    )
    return 'unsupported'
  }
  return emit(raw)
}

/** `values={{ DE: 83, … }}` → `[GeoValue(region:value:)]`; a `GeoValue[]` passes through. */
export const geoValuesAdapter: ChartHostAdapter = (attrs, t, warn, resolve, emit) => {
  const raw = attrs['values']!
  const lit = literalOf(raw, resolve)
  if (lit === undefined || lit.kind !== 'object') return emit(raw)
  if (lit.spreads !== undefined && lit.spreads.length > 0) {
    warn('<MapChart values>: a record literal with a spread does not cross; pass a `GeoValue[]` instead. Emitting nothing.')
    return 'unsupported'
  }
  const items: string[] = []
  for (const f of lit.fields) {
    const n = litNumber(f.value)
    if (n === undefined) {
      warn(`<MapChart values>: the value for "${f.name}" must be a number literal on native; emitting nothing.`)
      return 'unsupported'
    }
    items.push(t.struct('GeoValue', [['region', JSON.stringify(f.name)], ['value', chartDouble(n)]]))
  }
  return t.list(items)
}

const box00 = (a: ChartHostArgs, t: ChartHostTarget): string => t.rect('0.0', '0.0', a.W, a.H)

/**
 * `<MapChart roam>` on native: which gestures it wants and its zoom bounds,
 * read off static attributes (true / 'scale' / 'move' / 'pan', and a literal
 * `scaleLimit`), the same vocabulary and defaults as the web host.
 */
export function chartRoamConfig(read: (name: string) => unknown, warn: (m: string) => void, tag: string, readExpr: (name: string) => ExprIR | undefined = () => undefined): { move: boolean; scale: boolean; min: number; max: number } | null {
  const roam = read('roam')
  if (roam === undefined || roam === false) return null
  const move = roam === true || roam === 'move' || roam === 'pan'
  const scale = roam === true || roam === 'scale'
  if (!move && !scale) {
    warn(`<${tag} roam>: roam must be a literal true, 'scale', 'move' or 'pan' on native; the map is static.`)
    return null
  }
  const lim = readExpr('scaleLimit')
  if (lim !== undefined && lim.kind !== 'object') warn(`<${tag} scaleLimit>: scaleLimit must be a literal { min, max } on native; the default 0.5 … 20 applies.`)
  const min = lim?.kind === 'object' ? litNumber(objectField(lim, 'min')) : undefined
  const max = lim?.kind === 'object' ? litNumber(objectField(lim, 'max')) : undefined
  return { move, scale, min: min ?? 0.5, max: max ?? 20 }
}

/** `options?.field` — or the target's nil when no options were given (`nil?.x` is not Swift). */
const optField = (a: ChartHostArgs, t: ChartHostTarget, field: string): string =>
  a.options === t.nil ? t.nil : `(${a.options}).${field}`

export const CHART_HOSTS: Readonly<Record<string, ChartHostSpec>> = {
  SankeyChart: {
    data: ['nodes', 'links'],
    options: 'sankey',
    optionsStruct: 'SankeyOptions',
    themeDefaults: ['palette', 'labelColor'],
    defaultHeight: 300,
    layout: (a, t) => {
      const box = t.rect(a.gutter, '8.0', t.max0(`${a.W} - ${a.gutter} * 2.0`), t.max0(`${a.H} - 16.0`))
      return `layoutSankey(${a.data[0]}, ${a.data[1]}, ${box}, ${a.options})`
    },
    render: (l, a) => `renderSankey(${l}, ${a.options})`,
    hit: (l, x, y) => `hitSankeyIndex(${l}, ${x}, ${y})`,
    transposable: true,
    legend: (l) => `sankeyLegend(${l})`,
    tooltip: (l, x, y) => `sankeyTip(${l}, ${x}, ${y})`,
    adapt: { nodes: sankeyNodesAdapter, links: sankeyLinksAdapter },
  },
  GraphChart: {
    data: ['nodes', 'links'],
    options: 'graph',
    optionsStruct: 'GraphOptions',
    themeDefaults: ['palette', 'labelColor', 'linkColor'],
    defaultHeight: 300,
    layout: (a, t) => `layoutGraph(${a.data[0]}, ${a.data[1]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a, t) => `renderGraph(${l}, ${box00(a, t)}, ${a.options})`,
    hit: (l, x, y) => `hitGraphIndex(${l}, ${x}, ${y})`,
    tooltip: (l, x, y) => `graphTip(${l}, ${x}, ${y})`,
    adapt: { nodes: graphNodesAdapter, links: graphLinksAdapter },
  },
  TreemapChart: {
    data: ['data'],
    options: 'treemap',
    optionsStruct: 'TreemapOptions',
    themeDefaults: ['palette'],
    defaultHeight: 300,
    layout: (a, t) => `layoutTreemap(${a.data[0]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a) => `renderTreemap(${l}, ${a.options})`,
    hit: (l, x, y) => `hitTreemapIndex(${l}, ${x}, ${y})`,
    legend: (l) => `treemapLegend(${l})`,
    tooltip: (l, x, y) => `treemapTip(${l}, ${x}, ${y})`,
  },
  SunburstChart: {
    data: ['data'],
    options: 'sunburst',
    optionsStruct: 'SunburstOptions',
    themeDefaults: ['palette'],
    defaultHeight: 300,
    layout: (a, t) => {
      const outer = t.max0(`${t.min(a.W, a.H)} / 2.0 - 4.0`)
      return `layoutSunburst(${a.data[0]}, ${outer} * ${a.innerRatio}, ${outer}, ${a.options})`
    },
    render: (l, a, t) => `renderSunburst(${l}, ${t.pt(`${a.W} / 2.0`, `${a.H} / 2.0`)}, ${a.options})`,
    hit: (l, x, y, a, t) => `hitSunburstIndex(${l}, ${t.pt(`${a.W} / 2.0`, `${a.H} / 2.0`)}, ${x}, ${y})`,
    legend: (l) => `sunburstLegend(${l})`,
    tooltip: (l, x, y, a, t) => `sunburstTip(${l}, ${t.pt(`${a.W} / 2.0`, `${a.H} / 2.0`)}, ${x}, ${y})`,
  },
  TreeChart: {
    data: ['data'],
    options: 'tree',
    optionsStruct: 'TreeOptions',
    themeDefaults: ['palette', 'labelColor', 'linkColor'],
    defaultHeight: 300,
    layout: (a, t) => `layoutTree(${a.data[0]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a) => `renderTree(${l}, ${a.options})`,
    hit: (l, x, y, a, t) => `hitTreeIndex(${l}, ${x}, ${y}, ${optField(a, t, 'symbolSize')})`,
    legend: (l) => `treeLegend(${l})`,
    tooltip: (l, x, y, a, t) => `treeTip(${l}, ${x}, ${y}, ${optField(a, t, 'symbolSize')})`,
  },
  ChordChart: {
    data: ['nodes', 'links'],
    options: 'chord',
    optionsStruct: 'ChordOptions',
    themeDefaults: ['palette', 'labelColor'],
    defaultHeight: 360,
    layout: (a, t) =>
      `layoutChord(${a.data[0]}, ${a.data[1]}, ${t.rect('8.0', '8.0', t.max0(`${a.W} - 16.0`), t.max0(`${a.H} - 16.0`))}, ${a.options})`,
    render: (l, a) => `renderChord(${l}, ${a.options})`,
    hit: (l, x, y) => `hitChordIndex(${l}, ${x}, ${y})`,
    legend: (l) => `chordLegend(${l})`,
    tooltip: (l, x, y) => `chordTip(${l}, ${x}, ${y})`,
  },
  RiverChart: {
    data: ['series'],
    options: 'river',
    optionsStruct: 'RiverOptions',
    themeDefaults: ['palette'],
    defaultHeight: 300,
    layout: (a, t) => `layoutRiver(${a.data[0]}, ${t.rect('8.0', '8.0', t.max0(`${a.W} - 16.0`), t.max0(`${a.H} - 16.0`))}, ${a.options})`,
    render: (l, a) => `renderRiver(${l}, ${a.options})`,
    hit: (l, x, y, a, t) => `hitRiverIndex(${l}, ${x}, ${y}, ${optField(a, t, 'curve')})`,
    legend: (l) => `riverLegend(${l})`,
    tooltip: (l, x, y, a, t) => `riverTip(${l}, ${x}, ${y}, ${optField(a, t, 'curve')})`,
  },
  GanttChart: {
    data: ['tasks'],
    options: 'gantt',
    optionsStruct: 'GanttOptions',
    themeDefaults: ['palette', 'labelColor', 'gridColor', 'laneColor', 'todayColor'],
    defaultHeight: 320,
    layout: (a, t) => `layoutGantt(${a.data[0]}, ${t.rect('4.0', '4.0', `${a.W} - 8.0`, `${a.H} - 8.0`)}, ${a.options})`,
    render: (l, a) => `renderGantt(${l}, ${a.options})`,
    hit: (l, x, y) => `hitGanttIndex(${l}, ${x}, ${y})`,
    tooltip: (l, x, y) => `ganttTip(${l}, ${x}, ${y})`,
  },
  PolarChart: {
    data: ['axes', 'series'],
    options: 'polar',
    optionsStruct: 'PolarOptions',
    themeDefaults: ['palette', 'labelColor', 'gridColor'],
    defaultHeight: 300,
    layout: (a, t) => `layoutPolar(${a.data[0]}, ${a.data[1]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a) => `renderPolar(${l}, ${a.options})`,
    hit: (l, x, y) => `hitPolarIndex(${l}, ${x}, ${y})`,
    // The engine's DEFAULT_PALETTE is a private module constant in the generated Swift; the web default is inlined instead.
    legend: (_l, a, t) => `polarLegend(${a.data[1]}, ${t.coalesce(optField(a, t, 'palette'), t.list(CHART_HOST_PALETTE.map((c) => JSON.stringify(c))))})`,
    tooltip: (l, x, y, a) => `polarTip(${l}, ${a.data[1]}, ${x}, ${y})`,
  },
  CalendarChart: {
    visualMap: true,
    data: ['start', 'end', 'values'],
    options: 'calendar',
    optionsStruct: 'CalendarOptions',
    themeDefaults: ['labelColor', 'emptyColor', 'stops'],
    defaultHeight: 140,
    layout: (a, t) => `layoutCalendar(${a.data[0]}, ${a.data[1]}, ${t.rect('4.0', '4.0', `${a.W} - 8.0`, `${a.H} - 8.0`)}, ${a.options})`,
    render: (l, a) => `renderCalendar(${l}, ${a.data[2]}, ${a.options})`,
    hit: (l, x, y) => `hitCalendarIndex(${l}, ${x}, ${y})`,
    transposable: true,
    tooltip: (l, x, y, a) => `calendarTip(${l}, ${a.data[2]}, ${x}, ${y})`,
    adapt: { values: calendarValuesAdapter },
  },
  MapChart: {
    roam: true,
    visualMap: true,
    data: ['map', 'values', 'paths', 'points', 'overlayOptions', 'heat', 'pies', 'heatRadius', 'heatStops', 'trail', 'effectTime'],
    clock: 'trail',
    dataDefaults: {
      paths: (t) => t.list([]),
      points: (t) => t.list([]),
      overlayOptions: (t) => t.struct('GeoOverlayOptions', []),
      heat: (t) => t.list([]),
      pies: (t) => t.list([]),
      heatRadius: () => '20.0',
      heatStops: (t) => t.list([]),
      trail: (t) => t.nil,
      effectTime: () => '0.0',
    },
    options: 'options',
    optionsStruct: 'GeoOptions',
    themeDefaults: ['stops', 'emptyColor', 'borderColor', 'labelColor'],
    defaultHeight: 300,
    layout: (a, t) => `layoutGeoShapes(${a.data[0]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a, t) => `renderGeo(${l}, ${a.data[1]}, ${a.options}) + renderGeoHeat(${l}, ${a.data[5]}, geoHeatStops(${a.data[8]}, ${optField(a, t, 'stops')}), ${a.data[7]}, 1.0) + renderGeoOverlayPaths(${l}, ${a.data[2]}, ${a.data[4]}) + renderGeoPies(${l}, ${a.data[6]}, 1.0) + renderGeoTrailsIfAny(${l}, ${a.data[2]}, ${a.data[9]}, ${a.data[10]}, "#b42318") + renderGeoOverlayPoints(${l}, ${a.data[3]}, ${a.data[4]})`,
    reuseLayout: true,
    hit: (l, x, y) => `hitGeoIndex(${l}, ${x}, ${y})`,
    extraHits: [{ event: 'selectpointindex', hit: (l, x, y, a) => `hitGeoOverlayPoint(${l}, ${a.data[3]}, ${x}, ${y}, (${a.data[4]}).radius)` }],
    tooltip: (l, x, y, a) => `geoTip(${l}, ${a.data[1]}, ${x}, ${y})`,
    adapt: {
      map: geoShapesAdapter,
      values: geoValuesAdapter,
      // A literal radius crosses as a Double (Kotlin rejects an Int where a Double is expected).
      heatRadius: (attrs, _t, _warn, resolve, emit) => {
        const n = litNumber(literalOf(attrs['heatRadius']!, resolve))
        return n === undefined ? emit(attrs['heatRadius']!) : chartDouble(n)
      },
    },
  },
  ParallelChart: {
    data: ['axes', 'rows'],
    options: 'parallel',
    optionsStruct: 'ParallelOptions',
    themeDefaults: ['palette', 'labelColor', 'axisColor', 'highlightColor'],
    defaultHeight: 300,
    gutterDefault: 40,
    layout: (a, t) => `layoutParallel(${a.data[0]}, ${a.data[1]}, ${t.rect(a.gutter, '8.0', t.max0(`${a.W} - ${a.gutter} * 2.0`), t.max0(`${a.H} - 16.0`))}, ${a.options})`,
    render: (l, a) => `renderParallel(${l}, ${a.options})`,
    hit: (l, x, y) => `hitParallelIndex(${l}, ${x}, ${y})`,
    transposable: true,
    adapt: { axes: parallelAxesAdapter, rows: parallelRowsAdapter },
    warnProps: ['rowColor'],
  },
  SingleAxisChart: {
    data: ['axis', 'points'],
    options: 'singleAxis',
    optionsStruct: 'SingleAxisOptions',
    themeDefaults: ['labelColor', 'axisColor'],
    defaultHeight: 160,
    layout: (a, t) => `layoutSingleAxis(${a.data[0]}, ${a.data[1]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a) => `renderSingleAxis(${l}, ${a.options})`,
    hit: (l, x, y) => `hitSingleAxis(${l}, ${x}, ${y})`,
    adapt: { axis: singleAxisSpecAdapter },
  },
}

/** Plot hosts that exist on the web but have no native lowering yet, with the reason. */
export const UNLOWERED_CHART_HOSTS: Readonly<Record<string, string>> = {}

/** The grammar host and its mark/config children — `<Plot>` desugars to `<PlotChart marks>` before the plot emit runs. */
export const GRAMMAR_CHART_HOST = 'Plot'
export const GRAMMAR_MARK_TAGS: Readonly<Record<string, string>> = { Bar: 'bars', Line: 'line', Area: 'area', Dot: 'points', StackedArea: 'stackedArea', Band: 'band' }
export const GRAMMAR_CONFIG_TAGS: readonly string[] = ['Rule', 'Axis', 'Tip', 'Legend', 'Zoom', 'Label', 'Scale', 'Histogram']
/** The FAMILY marks: `<Plot>` with one of these desugars to the row-array host it names, channels as accessors. */
export const GRAMMAR_FAMILY_TAGS: Readonly<Record<string, string>> = { Arc: 'PieChart', Stage: 'FunnelChart', Cell: 'HeatmapChart', Candle: 'CandlestickChart' }
/** The channels of each family mark (the host's accessor props); every other attr is an option. */
const FAMILY_CHANNELS: Readonly<Record<string, readonly string[]>> = { Arc: ['value', 'label', 'color'], Stage: ['value', 'label', 'color'], Cell: ['x', 'y', 'value'], Candle: ['open', 'high', 'low', 'close'] }
/** Where a family mark's option attrs go: an options struct prop, or straight onto the host. */
const FAMILY_OPTIONS_PROP: Readonly<Record<string, string | undefined>> = { Stage: 'funnel', Candle: 'candle' }

/** Whether a JSX tag is a `@pyreon/charts/plot` host, lowered or not (the grammar's mark tags included, so a stray one warns instead of emitting a phantom component). */
export function isChartHostTag(tag: string): boolean {
  return (
    Object.hasOwn(CHART_HOSTS, tag) ||
    Object.hasOwn(ACCESSOR_CHART_HOSTS, tag) ||
    Object.hasOwn(FRAME_CHART_HOSTS, tag) ||
    Object.hasOwn(UNLOWERED_CHART_HOSTS, tag) ||
    tag === 'OptionChart' ||
    tag === GRAMMAR_CHART_HOST ||
    Object.hasOwn(GRAMMAR_MARK_TAGS, tag) ||
    Object.hasOwn(GRAMMAR_FAMILY_TAGS, tag) ||
    GRAMMAR_CONFIG_TAGS.includes(tag)
  )
}

const objectField = (e: ExprIR, name: string): ExprIR | undefined =>
  e.kind === 'object' && (e.spreads === undefined || e.spreads.length === 0)
    ? e.fields.find((f) => f.name === name)?.value
    : undefined

function optionFields(
  e: ExprIR,
  allowed: readonly string[],
  path: string,
  warn: (m: string) => void,
): void {
  if (e.kind !== 'object') return
  for (const field of e.fields) {
    if (!allowed.includes(field.name)) warn(`<OptionChart ${path}.${field.name}>: this option field does not cross yet; native renders without it.`)
  }
}

/** A few literal fields of an object IR as the plain record the web facade's readers take. */
function optionLiteralRecord(o: Extract<ExprIR, { kind: 'object' }>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const v = objectField(o, key)
    if (v?.kind === 'literal') out[key] = v.value
  }
  return out
}

function optionDatumNumber(e: ExprIR | undefined): number | undefined {
  // An ECharts `null` (or `'-'`) datum is a gap: NaN, which the engine skips or, under connectNulls, bridges.
  if (e?.kind === 'literal' && (e.value === null || e.value === '-')) return Number.NaN
  if (e?.kind === 'object') return litNumber(objectField(e, 'value'))
  return litNumber(e)
}

/** A ChartPattern value as its engine-struct literal. */
function patternLiteral(p: ChartPattern): ExprIR {
  const fields: { name: string; value: ExprIR }[] = [
    { name: 'kind', value: lit(p.kind) },
    { name: 'color', value: lit(p.color) },
    { name: 'spacing', value: optionDoubleLiteral(p.spacing) },
    { name: 'width', value: optionDoubleLiteral(p.width) },
  ]
  if (p.angle !== undefined) fields.push({ name: 'angle', value: optionDoubleLiteral(p.angle === 0 ? 0 : p.angle) })
  if (p.symbol !== undefined) fields.push({ name: 'symbol', value: lit(p.symbol) })
  if (p.spacingY !== undefined) fields.push({ name: 'spacingY', value: optionDoubleLiteral(p.spacingY) })
  if (p.image !== undefined) fields.push({ name: 'image', value: lit(p.image) })
  if (p.repeat !== undefined) fields.push({ name: 'repeat', value: lit(p.repeat) })
  if (p.shape !== undefined) {
    fields.push({ name: 'shape', value: { kind: 'array', elements: p.shape.map((q) => ({ kind: 'object', fields: [{ name: 'x', value: optionDoubleLiteral(q.x) }, { name: 'y', value: optionDoubleLiteral(q.y) }] }) as ExprIR) } })
  }
  if (p.shapeRings !== undefined) fields.push({ name: 'shapeRings', value: { kind: 'array', elements: p.shapeRings.map((c) => optionDoubleLiteral(c)) } })
  return { kind: 'object', fields }
}

/**
 * An itemStyle's decal, mapped by the web facade's own `fillPattern` at compile
 * time (so the tiled symbol, pitch and rotation are the ones the web draws),
 * or the `aria.decal` default for the series when it has none.
 */
function optionPatternLiteral(style: ExprIR | undefined, resolve: (name: string) => ExprIR | undefined, warn: (m: string) => void = () => {}, path = 'itemStyle', ariaIndex = -1, series?: ExprIR): ExprIR | undefined {
  const plainOf = (e: ExprIR | undefined): Record<string, unknown> => {
    const lit = literalOf(e, resolve)
    const v = lit === undefined ? undefined : irToValue(lit, resolve)
    return v !== undefined && v.ok === true && isPlainRecord(v.value) ? v.value : {}
  }
  const record = plainOf(style)
  const seriesRecord = plainOf(series)
  const areaRecord = isPlainRecord(seriesRecord['areaStyle']) ? seriesRecord['areaStyle'] : {}
  const seriesPath = path.replace(/\.itemStyle$/, '')
  const w = (_code: string, at: string, message: string): void => warn(`<OptionChart option.${at}>: ${message}`)
  // The web's own order: an item fill image, then an area fill image, then the series colour, then the decal.
  const p = imageFill(record['color'], `${path}.color`, w) ?? imageFill(areaRecord['color'], `${seriesPath}.areaStyle.color`, w) ?? imageFill(seriesRecord['color'], `${seriesPath}.color`, w) ?? fillPattern(record, `${path}.decal`, (_code, at, message) => warn(`<OptionChart option.${at}>: ${message}`)) ?? (ariaIndex >= 0 ? DEFAULT_DECALS[ariaIndex % DEFAULT_DECALS.length] : undefined)
  return p === undefined ? undefined : patternLiteral(p)
}

function optionTreeNodes(
  value: ExprIR | undefined,
  resolve: (name: string) => ExprIR | undefined,
  path: string,
  warn: (m: string) => void,
): ExprIR | undefined {
  const data = value === undefined ? undefined : literalOf(value, resolve)
  if (data?.kind !== 'array') {
    warn(`<OptionChart ${path}>: native hierarchy series need a literal data array; emitting nothing.`)
    return undefined
  }
  const nodes: ExprIR[] = []
  for (let i = 0; i < data.elements.length; i++) {
    const node = literalOf(data.elements[i], resolve)
    const name = node?.kind === 'object' ? objectField(node, 'name') : undefined
    if (node?.kind !== 'object' || litString(name) === undefined) {
      warn(`<OptionChart ${path}[${i}]>: a hierarchy node needs a literal string name; emitting nothing.`)
      return undefined
    }
    const fields: { name: string; value: ExprIR }[] = [{ name: 'name', value: name! }]
    const numeric = litNumber(objectField(node, 'value'))
    if (numeric !== undefined) fields.push({ name: 'value', value: optionNumberLiteral(numeric) })
    const children = objectField(node, 'children')
    if (children !== undefined) {
      const lowered = optionTreeNodes(children, resolve, `${path}[${i}].children`, warn)
      if (lowered === undefined) return undefined
      fields.push({ name: 'children', value: lowered })
    }
    const item = literalOf(objectField(node, 'itemStyle'), resolve)
    const color = item === undefined ? objectField(node, 'color') : objectField(item, 'color')
    if (litString(color) !== undefined) fields.push({ name: 'color', value: color! })
    nodes.push({ kind: 'object', fields })
  }
  return { kind: 'array', elements: nodes }
}

const optionNumberLiteral = (value: number): ExprIR => ({
  kind: 'literal',
  value,
  ...(!Number.isInteger(value) ? { float: true } : {}),
})

// A NaN (an ECharts `null` datum: a gap) is `0.0 / 0.0` — the engine's own gap idiom, and valid in Swift and Kotlin alike.
const optionDoubleLiteral = (value: number): ExprIR =>
  Number.isNaN(value)
    ? { kind: 'binary', op: '/', left: { kind: 'literal', value: 0, float: true }, right: { kind: 'literal', value: 0, float: true } }
    : { kind: 'literal', value, float: true }

const mergeStaticOptionObjects = (
  base: Extract<ExprIR, { kind: 'object' }>,
  override: Extract<ExprIR, { kind: 'object' }>,
): Extract<ExprIR, { kind: 'object' }> => {
  const fields = base.fields.map((field) => ({ ...field }))
  for (const incoming of override.fields) {
    const index = fields.findIndex((field) => field.name === incoming.name)
    if (index < 0) {
      fields.push({ ...incoming })
      continue
    }
    const previous = fields[index]!.value
    if (previous.kind === 'object' && incoming.value.kind === 'object') {
      fields[index] = { ...incoming, value: mergeStaticOptionObjects(previous, incoming.value) }
      continue
    }
    if (incoming.name === 'series' && previous.kind === 'array' && incoming.value.kind === 'array') {
      const elements = previous.elements.slice()
      for (let item = 0; item < incoming.value.elements.length; item++) {
        const before = elements[item]
        const after = incoming.value.elements[item]!
        elements[item] = before?.kind === 'object' && after.kind === 'object'
          ? mergeStaticOptionObjects(before, after)
          : after
      }
      fields[index] = { ...incoming, value: { kind: 'array', elements } }
      continue
    }
    fields[index] = { ...incoming }
  }
  return { kind: 'object', fields }
}

/** The height the web OptionChart defaults to. */
const OPTION_CHART_HEIGHT = 320
/** The strip's height — the web's `TIMELINE_HEIGHT`. */
const TIMELINE_STRIP_H = 40

function lowerTimelineSteps(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  raw: Extract<ExprIR, { kind: 'object' }>,
  resolve: (name: string) => ExprIR | undefined,
  warn: (m: string) => void,
): Extract<ExprIR, { kind: 'jsx-element' }> | null {
  const base = literalOf(objectField(raw, 'baseOption'), resolve)
  const timeline = literalOf(objectField(raw, 'timeline'), resolve) ?? (base?.kind === 'object' ? literalOf(objectField(base, 'timeline'), resolve) : undefined)
  const steps = literalOf(objectField(raw, 'options'), resolve)
  if (timeline?.kind !== 'object' || steps?.kind !== 'array' || steps.elements.length === 0) return null
  const timelineValue = irToValue(timeline, resolve)
  if (!timelineValue.ok || !isPlainRecord(timelineValue.value)) {
    warn('<OptionChart option.timeline>: a native timeline needs a literal timeline object; native renders one step.')
    return null
  }
  const read = timelineSteps({ timeline: timelineValue.value })
  if (read === null) return null
  const n = steps.elements.length
  const labels = read.labels.length >= n ? read.labels.slice(0, n) : [...read.labels, ...Array.from({ length: n - read.labels.length }, (_, i) => String(read.labels.length + i))]
  const heightAttr = litNumber(literalOf(attrOf(e, 'height'), resolve))
  const total = heightAttr ?? OPTION_CHART_HEIGHT
  // Each step is its own option: the same element, pinned to step i, in the height the strip leaves.
  const seen = new Set<string>()
  const once = (m: string): void => {
    if (seen.has(m)) return
    seen.add(m)
    warn(m)
  }
  const children: ChildIR[] = []
  for (let i = 0; i < n; i++) {
    const attrs: AttrIR[] = e.attrs.filter((a) => !(a.kind === 'attr' && (a.name === 'height' || a.name === 'data-testid' || a.name === 'timelineIndex')) && !(a.kind === 'event' && a.name === 'timelinechange'))
    attrs.push({ kind: 'attr', name: 'timelineIndex', value: lit(i) })
    attrs.push({ kind: 'attr', name: 'height', value: lit(Math.max(0, total - TIMELINE_STRIP_H)) })
    const child = desugarOptionChart({ ...e, attrs }, resolve, once)
    if (child === undefined) return null
    children.push({ kind: 'expr', expr: child })
  }
  const strip = { ...(read.strip ?? defaultTimelineStrip(labels)), labels }
  const outer: AttrIR[] = [
    { kind: 'attr', name: 'timelineStrip', value: valueToIr(strip) },
    { kind: 'attr', name: 'timelineCurrent', value: lit(Math.min(n - 1, read.current)) },
    { kind: 'attr', name: 'timelineAutoPlay', value: lit(read.autoPlay) },
    { kind: 'attr', name: 'timelineInterval', value: lit(read.playInterval) },
    { kind: 'attr', name: 'height', value: lit(total) },
  ]
  for (const a of e.attrs) if ((a.kind === 'attr' && (a.name === 'data-testid' || a.name === 'handle')) || (a.kind === 'event' && a.name === 'timelinechange')) outer.push(a)
  return { kind: 'jsx-element', tag: CHART_TIMELINE_TAG, attrs: outer, children }
}

/** The synthetic element a timeline OptionChart lowers to. */
export const CHART_TIMELINE_TAG = 'ChartTimeline'

/** A `TimelineStrip` literal IR as target source. */
export function chartTimelineStripLiteral(expr: ExprIR | undefined, t: ChartHostTarget): string | null {
  if (expr === undefined) return null
  const v = irToValue(expr, () => undefined)
  if (!v.ok || !isPlainRecord(v.value)) return null
  const s = v.value
  const str = (x: unknown): string => JSON.stringify(String(x))
  const labels = Array.isArray(s['labels']) ? (s['labels'] as unknown[]).map(str) : []
  return t.struct('TimelineStrip', [
    ['labels', t.list(labels)],
    ['loop', String(s['loop'] === true)],
    ['rewind', String(s['rewind'] === true)],
    ['showPlay', String(s['showPlay'] === true)],
    ['showPrev', String(s['showPrev'] === true)],
    ['showNext', String(s['showNext'] === true)],
    ['label', str(s['label'])],
    ['accent', str(s['accent'])],
    ['line', str(s['line'])],
    ['fontSize', chartDouble(typeof s['fontSize'] === 'number' ? (s['fontSize'] as number) : 11)],
  ])
}

const resolveStaticTimelineOption = (
  option: Extract<ExprIR, { kind: 'object' }>,
  requestedIndex: number | undefined,
  resolve: (name: string) => ExprIR | undefined,
  warn: (message: string) => void,
): Extract<ExprIR, { kind: 'object' }> => {
  const base = literalOf(objectField(option, 'baseOption'), resolve)
  const timeline = literalOf(objectField(option, 'timeline'), resolve) ??
    (base?.kind === 'object' ? literalOf(objectField(base, 'timeline'), resolve) : undefined)
  if (base?.kind !== 'object' && timeline?.kind !== 'object') return option

  let merged: Extract<ExprIR, { kind: 'object' }> = base?.kind === 'object'
    ? { ...base, fields: base.fields.filter((field) => field.name !== 'timeline') }
    : { kind: 'object', fields: [] }
  for (const field of option.fields) {
    if (field.name === 'baseOption' || field.name === 'options' || field.name === 'timeline') continue
    if (!merged.fields.some((current) => current.name === field.name)) merged.fields.push({ ...field })
  }

  const steps = literalOf(objectField(option, 'options'), resolve)
  const current = timeline?.kind === 'object' ? litNumber(objectField(timeline, 'currentIndex')) : undefined
  const index = Math.floor(requestedIndex ?? current ?? 0)
  if (steps?.kind !== 'array' || steps.elements.length === 0) {
    warn('<OptionChart option.options>: timeline has no static steps; native renders the base option.')
    return merged
  }
  if (index < 0 || index >= steps.elements.length) {
    warn(`<OptionChart timelineIndex>: step ${index} does not exist; native renders the base option.`)
    return merged
  }
  const step = literalOf(steps.elements[index], resolve)
  if (step?.kind !== 'object') {
    warn(`<OptionChart option.options[${index}]>: native needs a static option object; native renders the base option.`)
    return merged
  }
  merged = mergeStaticOptionObjects(merged, step)
  return merged
}

/**
 * Lower the first static OptionChart families through their existing native
 * hosts. The option facade is intentionally compile-time on native: arbitrary
 * records/functions cannot cross the Swift/Kotlin boundary, while an inline
 * ECharts-shaped literal can be validated without silently dropping fields.
 * More families are added here as explicit adapters.
 */
/** The `visualMap` fields `visualMapSpec` reads — every one crosses. */
const VISUAL_MAP_FIELDS = ['min', 'max', 'inRange', 'calculable', 'range', 'type', 'pieces', 'categories', 'splitNumber', 'orient', 'text', 'textStyle', 'itemWidth', 'itemHeight', 'left', 'right', 'top', 'bottom', 'show', 'selected', 'inactiveColor']

export function desugarOptionChart(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  resolve: (name: string) => ExprIR | undefined,
  warn: (m: string) => void,
): Extract<ExprIR, { kind: 'jsx-element' }> | undefined {
  const hosted = desugarOptionChartHost(e, resolve, warn)
  if (hosted === undefined || hosted.tag === CHART_TIMELINE_TAG) return hosted
  const lowered = withFamilyFrame(hosted, e, resolve, warn)
  // `option.toolbox` through the web's own reader: the plot host lowers the
  // whole toolbox, a family host its save button.
  const raw = literalOf(attrOf(e, 'option'), resolve)
  if (raw?.kind !== 'object' || objectField(raw, 'toolbox') === undefined) return lowered
  const plainOption = irToValue(raw, resolve)
  if (!plainOption.ok || !isPlainRecord(plainOption.value)) {
    warn('<OptionChart option.toolbox>: a native toolbox needs a literal toolbox object; native renders without it.')
    return lowered
  }
  const optWarn = (_c: string, path: string, message: string): void => warn(`<OptionChart option.${path}>: ${message}`)
  const brush = plainOption.value['brush'] === undefined ? undefined : readBrush(plainOption.value, optWarn)
  const tb = readToolbox(plainOption.value, optWarn, brush)
  if (tb === undefined) return lowered
  const cfg: Record<string, unknown> = lowered.tag === 'PlotChart'
    ? { ...(tb.dataZoom === true ? { dataZoom: true } : {}), ...(tb.dataView === true ? { dataView: true } : {}), ...(tb.magicType !== undefined ? { magicType: tb.magicType } : {}), ...(tb.brush !== undefined ? { brush: tb.brush } : {}), ...(tb.restore === true ? { restore: true } : {}), ...(tb.saveAsImage === true ? { saveAsImage: true } : {}) }
    : tb.saveAsImage === true ? { saveAsImage: true } : {}
  const brushAttrs: AttrIR[] = []
  if (lowered.tag === 'PlotChart' && tb.brush !== undefined && brush !== undefined) {
    if (brush.multiple) brushAttrs.push({ kind: 'attr', name: 'brushMode', value: valueToIr('multiple') })
    if (brush.outOpacity !== 0.1) brushAttrs.push({ kind: 'attr', name: 'outOfBrushOpacity', value: valueToIr(brush.outOpacity) })
    if (brush.seriesIndex.length > 0) brushAttrs.push({ kind: 'attr', name: 'brushSeriesIndex', value: valueToIr(brush.seriesIndex) })
  }
  if (lowered.tag !== 'PlotChart' && (tb.dataZoom === true || tb.dataView === true || tb.magicType !== undefined || tb.restore === true || tb.brush !== undefined)) {
    warn(`<OptionChart option.toolbox>: this ${lowered.tag} lowers the toolbox's saveAsImage on native; its other tools act on a cartesian chart.`)
  }
  if (Object.keys(cfg).length === 0) return lowered
  return { ...lowered, attrs: [...lowered.attrs.filter((a) => !(a.kind === 'attr' && a.name === 'toolbox')), { kind: 'attr', name: 'toolbox', value: valueToIr(cfg) }, ...brushAttrs] }
}

/** ECharts' box keys — where a placed family chart sits. */
const FRAME_KEYS: readonly string[] = ['left', 'top', 'right', 'bottom', 'width', 'height']

/** Family hosts ECharts places inside the chart (the web's PLACED_FAMILIES), by the series type each lowers. */
const PLACED_FAMILY_HOSTS: Readonly<Record<string, string>> = { FunnelChart: 'funnel', TreemapChart: 'treemap', TreeChart: 'tree', SankeyChart: 'sankey', SunburstChart: 'sunburst' }

/**
 * A placed family host gets its ECharts frame — the default placement per
 * type (a funnel's 80 / 60 margins, a treemap's 10%, a sunburst's 75% radius)
 * under the series' own box keys — as the `frameSpec` the host renders into,
 * exactly as the web's `familyRect` places it. A non-literal option cannot
 * be framed at compile time; its box keys are named rather than dropped.
 */
function withFamilyFrame(lowered: Extract<ExprIR, { kind: 'jsx-element' }>, e: Extract<ExprIR, { kind: 'jsx-element' }>, resolve: (n: string) => ExprIR | undefined, warn: (m: string) => void): Extract<ExprIR, { kind: 'jsx-element' }> {
  const type = PLACED_FAMILY_HOSTS[lowered.tag]
  if (type === undefined || lowered.attrs.some((a) => a.kind === 'attr' && a.name === 'frameSpec')) return lowered
  const raw = literalOf(attrOf(e, 'option'), resolve)
  const plainOption = raw === undefined ? { ok: false as const } : irToValue(raw, resolve)
  const series = plainOption.ok && isPlainRecord(plainOption.value) ? plainOption.value['series'] : undefined
  const s0 = Array.isArray(series) ? series[0] : series
  if (!isPlainRecord(s0) || s0['type'] !== type) {
    const rawS = raw?.kind === 'object' ? literalOf(objectField(raw, 'series'), resolve) : undefined
    const rawS0 = rawS?.kind === 'array' ? literalOf(rawS.elements[0], resolve) : rawS
    const keys = rawS0?.kind === 'object' ? rawS0.fields.map((f) => f.name).filter((k) => FRAME_KEYS.includes(k) || k === 'center') : []
    if (keys.length > 0) warn(`<OptionChart option.series[0].${keys[0]}>: placement needs a fully literal option on native; the chart fills its canvas.`)
    return lowered
  }
  return { ...lowered, attrs: [...lowered.attrs, { kind: 'attr', name: 'frameSpec', value: valueToIr(familyFrame(s0)) }] }
}

/** A host's `frameSpec` attribute as a `FrameSpec` literal, or undefined. */
export function chartFrameLiteral(e: Extract<ExprIR, { kind: 'jsx-element' }>, target: 'swift' | 'kotlin'): string | undefined {
  const frameAttr = attrOf(e, 'frameSpec')
  const frame = frameAttr === undefined ? undefined : irToValue(frameAttr, () => undefined)
  return frame?.ok === true ? engineStructLiteral('FrameSpec', frame.value, target) : undefined
}

function desugarOptionChartHost(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  resolve: (name: string) => ExprIR | undefined,
  warn: (m: string) => void,
): Extract<ExprIR, { kind: 'jsx-element' }> | undefined {
  let raw = literalOf(attrOf(e, 'option'), resolve)
  if (raw === undefined || raw.kind !== 'object' || (raw.spreads !== undefined && raw.spreads.length > 0)) {
    warn('<OptionChart option>: native needs an inline option object; emitting nothing.')
    return undefined
  }
  const requestedTimeline = literalOf(attrOf(e, 'timelineIndex'), resolve)
  const timelineIndex = requestedTimeline === undefined ? undefined : litNumber(requestedTimeline)
  if (requestedTimeline !== undefined && timelineIndex === undefined) {
    warn('<OptionChart timelineIndex>: native needs a static numeric index; the option currentIndex is used.')
  }
  // A timeline with static steps and no pinned `timelineIndex`: every step
  // lowers to its own host, and `ChartTimeline` switches between them under a
  // tappable strip with play / previous / next — the web's timeline, not a
  // frozen first step.
  if (requestedTimeline === undefined) {
    const lowered = lowerTimelineSteps(e, raw, resolve, warn)
    if (lowered !== null) return lowered
  }
  raw = resolveStaticTimelineOption(raw, timelineIndex, resolve, warn)
  raw = resolveStaticDataset(raw, resolve, warn)
  const rawSeries = literalOf(objectField(raw, 'series'), resolve)
  const series = rawSeries?.kind === 'array' ? literalOf(rawSeries.elements[0], resolve) : literalOf(rawSeries, resolve)
  const type = objectField(series ?? { kind: 'literal', value: null }, 'type')
  const kind = litString(type)
  if (series?.kind !== 'object' || kind === undefined) {
    warn('<OptionChart option.series>: native needs a literal series with a string `type`; emitting nothing.')
    return undefined
  }

  optionFields(raw, ['aria', 'series', 'title', 'legend', 'tooltip', 'xAxis', 'yAxis', 'radar', 'calendar', 'parallel', 'parallelAxis', 'singleAxis', 'polar', 'angleAxis', 'radiusAxis', 'visualMap', 'dataZoom', 'toolbox', 'brush', 'color', 'dataset', 'graphic'], 'option', warn)
  // ledger: coordinates.legend — the web pages a scrolling legend; the native legend has no pager yet.
  const legendType = literalOf(objectField(raw, 'legend'), resolve)
  if (legendType?.kind === 'object' && litString(objectField(legendType, 'type')) === 'scroll') {
    warn("<OptionChart option.legend.type>: 'scroll' pages the legend on the web; native draws every entry, wrapped, without the pager.")
  }

  for (const a of e.attrs) {
    if (a.kind === 'event' && a.name !== 'selectindex' && a.name !== 'brushselected') {
      const prop = a.name === 'select' ? 'onSelect' : a.name === 'familyselect' ? 'onFamilySelect' : a.name === 'timelinechange' ? 'onTimelineChange' : `on${a.name}`
      warn(`<OptionChart ${prop}>: this rich callback shape does not cross yet; native renders without it.`)
    }
  }
  const attrs: AttrIR[] = e.attrs.filter((a) => {
    if (a.kind !== 'attr') return a.kind === 'event' && (a.name === 'selectindex' || a.name === 'brushselected')
    return a.name !== 'option' && a.name !== 'theme' && a.name !== 'locale' && a.name !== 'timelineIndex'
  })
  const set = (name: string, value: ExprIR): void => {
    const i = attrs.findIndex((a) => a.kind === 'attr' && a.name === name)
    const attr: AttrIR = { kind: 'attr', name, value }
    if (i < 0) attrs.push(attr)
    else attrs[i] = attr
  }
  // `graphic` resolves at COMPILE time through the web facade's own
  // `graphicElements` (`@pyreon/charts/option-layer`), against the option's
  // static width/height (its props, or the web host's own 640x320 defaults),
  // so the native canvas draws the elements the web draws. The engine's
  // `graphicDrawCommands` then paints them on both targets.
  const graphicRaw = objectField(raw, 'graphic')

  // `visualMap` resolves at COMPILE time through the web's own `visualMapSpec`
  // (domain from the data when unset, pieces, `range`, `selected`), and the
  // value host draws the strip and owns the drag.
  const optionVisualMap = (): void => {
    if (objectField(raw!, 'visualMap') === undefined) return
    const plainOption = irToValue(raw!, resolve)
    if (!plainOption.ok || !isPlainRecord(plainOption.value)) {
      warn('<OptionChart option.visualMap>: a native visualMap needs a fully literal option; native renders without the strip.')
      return
    }
    const read = visualMapSpec(plainOption.value)
    if (read === null) return
    for (const w of read.warnings) warn(`<OptionChart option.${w.path}>: ${w.message}`)
    set('visualMap', valueToIr(read.spec))
  }

  if (graphicRaw !== undefined) {
    const graphicValue = irToValue(graphicRaw, resolve)
    if (graphicValue.ok !== true) {
      warn('<OptionChart option.graphic>: native needs literal graphic elements; they were skipped.')
    } else {
      const box = { w: litNumber(literalOf(attrOf(e, 'width'), resolve)) ?? 640, h: litNumber(literalOf(attrOf(e, 'height'), resolve)) ?? 320 }
      const resolved = graphicElements({ graphic: graphicValue.value } as Parameters<typeof graphicElements>[0], box.w, box.h)
      for (const w of resolved.warnings) warn(`<OptionChart option.${w.path}>: ${w.message}`)
      if (resolved.elements.length > 0) {
        set('graphicElements', {
          kind: 'array',
          elements: resolved.elements.map((g: GraphicElement) => ({
            kind: 'object' as const,
            fields: [
              { name: 'kind', value: lit(g.kind) },
              ...(['x', 'y', 'w', 'h', 'lineWidth', 'fontSize', 'cx', 'cy', 'r', 'r0', 'startAngle', 'endAngle'] as const).map((k) => ({ name: k, value: optionDoubleLiteral(g[k]) })),
              ...(['fill', 'stroke', 'text', 'align'] as const).map((k) => ({ name: k, value: lit(g[k]) })),
              { name: 'clockwise', value: lit(g.clockwise) },
              { name: 'points', value: { kind: 'array' as const, elements: g.points.map((p: { x: number; y: number }) => ({ kind: 'object' as const, fields: [{ name: 'x', value: optionDoubleLiteral(p.x) }, { name: 'y', value: optionDoubleLiteral(p.y) }] })) } },
            ],
          })),
        })
      }
    }
  }
  const title = literalOf(objectField(raw, 'title'), resolve)
  const titleText = title === undefined ? undefined : objectField(title, 'text')
  if (litString(titleText) !== undefined) set('title', titleText!)
  const legend = literalOf(objectField(raw, 'legend'), resolve)
  const legendShow = legend === undefined ? undefined : objectField(legend, 'show')
  if (legend !== undefined && !(legendShow?.kind === 'literal' && legendShow.value === false)) set('showLegend', lit(true))
  const tooltip = literalOf(objectField(raw, 'tooltip'), resolve)
  const tooltipShow = tooltip === undefined ? undefined : objectField(tooltip, 'show')
  if (tooltip !== undefined && !(tooltipShow?.kind === 'literal' && tooltipShow.value === false)) set('tooltip', lit(true))
  if (attrOf(e, 'theme') !== undefined) warn('<OptionChart theme>: registered ECharts themes do not cross yet; native uses the chart theme.')
  if (attrOf(e, 'locale') !== undefined) warn('<OptionChart locale>: locale formatting for family options is not used by this native adapter.')

  if (kind === 'gauge') {
    // The web facade's own compile of a literal gauge: ECharts' whole dial
    // (angles, bands, ticks, labels, pointers, anchor, titles, details) and
    // its placement cross as it computed them.
    const gaugeCompiled = compiledFamilyPlan(raw, resolve, 'gauge')
    optionFields(series, ['type', 'data', 'min', 'max', 'detail', ...(gaugeCompiled !== undefined ? ['name', ...GAUGE_DIAL_KEYS, 'left', 'top', 'right', 'bottom', 'width', 'height'] : [])], 'option.series[0]', warn)
    if (gaugeCompiled !== undefined && gaugeCompiled.plan.kind === 'gauge') {
      set('dial', valueToIr(gaugeCompiled.plan.dial))
      set('frameSpec', valueToIr(familyFrame(gaugeCompiled.series)))
    }
    const data = literalOf(objectField(series, 'data'), resolve)
    const firstDatum = data?.kind === 'array' ? literalOf(data.elements[0], resolve) : undefined
    const value = firstDatum === undefined ? undefined : firstDatum.kind === 'object' ? objectField(firstDatum, 'value') : firstDatum
    const numberValue = litNumber(value)
    if (numberValue === undefined) {
      warn('<OptionChart option.series[0].data[0]>: a native gauge needs a literal numeric value; emitting nothing.')
      return undefined
    }
    set('value', { kind: 'literal', value: numberValue, float: true })
    for (const name of ['min', 'max'] as const) {
      const v = objectField(series, name)
      const n = litNumber(v)
      if (n !== undefined) set(name, { kind: 'literal', value: n, float: true })
    }
    const detail = literalOf(objectField(series, 'detail'), resolve)
    const detailShow = detail === undefined ? undefined : objectField(detail, 'show')
    if (detailShow?.kind === 'literal' && detailShow.value === false) set('showValue', lit(false))
    return { kind: 'jsx-element', tag: 'GaugeChart', attrs, children: [] }
  }

  if (kind === 'pie') {
    // The web facade's own compile of a literal pie: its ECharts arcs, labels,
    // empty circle and placement cross as it computed them.
    const pieCompiled = compiledFamilyPlan(raw, resolve, 'pie')
    optionFields(series, ['type', 'data', 'radius', 'label', ...(pieCompiled !== undefined ? ['name', 'center', ...PIE_SHAPE_KEYS] : [])], 'option.series[0]', warn)
    const data = literalOf(objectField(series, 'data'), resolve)
    if (data?.kind !== 'array') {
      warn('<OptionChart option.series[0].data>: a native pie needs a literal data array; emitting nothing.')
      return undefined
    }
    const rows: ExprIR[] = []
    for (let i = 0; i < data.elements.length; i++) {
      const d = literalOf(data.elements[i], resolve)
      const value = d?.kind === 'object' ? objectField(d, 'value') : d
      const numberValue = litNumber(value)
      if (numberValue === undefined) {
        warn(`<OptionChart option.series[0].data[${i}]>: a pie datum needs a literal numeric value; emitting nothing.`)
        return undefined
      }
      const name = d?.kind === 'object' ? objectField(d, 'name') : undefined
      rows.push({ kind: 'object', fields: [
        { name: 'value', value: { kind: 'literal', value: numberValue, float: true } },
        { name: 'label', value: litString(name) === undefined ? lit(`Slice ${i + 1}`) : name! },
      ] })
    }
    set('data', { kind: 'array', elements: rows })
    set('value', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'value' } })
    set('label', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'label' } })
    const radius = literalOf(objectField(series, 'radius'), resolve)
    if (radius?.kind === 'array' && radius.elements.length === 2) {
      const inner = litString(radius.elements[0])
      const outer = litString(radius.elements[1])
      if (inner?.endsWith('%') && outer?.endsWith('%') && Number.parseFloat(outer) > 0) set('innerRadius', { kind: 'literal', value: Number.parseFloat(inner) / Number.parseFloat(outer), float: true })
    }
    const label = literalOf(objectField(series, 'label'), resolve)
    const labelShow = label === undefined ? undefined : objectField(label, 'show')
    if (labelShow?.kind === 'literal' && labelShow.value === false) set('showLabels', lit(false))
    if (pieCompiled !== undefined && pieCompiled.plan.kind === 'pie') {
      set('pie', valueToIr(pieCompiled.plan.pie))
      set('frameSpec', valueToIr(familyFrame(pieCompiled.series)))
      // No formatter: the tooltip is ECharts' default rows under the series name, as the web's.
      const tip = literalOf(objectField(raw, 'tooltip'), resolve)
      const shaped = tip !== undefined && (objectField(tip, 'formatter') !== undefined || objectField(tip, 'valueFormatter') !== undefined)
      if (!shaped) set('tooltipHeader', lit(litString(objectField(series, 'name')) ?? ''))
      // A datum's own itemStyle.color, as the web plan resolved it.
      const colors = pieCompiled.plan.rows.map((r) => r.color)
      if (colors.some((c) => c !== undefined)) {
        const at = attrs.findIndex((a) => a.kind === 'attr' && a.name === 'data')
        const dataAttr = at >= 0 ? attrs[at] : undefined
        if (dataAttr?.kind === 'attr' && dataAttr.value.kind === 'array') {
          const withColor = dataAttr.value.elements.map((row, i) => (row.kind === 'object' ? { ...row, fields: [...row.fields, { name: 'color', value: lit(colors[i] ?? CHART_HOST_PALETTE[i % CHART_HOST_PALETTE.length]!) }] } : row))
          set('data', { kind: 'array', elements: withColor })
          set('color', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'color' } })
        }
      }
    }
    return { kind: 'jsx-element', tag: 'PieChart', attrs, children: [] }
  }

  if (kind === 'radar') {
    optionFields(series, ['type', 'name', 'data', 'areaStyle', 'itemStyle', 'lineStyle', 'symbol', 'color'], 'option.series[0]', warn)
    const radar = literalOf(objectField(raw, 'radar'), resolve)
    const indicators = radar === undefined ? undefined : literalOf(objectField(radar, 'indicator'), resolve)
    const data = literalOf(objectField(series, 'data'), resolve)
    if (indicators?.kind !== 'array' || data?.kind !== 'array') {
      warn('<OptionChart option.radar.indicator>: a native radar needs literal indicators and series data; emitting nothing.')
      return undefined
    }
    const axes: ExprIR[] = []
    for (let i = 0; i < indicators.elements.length; i++) {
      const axis = literalOf(indicators.elements[i], resolve)
      const name = axis?.kind === 'object' ? objectField(axis, 'name') : undefined
      const max = axis?.kind === 'object' ? litNumber(objectField(axis, 'max')) : undefined
      if (litString(name) === undefined || max === undefined) {
        warn(`<OptionChart option.radar.indicator[${i}]>: a native radar axis needs literal name and max values; emitting nothing.`)
        return undefined
      }
      axes.push({ kind: 'object', fields: [{ name: 'label', value: name! }, { name: 'max', value: optionNumberLiteral(max) }] })
    }
    const rows: ExprIR[] = []
    for (let i = 0; i < data.elements.length; i++) {
      const datum = literalOf(data.elements[i], resolve)
      const values = datum?.kind === 'object' ? literalOf(objectField(datum, 'value'), resolve) : undefined
      if (values?.kind !== 'array' || values.elements.length !== axes.length || values.elements.some((v) => litNumber(v) === undefined)) {
        warn(`<OptionChart option.series[0].data[${i}].value>: a native radar row needs one literal number per indicator; emitting nothing.`)
        return undefined
      }
      const name = datum?.kind === 'object' ? objectField(datum, 'name') : undefined
      rows.push({ kind: 'object', fields: [
        { name: 'values', value: { kind: 'array', elements: values.elements.map((v) => optionNumberLiteral(litNumber(v)!)) } },
        { name: 'label', value: litString(name) === undefined ? lit(`Series ${i + 1}`) : name! },
      ] })
    }
    set('axes', { kind: 'array', elements: axes })
    set('data', { kind: 'array', elements: rows })
    set('values', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'values' } })
    set('label', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'label' } })
    const area = literalOf(objectField(series, 'areaStyle'), resolve)
    const opacity = area === undefined ? undefined : litNumber(objectField(area, 'opacity'))
    if (opacity !== undefined) set('fillAlpha', { kind: 'literal', value: opacity, float: true })
    return { kind: 'jsx-element', tag: 'RadarChart', attrs, children: [] }
  }

  if (kind === 'boxplot') {
    optionFields(series, ['type', 'name', 'data', 'itemStyle', 'color'], 'option.series[0]', warn)
    const data = literalOf(objectField(series, 'data'), resolve)
    const xAxis = literalOf(objectField(raw, 'xAxis'), resolve)
    const categories = xAxis?.kind === 'object' ? literalOf(objectField(xAxis, 'data'), resolve) : undefined
    if (data?.kind !== 'array' || categories?.kind !== 'array' || data.elements.length !== categories.elements.length) {
      warn('<OptionChart option.series[0].data>: native boxplots need literal five-number rows matching xAxis.data; emitting nothing.')
      return undefined
    }
    const rows: ExprIR[] = []
    for (let i = 0; i < data.elements.length; i++) {
      const summary = literalOf(data.elements[i], resolve)
      if (summary?.kind !== 'array' || summary.elements.length < 5 || summary.elements.slice(0, 5).some((value) => litNumber(value) === undefined)) {
        warn(`<OptionChart option.series[0].data[${i}]>: a native boxplot needs [min, q1, median, q3, max]; emitting nothing.`)
        return undefined
      }
      const category = litString(categories.elements[i]) ?? String(litNumber(categories.elements[i]) ?? i + 1)
      rows.push({ kind: 'object', fields: [
        { name: 'x', value: lit(category) },
        ...['min', 'q1', 'median', 'q3', 'max'].map((name, index) => ({ name, value: optionNumberLiteral(litNumber(summary.elements[index])!) })),
      ] })
    }
    const itemStyle = literalOf(objectField(series, 'itemStyle'), resolve)
    const boxFields: { name: string; value: ExprIR }[] = []
    if (itemStyle?.kind === 'object') {
      optionFields(itemStyle, ['color', 'borderColor'], 'option.series[0].itemStyle', warn)
      const fill = litString(objectField(itemStyle, 'color'))
      const stroke = litString(objectField(itemStyle, 'borderColor'))
      if (fill !== undefined) boxFields.push({ name: 'fill', value: lit(fill) })
      if (stroke !== undefined) boxFields.push({ name: 'stroke', value: lit(stroke) })
    }
    set('data', { kind: 'array', elements: rows })
    set('summary', { kind: 'arrow', params: ['d'], body: ident('d') })
    set('x', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'x' } })
    if (boxFields.length > 0) set('box', { kind: 'object', fields: boxFields })
    return { kind: 'jsx-element', tag: 'BoxplotChart', attrs, children: [] }
  }

  if (kind === 'candlestick') {
    optionFields(series, ['type', 'name', 'data', 'itemStyle', 'color'], 'option.series[0]', warn)
    const data = literalOf(objectField(series, 'data'), resolve)
    const xAxis = literalOf(objectField(raw, 'xAxis'), resolve)
    const categories = xAxis === undefined ? undefined : literalOf(objectField(xAxis, 'data'), resolve)
    if (data?.kind !== 'array' || categories?.kind !== 'array' || data.elements.length !== categories.elements.length) {
      warn('<OptionChart option.series[0].data>: native candlesticks need literal OHLC rows matching xAxis.data; emitting nothing.')
      return undefined
    }
    const rows: ExprIR[] = []
    for (let i = 0; i < data.elements.length; i++) {
      const values = literalOf(data.elements[i], resolve)
      if (values?.kind !== 'array' || values.elements.length < 4 || values.elements.slice(0, 4).some((v) => litNumber(v) === undefined)) {
        warn(`<OptionChart option.series[0].data[${i}]>: a native candle needs [open, close, low, high]; emitting nothing.`)
        return undefined
      }
      const fields: { name: string; value: ExprIR }[] = ['open', 'close', 'low', 'high'].map((name, vi) => ({ name, value: optionNumberLiteral(litNumber(values.elements[vi])!) }))
      fields.push({ name: 'x', value: lit(String(litString(categories.elements[i]) ?? litNumber(categories.elements[i]))) })
      rows.push({ kind: 'object', fields })
    }
    set('data', { kind: 'array', elements: rows })
    for (const name of ['open', 'high', 'low', 'close', 'x']) set(name, { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: name } })
    return { kind: 'jsx-element', tag: 'CandlestickChart', attrs, children: [] }
  }

  if (kind === 'parallel') {
    optionFields(series, ['type', 'name', 'data', 'lineStyle', 'color'], 'option.series[0]', warn)
    const rawAxes = literalOf(objectField(raw, 'parallelAxis'), resolve)
    const data = literalOf(objectField(series, 'data'), resolve)
    if (rawAxes?.kind !== 'array' || data?.kind !== 'array') {
      warn('<OptionChart option.parallelAxis>: native parallel coordinates need literal axes and data rows; emitting nothing.')
      return undefined
    }
    const axes: ExprIR[] = []
    for (let i = 0; i < rawAxes.elements.length; i++) {
      const axis = literalOf(rawAxes.elements[i], resolve)
      if (axis?.kind !== 'object') {
        warn(`<OptionChart option.parallelAxis[${i}]>: a native parallel axis must be a literal object; emitting nothing.`)
        return undefined
      }
      const dim = litNumber(objectField(axis, 'dim')) ?? i
      if (!Number.isInteger(dim) || dim < 0) {
        warn(`<OptionChart option.parallelAxis[${i}].dim>: a native parallel dimension must be a non-negative integer; emitting nothing.`)
        return undefined
      }
      optionFields(axis, ['dim', 'name', 'type', 'data', 'min', 'max', 'inverse'], `option.parallelAxis[${i}]`, warn)
      const fields: { name: string; value: ExprIR }[] = [
        { name: 'name', value: litString(objectField(axis, 'name')) === undefined ? lit(`dim ${dim}`) : objectField(axis, 'name')! },
      ]
      if (litString(objectField(axis, 'type')) === 'category') {
        const categories = literalOf(objectField(axis, 'data'), resolve)
        if (categories?.kind !== 'array' || categories.elements.some((v) => litString(v) === undefined)) {
          warn(`<OptionChart option.parallelAxis[${i}].data>: a native category axis needs literal string categories; emitting nothing.`)
          return undefined
        }
        fields.push({ name: 'type', value: lit('category') }, { name: 'categories', value: categories })
      } else {
        const min = litNumber(objectField(axis, 'min'))
        const max = litNumber(objectField(axis, 'max'))
        if (min !== undefined && max !== undefined) fields.push({ name: 'domain', value: { kind: 'object', fields: [{ name: 'min', value: optionNumberLiteral(min) }, { name: 'max', value: optionNumberLiteral(max) }] } })
      }
      const inverse = objectField(axis, 'inverse')
      if (inverse?.kind === 'literal' && inverse.value === true) fields.push({ name: 'inverse', value: lit(true) })
      axes[dim] = { kind: 'object', fields }
    }
    if (axes.some((axis) => axis === undefined)) {
      warn('<OptionChart option.parallelAxis>: native parallel dimensions must be contiguous; emitting nothing.')
      return undefined
    }
    for (let i = 0; i < data.elements.length; i++) {
      const row = literalOf(data.elements[i], resolve)
      if (row?.kind !== 'array' || row.elements.length !== axes.length) {
        warn(`<OptionChart option.series[0].data[${i}]>: a native parallel datum needs one literal value per axis; emitting nothing.`)
        return undefined
      }
    }
    const lineStyle = literalOf(objectField(series, 'lineStyle'), resolve)
    const parallelFields: { name: string; value: ExprIR }[] = []
    if (lineStyle?.kind === 'object') {
      optionFields(lineStyle, ['width', 'opacity', 'color'], 'option.series[0].lineStyle', warn)
      const width = litNumber(objectField(lineStyle, 'width'))
      const opacity = litNumber(objectField(lineStyle, 'opacity'))
      const color = litString(objectField(lineStyle, 'color'))
      if (width !== undefined) parallelFields.push({ name: 'lineWidth', value: optionNumberLiteral(width) })
      if (opacity !== undefined) parallelFields.push({ name: 'lineOpacity', value: optionNumberLiteral(opacity) })
      if (color !== undefined) parallelFields.push({ name: 'lineColor', value: lit(color) })
    }
    const parallel = literalOf(objectField(raw, 'parallel'), resolve)
    if (parallel?.kind === 'object') {
      optionFields(parallel, ['layout'], 'option.parallel', warn)
      if (litString(objectField(parallel, 'layout')) === 'vertical') set('orient', lit('vertical'))
    }
    set('axes', { kind: 'array', elements: axes })
    set('rows', data)
    if (parallelFields.length > 0) set('parallel', { kind: 'object', fields: parallelFields })
    return { kind: 'jsx-element', tag: 'ParallelChart', attrs, children: [] }
  }

  if (kind === 'themeRiver') {
    optionFields(series, ['type', 'name', 'data', 'coordinateSystem', 'singleAxisIndex', 'boundaryGap', 'label', 'itemStyle', 'emphasis', 'color'], 'option.series[0]', warn)
    const data = literalOf(objectField(series, 'data'), resolve)
    if (data?.kind !== 'array') {
      warn('<OptionChart option.series[0].data>: a native river chart needs literal [category, value, series] rows; emitting nothing.')
      return undefined
    }
    const categories = new Set<string>()
    const byName = new Map<string, Map<string, number>>()
    for (let i = 0; i < data.elements.length; i++) {
      const row = literalOf(data.elements[i], resolve)
      const category = row?.kind === 'array' ? litString(row.elements[0]) : undefined
      const value = row?.kind === 'array' ? litNumber(row.elements[1]) : undefined
      const name = row?.kind === 'array' ? litString(row.elements[2]) : undefined
      if (category === undefined || value === undefined || name === undefined) {
        warn(`<OptionChart option.series[0].data[${i}]>: a native river datum needs a literal [category, number, series] tuple; emitting nothing.`)
        return undefined
      }
      categories.add(category)
      const values = byName.get(name) ?? new Map<string, number>()
      values.set(category, (values.get(category) ?? 0) + value)
      byName.set(name, values)
    }
    const sortedCategories = [...categories].sort()
    const riverSeries: ExprIR[] = [...byName].map(([name, values]) => ({
      kind: 'object',
      fields: [
        { name: 'name', value: lit(name) },
        { name: 'values', value: { kind: 'array', elements: sortedCategories.map((category) => optionDoubleLiteral(values.get(category) ?? 0)) } },
      ],
    }))
    const riverFields: { name: string; value: ExprIR }[] = [
      { name: 'categories', value: { kind: 'array', elements: sortedCategories.map(lit) } },
    ]
    const label = literalOf(objectField(series, 'label'), resolve)
    if (label?.kind === 'object') {
      optionFields(label, ['show'], 'option.series[0].label', warn)
      const show = objectField(label, 'show')
      if (show?.kind === 'literal' && show.value === false) riverFields.push({ name: 'showLabels', value: lit(false) })
    }
    const singleAxis = literalOf(objectField(raw, 'singleAxis'), resolve)
    if (singleAxis?.kind === 'object') optionFields(singleAxis, ['type'], 'option.singleAxis', warn)
    set('series', { kind: 'array', elements: riverSeries })
    set('river', { kind: 'object', fields: riverFields })
    return { kind: 'jsx-element', tag: 'RiverChart', attrs, children: [] }
  }

  if (litString(objectField(series, 'coordinateSystem')) === 'singleAxis') {
    if (kind !== 'scatter' && kind !== 'effectScatter') {
      warn(`<OptionChart option.series[0].type>: native single-axis charts support scatter series; ${kind} cannot lower.`)
      return undefined
    }
    optionFields(series, ['type', 'name', 'data', 'coordinateSystem', 'singleAxisIndex', 'label', 'itemStyle', 'symbolSize', 'color'], 'option.series[0]', warn)
    const axis = literalOf(objectField(raw, 'singleAxis'), resolve)
    const data = literalOf(objectField(series, 'data'), resolve)
    if (axis?.kind !== 'object' || data?.kind !== 'array') {
      warn('<OptionChart option.singleAxis>: native single-axis charts need a literal axis and data; emitting nothing.')
      return undefined
    }
    optionFields(axis, ['type', 'data', 'min', 'max', 'name'], 'option.singleAxis', warn)
    const axisFields: { name: string; value: ExprIR }[] = []
    const isCategory = litString(objectField(axis, 'type')) === 'category'
    axisFields.push({ name: 'type', value: lit(isCategory ? 'category' : 'value') })
    if (isCategory) {
      const categories = literalOf(objectField(axis, 'data'), resolve)
      if (categories?.kind !== 'array' || categories.elements.some((value) => litString(value) === undefined)) {
        warn('<OptionChart option.singleAxis.data>: a native category axis needs literal string categories; emitting nothing.')
        return undefined
      }
      axisFields.push({ name: 'categories', value: categories })
    } else {
      const min = litNumber(objectField(axis, 'min'))
      const max = litNumber(objectField(axis, 'max'))
      if (min !== undefined && max !== undefined) axisFields.push({ name: 'domain', value: { kind: 'object', fields: [{ name: 'min', value: optionDoubleLiteral(min) }, { name: 'max', value: optionDoubleLiteral(max) }] } })
    }
    const axisName = litString(objectField(axis, 'name'))
    if (axisName !== undefined) axisFields.push({ name: 'name', value: lit(axisName) })
    const points: ExprIR[] = []
    for (let i = 0; i < data.elements.length; i++) {
      const datum = literalOf(data.elements[i], resolve)
      const values = datum?.kind === 'array' ? datum : datum?.kind === 'object' ? literalOf(objectField(datum, 'value'), resolve) : undefined
      const x = values?.kind === 'array' ? litNumber(values.elements[0]) : litNumber(datum)
      if (x === undefined) {
        warn(`<OptionChart option.series[0].data[${i}]>: a native single-axis datum needs a literal value or [position, size]; emitting nothing.`)
        return undefined
      }
      const fields: { name: string; value: ExprIR }[] = [{ name: 'x', value: optionDoubleLiteral(x) }]
      const size = values?.kind === 'array' ? litNumber(values.elements[1]) : undefined
      if (size !== undefined) fields.push({ name: 'size', value: optionDoubleLiteral(size) })
      if (datum?.kind === 'object') {
        const name = litString(objectField(datum, 'name'))
        const itemStyle = literalOf(objectField(datum, 'itemStyle'), resolve)
        const color = itemStyle?.kind === 'object' ? litString(objectField(itemStyle, 'color')) : undefined
        if (name !== undefined) fields.push({ name: 'name', value: lit(name) })
        if (color !== undefined) fields.push({ name: 'color', value: lit(color) })
      }
      points.push({ kind: 'object', fields })
    }
    const optionFieldsOut: { name: string; value: ExprIR }[] = []
    const label = literalOf(objectField(series, 'label'), resolve)
    if (label?.kind === 'object') {
      optionFields(label, ['show'], 'option.series[0].label', warn)
      const show = objectField(label, 'show')
      if (show?.kind === 'literal' && show.value === true) optionFieldsOut.push({ name: 'showLabels', value: lit(true) })
    }
    const radius = litNumber(objectField(series, 'symbolSize'))
    if (radius !== undefined) optionFieldsOut.push({ name: 'radius', value: optionDoubleLiteral(radius / 2) })
    const itemStyle = literalOf(objectField(series, 'itemStyle'), resolve)
    const color = itemStyle?.kind === 'object' ? litString(objectField(itemStyle, 'color')) : undefined
    if (color !== undefined) optionFieldsOut.push({ name: 'color', value: lit(color) })
    set('axis', { kind: 'object', fields: axisFields })
    set('points', { kind: 'array', elements: points })
    if (optionFieldsOut.length > 0) set('singleAxis', { kind: 'object', fields: optionFieldsOut })
    return { kind: 'jsx-element', tag: 'SingleAxisChart', attrs, children: [] }
  }

  if (litString(objectField(series, 'coordinateSystem')) === 'polar') {
    const angleAxis = literalOf(objectField(raw, 'angleAxis'), resolve)
    const radiusAxis = literalOf(objectField(raw, 'radiusAxis'), resolve)
    if (angleAxis?.kind !== 'object' || radiusAxis?.kind !== 'object') {
      warn('<OptionChart option.angleAxis>: native polar charts need literal angleAxis and radiusAxis objects; emitting nothing.')
      return undefined
    }
    optionFields(angleAxis, ['type', 'data', 'min', 'max', 'startAngle', 'clockwise'], 'option.angleAxis', warn)
    optionFields(radiusAxis, ['type', 'data', 'min', 'max'], 'option.radiusAxis', warn)
    const categoryOnRadius = litString(objectField(radiusAxis, 'type')) === 'category'
    const categoryAxis = categoryOnRadius ? radiusAxis : angleAxis
    const valueAxis = categoryOnRadius ? angleAxis : radiusAxis
    const categoryData = literalOf(objectField(categoryAxis, 'data'), resolve)
    if (categoryData?.kind !== 'array' || categoryData.elements.some((value) => litString(value) === undefined)) {
      warn('<OptionChart polar category axis data>: native polar charts need literal string categories; emitting nothing.')
      return undefined
    }
    // `categoryOn` is always stated: a `categories`-only literal (an option
    // with no radius max, the common case) is ambiguous to struct selection
    // and emitted an untyped object that neither toolchain accepted.
    const axesFields: { name: string; value: ExprIR }[] = [
      { name: 'categories', value: categoryData },
      { name: 'categoryOn', value: lit(categoryOnRadius ? 'radius' : 'angle') },
    ]
    const min = litNumber(objectField(valueAxis, 'min'))
    const max = litNumber(objectField(valueAxis, 'max'))
    if (max !== undefined) axesFields.push({ name: 'valueDomain', value: { kind: 'object', fields: [{ name: 'min', value: optionDoubleLiteral(min ?? 0) }, { name: 'max', value: optionDoubleLiteral(max) }] } })
    const startAngle = litNumber(objectField(angleAxis, 'startAngle'))
    if (startAngle !== undefined) axesFields.push({ name: 'startAngle', value: optionDoubleLiteral((-startAngle * Math.PI) / 180) })
    const clockwise = objectField(angleAxis, 'clockwise')
    if (clockwise?.kind === 'literal' && clockwise.value === false) axesFields.push({ name: 'clockwise', value: lit(false) })

    const sourceSeries = rawSeries?.kind === 'array' ? rawSeries.elements : [series]
    const polarSeries: ExprIR[] = []
    for (let i = 0; i < sourceSeries.length; i++) {
      const item = literalOf(sourceSeries[i], resolve)
      const rawKind = item?.kind === 'object' ? litString(objectField(item, 'type')) : undefined
      const itemKind = rawKind === 'effectScatter' ? 'scatter' : rawKind
      if (item?.kind !== 'object' || (itemKind !== 'bar' && itemKind !== 'line' && itemKind !== 'scatter') || litString(objectField(item, 'coordinateSystem')) !== 'polar') {
        warn(`<OptionChart option.series[${i}]>: native polar charts support literal polar bar, line and scatter series; emitting nothing.`)
        return undefined
      }
      optionFields(item, ['type', 'name', 'data', 'coordinateSystem', 'polarIndex', 'stack', 'itemStyle', 'lineStyle', 'label', 'emphasis', 'smooth', 'symbol', 'symbolSize', 'barWidth', 'barGap', 'barCategoryGap', 'roundCap', 'showBackground', 'backgroundStyle', 'areaStyle', 'color'], `option.series[${i}]`, warn)
      const itemData = literalOf(objectField(item, 'data'), resolve)
      if (itemData?.kind !== 'array') {
        warn(`<OptionChart option.series[${i}].data>: a native polar series needs literal numeric data; emitting nothing.`)
        return undefined
      }
      const values: ExprIR[] = []
      for (let j = 0; j < itemData.elements.length; j++) {
        const datum = literalOf(itemData.elements[j], resolve)
        const value = datum?.kind === 'array' ? litNumber(datum.elements[0]) : datum?.kind === 'object' ? litNumber(objectField(datum, 'value')) : litNumber(datum)
        if (value === undefined) {
          warn(`<OptionChart option.series[${i}].data[${j}]>: a native polar datum needs a literal number; emitting nothing.`)
          return undefined
        }
        values.push(optionDoubleLiteral(value))
      }
      const itemStyle = literalOf(objectField(item, 'itemStyle'), resolve)
      const lineStyle = literalOf(objectField(item, 'lineStyle'), resolve)
      const color = itemStyle?.kind === 'object' ? litString(objectField(itemStyle, 'color')) : lineStyle?.kind === 'object' ? litString(objectField(lineStyle, 'color')) : undefined
      const fields: { name: string; value: ExprIR }[] = [
        { name: 'name', value: litString(objectField(item, 'name')) === undefined ? lit(`Series ${i + 1}`) : objectField(item, 'name')! },
        { name: 'kind', value: lit(itemKind) },
        { name: 'values', value: { kind: 'array', elements: values } },
      ]
      if (color !== undefined) fields.push({ name: 'color', value: lit(color) })
      const symbolSize = litNumber(objectField(item, 'symbolSize'))
      if (symbolSize !== undefined && itemKind !== 'bar') fields.push({ name: 'radius', value: optionDoubleLiteral(symbolSize / 2) })
      const stack = litString(objectField(item, 'stack'))
      if (stack !== undefined) fields.push({ name: 'stack', value: lit(stack) })
      polarSeries.push({ kind: 'object', fields })
    }

    const polarFields: { name: string; value: ExprIR }[] = []
    const polar = literalOf(objectField(raw, 'polar'), resolve)
    if (polar?.kind === 'object') {
      optionFields(polar, ['radius'], 'option.polar', warn)
      const radius = literalOf(objectField(polar, 'radius'), resolve)
      const inner = radius?.kind === 'array' ? litString(radius.elements[0]) : undefined
      const outer = radius?.kind === 'array' ? litString(radius.elements[1]) : undefined
      if (inner?.endsWith('%') && outer?.endsWith('%') && Number.parseFloat(outer) > 0) polarFields.push({ name: 'innerRatio', value: optionDoubleLiteral(Number.parseFloat(inner) / Number.parseFloat(outer)) })
    }
    set('axes', { kind: 'object', fields: axesFields })
    set('series', { kind: 'array', elements: polarSeries })
    if (polarFields.length > 0) set('polar', { kind: 'object', fields: polarFields })
    return { kind: 'jsx-element', tag: 'PolarChart', attrs, children: [] }
  }

  if (kind === 'heatmap' && litString(objectField(series, 'coordinateSystem')) === 'calendar') {
    optionFields(series, ['type', 'name', 'coordinateSystem', 'data', 'label', 'itemStyle', 'emphasis', 'color'], 'option.series[0]', warn)
    const calendar = literalOf(objectField(raw, 'calendar'), resolve)
    const range = calendar?.kind === 'object' ? literalOf(objectField(calendar, 'range'), resolve) : undefined
    let start: string | undefined
    let end: string | undefined
    const year = litString(range) ?? (litNumber(range) !== undefined ? String(litNumber(range)) : undefined)
    if (year !== undefined && /^\d{4}$/.test(year)) {
      start = `${year}-01-01`
      end = `${year}-12-31`
    } else if (year !== undefined && /^\d{4}-\d{2}$/.test(year)) {
      const y = Number(year.slice(0, 4))
      const month = Number(year.slice(5, 7))
      const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
      const last = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
      if (last !== undefined) {
        start = `${year}-01`
        end = `${year}-${last}`
      }
    } else if (year !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(year)) {
      start = year
      end = year
    } else if (range?.kind === 'array' && range.elements.length === 2) {
      start = litString(range.elements[0])
      end = litString(range.elements[1])
    }
    if (start === undefined || end === undefined) {
      warn('<OptionChart option.calendar.range>: a native calendar needs a literal year, month, date, or [start, end] ISO-date range; emitting nothing.')
      return undefined
    }
    optionFields(calendar!, ['range', 'orient', 'cellSize', 'dayLabel', 'monthLabel', 'itemStyle'], 'option.calendar', warn)
    const calendarFields: { name: string; value: ExprIR }[] = []
    const orient = litString(objectField(calendar!, 'orient'))
    if (orient === 'vertical') set('orient', lit('vertical'))
    const cellSizeRaw = literalOf(objectField(calendar!, 'cellSize'), resolve)
    const cellSize = cellSizeRaw?.kind === 'array' ? litNumber(cellSizeRaw.elements[0]) : litNumber(cellSizeRaw)
    if (cellSize !== undefined) calendarFields.push({ name: 'cellSize', value: optionDoubleLiteral(cellSize) })
    const dayLabel = literalOf(objectField(calendar!, 'dayLabel'), resolve)
    if (dayLabel?.kind === 'object') {
      optionFields(dayLabel, ['show', 'firstDay'], 'option.calendar.dayLabel', warn)
      const show = objectField(dayLabel, 'show')
      if (show?.kind === 'literal' && show.value === false) calendarFields.push({ name: 'showDayLabels', value: lit(false) })
      const firstDay = litNumber(objectField(dayLabel, 'firstDay'))
      if (firstDay !== undefined) calendarFields.push({ name: 'firstDay', value: optionDoubleLiteral(firstDay) })
    }
    const monthLabel = literalOf(objectField(calendar!, 'monthLabel'), resolve)
    if (monthLabel?.kind === 'object') {
      optionFields(monthLabel, ['show'], 'option.calendar.monthLabel', warn)
      const show = objectField(monthLabel, 'show')
      if (show?.kind === 'literal' && show.value === false) calendarFields.push({ name: 'showMonthLabels', value: lit(false) })
    }
    const itemStyle = literalOf(objectField(calendar!, 'itemStyle'), resolve)
    if (itemStyle?.kind === 'object') {
      optionFields(itemStyle, ['color', 'borderWidth'], 'option.calendar.itemStyle', warn)
      const emptyColor = litString(objectField(itemStyle, 'color'))
      const gap = litNumber(objectField(itemStyle, 'borderWidth'))
      if (emptyColor !== undefined) calendarFields.push({ name: 'emptyColor', value: lit(emptyColor) })
      if (gap !== undefined) calendarFields.push({ name: 'cellGap', value: optionDoubleLiteral(gap) })
    }
    const visualMap = literalOf(objectField(raw, 'visualMap'), resolve)
    if (visualMap?.kind === 'object') {
      optionFields(visualMap, VISUAL_MAP_FIELDS, 'option.visualMap', warn)
      const min = litNumber(objectField(visualMap, 'min'))
      const max = litNumber(objectField(visualMap, 'max'))
      if (min !== undefined && max !== undefined) calendarFields.push({ name: 'domain', value: { kind: 'object', fields: [{ name: 'min', value: optionDoubleLiteral(min) }, { name: 'max', value: optionDoubleLiteral(max) }] } })
      const inRange = literalOf(objectField(visualMap, 'inRange'), resolve)
      if (inRange?.kind === 'object') {
        optionFields(inRange, ['color'], 'option.visualMap.inRange', warn)
        const colors = literalOf(objectField(inRange, 'color'), resolve)
        if (colors?.kind === 'array' && colors.elements.length >= 2 && colors.elements.every((color) => litString(color) !== undefined)) calendarFields.push({ name: 'stops', value: colors })
      }
    }
    const data = literalOf(objectField(series, 'data'), resolve)
    if (data?.kind !== 'array') {
      warn('<OptionChart option.series[0].data>: a native calendar needs literal [date, value] rows; emitting nothing.')
      return undefined
    }
    const fields: { name: string; value: ExprIR }[] = []
    for (let i = 0; i < data.elements.length; i++) {
      const row = literalOf(data.elements[i], resolve)
      const date = row?.kind === 'array' ? litString(row.elements[0]) : undefined
      const value = row?.kind === 'array' ? litNumber(row.elements[1]) : undefined
      if (date === undefined || value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        warn(`<OptionChart option.series[0].data[${i}]>: a native calendar cell needs a literal [ISO-date, number]; emitting nothing.`)
        return undefined
      }
      fields.push({ name: date, value: optionNumberLiteral(value) })
    }
    set('start', lit(start))
    set('end', lit(end))
    set('values', { kind: 'object', fields })
    if (calendarFields.length > 0) set('calendar', { kind: 'object', fields: calendarFields })
    optionVisualMap()
    return { kind: 'jsx-element', tag: 'CalendarChart', attrs, children: [] }
  }

  if (kind === 'heatmap') {
    optionVisualMap()
    optionFields(series, ['type', 'name', 'data', 'label', 'itemStyle', 'emphasis', 'color'], 'option.series[0]', warn)
    const data = literalOf(objectField(series, 'data'), resolve)
    const xAxis = literalOf(objectField(raw, 'xAxis'), resolve)
    const yAxis = literalOf(objectField(raw, 'yAxis'), resolve)
    const xs = xAxis === undefined ? undefined : literalOf(objectField(xAxis, 'data'), resolve)
    const ys = yAxis === undefined ? undefined : literalOf(objectField(yAxis, 'data'), resolve)
    if (data?.kind !== 'array' || xs?.kind !== 'array' || ys?.kind !== 'array') {
      warn('<OptionChart option.series[0].data>: a native heatmap needs literal data and category axes; emitting nothing.')
      return undefined
    }
    const rows: ExprIR[] = []
    for (let i = 0; i < data.elements.length; i++) {
      const values = literalOf(data.elements[i], resolve)
      const xi = values?.kind === 'array' ? litNumber(values.elements[0]) : undefined
      const yi = values?.kind === 'array' ? litNumber(values.elements[1]) : undefined
      const value = values?.kind === 'array' ? litNumber(values.elements[2]) : undefined
      if (xi === undefined || yi === undefined || value === undefined || xs.elements[xi] === undefined || ys.elements[yi] === undefined) {
        warn(`<OptionChart option.series[0].data[${i}]>: a native heatmap cell needs valid [xIndex, yIndex, value]; emitting nothing.`)
        return undefined
      }
      rows.push({ kind: 'object', fields: [
        { name: 'x', value: lit(String(litString(xs.elements[xi]) ?? litNumber(xs.elements[xi]))) },
        { name: 'y', value: lit(String(litString(ys.elements[yi]) ?? litNumber(ys.elements[yi]))) },
        { name: 'value', value: optionNumberLiteral(value) },
      ] })
    }
    set('data', { kind: 'array', elements: rows })
    for (const name of ['x', 'y', 'value']) set(name, { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: name } })
    return { kind: 'jsx-element', tag: 'HeatmapChart', attrs, children: [] }
  }

  if (kind === 'funnel') {
    optionFields(series, ['type', 'name', 'data', 'sort', 'gap', 'minSize', 'label', 'itemStyle', 'funnelAlign', 'color', 'emphasis', ...FRAME_KEYS], 'option.series[0]', warn)
    const data = literalOf(objectField(series, 'data'), resolve)
    if (data?.kind !== 'array') {
      warn('<OptionChart option.series[0].data>: a native funnel needs a literal data array; emitting nothing.')
      return undefined
    }
    const rows: ExprIR[] = []
    for (let i = 0; i < data.elements.length; i++) {
      const datum = literalOf(data.elements[i], resolve)
      const value = datum?.kind === 'object' ? litNumber(objectField(datum, 'value')) : undefined
      const name = datum?.kind === 'object' ? objectField(datum, 'name') : undefined
      if (value === undefined) {
        warn(`<OptionChart option.series[0].data[${i}]>: a funnel datum needs a literal value; emitting nothing.`)
        return undefined
      }
      rows.push({ kind: 'object', fields: [{ name: 'value', value: optionNumberLiteral(value) }, { name: 'label', value: litString(name) === undefined ? lit(`Stage ${i + 1}`) : name! }] })
    }
    set('data', { kind: 'array', elements: rows })
    set('value', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'value' } })
    set('label', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'label' } })
    const funnelFields: { name: string; value: ExprIR }[] = []
    for (const name of ['sort', 'gap'] as const) {
      const value = objectField(series, name)
      if ((name === 'sort' && litString(value) !== undefined) || (name === 'gap' && litNumber(value) !== undefined)) funnelFields.push({ name, value: value! })
    }
    if (funnelFields.length > 0) set('funnel', { kind: 'object', fields: funnelFields })
    // No formatter: ECharts' default rows under the series name, as the web's.
    const funnelTip = literalOf(objectField(raw, 'tooltip'), resolve)
    if (funnelTip?.kind === 'object' && objectField(funnelTip, 'formatter') === undefined && objectField(funnelTip, 'valueFormatter') === undefined) set('tooltipHeader', lit(litString(objectField(series, 'name')) ?? ''))
    return { kind: 'jsx-element', tag: 'FunnelChart', attrs, children: [] }
  }

  if (kind === 'treemap' || kind === 'sunburst' || kind === 'tree') {
    optionFields(series, ['type', 'name', 'data', 'label', 'itemStyle', 'levels', 'radius', 'nodeClick', 'roam', 'symbolSize', 'orient', ...FRAME_KEYS, ...(kind === 'sunburst' ? ['center'] : [])], 'option.series[0]', warn)
    const data = optionTreeNodes(objectField(series, 'data'), resolve, 'option.series[0].data', warn)
    if (data === undefined) return undefined
    set('data', data)
    const label = literalOf(objectField(series, 'label'), resolve)
    const labelShow = label === undefined ? undefined : objectField(label, 'show')
    const optionName = kind === 'treemap' ? 'treemap' : kind === 'sunburst' ? 'sunburst' : 'tree'
    const optionValues: { name: string; value: ExprIR }[] = []
    if (labelShow?.kind === 'literal' && labelShow.value === false) optionValues.push({ name: 'showLabels', value: lit(false) })
    const symbolSize = litNumber(objectField(series, 'symbolSize'))
    if (kind === 'tree' && symbolSize !== undefined) optionValues.push({ name: 'symbolSize', value: optionNumberLiteral(symbolSize) })
    if (optionValues.length > 0) set(optionName, { kind: 'object', fields: optionValues })
    if (kind === 'sunburst') {
      const radius = literalOf(objectField(series, 'radius'), resolve)
      if (radius?.kind === 'array' && radius.elements.length === 2) {
        const inner = litString(radius.elements[0])
        const outer = litString(radius.elements[1])
        if (inner?.endsWith('%') && outer?.endsWith('%') && Number.parseFloat(outer) > 0) set('innerRatio', optionNumberLiteral(Number.parseFloat(inner) / Number.parseFloat(outer)))
      }
    }
    const tag = kind === 'treemap' ? 'TreemapChart' : kind === 'sunburst' ? 'SunburstChart' : 'TreeChart'
    return { kind: 'jsx-element', tag, attrs, children: [] }
  }

  if (kind === 'sankey' || kind === 'graph') {
    optionFields(series, ['type', 'name', 'data', 'nodes', 'links', 'edges', 'label', 'itemStyle', 'lineStyle', 'layout', 'roam', 'symbolSize', 'nodeWidth', 'nodeGap', 'nodeAlign', 'orient', ...(kind === 'sankey' ? FRAME_KEYS : [])], 'option.series[0]', warn)
    if (litString(objectField(series, 'orient')) === 'vertical') set('orient', lit('vertical'))
    const rawNodes = literalOf(objectField(series, 'data') ?? objectField(series, 'nodes'), resolve)
    const rawLinks = literalOf(objectField(series, 'links') ?? objectField(series, 'edges'), resolve)
    if (rawNodes?.kind !== 'array' || rawLinks?.kind !== 'array') {
      warn(`<OptionChart option.series[0]>: native ${kind} needs literal node and link arrays; emitting nothing.`)
      return undefined
    }
    const nodes: ExprIR[] = []
    for (let i = 0; i < rawNodes.elements.length; i++) {
      const node = literalOf(rawNodes.elements[i], resolve)
      const name = node?.kind === 'object' ? objectField(node, 'name') : undefined
      if (node?.kind !== 'object' || litString(name) === undefined) {
        warn(`<OptionChart option.series[0].data[${i}]>: a native ${kind} node needs a literal string name; emitting nothing.`)
        return undefined
      }
      const fields: { name: string; value: ExprIR }[] = [{ name: 'name', value: name! }]
      if (kind === 'graph') {
        fields.unshift({ name: 'id', value: litString(objectField(node, 'id')) === undefined ? name! : objectField(node, 'id')! })
        const value = litNumber(objectField(node, 'value'))
        if (value !== undefined) fields.push({ name: 'value', value: optionDoubleLiteral(value) })
      }
      const item = literalOf(objectField(node, 'itemStyle'), resolve)
      const color = item === undefined ? undefined : objectField(item, 'color')
      if (litString(color) !== undefined) fields.push({ name: 'color', value: color! })
      nodes.push({ kind: 'object', fields })
    }
    const links: ExprIR[] = []
    for (let i = 0; i < rawLinks.elements.length; i++) {
      const link = literalOf(rawLinks.elements[i], resolve)
      const source = link?.kind === 'object' ? objectField(link, 'source') : undefined
      const target = link?.kind === 'object' ? objectField(link, 'target') : undefined
      if (link?.kind !== 'object' || litString(source) === undefined || litString(target) === undefined) {
        warn(`<OptionChart option.series[0].links[${i}]>: a native ${kind} link needs literal string endpoints; emitting nothing.`)
        return undefined
      }
      const fields: { name: string; value: ExprIR }[] = [{ name: 'source', value: source! }, { name: 'target', value: target! }]
      const value = litNumber(objectField(link, 'value'))
      if (kind === 'sankey') {
        if (value === undefined) {
          warn(`<OptionChart option.series[0].links[${i}].value>: a native sankey link needs a literal value; emitting nothing.`)
          return undefined
        }
        fields.push({ name: 'value', value: optionDoubleLiteral(value) })
      } else if (value !== undefined) fields.push({ name: 'value', value: optionDoubleLiteral(value) })
      links.push({ kind: 'object', fields })
    }
    set('nodes', { kind: 'array', elements: nodes })
    set('links', { kind: 'array', elements: links })
    const optionName = kind === 'sankey' ? 'sankey' : 'graph'
    const optionValues: { name: string; value: ExprIR }[] = []
    if (kind === 'sankey') {
      const nodeWidth = litNumber(objectField(series, 'nodeWidth'))
      const nodeGap = litNumber(objectField(series, 'nodeGap'))
      const nodeAlign = litString(objectField(series, 'nodeAlign'))
      if (nodeWidth !== undefined) optionValues.push({ name: 'nodeWidth', value: optionNumberLiteral(nodeWidth) })
      if (nodeGap !== undefined) optionValues.push({ name: 'nodePadding', value: optionNumberLiteral(nodeGap) })
      if (nodeAlign === 'left' || nodeAlign === 'justify') optionValues.push({ name: 'align', value: lit(nodeAlign) })
    } else {
      const layout = litString(objectField(series, 'layout'))
      const symbolSize = litNumber(objectField(series, 'symbolSize'))
      if (layout === 'force' || layout === 'circular' || layout === 'none') optionValues.push({ name: 'layout', value: lit(layout) })
      if (symbolSize !== undefined) optionValues.push({ name: 'symbolSize', value: optionNumberLiteral(symbolSize) })
    }
    if (optionValues.length > 0) set(optionName, { kind: 'object', fields: optionValues })
    return { kind: 'jsx-element', tag: kind === 'sankey' ? 'SankeyChart' : 'GraphChart', attrs, children: [] }
  }

  if (kind === 'lines') {
    // ECharts' lines series: compiled by the web facade itself at compile time,
    // so native draws the same coordinates, styles and trail parameters. The
    // plot carries the x extent as two value rows and no marks.
    const plainOption = irToValue(raw, resolve)
    if (plainOption.ok !== true || !isPlainRecord(plainOption.value)) {
      warn('<OptionChart option>: native lines series need a literal option; emitting nothing.')
      return undefined
    }
    const plainSeries = plainOption.value['series']
    if (!Array.isArray(plainSeries) || plainSeries.some((ps) => !isPlainRecord(ps) || ps['type'] !== 'lines')) {
      warn('<OptionChart option.series>: native lines charts need every series to be a lines series; emitting nothing.')
      return undefined
    }
    const compiledLines = compileOption(plainOption.value as never)
    for (const w of compiledLines.warnings) warn(`<OptionChart option.${w.path}>: ${w.message}`)
    const linesSpec = compiledLines.spec
    const xs = linesSpec.xValues ?? [0, 1]
    const xsFloat = xs.some((v) => !Number.isInteger(v))
    set('data', { kind: 'array', elements: xs.map((v) => ({ kind: 'object', fields: [{ name: 'xv', value: { kind: 'literal', value: v, ...(xsFloat ? { float: true } : {}) } }] })) })
    set('xValue', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'xv' } })
    set('marks', { kind: 'array', elements: [] })
    if (linesSpec.yDomain !== undefined) set('yDomain', { kind: 'object', fields: [{ name: 'min', value: optionDoubleLiteral(linesSpec.yDomain.min) }, { name: 'max', value: optionDoubleLiteral(linesSpec.yDomain.max) }] })
    const lineLits: ExprIR[] = (linesSpec.lines ?? []).map((ls) => ({
      kind: 'object',
      fields: [
        { name: 'coords', value: { kind: 'array', elements: ls.coords.map((row) => ({ kind: 'array' as const, elements: row.map((v) => optionDoubleLiteral(v)) })) } },
        { name: 'colors', value: { kind: 'array', elements: ls.colors.map((c) => lit(c)) } },
        { name: 'widths', value: { kind: 'array', elements: ls.widths.map((v) => optionDoubleLiteral(v)) } },
        { name: 'effect', value: lit(ls.effect) },
        { name: 'period', value: optionDoubleLiteral(ls.period) },
        { name: 'trailLength', value: optionDoubleLiteral(ls.trailLength) },
        { name: 'effectColor', value: lit(ls.effectColor) },
        { name: 'symbolSize', value: optionDoubleLiteral(ls.symbolSize) },
      ],
    }))
    set('lines', { kind: 'array', elements: lineLits })
    if ((linesSpec.lines ?? []).some((ls) => ls.effect)) set('effectClock', lit(true))
    return { kind: 'jsx-element', tag: 'PlotChart', attrs, children: [] }
  }

  const cartesianKinds = new Set(['line', 'bar', 'pictorialBar', 'scatter'])
  if (cartesianKinds.has(kind)) {
    if (rawSeries?.kind !== 'array' || rawSeries.elements.length === 0) {
      warn('<OptionChart option.series>: native cartesian options need a non-empty literal series array; emitting nothing.')
      return undefined
    }
    const seriesObjects: Extract<ExprIR, { kind: 'object' }>[] = []
    // The web facade's own compile of a literal option: every series and spec
    // field it resolves crosses from here, so the two targets read ONE
    // interpretation of the option instead of two that drift. The keys it
    // carries are allowed only when it ran.
    const compiledCart = compileLiteralOption(raw, resolve, rawSeries.elements.length)
    const fwd = compiledCart !== undefined
    for (let si = 0; si < rawSeries.elements.length; si++) {
      const s = literalOf(rawSeries.elements[si], resolve)
      const sk = s === undefined ? undefined : litString(objectField(s, 'type'))
      if (s?.kind !== 'object' || sk === undefined || !cartesianKinds.has(sk)) {
        warn(`<OptionChart option.series[${si}].type>: this cartesian adapter needs line, bar, pictorialBar, or scatter series; emitting nothing.`)
        return undefined
      }
      optionFields(s, ['type', 'name', 'data', 'stack', 'areaStyle', 'itemStyle', 'lineStyle', 'markArea', 'markLine', 'markPoint', 'symbol', 'symbolRepeat', 'showSymbol', 'symbolSize', 'tooltipExtras', 'sampling', 'large', 'largeThreshold', 'progressive', 'progressiveThreshold', 'emphasis', 'select', 'blur', 'selectedMode', 'symbolClip', 'symbolMargin', 'symbolBoundingData', 'symbolOffset', 'symbolPosition', 'symbolRotate', 'label', 'yAxisIndex', 'xAxisIndex', ...(fwd ? FORWARDED_SERIES_KEYS : [])], `option.series[${si}]`, warn)
      seriesObjects.push(s)
    }
    const xAxisTop = literalOf(objectField(raw, 'xAxis'), resolve)
    // ECharts' xAxis may be an array: the first axis places the bands, and a
    // second labels the SAME bands on the opposite edge when its count matches.
    const xAxisEntries = xAxisTop?.kind === 'array' ? xAxisTop.elements.map((el) => literalOf(el, resolve)) : []
    const xAxis = xAxisTop?.kind === 'array' ? xAxisEntries[0] : xAxisTop
    const x2AxisLit = xAxisEntries.length > 1 ? xAxisEntries[1] : undefined
    // A value or time x axis: series data are [x, y] pairs. Series on the first
    // axis share one list of x positions (the engine's xValues); a series on a
    // second value axis (xAxisIndex: 1) carries its own.
    const xTypeLit = xAxis?.kind === 'object' ? litString(objectField(xAxis, 'type')) : undefined
    const valueX = xTypeLit === 'value' || xTypeLit === 'time'
    const x2TypeLit = x2AxisLit?.kind === 'object' ? litString(objectField(x2AxisLit, 'type')) : undefined
    const x2Value = valueX && (x2TypeLit === 'value' || x2TypeLit === 'time')
    const pairXs: (number[] | undefined)[] = []
    const pairYs: (number[] | undefined)[] = []
    let sharedXs: number[] | undefined = undefined
    if (valueX) {
      for (let si = 0; si < seriesObjects.length; si++) {
        const data = literalOf(objectField(seriesObjects[si]!, 'data'), resolve)
        const xsOut: number[] = []
        const ysOut: number[] = []
        const ok = data?.kind === 'array' && data.elements.every((d) => {
          const pair = literalOf(d, resolve)
          const px = pair?.kind === 'array' && pair.elements.length >= 2 ? litNumber(literalOf(pair.elements[0], resolve)) : undefined
          const py = pair?.kind === 'array' && pair.elements.length >= 2 ? litNumber(literalOf(pair.elements[1], resolve)) : undefined
          if (px === undefined || py === undefined) return false
          xsOut.push(px)
          ysOut.push(py)
          return true
        })
        if (!ok) {
          warn(`<OptionChart option.series[${si}].data>: a native value x axis needs literal [x, y] pairs; emitting nothing.`)
          return undefined
        }
        pairXs.push(xsOut)
        pairYs.push(ysOut)
        const onSecond = x2Value && litNumber(objectField(seriesObjects[si]!, 'xAxisIndex')) === 1
        if (onSecond && pairXs[0] !== undefined && xsOut.length !== pairXs[0].length) {
          warn(`<OptionChart option.series[${si}].data>: a native series on the second value x axis needs as many points as the first series; emitting nothing.`)
          return undefined
        }
        if (onSecond) continue
        if (sharedXs === undefined) sharedXs = xsOut
        else if (sharedXs.length !== xsOut.length || sharedXs.some((v, k) => v !== xsOut[k])) {
          warn(`<OptionChart option.series[${si}].data>: native series on one value x axis must share their x positions; emitting nothing.`)
          return undefined
        }
      }
      if (xTypeLit === 'time') set('xTime', lit(true))
    }
    const categories: ExprIR | undefined = valueX
      ? { kind: 'array', elements: (sharedXs ?? pairXs.find((v) => v !== undefined) ?? []).map((v) => lit(String(v))) }
      : xAxis === undefined ? undefined : literalOf(objectField(xAxis, 'data'), resolve)
    if (categories?.kind !== 'array' || !categories.elements.every((x) => litString(x) !== undefined || litNumber(x) !== undefined)) {
      warn('<OptionChart option.xAxis.data>: native cartesian options need a literal category array; emitting nothing.')
      return undefined
    }
    optionFields(xAxis!, ['type', 'data', 'show', 'name', 'inverse', 'position', 'offset', ...(fwd ? FORWARDED_AXIS_KEYS : [])], 'option.xAxis', warn)
    if (fwd) forwardedAxisSubfields(xAxis!, 'option.xAxis', warn)
    const x2Data = x2AxisLit?.kind === 'object' ? literalOf(objectField(x2AxisLit, 'data'), resolve) : undefined
    const x2Mapped = x2Value || (!valueX && x2Data?.kind === 'array' && x2Data.elements.length === categories.elements.length && x2Data.elements.every((x) => litString(x) !== undefined || litNumber(x) !== undefined))
    if (xAxisEntries.length > 2 || (xAxisEntries.length === 2 && !x2Mapped)) warn('<OptionChart option.xAxis>: a second x axis maps as a value axis, or as a second set of category labels with the same count; other x axes were ignored.')
    if (x2Value && x2AxisLit?.kind === 'object') {
      const x2Name = litString(objectField(x2AxisLit, 'name'))
      if (x2Name !== undefined) set('x2Title', lit(x2Name))
      const x2min = litNumber(objectField(x2AxisLit, 'min'))
      const x2max = litNumber(objectField(x2AxisLit, 'max'))
      if (x2min !== undefined && x2max !== undefined) set('x2Domain', { kind: 'object', fields: [{ name: 'min', value: optionDoubleLiteral(x2min) }, { name: 'max', value: optionDoubleLiteral(x2max) }] })
    }
    if (!valueX && x2Mapped && x2Data?.kind === 'array') {
      set('x2Labels', { kind: 'array', elements: x2Data.elements.map((x) => lit(litString(x) ?? String(litNumber(x)))) })
      const x2Name = x2AxisLit?.kind === 'object' ? litString(objectField(x2AxisLit, 'name')) : undefined
      if (x2Name !== undefined) set('x2Title', lit(x2Name))
    }
    const xOffsetLit = litNumber(objectField(xAxis!, 'offset'))
    if (xOffsetLit !== undefined) set('xOffset', lit(xOffsetLit))
    if (litString(objectField(xAxis!, 'position')) === 'top') set('xTop', lit(true))
    const xInverseRaw = objectField(xAxis!, 'inverse')
    if (xInverseRaw?.kind === 'literal' && xInverseRaw.value === true) set('xInverse', lit(true))
    const seriesValues: number[][] = []
    for (let si = 0; si < seriesObjects.length; si++) {
      if (valueX) {
        seriesValues.push(pairYs[si]!)
        continue
      }
      const data = literalOf(objectField(seriesObjects[si]!, 'data'), resolve)
      if (data?.kind !== 'array' || data.elements.length !== categories.elements.length || data.elements.some((d) => optionDatumNumber(literalOf(d, resolve)) === undefined)) {
        warn(`<OptionChart option.series[${si}].data>: native cartesian series need one literal numeric value per xAxis category; emitting nothing.`)
        return undefined
      }
      seriesValues.push(data.elements.map((d) => optionDatumNumber(literalOf(d, resolve))!))
    }
    // Large data at COMPILE time, through the web facade's own decimation
    // (`sampling` thins to the option's static `width` — the same 640 the web
    // uses when nothing measured it — `large` / `progressive` to their
    // thresholds), so the native chart carries the same datums the web draws.
    const sampleRequests: SamplingRequest[] = []
    const staticWidth = litNumber(literalOf(attrOf(e, 'width'), resolve)) ?? 640
    for (let si = 0; si < seriesObjects.length; si++) {
      const request = samplingRequest(optionLiteralRecord(seriesObjects[si]!, ['sampling', 'large', 'largeThreshold', 'progressive', 'progressiveThreshold']), staticWidth, (message) => warn(`<OptionChart option.series[${si}].sampling>: ${message}`))
      if (request !== null) sampleRequests.push(request)
    }
    let categoryLiterals = categories.elements
    if (sampleRequests.length > 0) {
      const thinned = decimateShared(sampleRequests, { columns: seriesValues, categories: categoryLiterals.map((x) => String(litString(x) ?? litNumber(x))), xValues: undefined })
      if (thinned.columns !== seriesValues) {
        for (let si = 0; si < seriesValues.length; si++) seriesValues[si] = thinned.columns[si]!
        categoryLiterals = thinned.categories.map((c) => lit(c))
      }
    }
    // Synthesised row structs infer each field from their first occurrence.
    // Keep an all-integral series as Int (the mark accessor converts it), but
    // make EVERY value Double when any row is fractional so later rows cannot
    // disagree with the first row's generated Swift/Kotlin field type.
    const seriesFloat = seriesValues.map((values) => values.some((n) => !Number.isInteger(n)))
    const rows: ExprIR[] = categoryLiterals.map((x, i) => ({
      kind: 'object',
      fields: [
        { name: 'x', value: lit(String(litString(x) ?? litNumber(x))) },
        ...(valueX && sharedXs !== undefined ? [{ name: 'xv', value: { kind: 'literal' as const, value: sharedXs[i] ?? 0, ...(sharedXs.some((v) => !Number.isInteger(v)) ? { float: true } : {}) } }] : []),
        ...seriesValues.map((values, si) => ({
          name: `s${si}`,
          // A gap (an ECharts null) is NaN, spelled as the engine's `0.0 / 0.0`.
          value: Number.isNaN(values[i]!)
            ? optionDoubleLiteral(Number.NaN)
            : {
                kind: 'literal' as const,
                value: values[i]!,
                ...(seriesFloat[si] ? { float: true } : {}),
              },
        })),
      ],
    }))
    set('data', { kind: 'array', elements: rows })
    set('x', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'x' } })
    if (valueX && sharedXs !== undefined) set('xValue', { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: 'xv' } })
    const barCount = seriesObjects.filter((s) => {
      const seriesType = litString(objectField(s, 'type'))
      return seriesType === 'bar' || seriesType === 'pictorialBar'
    }).length
    const yAxisTop = literalOf(objectField(raw, 'yAxis'), resolve)
    const yAxisPair = yAxisTop?.kind === 'array' ? yAxisTop.elements.map((el) => literalOf(el, resolve)) : []
    const swapYAxes = yAxisPair.length >= 2 && yAxisPair[0]?.kind === 'object' && litString(objectField(yAxisPair[0], 'position')) === 'right' && !(yAxisPair[1]?.kind === 'object' && litString(objectField(yAxisPair[1], 'position')) === 'right')
    const marks: ExprIR[] = seriesObjects.map((s, si) => {
      const sk = litString(objectField(s, 'type'))!
      const stacked = objectField(s, 'stack') !== undefined
      const barLike = sk === 'bar' || sk === 'pictorialBar'
      // A line with an areaStyle is a LINE that also fills (the web facade's reading); only without a compile is it the area mark.
      const filledLine = compiledCart !== undefined && compiledCart.spec.series[si]?.areaFill === true
      const factory = barLike ? (stacked ? 'stackedBars' : barCount > 1 ? 'groupedBars' : 'bars') : sk === 'scatter' ? 'points' : objectField(s, 'areaStyle') !== undefined && !filledLine ? 'area' : 'line'
      const opts: { name: string; value: ExprIR }[] = []
      const name = objectField(s, 'name')
      if (litString(name) !== undefined) opts.push({ name: 'label', value: name! })
      const item = literalOf(objectField(s, sk === 'line' ? 'lineStyle' : 'itemStyle'), resolve)
      const color = item === undefined ? undefined : objectField(item, 'color')
      if (litString(color) !== undefined) opts.push({ name: 'color', value: color! })
      // ECharts' gradient colour object → the mark's `gradient` (stops + direction,
      // or the radial shape); its first stop is the solid colour. An IMAGE
      // pattern (`color: { image }`) has no native form and is named.
      const gradientSlots: [string, ExprIR | undefined][] = [['itemStyle', literalOf(objectField(s, 'itemStyle'), resolve)], ['areaStyle', literalOf(objectField(s, 'areaStyle'), resolve)], ['lineStyle', literalOf(objectField(s, 'lineStyle'), resolve)]]
      for (const [slot, style] of gradientSlots) {
        const g = style?.kind === 'object' ? literalOf(objectField(style, 'color'), resolve) : undefined
        const rawStops = g?.kind === 'object' ? literalOf(objectField(g, 'colorStops'), resolve) : undefined
        if (g?.kind === 'object' && rawStops === undefined && objectField(g, 'image') !== undefined) {
          // A fill image is the mark's pattern (optionPatternLiteral); a stroke cannot carry one.
          if (slot === 'lineStyle') warn(`<OptionChart option.series[${si}].lineStyle.color>: A line stroke cannot be an image pattern (fills can); the palette colour is used.`)
          continue
        }
        if (g?.kind !== 'object' || rawStops?.kind !== 'array') continue
        const stops: { offset: number; color: string }[] = []
        for (const st of rawStops.elements) {
          const so = literalOf(st, resolve)
          const offset = so?.kind === 'object' ? litNumber(objectField(so, 'offset')) : undefined
          const stopColor = so?.kind === 'object' ? litString(objectField(so, 'color')) : undefined
          if (offset !== undefined && stopColor !== undefined) stops.push({ offset, color: stopColor })
        }
        if (stops.length === 0) continue
        if (litString(objectField(g, 'type')) === 'radial') {
          const stopLiterals: ExprIR[] = stops.map((st) => ({ kind: 'object', fields: [{ name: 'offset', value: optionDoubleLiteral(st.offset) }, { name: 'color', value: lit(st.color) }] }))
          opts.push({ name: 'gradient', value: { kind: 'object', fields: [{ name: 'stops', value: { kind: 'array', elements: stopLiterals } }, { name: 'shape', value: lit('radial') }] } })
          if (litString(color) === undefined) opts.push({ name: 'color', value: lit(stops[0]!.color) })
          break
        }
        const dx = (litNumber(objectField(g, 'x2')) ?? 0) - (litNumber(objectField(g, 'x')) ?? 0)
        const dy = (litNumber(objectField(g, 'y2')) ?? 1) - (litNumber(objectField(g, 'y')) ?? 0)
        const horizontal = Math.abs(dx) > Math.abs(dy)
        const ordered = (horizontal ? dx < 0 : dy < 0) ? stops.map((st) => ({ offset: 1 - st.offset, color: st.color })).reverse() : stops
        const stopLiterals: ExprIR[] = ordered.map((st) => ({ kind: 'object', fields: [{ name: 'offset', value: optionDoubleLiteral(st.offset) }, { name: 'color', value: lit(st.color) }] }))
        const gradientFields: { name: string; value: ExprIR }[] = [{ name: 'stops', value: { kind: 'array', elements: stopLiterals } }]
        if (horizontal) gradientFields.push({ name: 'direction', value: lit('horizontal') })
        opts.push({ name: 'gradient', value: { kind: 'object', fields: gradientFields } })
        if (litString(color) === undefined) opts.push({ name: 'color', value: lit(ordered[0]!.color) })
        break
      }
      // ECharts' yAxisIndex: 1 scales the series on the right y axis.
      const axisIndexRaw = objectField(s, 'yAxisIndex')
      if (axisIndexRaw === undefined && swapYAxes) opts.push({ name: 'axis', value: lit('right') })
      if (axisIndexRaw !== undefined) {
        const axisIndex = litNumber(axisIndexRaw)
        if ((axisIndex === 1) !== swapYAxes && (axisIndex === 0 || axisIndex === 1)) opts.push({ name: 'axis', value: lit('right') })
        else if (axisIndex !== undefined && axisIndex >= 2 && axisIndex < yAxisPair.length) opts.push({ name: 'axisExtra', value: optionDoubleLiteral(axisIndex - 2) })
        else if (axisIndex !== 0 && axisIndex !== 1) warn(`<OptionChart option.series[${si}].yAxisIndex>: yAxisIndex ${axisIndex} names no declared y axis; the series uses the left axis.`)
      }
      if (x2Value && litNumber(objectField(s, 'xAxisIndex')) === 1) {
        opts.push({ name: 'onX2', value: lit(true) })
        opts.push({ name: 'xs', value: { kind: 'array', elements: (pairXs[si] ?? []).map((v) => optionDoubleLiteral(v)) } })
      }
      const ariaLit = literalOf(objectField(raw, 'aria'), resolve)
      const ariaDecal = ariaLit?.kind === 'object' ? literalOf(objectField(ariaLit, 'decal'), resolve) : undefined
      const ariaShow = ariaDecal?.kind === 'object' ? objectField(ariaDecal, 'show') : undefined
      const pattern = optionPatternLiteral(objectField(s, 'itemStyle'), resolve, warn, `series[${si}].itemStyle`, ariaShow?.kind === 'literal' && ariaShow.value === true ? si : -1, s)
      if (pattern !== undefined) opts.push({ name: 'pattern', value: pattern })
      // ECharts' states: `emphasis.focus` / `emphasis.itemStyle.color`,
      // `select.itemStyle.color`, `blur.itemStyle.opacity` — the same four
      // Series fields the web facade fills; anything beyond a fill is named.
      const stateLiteral = (key: string): Extract<ExprIR, { kind: 'object' }> | undefined => {
        const v = literalOf(objectField(s, key), resolve)
        return v?.kind === 'object' ? v : undefined
      }
      const emphasisOpt = stateLiteral('emphasis')
      if (emphasisOpt !== undefined) {
        const focus = litString(objectField(emphasisOpt, 'focus'))
        if (focus === 'self' || focus === 'series') opts.push({ name: 'focus', value: lit(focus) })
        else if (objectField(emphasisOpt, 'focus') !== undefined && focus !== 'none') warn(`<OptionChart option.series[${si}].emphasis.focus>: only self, series and none are supported natively; nothing is blurred.`)
        const emphasisItem = literalOf(objectField(emphasisOpt, 'itemStyle'), resolve)
        const c = emphasisItem?.kind === 'object' ? litString(objectField(emphasisItem, 'color')) : undefined
        if (c !== undefined) opts.push({ name: 'emphasisColor', value: lit(c) })
        const scaleIR = objectField(emphasisOpt, 'scale')
        const scaleN = litNumber(scaleIR)
        if (scaleIR?.kind === 'literal' && scaleIR.value === true) opts.push({ name: 'emphasisScale', value: optionDoubleLiteral(1.1) })
        else if (scaleN !== undefined) opts.push({ name: 'emphasisScale', value: optionDoubleLiteral(Math.max(0, scaleN)) })
        if (litBoolean(objectField(emphasisOpt, 'disabled')) === true) opts.push({ name: 'emphasisDisabled', value: lit(true) })
        const eLine = literalOf(objectField(emphasisOpt, 'lineStyle'), resolve)
        const eWidth = eLine?.kind === 'object' ? litNumber(objectField(eLine, 'width')) : undefined
        if (eWidth !== undefined) opts.push({ name: 'emphasisWidth', value: optionDoubleLiteral(Math.max(0, eWidth)) })
        const eArea = literalOf(objectField(emphasisOpt, 'areaStyle'), resolve)
        const eOpacity = eArea?.kind === 'object' ? litNumber(objectField(eArea, 'opacity')) : undefined
        if (eOpacity !== undefined) opts.push({ name: 'emphasisAreaOpacity', value: optionDoubleLiteral(Math.max(0, Math.min(1, eOpacity))) })
        if (stateLabelShows(emphasisOpt, `emphasis`, si, resolve, warn)) opts.push({ name: 'emphasisLabel', value: lit(true) })
        const scope = litString(objectField(emphasisOpt, 'blurScope'))
        if (scope !== undefined && scope !== 'coordinateSystem' && scope !== 'series' && scope !== 'global') warn(`<OptionChart option.series[${si}].emphasis.blurScope>: "${scope}" is not one ECharts defines; it was ignored.`)
      }
      const selectOpt = stateLiteral('select')
      if (selectOpt !== undefined) {
        const selectItem = literalOf(objectField(selectOpt, 'itemStyle'), resolve)
        const c = selectItem?.kind === 'object' ? litString(objectField(selectItem, 'color')) : undefined
        if (c !== undefined) opts.push({ name: 'selectColor', value: lit(c) })
        if (stateLabelShows(selectOpt, `select`, si, resolve, warn)) opts.push({ name: 'selectLabel', value: lit(true) })
        if (litBoolean(objectField(selectOpt, 'disabled')) === true) warn(`<OptionChart option.series[${si}].select.disabled>: not supported; leave selectedMode off to stop a datum pinning.`)
        for (const key of ['lineStyle', 'areaStyle']) if (objectField(selectOpt, key) !== undefined) warn(`<OptionChart option.series[${si}].select.${key}>: has no engine form (a pinned DATUM takes select.itemStyle.color and a heavy outline, and a stroke belongs to the whole line); it was ignored.`)
      }
      const blurOpt = stateLiteral('blur')
      if (blurOpt !== undefined) {
        const blurItem = literalOf(objectField(blurOpt, 'itemStyle'), resolve)
        const opacity = blurItem?.kind === 'object' ? litNumber(objectField(blurItem, 'opacity')) : undefined
        if (opacity !== undefined) opts.push({ name: 'blurOpacity', value: optionDoubleLiteral(Math.max(0, Math.min(1, opacity))) })
        const bLine = literalOf(objectField(blurOpt, 'lineStyle'), resolve)
        const bWidth = bLine?.kind === 'object' ? litNumber(objectField(bLine, 'width')) : undefined
        if (bWidth !== undefined) opts.push({ name: 'blurWidth', value: optionDoubleLiteral(Math.max(0, bWidth)) })
        const bArea = literalOf(objectField(blurOpt, 'areaStyle'), resolve)
        const bOpacity = bArea?.kind === 'object' ? litNumber(objectField(bArea, 'opacity')) : undefined
        if (bOpacity !== undefined) opts.push({ name: 'blurAreaOpacity', value: optionDoubleLiteral(Math.max(0, Math.min(1, bOpacity))) })
        if (objectField(blurOpt, 'label') !== undefined) warn(`<OptionChart option.series[${si}].blur.label>: has no engine form (a blurred datum keeps its own label); it was ignored.`)
      }
      // ECharts' `label`: the facade resolves the {a}/{b}/{c}/{d} template per
      // datum, so the native side resolves it the SAME way at compile time and
      // carries the finished strings. The engine owns the rich segmentation.
      const labelOpt = literalOf(objectField(s, 'label'), resolve)
      if (labelOpt?.kind === 'object') {
        const showIR = objectField(labelOpt, 'show')
        if (showIR?.kind === 'literal' && showIR.value === true) opts.push({ name: 'showValues', value: lit(true) })
        const labelPlain = irToValue(labelOpt, resolve)
        if (labelPlain.ok === true && isPlainRecord(labelPlain.value)) {
          const seriesName = litString(objectField(s, 'name')) ?? `Series ${si + 1}`
          const resolvedLabel = labelFields(labelPlain.value, seriesName, categoryLiterals.map((x) => String(litString(x) ?? litNumber(x))), seriesValues[si] ?? [], `option.series[${si}].label`, (_code, path, message) => warn(`<OptionChart ${path}>: ${message}`), plain)
          if (resolvedLabel.labelTexts !== undefined) opts.push({ name: 'labelTexts', value: { kind: 'array', elements: resolvedLabel.labelTexts.map((textValue) => lit(textValue)) } })
          if (resolvedLabel.labelColor !== undefined) opts.push({ name: 'labelColor', value: lit(resolvedLabel.labelColor) })
          if (resolvedLabel.labelSize !== undefined) opts.push({ name: 'labelSize', value: optionDoubleLiteral(resolvedLabel.labelSize) })
          if (resolvedLabel.labelRich !== undefined) {
            opts.push({
              name: 'labelRich',
              value: { kind: 'array', elements: (resolvedLabel.labelRich as RichStyle[]).map((r) => ({ kind: 'object' as const, fields: [{ name: 'name', value: lit(r.name) }, { name: 'color', value: lit(r.color) }, { name: 'fontSize', value: optionDoubleLiteral(r.fontSize) }] })) },
            })
          }
        } else {
          warn(`<OptionChart option.series[${si}].label>: native needs a literal label object (a FUNCTION formatter cannot run at compile time); the values are shown unformatted.`)
        }
      }
      const modeRaw = objectField(s, 'selectedMode')
      if (modeRaw !== undefined && si === 0) {
        const mode = modeRaw.kind === 'literal' ? modeRaw.value : undefined
        if (mode === true || mode === 'single') set('selectedMode', lit('single'))
        else if (mode === 'multiple') set('selectedMode', lit('multiple'))
        else if (mode === 'series') set('selectedMode', lit('series'))
        else if (mode !== false) warn(`<OptionChart option.series[0].selectedMode>: only true, single, multiple and series are supported natively; taps do not pin.`)
      }
      // The dataset pre-pass materialised `encode.tooltip` as `tooltipExtras`.
      const extras = literalOf(objectField(s, 'tooltipExtras'), resolve)
      if (extras?.kind === 'array' && extras.elements.length > 0) opts.push({ name: 'extras', value: extras })
      if (sk === 'line' || sk === 'scatter') {
        // ECharts' symbol / showSymbol: a scatter datum shape, or a line's opt-in datum symbols.
        const showSymbol = objectField(s, 'showSymbol')
        const wantsLineSymbols = sk === 'line' && showSymbol?.kind === 'literal' && showSymbol.value === true
        const rawSymbol = litString(objectField(s, 'symbol')) ?? (wantsLineSymbols ? 'circle' : '')
        if (sk === 'scatter' || wantsLineSymbols) {
          const symbol = rawSymbol === 'circle' || rawSymbol === 'emptyCircle' ? 'circle' : rawSymbol === 'rect' || rawSymbol === 'roundRect' ? 'rect' : rawSymbol === 'diamond' || rawSymbol === 'triangle' ? rawSymbol : undefined
          if (rawSymbol !== '' && symbol === undefined) warn(`<OptionChart option.series[${si}].symbol>: native series symbols support circle, emptyCircle, rect, roundRect, diamond, or triangle; rendering circles.`)
          const resolved = symbol ?? (rawSymbol === '' ? undefined : 'circle')
          if (resolved !== undefined && (sk === 'line' || resolved !== 'circle')) opts.push({ name: 'symbol', value: lit(resolved) })
        }
        // ECharts' symbolSize is a diameter; the mark's radius is half of it.
        const symbolSize = litNumber(objectField(s, 'symbolSize'))
        if (symbolSize !== undefined) opts.push({ name: 'radius', value: optionDoubleLiteral(symbolSize / 2) })
      }
      if (sk === 'pictorialBar') {
        const rawSymbol = litString(objectField(s, 'symbol')) ?? 'rect'
        const symbol = rawSymbol === 'roundRect' ? 'rect' : rawSymbol
        if (symbol === 'rect' || symbol === 'circle' || symbol === 'diamond' || symbol === 'triangle') {
          opts.push({ name: 'symbol', value: lit(symbol) })
        } else {
          warn(`<OptionChart option.series[${si}].symbol>: native pictorial bars support rect, roundRect, circle, diamond, or triangle; rendering rectangles.`)
          opts.push({ name: 'symbol', value: lit('rect') })
        }
        const repeat = objectField(s, 'symbolRepeat')
        const repeatValue = repeat?.kind === 'literal' && (repeat.value === true || repeat.value === 'fixed' || (typeof repeat.value === 'number' && repeat.value > 0))
        opts.push({ name: 'symbolRepeat', value: lit(repeatValue) })
        // The six geometry keys, in px / degrees, like the web facade; percent strings are named.
        const px = (key: string): number | undefined => {
          const v = objectField(s, key)
          if (v === undefined) return undefined
          const n = litNumber(v)
          if (n === undefined) warn(`<OptionChart option.series[${si}].${key}>: pictorialBar ${key} takes a number of pixels here (a percent string is not supported); it was ignored.`)
          return n
        }
        const margin = px('symbolMargin')
        if (margin !== undefined) opts.push({ name: 'symbolMargin', value: optionDoubleLiteral(Math.max(0, margin)) })
        const offsetRaw = literalOf(objectField(s, 'symbolOffset'), resolve)
        if (offsetRaw !== undefined) {
          const dx = offsetRaw.kind === 'array' && offsetRaw.elements.length === 2 ? litNumber(offsetRaw.elements[0]) : undefined
          const dy = offsetRaw.kind === 'array' && offsetRaw.elements.length === 2 ? litNumber(offsetRaw.elements[1]) : undefined
          if (dx !== undefined && dy !== undefined) opts.push({ name: 'symbolOffset', value: { kind: 'array', elements: [optionDoubleLiteral(dx), optionDoubleLiteral(dy)] } })
          else warn(`<OptionChart option.series[${si}].symbolOffset>: symbolOffset takes [dx, dy] in pixels here (a percent string is not supported); it was ignored.`)
        }
        const position = litString(objectField(s, 'symbolPosition'))
        if (position === 'start' || position === 'end' || position === 'center') opts.push({ name: 'symbolPosition', value: lit(position) })
        else if (objectField(s, 'symbolPosition') !== undefined) warn(`<OptionChart option.series[${si}].symbolPosition>: only start, end and center are supported; it was ignored.`)
        const rotate = px('symbolRotate')
        if (rotate !== undefined) opts.push({ name: 'symbolRotate', value: optionDoubleLiteral(rotate) })
        const clip = objectField(s, 'symbolClip')
        if (clip !== undefined) opts.push({ name: 'symbolClip', value: lit(clip.kind === 'literal' && clip.value === true) })
        const bounding = px('symbolBoundingData')
        if (bounding !== undefined) opts.push({ name: 'symbolBoundingData', value: optionDoubleLiteral(bounding) })
      }
      if (compiledCart !== undefined) forwardCompiledSeries(opts, compiledCart.spec.series[si]!)
      return {
        kind: 'call',
        callee: ident(factory),
        args: [
          { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: `s${si}` } },
          { kind: 'object', fields: opts },
        ],
      }
    })
    set('marks', { kind: 'array', elements: marks })
    if (compiledCart !== undefined) {
      const specLit = optionSpecLiteral(compiledCart.spec)
      if (specLit.fields.length > 0) set('optionSpec', specLit)
    }
    // ECharts' default tooltip content (no formatter): its cells come from the engine's
    // tooltipAxisCells / tooltipItemCells — the trigger ('item' unless the option says 'axis')
    // and which series the option NAMED, since ECharts hides a generated name.
    const tipOpt = literalOf(objectField(raw, 'tooltip'), resolve)
    if (tipOpt?.kind === 'object' && objectField(tipOpt, 'formatter') === undefined && objectField(tipOpt, 'valueFormatter') === undefined) {
      const trig = litString(objectField(tipOpt, 'trigger')) === 'axis' ? 'axis' : 'item'
      const named = seriesObjects.map((so) => {
        const nm = litString(objectField(so, 'name'))
        return lit(nm !== undefined && nm !== '')
      })
      set('tooltipCells', { kind: 'object', fields: [{ name: 'trigger', value: lit(trig) }, { name: 'named', value: { kind: 'array', elements: named } }] })
    }
    const annotations: ExprIR[] = []
    for (let si = 0; si < seriesObjects.length; si++) {
      const markArea = literalOf(objectField(seriesObjects[si]!, 'markArea'), resolve)
      if (markArea === undefined) continue
      if (markArea.kind !== 'object') {
        warn(`<OptionChart option.series[${si}].markArea>: native mark areas need a literal object; rendering without it.`)
        continue
      }
      optionFields(markArea, ['data', 'itemStyle'], `option.series[${si}].markArea`, warn)
      const data = literalOf(objectField(markArea, 'data'), resolve)
      const style = literalOf(objectField(markArea, 'itemStyle'), resolve)
      const color = style?.kind === 'object' ? litString(objectField(style, 'color')) : undefined
      if (style?.kind === 'object') optionFields(style, ['color'], `option.series[${si}].markArea.itemStyle`, warn)
      if (data?.kind !== 'array') {
        warn(`<OptionChart option.series[${si}].markArea.data>: native mark areas need a literal boundary-pair array; rendering without it.`)
        continue
      }
      for (let ai = 0; ai < data.elements.length; ai++) {
        const pair = literalOf(data.elements[ai], resolve)
        const from = pair?.kind === 'array' ? literalOf(pair.elements[0], resolve) : undefined
        const to = pair?.kind === 'array' ? literalOf(pair.elements[1], resolve) : undefined
        if (from?.kind !== 'object' || to?.kind !== 'object') {
          warn(`<OptionChart option.series[${si}].markArea.data[${ai}]>: native mark areas need two literal boundary objects; rendering without this area.`)
          continue
        }
        const yFrom = litNumber(objectField(from, 'yAxis'))
        const yTo = litNumber(objectField(to, 'yAxis'))
        const xFrom = litNumber(objectField(from, 'xAxis'))
        const xTo = litNumber(objectField(to, 'xAxis'))
        const fields: { name: string; value: ExprIR }[] = []
        if (yFrom !== undefined && yTo !== undefined) {
          fields.push({ name: 'yFrom', value: optionDoubleLiteral(yFrom) }, { name: 'yTo', value: optionDoubleLiteral(yTo) })
        } else if (xFrom !== undefined && xTo !== undefined) {
          fields.push({ name: 'xFrom', value: optionDoubleLiteral(xFrom) }, { name: 'xTo', value: optionDoubleLiteral(xTo) })
        } else {
          warn(`<OptionChart option.series[${si}].markArea.data[${ai}]>: native mark areas need matching numeric xAxis or yAxis boundaries; rendering without this area.`)
          continue
        }
        const name = litString(objectField(from, 'name'))
        if (name !== undefined) fields.push({ name: 'label', value: lit(name) })
        if (color !== undefined) fields.push({ name: 'color', value: lit(color) })
        annotations.push({ kind: 'object', fields })
      }
    }
    // markLine → annotations (rules and segments), markPoint → markers — the
    // web facade's resolution run at compile time over the literal series,
    // so a statistic names the same datum on every target.
    const markers: ExprIR[] = []
    const catNames = categories.elements.map((x) => String(litString(x) ?? litNumber(x)))
    const styleColorOf = (o: Extract<ExprIR, { kind: 'object' }> | undefined, key: string, fallback: string | undefined): string | undefined => {
      const st = o === undefined ? undefined : literalOf(objectField(o, key), resolve)
      const c = st?.kind === 'object' ? litString(objectField(st, 'color')) : undefined
      return c ?? fallback
    }
    for (let si = 0; si < seriesObjects.length; si++) {
      const s = seriesObjects[si]!
      const values = seriesValues[si]!
      const argIndex = (which: string): number => {
        if (values.length === 0) return -1
        if (which === 'max' || which === 'min') return values.reduce((best, v, j) => (which === 'max' ? v > values[best]! : v < values[best]!) ? j : best, 0)
        if (which === 'average') {
          const mean = values.reduce((a, b) => a + b, 0) / values.length
          return values.reduce((best, v, j) => (Math.abs(v - mean) < Math.abs(values[best]! - mean) ? j : best), 0)
        }
        return -1
      }
      const statOf = (which: string): number | undefined => {
        if (values.length === 0) return undefined
        if (which === 'average') return values.reduce((a, b) => a + b, 0) / values.length
        if (which === 'max') return Math.max(...values)
        if (which === 'min') return Math.min(...values)
        if (which === 'median') {
          const sorted = [...values].sort((a, b) => a - b)
          const mid = Math.floor(sorted.length / 2)
          return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
        }
        return undefined
      }
      const xOfCoord = (rawX: ExprIR | undefined): number | undefined => {
        const name = litString(rawX)
        if (name !== undefined) {
          const at = catNames.indexOf(name)
          return at >= 0 ? at : undefined
        }
        return litNumber(rawX)
      }
      const endpoint = (end: Extract<ExprIR, { kind: 'object' }>): { x: number; y: number } | undefined => {
        const endType = litString(objectField(end, 'type'))
        if (endType !== undefined) {
          const at = argIndex(endType)
          return at < 0 ? undefined : { x: at, y: values[at]! }
        }
        const coord = literalOf(objectField(end, 'coord'), resolve)
        if (coord?.kind === 'array') {
          const cx = xOfCoord(literalOf(coord.elements[0], resolve))
          const cy = litNumber(literalOf(coord.elements[1], resolve))
          return cx !== undefined && cy !== undefined ? { x: cx, y: cy } : undefined
        }
        const ex = litNumber(objectField(end, 'xAxis'))
        const ey = litNumber(objectField(end, 'yAxis'))
        return ex !== undefined && ey !== undefined ? { x: ex, y: ey } : undefined
      }
      const markLine = literalOf(objectField(s, 'markLine'), resolve)
      if (markLine !== undefined) {
        if (markLine.kind !== 'object') {
          warn(`<OptionChart option.series[${si}].markLine>: native mark lines need a literal object; rendering without them.`)
        } else {
          optionFields(markLine, ['data', 'lineStyle'], `option.series[${si}].markLine`, warn)
          const mlColor = styleColorOf(markLine, 'lineStyle', undefined)
          const data = literalOf(objectField(markLine, 'data'), resolve)
          const items = data?.kind === 'array' ? data.elements : []
          if (data?.kind !== 'array') warn(`<OptionChart option.series[${si}].markLine.data>: native mark lines need a literal data array; rendering without them.`)
          for (let k = 0; k < items.length; k++) {
            const m = literalOf(items[k], resolve)
            const fields: { name: string; value: ExprIR }[] = []
            if (m?.kind === 'array') {
              const from = literalOf(m.elements[0], resolve)
              const to = literalOf(m.elements[1], resolve)
              const p1 = from?.kind === 'object' ? endpoint(from) : undefined
              const p2 = to?.kind === 'object' ? endpoint(to) : undefined
              if (p1 === undefined || p2 === undefined || from?.kind !== 'object') {
                warn(`<OptionChart option.series[${si}].markLine.data[${k}]>: a native point-to-point mark line needs two literal endpoints (a type, a coord, or xAxis + yAxis); rendering without it.`)
                continue
              }
              fields.push({ name: 'x1', value: optionDoubleLiteral(p1.x) }, { name: 'y1', value: optionDoubleLiteral(p1.y) }, { name: 'x2', value: optionDoubleLiteral(p2.x) }, { name: 'y2', value: optionDoubleLiteral(p2.y) })
              const name = litString(objectField(from, 'name'))
              if (name !== undefined) fields.push({ name: 'label', value: lit(name) })
              const c = styleColorOf(from, 'lineStyle', mlColor)
              if (c !== undefined) fields.push({ name: 'color', value: lit(c) })
              annotations.push({ kind: 'object', fields })
              continue
            }
            if (m?.kind !== 'object') continue
            const lineType = litString(objectField(m, 'type'))
            const stat = lineType === undefined ? undefined : statOf(lineType)
            const yAt = litNumber(objectField(m, 'yAxis'))
            const xAt = litNumber(objectField(m, 'xAxis'))
            const name = litString(objectField(m, 'name'))
            if (stat !== undefined) fields.push({ name: 'y', value: optionDoubleLiteral(stat) }, { name: 'label', value: lit(name ?? lineType!) })
            else if (yAt !== undefined) fields.push({ name: 'y', value: optionDoubleLiteral(yAt) })
            else if (xAt !== undefined) fields.push({ name: 'x', value: optionDoubleLiteral(xAt) })
            else {
              warn(`<OptionChart option.series[${si}].markLine.data[${k}]>: native mark lines map average/max/min/median, yAxis, xAxis, and point-to-point pairs; rendering without this line.`)
              continue
            }
            if (stat === undefined && name !== undefined) fields.push({ name: 'label', value: lit(name) })
            const c = styleColorOf(m, 'lineStyle', mlColor)
            if (c !== undefined) fields.push({ name: 'color', value: lit(c) })
            annotations.push({ kind: 'object', fields })
          }
        }
      }
      const markPoint = literalOf(objectField(s, 'markPoint'), resolve)
      if (markPoint !== undefined) {
        if (markPoint.kind !== 'object') {
          warn(`<OptionChart option.series[${si}].markPoint>: native mark points need a literal object; rendering without them.`)
        } else {
          optionFields(markPoint, ['data', 'itemStyle', 'symbolSize'], `option.series[${si}].markPoint`, warn)
          const mpColor = styleColorOf(markPoint, 'itemStyle', undefined)
          const mpSize = litNumber(objectField(markPoint, 'symbolSize'))
          const data = literalOf(objectField(markPoint, 'data'), resolve)
          const items = data?.kind === 'array' ? data.elements : []
          if (data?.kind !== 'array') warn(`<OptionChart option.series[${si}].markPoint.data>: native mark points need a literal data array; rendering without them.`)
          for (let k = 0; k < items.length; k++) {
            const m = literalOf(items[k], resolve)
            if (m?.kind !== 'object') continue
            const pointType = litString(objectField(m, 'type'))
            const fields: { name: string; value: ExprIR }[] = [{ name: 'seriesIndex', value: optionDoubleLiteral(si) }]
            if (pointType === 'max' || pointType === 'min' || pointType === 'average') fields.push({ name: 'at', value: lit(pointType) })
            else {
              const coord = literalOf(objectField(m, 'coord'), resolve)
              const cx = coord?.kind === 'array' ? xOfCoord(literalOf(coord.elements[0], resolve)) : undefined
              if (cx === undefined) {
                warn(`<OptionChart option.series[${si}].markPoint.data[${k}]>: native mark points map max/min/average and coord; rendering without this point.`)
                continue
              }
              fields.push({ name: 'atIndex', value: optionDoubleLiteral(cx) })
            }
            const valueField = objectField(m, 'value')
            const value = litString(valueField) ?? (litNumber(valueField) === undefined ? undefined : String(litNumber(valueField)))
            const name = litString(objectField(m, 'name')) ?? value
            if (name !== undefined) fields.push({ name: 'label', value: lit(name) })
            const c = styleColorOf(m, 'itemStyle', mpColor)
            if (c !== undefined) fields.push({ name: 'color', value: lit(c) })
            const size = litNumber(objectField(m, 'symbolSize')) ?? mpSize
            if (size !== undefined) fields.push({ name: 'radius', value: optionDoubleLiteral(size / 2) })
            markers.push({ kind: 'object', fields })
          }
        }
      }
    }
    if (annotations.length > 0) set('annotations', { kind: 'array', elements: annotations })
    if (markers.length > 0) set('markers', { kind: 'array', elements: markers })
    const xShow = xAxis === undefined ? undefined : objectField(xAxis, 'show')
    if (xShow?.kind === 'literal' && xShow.value === false) set('showXAxis', lit(false))
    const xName = xAxis === undefined ? undefined : litString(objectField(xAxis, 'name'))
    if (xName !== undefined) set('xTitle', lit(xName))
    // ECharts' yAxis is one axis object or an array of them; index 1 is the
    // right axis a series selects with yAxisIndex: 1.
    const yAxisRaw = literalOf(objectField(raw, 'yAxis'), resolve)
    const yAxisDeclared: ExprIR[] = yAxisRaw === undefined ? [] : yAxisRaw.kind === 'array' ? yAxisRaw.elements.map((el) => literalOf(el, resolve)).filter((el): el is ExprIR => el !== undefined) : [yAxisRaw]
    const positionOf = (el: ExprIR | undefined): string | undefined => (el?.kind === 'object' ? litString(objectField(el, 'position')) : undefined)
    // The same side rules as the web facade: a lone axis may sit right, and two
    // axes whose first is placed right swap (yAxisIndex follows).
    const yAxisList: ExprIR[] = swapYAxes ? [yAxisDeclared[1]!, yAxisDeclared[0]!, ...yAxisDeclared.slice(2)] : yAxisDeclared
    if (yAxisDeclared.length === 1 && positionOf(yAxisDeclared[0]) === 'right') set('yRight', lit(true))
    for (let ai = 0; ai < Math.min(2, yAxisDeclared.length); ai++) {
      const pos = positionOf(yAxisDeclared[ai])
      const natural = ai === 0 ? 'left' : 'right'
      if (pos !== undefined && pos !== natural && !swapYAxes && !(yAxisDeclared.length === 1 && pos === 'right')) warn(`<OptionChart option.yAxis[${ai}].position>: both y axes cannot share a side; the axis keeps its default side.`)
    }
    // Third and later y axes: side, pinned domain, title and offset.
    const extraAxes: ExprIR[] = []
    for (let ai = 2; ai < yAxisList.length; ai++) {
      const a = yAxisList[ai]!
      if (a.kind !== 'object') continue
      optionFields(a, ['type', 'show', 'name', 'min', 'max', 'position', 'offset', 'splitLine', ...(fwd ? FORWARDED_AXIS_KEYS : [])], `option.yAxis[${ai}]`, warn)
      if (fwd) forwardedAxisSubfields(a, `option.yAxis[${ai}]`, warn)
      const fields: { name: string; value: ExprIR }[] = [{ name: 'side', value: lit(litString(objectField(a, 'position')) === 'left' ? 'left' : 'right') }]
      const amin = litNumber(objectField(a, 'min'))
      const amax = litNumber(objectField(a, 'max'))
      if (amin !== undefined && amax !== undefined) fields.push({ name: 'domain', value: { kind: 'object', fields: [{ name: 'min', value: optionDoubleLiteral(amin) }, { name: 'max', value: optionDoubleLiteral(amax) }] } })
      const aname = litString(objectField(a, 'name'))
      if (aname !== undefined) fields.push({ name: 'title', value: lit(aname) })
      const aoff = litNumber(objectField(a, 'offset'))
      if (aoff !== undefined) fields.push({ name: 'offset', value: optionDoubleLiteral(aoff) })
      extraAxes.push({ kind: 'object', fields })
    }
    if (extraAxes.length > 0) set('extraYAxes', { kind: 'array', elements: extraAxes })
    for (let ai = 0; ai < Math.min(2, yAxisList.length); ai++) {
      const yAxis = yAxisList[ai]!
      if (yAxis.kind !== 'object') continue
      const path = yAxisRaw?.kind === 'array' ? `option.yAxis[${ai}]` : 'option.yAxis'
      optionFields(yAxis, ['type', 'show', 'name', 'min', 'max', 'splitLine', 'inverse', 'position', 'offset', ...(fwd ? FORWARDED_AXIS_KEYS : [])], path, warn)
      if (fwd) forwardedAxisSubfields(yAxis, path, warn)
      const right = ai === 1
      const yOffsetLit = litNumber(objectField(yAxis, 'offset'))
      if (yOffsetLit !== undefined) set(right ? 'y2Offset' : 'yOffset', lit(yOffsetLit))
      const yShow = objectField(yAxis, 'show')
      if (!right && yShow?.kind === 'literal' && yShow.value === false) set('showYAxis', lit(false))
      if (!right && litString(objectField(yAxis, 'type')) === 'log') set('yScale', lit('log'))
      const inverse = objectField(yAxis, 'inverse')
      if (!right && inverse?.kind === 'literal' && inverse.value === true) set('yInverse', lit(true))
      const yName = litString(objectField(yAxis, 'name'))
      if (yName !== undefined) set(right ? 'y2Title' : 'yTitle', lit(yName))
      const split = literalOf(objectField(yAxis, 'splitLine'), resolve)
      const splitShow = split?.kind === 'object' ? objectField(split, 'show') : undefined
      if (!right && splitShow?.kind === 'literal' && splitShow.value === false) set('showGrid', lit(false))
      const ymin = litNumber(objectField(yAxis, 'min'))
      const ymax = litNumber(objectField(yAxis, 'max'))
      if (ymin !== undefined && ymax !== undefined) {
        set(right ? 'y2Domain' : 'yDomain', {
          kind: 'object',
          fields: [
            { name: 'min', value: { kind: 'literal', value: ymin, float: true } },
            { name: 'max', value: { kind: 'literal', value: ymax, float: true } },
          ],
        })
      }
    }
    // `dataZoom` resolves through the web's own reader: inside → the pinch/pan
    // zoom, slider → the navigator, start/end → the opening window, zoomLock /
    // minSpan / maxSpan → the limits, and filterMode none/empty pins the y
    // extent of every row.
    if (objectField(raw, 'dataZoom') !== undefined) {
      const plainOption = irToValue(raw, resolve)
      if (!plainOption.ok || !isPlainRecord(plainOption.value)) {
        warn('<OptionChart option.dataZoom>: a native dataZoom needs a fully literal option; native renders without the zoom.')
      } else {
        const compiled = compileOption(plainOption.value)
        for (const w of compiled.warnings) if (w.path.startsWith('dataZoom')) warn(`<OptionChart option.${w.path}>: ${w.message}`)
        const z = compiled.zoom
        if (z !== undefined) {
          if (z.inside) set('dataZoom', lit(true))
          if (z.slider) set('navigator', lit(true))
          const win = (a: number, b: number): ExprIR => ({ kind: 'object', fields: [{ name: 'start', value: optionDoubleLiteral(a) }, { name: 'end', value: optionDoubleLiteral(b) }] })
          if (z.window.start > 0 || z.window.end < 1) set('initialZoom', win(z.window.start, z.window.end))
          if (z.lock || z.minSpan > 0 || z.maxSpan < 1) {
            set('zoomLimits', { kind: 'object', fields: [{ name: 'lock', value: lit(z.lock) }, { name: 'minSpan', value: optionDoubleLiteral(z.minSpan) }, { name: 'maxSpan', value: optionDoubleLiteral(z.maxSpan) }] })
          }
          if (z.keepY && attrOf({ kind: 'jsx-element', tag: 'PlotChart', attrs, children: [] }, 'yDomain') === undefined) {
            const d = resolveYDomain(compiled.spec)
            set('yDomain', { kind: 'object', fields: [{ name: 'min', value: optionDoubleLiteral(d.min) }, { name: 'max', value: optionDoubleLiteral(d.max) }] })
          }
        }
      }
    }
    return { kind: 'jsx-element', tag: 'PlotChart', attrs, children: [] }
  }

  warn(`<OptionChart option.series[0].type>: native option adapter does not lower \`${kind}\` yet; emitting nothing.`)
  return undefined
}

/**
 * Apply an accessor to an argument. An arrow is INLINED (its parameter
 * substituted) rather than called, so the emitted native code reads
 * `d.age` instead of `((d) => d.age)(d)` — the emitters lower a member
 * expression cleanly and an immediately-applied lambda far less so.
 */
function callArrow(fn: ExprIR, arg: ExprIR): ExprIR {
  if (fn.kind === 'arrow' && fn.params.length === 1) return substituteIdent(fn.body, fn.params[0]!, arg)
  return { kind: 'call', callee: fn, args: [arg] }
}

/** Replace every free `name` in `e` with `to` — enough for the accessor shapes the grammar produces. */
function substituteIdent(e: ExprIR, name: string, to: ExprIR): ExprIR {
  if (e.kind === 'identifier') return e.name === name ? to : e
  if (e.kind === 'member') return { ...e, object: substituteIdent(e.object, name, to) }
  if (e.kind === 'call') return { ...e, callee: substituteIdent(e.callee, name, to), args: e.args.map((a) => substituteIdent(a, name, to)) }
  return e
}

const lit = (value: string | number | boolean): ExprIR => ({ kind: 'literal', value })
const ident = (name: string): ExprIR => ({ kind: 'identifier', name })
/** `"field"` → `(d) => d.field`; an accessor passes through. */
function channelArrow(v: ExprIR): ExprIR {
  if (v.kind === 'literal' && typeof v.value === 'string') return { kind: 'arrow', params: ['d'], body: { kind: 'member', object: ident('d'), property: v.value } }
  return v
}
const attrOf = (e: Extract<ExprIR, { kind: 'jsx-element' }>, name: string): ExprIR | undefined => {
  const a = e.attrs.find((x) => x.kind === 'attr' && x.name === name)
  return a?.kind === 'attr' ? a.value : undefined
}
const flagOn = (e: Extract<ExprIR, { kind: 'jsx-element' }>, name: string): boolean => {
  const v = attrOf(e, name)
  return v !== undefined && !(v.kind === 'literal' && v.value === false)
}

/**
 * `<Plot data x>` with mark children → the `<PlotChart data x marks={[…]}>`
 * element the plot emit already lowers, so the grammar is the SAME spec on
 * native as on the web. Field-name channels become accessors; mark children
 * become mark calls with their options; Rule/Axis/Tip/Legend/Zoom become the
 * plot props they set on the web. A long-format `color` channel (a pivot the
 * web resolves at runtime) is not lowered — it warns by name and the chart
 * renders as wide-format.
 */
export function desugarChartGrammar(e: Extract<ExprIR, { kind: 'jsx-element' }>, warn: (m: string) => void): Extract<ExprIR, { kind: 'jsx-element' }> {
  // A family mark names the host: the same grammar, the row-array host's props.
  const children = e.children.flatMap((c) => (c.kind === 'expr' && c.expr.kind === 'jsx-element' ? [c.expr] : []))
  const familyMark = children.find((c) => Object.hasOwn(GRAMMAR_FAMILY_TAGS, c.tag))
  if (familyMark !== undefined) return desugarFamilyGrammar(e, familyMark, children, warn)
  const attrs: AttrIR[] = []
  let histogram: { x: ExprIR; bins: ExprIR } | undefined
  const marks: ExprIR[] = []
  const annotations: ExprIR[] = []
  const markers: ExprIR[] = []
  for (const a of e.attrs) {
    if (a.kind === 'attr' && (a.name === 'x' || a.name === 'xValue')) attrs.push({ kind: 'attr', name: a.name, value: channelArrow(a.value) })
    else if (a.kind === 'attr' && a.name === 'color') warn('<Plot color>: the long-format pivot is resolved on the web at runtime and is not lowered on native; the chart renders wide-format (one mark, one series).')
    else attrs.push(a)
  }
  for (const c of e.children) {
    if (c.kind !== 'expr' || c.expr.kind !== 'jsx-element') continue
    const child = c.expr
    const tag = child.tag
    const markKind = GRAMMAR_MARK_TAGS[tag]
    if (markKind !== undefined) {
      // `<Band>` is the one mark with no `y`: a region has two bounds and no
      // single value, so it takes `low`/`high` and lowers to `band(low, high)`
      // — whose SERIES value is the upper bound, hence the argument order.
      if (tag === 'Band') {
        const lo = attrOf(child, 'low')
        const hi = attrOf(child, 'high')
        if (lo === undefined || hi === undefined) {
          warn('<Band>: needs both a `low` and a `high` channel; the mark is skipped on native.')
          continue
        }
        const bandFields: { name: string; value: ExprIR }[] = []
        for (const a of child.attrs) {
          if (a.kind !== 'attr' || a.name === 'low' || a.name === 'high') continue
          bandFields.push({ name: a.name, value: a.value })
        }
        const bandArgs: ExprIR[] = [channelArrow(lo), channelArrow(hi)]
        if (bandFields.length > 0) bandArgs.push({ kind: 'object', fields: bandFields })
        marks.push({ kind: 'call', callee: ident('band'), args: bandArgs })
        continue
      }
      const y = attrOf(child, 'y')
      if (y === undefined) {
        warn(`<${tag}>: needs a \`y\` channel; the mark is skipped on native.`)
        continue
      }
      const stack = flagOn(child, 'stack')
      const group = flagOn(child, 'group')
      const isWaterfall = flagOn(child, 'waterfall')
      const r = attrOf(child, 'r')
      const callee = tag === 'Bar' ? (isWaterfall ? 'waterfall' : stack ? 'stackedBars' : group ? 'groupedBars' : 'bars') : tag === 'Dot' && r !== undefined ? 'bubble' : markKind
      const fields: { name: string; value: ExprIR }[] = []
      for (const a of child.attrs) {
        if (a.kind !== 'attr' || ['y', 'r', 'stack', 'group', 'waterfall'].includes(a.name)) continue
        fields.push({ name: a.name, value: a.value })
      }
      const args: ExprIR[] = [channelArrow(y)]
      if (callee === 'bubble' && r !== undefined) args.push(channelArrow(r))
      if (fields.length > 0) args.push({ kind: 'object', fields })
      marks.push({ kind: 'call', callee: ident(callee), args })
      continue
    }
    switch (tag) {
      case 'Rule': {
        const y = attrOf(child, 'y')
        const from = attrOf(child, 'from')
        const to = attrOf(child, 'to')
        const x = attrOf(child, 'x')
        const fields: { name: string; value: ExprIR }[] = []
        if (from !== undefined && to !== undefined) fields.push({ name: 'yFrom', value: from }, { name: 'yTo', value: to })
        else if (y !== undefined) fields.push({ name: 'y', value: y })
        else if (x !== undefined) fields.push({ name: 'x', value: x })
        else continue
        for (const n of ['label', 'color']) {
          const v = attrOf(child, n)
          if (v !== undefined) fields.push({ name: n, value: v })
        }
        annotations.push({ kind: 'object', fields })
        break
      }
      case 'Axis': {
        const format = attrOf(child, 'format')
        const domain = attrOf(child, 'domain')
        const title = attrOf(child, 'title')
        if (flagOn(child, 'x')) {
          if (format !== undefined) attrs.push({ kind: 'attr', name: 'xFormat', value: format })
          if (flagOn(child, 'time')) attrs.push({ kind: 'attr', name: 'xTime', value: lit(true) })
          if (flagOn(child, 'hidden')) attrs.push({ kind: 'attr', name: 'showXAxis', value: lit(false) })
          if (title !== undefined) attrs.push({ kind: 'attr', name: 'xTitle', value: title })
          const labels = attrOf(child, 'labels')
          if (labels !== undefined) attrs.push({ kind: 'attr', name: 'xLabels', value: labels })
        } else if (flagOn(child, 'y2')) {
          if (format !== undefined) attrs.push({ kind: 'attr', name: 'y2Format', value: format })
          if (domain !== undefined) attrs.push({ kind: 'attr', name: 'y2Domain', value: domain })
          if (title !== undefined) attrs.push({ kind: 'attr', name: 'y2Title', value: title })
        } else {
          if (format !== undefined) attrs.push({ kind: 'attr', name: 'format', value: format })
          if (flagOn(child, 'hidden')) attrs.push({ kind: 'attr', name: 'showYAxis', value: lit(false) })
          if (title !== undefined) attrs.push({ kind: 'attr', name: 'yTitle', value: title })
          if (flagOn(child, 'time')) attrs.push({ kind: 'attr', name: 'yTime', value: lit(true) })
          const scale = attrOf(child, 'scale')
          if (scale !== undefined) attrs.push({ kind: 'attr', name: 'yScale', value: scale })
        }
        break
      }
      case 'Scale': {
        // `<Scale y="log" | "time" x="time" normalize>` — the same switches `<Axis>` carries, stated together.
        const y = attrOf(child, 'y')
        if (y !== undefined && y.kind === 'literal' && y.value === 'time') attrs.push({ kind: 'attr', name: 'yTime', value: lit(true) })
        else if (y !== undefined) attrs.push({ kind: 'attr', name: 'yScale', value: y })
        const x = attrOf(child, 'x')
        if (x !== undefined && x.kind === 'literal' && x.value === 'time') attrs.push({ kind: 'attr', name: 'xTime', value: lit(true) })
        if (flagOn(child, 'normalize')) attrs.push({ kind: 'attr', name: 'stackNormalize', value: lit(true) })
        break
      }
      case 'Histogram': {
        // `histogram()` on the web is not a mark — it REPLACES the plot's rows
        // with bins and draws one bar per bin. So the native form is the same
        // substitution, expressed in the IR: the row basis becomes
        // `binValues(rows.map(x), bins)`, the category is the engine's own
        // `binLabel` (shared with the web helper, so the two cannot label a
        // bin differently), and the mark is an ordinary bar over `count` —
        // which means the tooltip, the accessible table and selection all
        // come from the paths that already work.
        const hx = attrOf(child, 'x')
        if (hx === undefined) {
          warn('<Histogram>: needs an `x` channel; the plot renders without it on native.')
          break
        }
        histogram = { x: channelArrow(hx), bins: attrOf(child, 'bins') ?? lit(10) }
        break
      }
      case 'Tip':
        attrs.push({ kind: 'attr', name: 'tooltip', value: lit(true) })
        if (flagOn(child, 'crosshair')) attrs.push({ kind: 'attr', name: 'crosshair', value: lit(true) })
        break
      case 'Label': {
        // The engine's point marker: `series` → seriesIndex, a numeric `at` → atIndex, a named one → at.
        const text = attrOf(child, 'text')
        if (text === undefined) {
          warn('<Label>: needs a `text`; the marker is skipped on native.')
          break
        }
        const fields: { name: string; value: ExprIR }[] = [{ name: 'label', value: text }]
        const series = attrOf(child, 'series')
        if (series !== undefined) fields.push({ name: 'seriesIndex', value: series })
        const at = attrOf(child, 'at')
        if (at !== undefined) fields.push({ name: at.kind === 'literal' && typeof at.value === 'number' ? 'atIndex' : 'at', value: at })
        for (const n of ['color', 'radius']) {
          const v = attrOf(child, n)
          if (v !== undefined) fields.push({ name: n, value: v })
        }
        markers.push({ kind: 'object', fields })
        break
      }
      case 'Legend': {
        attrs.push({ kind: 'attr', name: 'showLegend', value: lit(true) })
        const toggle = attrOf(child, 'toggle')
        if (toggle !== undefined) attrs.push({ kind: 'attr', name: 'legendToggle', value: toggle })
        const maxRows = attrOf(child, 'maxRows')
        if (maxRows !== undefined) attrs.push({ kind: 'attr', name: 'legendMaxRows', value: maxRows })
        break
      }
      case 'Zoom': {
        const inside = attrOf(child, 'inside')
        if (inside === undefined || !(inside.kind === 'literal' && inside.value === false)) attrs.push({ kind: 'attr', name: 'dataZoom', value: lit(true) })
        if (flagOn(child, 'navigator')) attrs.push({ kind: 'attr', name: 'navigator', value: lit(true) })
        const presets = attrOf(child, 'presets')
        if (presets !== undefined) attrs.push({ kind: 'attr', name: 'zoomPresets', value: presets })
        const link = attrOf(child, 'link')
        if (link !== undefined) attrs.push({ kind: 'attr', name: 'link', value: link })
        const brush = attrOf(child, 'brush')
        if (brush !== undefined) {
          attrs.push({ kind: 'attr', name: 'brush', value: lit(true) })
          attrs.push({ kind: 'event', name: 'brush', handler: brush })
        }
        break
      }
      default:
        warn(`<Plot>: child <${tag}> is not a mark or a chart setting; it is ignored on native.`)
    }
  }
  if (histogram !== undefined) {
    // The substitution, in one place: rows → bins, x → the bin's label, marks
    // → one bar over the count. Any mark the author also wrote is dropped
    // WITH A WARNING rather than silently, because those marks read the
    // ORIGINAL rows and there are none left to read.
    const dataAttr = attrs.find((a) => a.kind === 'attr' && a.name === 'data')
    const rows = dataAttr?.kind === 'attr' ? dataAttr.value : undefined
    if (rows === undefined) {
      warn('<Histogram>: <Plot> needs a `data` attribute to bin; the plot renders without it on native.')
    } else {
      if (marks.length > 0) warn('<Histogram>: a mark beside it reads the ORIGINAL rows, which the histogram replaces with bins; it is dropped on native.')
      const binned: ExprIR = {
        kind: 'call',
        callee: ident('binValues'),
        args: [
          // The channel is coerced through the runtime's `pyreonChartDouble`:
          // PMTC types a bare `number` as Int, and `binValues` takes Doubles,
          // so an un-coerced map is a `List<Int>` that Kotlin refuses.
          { kind: 'call', callee: { kind: 'member', object: rows, property: 'map' }, args: [{ kind: 'arrow', params: ['d'], body: { kind: 'call', callee: ident('pyreonChartDouble'), args: [callArrow(histogram.x, ident('d'))] } }] },
          { kind: 'call', callee: ident('pyreonChartDouble'), args: [histogram.bins] },
        ],
      }
      const keep = attrs.filter((a) => !(a.kind === 'attr' && (a.name === 'data' || a.name === 'x' || a.name === 'xValue')))
      attrs.length = 0
      attrs.push(...keep)
      attrs.push({ kind: 'attr', name: 'data', value: binned })
      attrs.push({ kind: 'attr', name: 'x', value: { kind: 'arrow', params: ['b'], body: { kind: 'call', callee: ident('binLabel'), args: [ident('b')] } } })
      marks.length = 0
      marks.push({ kind: 'call', callee: ident('bars'), args: [{ kind: 'arrow', params: ['b'], body: { kind: 'member', object: ident('b'), property: 'count' } }, { kind: 'object', fields: [{ name: 'label', value: lit('Count') }] }] })
    }
  }
  attrs.push({ kind: 'attr', name: 'marks', value: { kind: 'array', elements: marks } })
  if (annotations.length > 0) attrs.push({ kind: 'attr', name: 'annotations', value: { kind: 'array', elements: annotations } })
  if (markers.length > 0) attrs.push({ kind: 'attr', name: 'markers', value: { kind: 'array', elements: markers } })
  return { kind: 'jsx-element', tag: 'PlotChart', attrs, children: [] }
}

/**
 * `<Plot data><Arc value label /></Plot>` → `<PieChart data value={(d) => d.value} label={…}>`
 * (and Stage → Funnel, Cell → Heatmap, Candle → Candlestick): the plot's shared
 * props carry over, the mark's channels become the host's accessors, its
 * option attrs go where the host keeps them (`funnel={{…}}` / `candle={{…}}`
 * or straight on), `<Tip>` / `<Legend>` / `<Axis y format>` set the host's
 * switches. Everything cartesian — the other marks, `<Zoom>`, `<Rule>`,
 * `<Label>`, the `x` channel except on a candlestick — is reported and ignored,
 * exactly as the web host does.
 */
function desugarFamilyGrammar(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  mark: Extract<ExprIR, { kind: 'jsx-element' }>,
  children: readonly Extract<ExprIR, { kind: 'jsx-element' }>[],
  warn: (m: string) => void,
): Extract<ExprIR, { kind: 'jsx-element' }> {
  const host = GRAMMAR_FAMILY_TAGS[mark.tag]!
  const attrs: AttrIR[] = []
  for (const a of e.attrs) {
    if (a.kind === 'attr' && a.name === 'x') {
      if (host === 'CandlestickChart') attrs.push({ kind: 'attr', name: 'x', value: channelArrow(a.value) })
      else warn(`<Plot x>: a ${host.replace('Chart', '').toLowerCase()} has no x channel; it is ignored.`)
    } else if (a.kind === 'attr' && (a.name === 'xValue' || a.name === 'color' || a.name === 'horizontal' || a.name === 'showGrid')) {
      warn(`<Plot ${a.name}>: not a ${host.replace('Chart', '').toLowerCase()} prop; it is ignored.`)
    } else attrs.push(a)
  }
  const channels = FAMILY_CHANNELS[mark.tag]!
  const optionsProp = FAMILY_OPTIONS_PROP[mark.tag]
  const options: { name: string; value: ExprIR }[] = []
  for (const a of mark.attrs) {
    if (a.kind !== 'attr') continue
    if (channels.includes(a.name)) attrs.push({ kind: 'attr', name: a.name, value: channelArrow(a.value) })
    else if (optionsProp !== undefined) options.push({ name: a.name, value: a.value })
    else attrs.push(a)
  }
  if (optionsProp !== undefined && options.length > 0) attrs.push({ kind: 'attr', name: optionsProp, value: { kind: 'object', fields: options } })
  for (const child of children) {
    if (child === mark) continue
    if (Object.hasOwn(GRAMMAR_FAMILY_TAGS, child.tag)) {
      warn(`<Plot>: one family per plot — <${child.tag}> is ignored beside <${mark.tag}>.`)
      continue
    }
    if (child.tag === 'Tip') attrs.push({ kind: 'attr', name: 'tooltip', value: lit(true) })
    else if (child.tag === 'Legend') attrs.push({ kind: 'attr', name: 'showLegend', value: lit(true) })
    else if (child.tag === 'Axis' && !flagOn(child, 'x') && !flagOn(child, 'y2') && attrOf(child, 'format') !== undefined) attrs.push({ kind: 'attr', name: 'format', value: attrOf(child, 'format')! })
    else warn(`<Plot>: <${child.tag}> does not apply to a ${host.replace('Chart', '').toLowerCase()}; it is ignored.`)
  }
  return { kind: 'jsx-element', tag: host, attrs, children: [] }
}

/**
 * The accessible name a chart canvas gets when the author gave it neither an
 * `accessibilityLabel` nor a `title` — the family word: `PieChart` → "Pie
 * chart", `PlotChart` → "Chart". A canvas is one opaque node to a screen
 * reader; unnamed it is a blank rectangle, which is what every native chart
 * host was before this default (the web host's caption is the same idea).
 */
export function chartDefaultLabel(tag: string): string {
  const family = tag.replace(/Chart$/, '')
  if (family === '' || family === 'Plot' || family === 'Option') return 'Chart'
  return `${family} chart`
}

/** A Double literal the way both targets accept it (`240` → `240.0`). */
export function chartDouble(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : `${n}`
}


// ---------------------------------------------------------------------------
// Accessor-prop hosts. `<FunnelChart data={rows} value={(d) => d.total}
// label={(d) => d.name}>` builds its engine input by MAPPING the rows through
// accessor closures; natively that is `rows.enumerated().map { (i, d) in
// FunnelStage(value: Double(d.total), label: d.name, color: …) }` — the
// accessor bodies inlined with their parameters substituted, so the closure
// is one expression the target can type from the array's element. A block-
// bodied accessor has no such form and warns by name.
// ---------------------------------------------------------------------------

/** One field of the engine's input struct, fed by an accessor prop. */
export interface AccessorField {
  /** The struct field. */
  readonly name: string
  /** The accessor prop on the host (`value`, `label`, `color`). */
  readonly prop: string
  /** Coerce the accessor's result to a Double (the field is a Double). */
  readonly double?: boolean
  /** When the accessor is absent: the shared palette by index. */
  readonly fallback?: 'palette'
}

export interface AccessorHostSpec {
  /** The rows prop. */
  readonly data: string
  /** The engine's input struct the rows map to. */
  readonly struct: string
  readonly fields: readonly AccessorField[]
  /** The options prop (`funnel`), or none. */
  readonly options?: string
  /** The engine struct `options` holds; a host without one (Pie) neither steers nor animates. */
  readonly optionsStruct?: string
  readonly defaultHeight: number
  /** Builds the draw-list expression from the mapped items. */
  readonly render: (items: string, a: ChartHostArgs, t: ChartHostTarget) => string
  /** Builds the index-hit expression for a tap at (x, y). */
  readonly hit: (items: string, x: string, y: string, a: ChartHostArgs, t: ChartHostTarget) => string
  /** The crossing `xLegend(items)`. */
  readonly legend: (items: string) => string
  /** The crossing `xTip(items, …, x, y)` — empty = miss. */
  readonly tooltip: (items: string, x: string, y: string, a: ChartHostArgs, t: ChartHostTarget) => string
}


export const ACCESSOR_CHART_HOSTS: Readonly<Record<string, AccessorHostSpec>> = {
  FunnelChart: {
    data: 'data',
    struct: 'FunnelStage',
    fields: [
      { name: 'value', prop: 'value', double: true },
      { name: 'label', prop: 'label' },
      { name: 'color', prop: 'color', fallback: 'palette' },
    ],
    options: 'funnel',
    optionsStruct: 'FunnelOptions',
    defaultHeight: 240,
    render: (items, a, t) => `renderFunnel(${items}, ${t.rect('8.0', '8.0', `${a.W} - 16.0`, `${a.H} - 16.0`)}, ${a.options})`,
    hit: (items, x, y, a, t) => `hitFunnel(${items}, ${t.rect('8.0', '8.0', `${a.W} - 16.0`, `${a.H} - 16.0`)}, ${x}, ${y}, ${a.options})`,
    legend: (items) => `funnelLegend(${items})`,
    tooltip: (items, x, y, a, t) => (a.tipHeader !== undefined ? `funnelTipRowsWith(${items}, ${t.rect('8.0', '8.0', `${a.W} - 16.0`, `${a.H} - 16.0`)}, ${x}, ${y}, ${a.tipHeader}, ${a.options})` : `funnelTip(${items}, ${t.rect('8.0', '8.0', `${a.W} - 16.0`, `${a.H} - 16.0`)}, ${x}, ${y}, ${a.options})`),
  },
  PieChart: {
    data: 'data',
    struct: 'Slice',
    fields: [
      { name: 'value', prop: 'value', double: true },
      { name: 'label', prop: 'label' },
      { name: 'color', prop: 'color', fallback: 'palette' },
    ],
    defaultHeight: 240,
    // `innerRatio` carries the host's `innerRadius` (a 0..1 fraction of the fitted radius).
    // An OptionChart-placed pie draws into its frame, laid round by ECharts' arcs (the web host's `frame` / `pie`).
    render: (items, a, t) => `renderPie(${items}, ${a.frame ?? box00(a, t)}, ${t.pieOptions(a)})`,
    hit: (items, x, y, a, t) => {
      if (a.pieArcs !== undefined) return `pieHitWith(${items}, ${a.frame ?? box00(a, t)}, ${a.innerRatio}, ${a.pieArcs}, ${x}, ${y})`
      const fit = `fitCircle(${box00(a, t)})`
      return `hitArc(layoutArcs(${items}), ${fit}.center, ${fit}.radius, ${fit}.radius * ${a.innerRatio}, ${t.pt(x, y)})`
    },
    legend: (items) => `pieLegend(${items})`,
    tooltip: (items, x, y, a, t) => (a.pieArcs !== undefined && a.tipHeader !== undefined ? `pieTipRowsWith(${items}, ${a.frame ?? box00(a, t)}, ${a.innerRatio}, ${a.pieArcs}, ${x}, ${y}, ${a.tipHeader})` : a.pieArcs !== undefined ? `pieTipWith(${items}, ${a.frame ?? box00(a, t)}, ${a.innerRatio}, ${a.pieArcs}, ${x}, ${y})` : `pieTip(${items}, ${box00(a, t)}, ${a.innerRatio}, ${x}, ${y})`),
  },
}

/**
 * The web hosts' default `ChartTheme` — inlined because the engine's own
 * `defaultTheme` is module-private in both targets. Field ORDER is the struct's
 * declaration order (Swift's memberwise init rejects reordered arguments), and
 * every value is the emitted TEXT of that field. Drift against
 * `@pyreon/charts/plot`'s `defaultTheme` is locked by `chart-theme-default.test.ts`.
 */
export const CHART_THEME_DEFAULT = {
  palette: ['#4f7df3', '#f97362', '#22c3a6', '#a66cff', '#ffb020', '#2fb7e8', '#f45fa3', '#7bc950', '#8892a6', '#c47a3d'],
  background: '',
  surface: '#ffffff',
  text: '#1f2937',
  label: '#5a6b7a',
  axis: '#8496a5',
  grid: 'rgba(132,150,165,0.18)',
  positive: '#15803d',
  negative: '#b42318',
  muted: '#e2e8f0',
  ramp: ['#eff6ff', '#93c5fd', '#3b82f6', '#1e40af'],
  fontFamily: '',
  fontSize: '11.0',
  titleSize: '15.0',
  radius: '3.0',
  enterMs: '700.0',
  updateMs: '350.0',
} as const

/**
 * The named palettes `@pyreon/charts/plot` exports as `palettes.*`, so a theme
 * literal may say `palette: palettes.okabeIto` and lower to the resolved list.
 * Drift-locked against theme.ts by `chart-theme-default.test.ts`.
 */
export const NAMED_PALETTES: Readonly<Record<string, readonly string[]>> = {
  pyreon: CHART_THEME_DEFAULT.palette,
  pyreonDark: ['#7b9bff', '#ff8f7e', '#4adbc0', '#bd93ff', '#ffc44d', '#5dcbf2', '#ff80be', '#9ad870', '#a3acbd', '#d8955e'],
  echarts6: ['#5070dd', '#b6d634', '#505372', '#ff994d', '#0ca8df', '#ffd10a', '#fb628b', '#785db0', '#3fbe95'],
  echarts5: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'],
  echartsDark: ['#4992ff', '#7cffb2', '#fddd60', '#ff6e76', '#58d9f9', '#05c091', '#ff8a45', '#8d48e3', '#dd79ff'],
  observable10: ['#4269d0', '#efb118', '#ff725c', '#6cc5b0', '#3ca951', '#ff8ab7', '#a463f2', '#97bbf5', '#9c6b4e', '#9498a0'],
  tableau10: ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'],
  okabeIto: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#000000'],
  tailwind: ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'],
}

/** `chartThemes.light` / `chartThemes.dark` as emitted field text — `theme={chartThemes.dark}` lowers to the whole map. */
export const CHART_THEMES: Readonly<Record<'light' | 'dark', Readonly<Record<keyof typeof CHART_THEME_DEFAULT, string | readonly string[]>>>> = {
  light: CHART_THEME_DEFAULT,
  dark: {
    palette: NAMED_PALETTES.pyreonDark!,
    background: '#141821',
    surface: '#1c2230',
    text: '#e6eaf2',
    label: '#9aa5b5',
    axis: '#5d6878',
    grid: 'rgba(154,165,181,0.16)',
    positive: '#22c55e',
    negative: '#f87171',
    muted: '#2a3140',
    ramp: ['#172033', '#1d4ed8', '#3b82f6', '#93c5fd'],
    fontFamily: '',
    fontSize: '11.0',
    titleSize: '15.0',
    radius: '3.0',
    enterMs: '700.0',
    updateMs: '350.0',
  },
}

/** The kind each theme field must be as a literal on native. */
export const CHART_THEME_FIELDS: readonly { name: keyof typeof CHART_THEME_DEFAULT; kind: 'string' | 'number' | 'strings' }[] = [
  { name: 'palette', kind: 'strings' },
  { name: 'background', kind: 'string' },
  { name: 'surface', kind: 'string' },
  { name: 'text', kind: 'string' },
  { name: 'label', kind: 'string' },
  { name: 'axis', kind: 'string' },
  { name: 'grid', kind: 'string' },
  { name: 'positive', kind: 'string' },
  { name: 'negative', kind: 'string' },
  { name: 'muted', kind: 'string' },
  { name: 'ramp', kind: 'strings' },
  { name: 'fontFamily', kind: 'string' },
  { name: 'fontSize', kind: 'number' },
  { name: 'titleSize', kind: 'number' },
  { name: 'radius', kind: 'number' },
  { name: 'enterMs', kind: 'number' },
  { name: 'updateMs', kind: 'number' },
]

/**
 * The `theme` prop's literal fields, resolved over the defaults — as EMITTED
 * text per field (`list` formats the palette for the target). A non-literal
 * theme, or a field of the wrong shape, warns BY NAME and keeps its default;
 * both emitters share this so their warnings and fallbacks cannot drift.
 */
export function chartThemeFields(
  v: ExprIR | undefined,
  tag: string,
  warn: (m: string) => void,
  list: (items: readonly string[]) => string,
  scope?: RawChartTheme,
  scheme?: (light: string, dark: string) => string,
): ChartThemeText {
  const out = {} as ChartThemeText
  const named = namedChartTheme(v)
  // A named theme replaces the scope wholesale (as on the web, where a `theme`
  // prop is merged OVER the provider's — and a whole theme has every field).
  const base = named ?? scope ?? CHART_THEME_DEFAULT
  // No theme, no provider: the web host follows the SYSTEM colour scheme
  // (`prefers-color-scheme`, live). A bare chart on a phone used to be
  // hard-wired to the light theme — with no warning — while the same source
  // followed dark mode in a browser. With a `scheme` switch from the emitter,
  // every field the two built-in themes disagree on becomes a runtime
  // conditional over the platform's own scheme read (SwiftUI's `colorScheme`
  // environment, Compose's `isSystemInDarkTheme()`); the fields they agree on
  // (sizes, timings) stay literals. A literal `theme` override still lays over
  // the LIGHT base — a partial theme on the web merges over the mode's theme,
  // which is what the fields below then do per field.
  const runtime = scheme !== undefined && named === undefined && scope === undefined
  const dark = CHART_THEMES.dark
  // `background: ''` means "inherit the page" — no colour to paint with. A
  // mark that reads the GROUND resolves it to white, exactly as the web host
  // does; tracked as raw VALUES so a literal `theme={{ background }}` override
  // below flows into it before the text is built.
  let bgLight = base.background as string
  const setGround = (): void => {
    const ground = (c: string): string => (c === '' ? '#ffffff' : c)
    const gl = ground(bgLight)
    const gd = ground(dark.background as string)
    out.pageGround = runtime && gd !== gl && scheme !== undefined ? scheme(JSON.stringify(gl), JSON.stringify(gd)) : JSON.stringify(gl)
  }
  const palette = named === undefined ? chartThemePalette(v, tag, warn, base.palette as readonly string[]) : (named.palette as readonly string[])
  const paletteExplicit = named !== undefined || chartThemePaletteGiven(v)
  for (const f of CHART_THEME_FIELDS) {
    const d = base[f.name]
    if (f.kind === 'strings') {
      // `palette` has its own resolution (a named `palettes.x`, an explicit
      // `palette` prop), so it keeps that path; every OTHER list field reads
      // its own value. Reading `palette` for all of them was correct only
      // while it was the sole list field — the moment `ramp` joined, a
      // calendar's value ramp emitted the CATEGORICAL palette.
      const isPalette = f.name === 'palette'
      const lightList = isPalette ? palette : (d as readonly string[])
      const darkList = (isPalette ? dark.palette : dark[f.name]) as readonly string[]
      const light = list(lightList.map((c) => JSON.stringify(c)))
      const pinned = isPalette && paletteExplicit
      out[f.name] =
        runtime && !pinned && darkList.join('\u0000') !== lightList.join('\u0000')
          ? scheme(light, list(darkList.map((c) => JSON.stringify(c))))
          : light
    } else if (f.kind === 'number') out[f.name] = d as string
    else {
      const dv = dark[f.name] as string
      out[f.name] = runtime && dv !== d ? scheme(JSON.stringify(d), JSON.stringify(dv)) : JSON.stringify(d)
    }
  }
  setGround()
  if (v === undefined || named !== undefined) return out
  if (v.kind !== 'object' || (v.spreads !== undefined && v.spreads.length > 0)) {
    warn(`<${tag} theme>: only an object literal with literal fields lowers on native; the default theme applies.`)
    return out
  }
  for (const f of v.fields) {
    const spec = CHART_THEME_FIELDS.find((x) => x.name === f.name)
    if (spec === undefined) continue
    if (spec.kind === 'strings') {
      // `palette` is resolved above (it also accepts a `palettes.<name>`
      // reference). Any other list field takes a literal array of string
      // literals here — silently dropping it would be the documented
      // silent-lowering-gap class.
      if (spec.name === 'palette') continue
      const items = chartStringListLiteral(f.value)
      if (items === undefined) {
        warn(`<${tag} theme>: \`${f.name}\` must be an array of string literals on native; its default applies.`)
        continue
      }
      out[spec.name] = list(items.map((c) => JSON.stringify(c)))
      continue
    }
    if (f.value.kind !== 'literal' || typeof f.value.value !== spec.kind) {
      warn(`<${tag} theme>: \`${f.name}\` must be a ${spec.kind} literal on native; its default applies.`)
      continue
    }
    out[spec.name] = spec.kind === 'number' ? chartDouble(f.value.value as number) : JSON.stringify(f.value.value)
    if (spec.name === 'background') bgLight = f.value.value as string
  }
  setGround()
  return out
}

/** An array of string literals, or `undefined` for anything else. */
function chartStringListLiteral(v: ExprIR): readonly string[] | undefined {
  if (v.kind !== 'array') return undefined
  const out: string[] = []
  for (const el of v.elements) {
    if (el.kind !== 'literal' || typeof el.value !== 'string') return undefined
    out.push(el.value)
  }
  return out
}

/** Whether a `theme` literal names its own `palette` (a literal list or a `palettes.<name>` reference). */
function chartThemePaletteGiven(v: ExprIR | undefined): boolean {
  return v !== undefined && v.kind === 'object' && v.fields.some((f) => f.name === 'palette')
}

/** `theme={chartThemes.dark}` — a whole built-in theme by reference. */
function namedChartTheme(v: ExprIR | undefined): (typeof CHART_THEMES)['light'] | undefined {
  if (v === undefined || v.kind !== 'member' || v.object.kind !== 'identifier' || v.object.name !== 'chartThemes') return undefined
  return v.property === 'light' || v.property === 'dark' ? CHART_THEMES[v.property] : undefined
}

/**
 * The theme's palette on native: a `palette` literal (an array of string
 * literals), a named `palettes.<name>` reference, or the default. Marks without
 * a `color` cycle through it.
 */
export function chartThemePalette(v: ExprIR | undefined, tag: string, warn: (m: string) => void, fallback: readonly string[] = CHART_THEME_DEFAULT.palette): readonly string[] {
  const named = namedChartTheme(v)
  if (named !== undefined) return named.palette as readonly string[]
  if (v === undefined || v.kind !== 'object') return fallback
  const f = v.fields.find((x) => x.name === 'palette')
  if (f === undefined) return fallback
  const pv = f.value
  if (pv.kind === 'member' && pv.object.kind === 'identifier' && pv.object.name === 'palettes') {
    const found = NAMED_PALETTES[pv.property]
    if (found !== undefined) return found
    warn(`<${tag} theme>: \`palettes.${pv.property}\` is not a named palette (${Object.keys(NAMED_PALETTES).join(', ')}); the default palette applies.`)
    return fallback
  }
  if (pv.kind !== 'array' || pv.elements.length === 0 || pv.elements.some((it) => it.kind !== 'literal' || typeof it.value !== 'string')) {
    warn(`<${tag} theme>: \`palette\` must be a non-empty array of string literals or a \`palettes.<name>\` reference on native; the default palette applies.`)
    return fallback
  }
  return pv.elements.map((it) => (it as { value: string }).value)
}

/** A theme as RAW values (the shape of `CHART_THEME_DEFAULT` / a `CHART_THEMES` entry): what a provider scope carries. */
export type RawChartTheme = Readonly<Record<keyof typeof CHART_THEME_DEFAULT, string | readonly string[]>>

/**
 * `<ChartThemeProvider mode theme>` as a compile-time scope: the mode's theme
 * (light / dark) with the provider's literal `theme` fields laid over it, over
 * an outer scope when providers nest. The web resolves the same three layers
 * at runtime (mode → provider overrides → the chart's own `theme`, which
 * `chartThemeFields` lays over this scope). What cannot be read at compile
 * time is named: a mode that is not a string literal (the web tracks the
 * system scheme, or an app's reactive mode — natively the light theme
 * applies), and a non-literal `theme`.
 */
export function chartThemeScope(e: ExprIR & { kind: 'jsx-element' }, warn: (m: string) => void, outer?: RawChartTheme): RawChartTheme {
  const modeAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'mode')
  const modeV = modeAttr?.kind === 'attr' ? modeAttr.value : undefined
  let base: RawChartTheme = outer ?? CHART_THEME_DEFAULT
  if (modeV === undefined) {
    if (outer === undefined) warn('<ChartThemeProvider>: without a literal `mode` the web follows the system scheme; natively the light theme applies — pin `mode="dark"` (or give each chart its own `theme`).')
  } else if (modeV.kind === 'literal' && (modeV.value === 'light' || modeV.value === 'dark')) {
    base = CHART_THEMES[modeV.value]
  } else {
    warn('<ChartThemeProvider mode>: only the literal "light" / "dark" lowers on native (a reactive mode cannot be read at compile time); the light theme applies.')
  }
  const themeAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'theme')
  const themeV = themeAttr?.kind === 'attr' ? themeAttr.value : undefined
  if (themeV === undefined) return base
  const raw: Record<string, string | readonly string[]> = { ...base }
  const named = namedChartTheme(themeV)
  if (named !== undefined) return named
  if (themeV.kind !== 'object' || (themeV.spreads !== undefined && themeV.spreads.length > 0)) {
    warn('<ChartThemeProvider theme>: only an object literal with literal fields lowers on native; the mode\'s theme applies.')
    return base
  }
  raw.palette = chartThemePalette(themeV, 'ChartThemeProvider', warn, base.palette as readonly string[])
  for (const f of themeV.fields) {
    const spec = CHART_THEME_FIELDS.find((x) => x.name === f.name)
    if (spec === undefined || spec.kind === 'strings') continue
    if (f.value.kind !== 'literal' || typeof f.value.value !== spec.kind) {
      warn(`<ChartThemeProvider theme>: \`${f.name}\` must be a ${spec.kind} literal on native; the mode's value applies.`)
      continue
    }
    raw[spec.name] = spec.kind === 'number' ? chartDouble(f.value.value as number) : (f.value.value as string)
  }
  return raw as RawChartTheme
}

/** The palette the web Funnel / Pie hosts colour unaccessored rows with — the theme's. */
export const CHART_HOST_PALETTE: readonly string[] = CHART_THEME_DEFAULT.palette


/**
 * The shared canvas host's chrome props (canvas-host.tsx). On native, the
 * plot host draws the title and legend (the #3265 chrome emit); the family
 * hosts draw title, legend and a tap tooltip through the crossing `chrome.ts`;
 * and every host whose engine takes an entrance `progress` plays the same
 * cubic ease-out entrance the web host does (`PyreonChartEntrance`). What a
 * target does NOT draw MUST warn by name rather than drop silently.
 */
export const CHART_CHROME_PROPS: readonly string[] = ['showTitle', 'subtitle', 'showLegend', 'tooltip', 'animate', 'legendPosition', 'keyboard', 'updateAnimation', 'updateDuration', 'universalTransition', 'toolbox', 'onSaveImage', 'accessibleTable', 'rtl']
const CHROME_LOWERED: Readonly<Record<string, readonly string[]>> = {
  PlotChart: ['showTitle', 'subtitle', 'showLegend', 'tooltip', 'animate', 'rtl', 'legendPosition', 'toolbox', 'onSaveImage'],
  // Gauge / Candlestick / Heatmap build their canvas without the chrome seam,
  // so they take the RTL pair from `swiftRtl` / `kotlinRtl` directly. Their
  // lists stay spelled out: adding a prop to `FAMILY_CHROME` must never
  // silently claim a host whose emitter does not read it, which is exactly
  // what happened when `rtl` first went in there.
  GaugeChart: ['showTitle', 'subtitle', 'showLegend', 'tooltip', 'rtl', 'toolbox', 'onSaveImage'],
  CandlestickChart: ['showTitle', 'subtitle', 'showLegend', 'tooltip', 'rtl', 'toolbox', 'onSaveImage'],
  HeatmapChart: ['animate', 'rtl', 'toolbox', 'onSaveImage'],
  BoxplotChart: ['showTitle', 'subtitle', 'showLegend', 'tooltip', 'animate', 'rtl', 'toolbox', 'onSaveImage'],
  RadarChart: ['showLegend', 'rtl', 'legendPosition', 'toolbox', 'onSaveImage'],
}
/**
 * Title + legend + tap tooltip — what the generic and accessor hosts draw
 * natively through the crossing chrome.
 *
 * `legendPosition` is here and NOT on Boxplot / Gauge / Candlestick / Heatmap:
 * those four build their canvas without the chrome seam (their engines draw
 * their own frame), so nothing there reads the prop. Claiming it per-CLASS is
 * exactly the mistake the `CHROME_LOWERED` comment above records.
 */
const FAMILY_CHROME: readonly string[] = ['showTitle', 'subtitle', 'showLegend', 'tooltip', 'rtl', 'legendPosition', 'toolbox', 'onSaveImage']
/**
 * Whether `<tag>`'s engine takes an entrance `progress` — the same set the web
 * canvas host tweens (`animates: true`). A host outside it (Pie, Radar,
 * Candlestick, Gauge) draws fully formed on EVERY target, so `animate` there
 * is inert rather than "not lowered yet".
 */
export function chartHostAnimates(tag: string): boolean {
  if (tag === 'PlotChart' || tag === 'HeatmapChart' || tag === 'BoxplotChart') return true
  const host = CHART_HOSTS[tag]
  if (host !== undefined) return host.optionsStruct !== undefined
  return ACCESSOR_CHART_HOSTS[tag]?.optionsStruct !== undefined
}
/** The chrome props `<tag>` does NOT lower — each present one warns. */
export function chartChromeUnlowered(tag: string): readonly string[] {
  const family = Object.hasOwn(CHART_HOSTS, tag) || Object.hasOwn(ACCESSOR_CHART_HOSTS, tag)
  // A table-driven host draws the tap tooltip only through a crossing `xTip`;
  // one without it (Parallel — its lines are built from the raw rows on the
  // web) must REPORT `tooltip` rather than pass the policy's "lowered" verdict.
  const familyChrome = FAMILY_CHROME.filter((p) => p !== 'tooltip' || !Object.hasOwn(CHART_HOSTS, tag) || CHART_HOSTS[tag]!.tooltip !== undefined)
  const lowered = [
    ...(CHROME_LOWERED[tag] ?? (family ? familyChrome : [])),
    ...(family && chartHostAnimates(tag) ? ['animate'] : []),
    ...(family || tag === 'PlotChart' ? ['updateAnimation', 'updateDuration', 'universalTransition'] : []),
  ]
  return CHART_CHROME_PROPS.filter((p) => !lowered.includes(p))
}

/**
 * The area brush a `<PlotChart>` asks for: a literal `brushType` (or a toolbox
 * brush tool to take one up), `brushMode`, `outOfBrushOpacity`. Non-literal
 * values warn and fall back, as every chart flag does.
 */
export function chartAreaBrushConfig(
  read: (name: string) => unknown,
  has: (name: string) => boolean,
  toolboxBrush: readonly string[],
  warn: (m: string) => void,
  tag: string,
  expr: (name: string) => ExprIR | undefined,
  resolve: (name: string) => ExprIR | undefined,
): { on: boolean; initial: string; keep: boolean; opacity: number; only: number[] } {
  let initial = ''
  if (has('brushType')) {
    const t = read('brushType')
    if (t === 'rect' || t === 'polygon' || t === 'lineX' || t === 'lineY') initial = t
    else warn(`<${tag} brushType>: native needs a literal 'rect' | 'polygon' | 'lineX' | 'lineY'; the brush starts off.`)
  }
  let keep = false
  if (has('brushMode')) {
    const m = read('brushMode')
    if (m === 'single' || m === 'multiple') keep = m === 'multiple'
    else warn(`<${tag} brushMode>: native needs a literal 'single' | 'multiple'; single applies.`)
  }
  let opacity = 0.1
  if (has('outOfBrushOpacity')) {
    const o = read('outOfBrushOpacity')
    if (typeof o === 'number') opacity = Math.max(0, Math.min(1, o))
    else warn(`<${tag} outOfBrushOpacity>: native needs a literal number; 0.1 applies.`)
  }
  const only: number[] = []
  const seriesExpr = expr('brushSeriesIndex')
  if (seriesExpr !== undefined) {
    const seriesLit = literalOf(seriesExpr, resolve)
    const v = seriesLit === undefined ? undefined : irToValue(seriesLit, resolve)
    const o = v !== undefined && v.ok ? v.value : undefined
    if (Array.isArray(o) && o.every((x) => typeof x === 'number')) for (const x of o as number[]) only.push(x)
    else warn(`<${tag} brushSeriesIndex>: native needs a literal number array; every series is brushed.`)
  }
  return { on: initial !== '' || toolboxBrush.length > 0, initial, keep, opacity, only }
}

/** The warning for a rich-hit `onSelect` on a host whose native tap can only report the engine's INDEX hit. */
export function chartRichSelectWarning(tag: string): string {
  return `<${tag} onSelect>: the rich-hit callback is not lowered on native — use \`onSelectIndex\` (the engine's index hit, the shape the tap reports on every target).`
}
/** The warning for a chrome prop `<tag>` carries but does not draw — `animate` on an engine with no entrance is inert everywhere, not a native gap. */
/**
 * A chart FLAG the native emit can only honour as a literal (`dataZoom`,
 * `navigator`, `brush`, `horizontal`, `universalTransition`,
 * `updateAnimation`). A flag that is PRESENT but not statically resolvable —
 * a signal read, a prop, a computed — used to lower silently as OFF, which is
 * the one outcome worse than a warning: the web build honours the value and
 * the device build quietly does not. The emitters route every such read
 * through here so the drop is named.
 */
export function chartStaticFlag(
  element: { attrs: readonly ({ kind: 'attr'; name: string } | { kind: string })[] },
  tag: string,
  prop: string,
  read: (name: string) => string | number | boolean | undefined,
  warn: (message: string) => void,
): boolean {
  const value = read(prop)
  if (value === undefined && element.attrs.some((attr) => attr.kind === 'attr' && (attr as { name: string }).name === prop)) {
    warn(`<${tag} ${prop}={…}>: must be a literal on native — a reactive or computed value lowers as \`false\`, so the chart renders without it. Use a literal, or branch with <Web> / <NativeIOS> / <NativeAndroid>.`)
    return false
  }
  return value === true
}

/**
 * `orient="vertical"` on a transposable host: literal `'vertical'` transposes;
 * a present but non-literal value is named (it would lower as horizontal
 * silently, the same class as `chartStaticFlag`); anything else is horizontal.
 */
export function chartOrientVertical(
  element: { attrs: readonly ({ kind: 'attr'; name: string } | { kind: string })[] },
  tag: string,
  read: (name: string) => string | number | boolean | undefined,
  warn: (message: string) => void,
): boolean {
  const value = read('orient')
  if (value === undefined && element.attrs.some((attr) => attr.kind === 'attr' && (attr as { name: string }).name === 'orient')) {
    warn(`<${tag} orient={…}>: must be a literal on native — a reactive or computed value lowers as horizontal. Use a literal, or branch with <Web> / <NativeIOS> / <NativeAndroid>.`)
    return false
  }
  return value === 'vertical'
}

export function chartChromeWarning(tag: string, prop: string): string {
  if (prop === 'animate' && !chartHostAnimates(tag)) return `<${tag}>: \`animate\` has no effect on any target — its engine draws fully formed; the prop is ignored.`
  return `<${tag}>: \`${prop}\` is not lowered on native yet; the chart renders without it.`
}
/** The entrance duration — the theme's `enterMs` (a literal object or a named theme), else the default; the family hosts read nothing else off `theme`, so this never warns. */
export function chartEnterMs(theme: ExprIR | undefined, tag: string, list: (items: readonly string[]) => string, scope?: RawChartTheme): string {
  return chartThemeFields(theme, tag, () => {}, list, scope).enterMs
}
/** The resolved theme as emitted TEXT per field — what `chartThemeFields` returns. */
/**
 * The theme's fields as EMITTED text, plus one DERIVED entry.
 *
 * `pageGround` is `background` with its "inherit the page" empty string
 * resolved to white — the one theme field a chart cannot paint with, and the
 * value a mark that reads the GROUND (a geo border separating two filled
 * regions) has to default from. The web host spells the same rule inline as
 * `theme.background === '' ? '#ffffff' : theme.background`; deriving it here
 * keeps it on the emitted-text side, where the value may be a runtime
 * colour-scheme conditional rather than a literal.
 */
export type ChartThemeText = Record<keyof typeof CHART_THEME_DEFAULT | 'pageGround', string>
/** The tooltip box from the theme — the web host's `tooltipStyle` (surface / grid / text, radius at least 4). */
/**
 * The `[optionField, themeValue]` pairs a host defaults from the theme — the
 * ONE place the web host's `{ palette: theme.palette, labelColor: theme.label,
 * ...props.x }` merge is spelled for both emitters.
 */
export function chartThemeDefaultFields(spec: ChartHostSpec, t: ChartThemeText): ReadonlyArray<readonly [string, string]> {
  const fields = spec.themeDefaults ?? []
  if (fields.length === 0) return []
  // Swift's memberwise init takes its arguments in DECLARATION order, so the
  // pairs are sorted by the field's position in the GENERATED struct rather
  // than by however the spec happens to list them — a restated order is one
  // regeneration away from emitting Swift that will not compile.
  const decl = CHART_ENGINE_STRUCTS.find((st) => st.name === spec.optionsStruct)
  const at = (f: string): number => {
    const i = decl?.fields.findIndex((d) => d.name === f) ?? -1
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...fields].sort((a, b) => at(a) - at(b)).map((f) => [f, t[CHART_THEME_SOURCE[f]]] as const)
}

/**
 * An OptionChart-lowered PlotChart's `tooltipCells` (the desugar sets it when
 * the option's tooltip has no formatter): ECharts' trigger and which series
 * the option named. Undefined otherwise — the host then keeps its own lines.
 */
export function chartTooltipCells(e: Extract<ExprIR, { kind: 'jsx-element' }>): { trigger: 'axis' | 'item'; named: boolean[] } | undefined {
  const a = attrOf(e, 'tooltipCells')
  if (a === undefined || a.kind !== 'object') return undefined
  const trigger = objectField(a, 'trigger')
  const named = objectField(a, 'named')
  return {
    trigger: trigger?.kind === 'literal' && trigger.value === 'axis' ? 'axis' : 'item',
    named: named?.kind === 'array' ? named.elements.map((x) => x.kind === 'literal' && x.value === true) : [],
  }
}

export function chartTooltipFields(t: ChartThemeText): readonly (readonly [string, string])[] {
  return [
    ['fontSize', t.fontSize],
    ['fill', t.surface],
    ['border', t.grid],
    ['text', t.text],
    ['pad', '8.0'],
    ['radius', chartDouble(Math.max(4, Number(t.radius)))],
  ]
}

/** The hosts with a dedicated emitter each (a fixed frame or a second data prop). */
export const FRAME_CHART_HOSTS: Readonly<Record<string, true>> = { GaugeChart: true, CandlestickChart: true, HeatmapChart: true, RadarChart: true, PlotChart: true, BoxplotChart: true }


// ---------------------------------------------------------------------------
// `<PlotChart marks>` — the cartesian family. A mark call (`bars((d) => d.v,
// { label })`) lowers to a `Series` whose values are the accessor inlined
// into a map over the rows; the spec is built inline and `renderChart` /
// `plotHitBars` do the rest. The constants below are the web host's own
// defaults (`resolveMarks`), inlined because the engine's are module-private.
// ---------------------------------------------------------------------------

/**
 * Indicator mark → the engine function that computes its values.
 *
 * These are DERIVED marks: the accessor produces the raw series and the named
 * engine function turns it into the drawn one, so the lowering is the same
 * shape as `bubble` → `bubbleRadii` — map the rows, then call the crossing
 * arithmetic. The functions live in `indicator-values.ts`, which is in
 * `ENGINE_FILES` for exactly this.
 *
 * `bollinger` is absent from this table because it is not a single mark: it
 * returns an ARRAY spread into `marks={[...]}`, so the emitters expand it
 * separately into the two Series it names (a band and its middle line).
 * `PLOT_SPREAD_MARKS` lists it, so the import allowlist's parity spec can see
 * it the same way it sees these.
 */
export const PLOT_SPREAD_MARKS: readonly string[] = ['bollinger']

export const PLOT_INDICATOR_MARKS: Readonly<Record<string, { readonly fn: string; readonly kind: string; readonly takesWindow: boolean }>> = {
  sma: { fn: 'smaValues', kind: 'line', takesWindow: true },
  ema: { fn: 'emaValues', kind: 'line', takesWindow: true },
  trend: { fn: 'trendValues', kind: 'line', takesWindow: false },
}

/**
 * The web facade's compile of an OptionChart's option, when every part of it
 * is literal and it yields exactly the series the native marks are built
 * from. Absent otherwise — the hand lowering then stands alone.
 */
function compileLiteralOption(raw: Extract<ExprIR, { kind: 'object' }>, resolve: (n: string) => ExprIR | undefined, seriesCount: number): ReturnType<typeof compileOption> | undefined {
  const plainOption = irToValue(raw, resolve)
  if (!plainOption.ok || !isPlainRecord(plainOption.value)) return undefined
  const compiled = compileOption(plainOption.value as never)
  return compiled.spec.series.length === seriesCount ? compiled : undefined
}

/**
 * Series fields the facade resolves from ECharts' semantics that the hand
 * lowering does not re-derive: they cross as the facade computed them. Each
 * is a literal Series field in `PLOT_MARK_OPTION_FIELDS`.
 */
const FORWARDED_SERIES_FIELDS: readonly string[] = [
  'radius', 'smoothAmount', 'smoothMonotone', 'connectNulls', 'areaFill', 'areaOpacity', 'areaColor', 'areaOrigin', 'areaOriginAt',
  'symbol', 'symbolHollow', 'symbolShow', 'showValues', 'labelPosition', 'labelDistance', 'labelBorderColor', 'labelBorderWidth',
  'labelRotate', 'labelOffset', 'labelAlign', 'labelVerticalAlign',
]

/** Series option keys that cross through the facade's compile (see FORWARDED_SERIES_FIELDS). */
const FORWARDED_SERIES_KEYS: readonly string[] = ['smooth', 'smoothMonotone', 'connectNulls', 'showAllSymbol']

/** Axis option keys that cross through the facade's compile. */
const FORWARDED_AXIS_KEYS: readonly string[] = ['axisLabel', 'axisTick', 'axisLine', 'splitLine', 'boundaryGap', 'scale', 'splitNumber', 'splitArea', 'minorTick', 'minorSplitLine']

/** The sub-keys of a forwarded axis key that the compile carries; the rest (a label `formatter`, …) are named, not dropped. */
const FORWARDED_AXIS_SUBKEYS: Readonly<Record<string, readonly string[]>> = {
  axisLabel: ['rotate', 'interval', 'margin', 'inside', 'show'],
  axisTick: ['show', 'length', 'inside', 'alignWithLabel', 'lineStyle'],
  axisLine: ['show', 'onZero', 'lineStyle'],
  splitLine: ['show', 'lineStyle'],
  splitArea: ['show', 'areaStyle'],
  minorTick: ['show', 'splitNumber', 'length', 'lineStyle'],
  minorSplitLine: ['show', 'lineStyle'],
}

function forwardedAxisSubfields(axis: ExprIR, path: string, warn: (m: string) => void): void {
  for (const [key, allowed] of Object.entries(FORWARDED_AXIS_SUBKEYS)) {
    const sub = objectField(axis, key)
    if (sub !== undefined) optionFields(sub, allowed, `${path}.${key}`, warn)
  }
}

/** The ChartSpec fields that cross from the facade's compile (the rest the hand lowering sets itself). */
const FORWARDED_SPEC_FIELDS: readonly string[] = [
  'boundaryGap', 'yZero', 'ySplit', 'barLayout', 'barGap', 'barCategoryGap', 'yMin', 'xSplit', 'xZero', 'xMin', 'xMax', 'xMinData', 'xMaxData',
  'yMax', 'yMinData', 'yMaxData', 'gridLeft', 'reserveLeft', 'gridTop', 'gridRight', 'gridBottom', 'gridContain',
  'xLabels', 'xLabelAngle', 'xLabelInterval', 'xLabelMargin', 'xLabelInside', 'yLabelAngle', 'yLabelMargin', 'yLabelInside',
  'xAxisLine', 'yAxisLine', 'y2AxisLine', 'xAxisOnZero', 'yAxisOnZero', 'y2Grid', 'xAxisLineColor', 'yAxisLineColor', 'xAxisLineWidth', 'yAxisLineWidth',
  'xTicks', 'yTicks', 'xTickLength', 'yTickLength', 'xTickInside', 'yTickInside', 'xTickColor', 'yTickColor', 'xTickBands',
  'gridColor', 'gridWidth', 'gridDash', 'xGrid', 'xGridColor', 'xGridWidth', 'xGridDash',
  'ySplitArea', 'xSplitArea', 'yMinorSplit', 'yMinorSplitColor', 'yMinorSplitWidth', 'xMinorSplit', 'xMinorSplitColor', 'xMinorSplitWidth',
  'yMinorTicks', 'yMinorTickLength', 'yMinorTickColor', 'xMinorTicks', 'xMinorTickLength', 'xMinorTickColor',
]

/** A plain value as a literal the emitters read: numbers as Doubles, arrays and objects recursively. */
function forwardedLiteral(v: unknown): ExprIR | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? optionDoubleLiteral(v) : undefined
  if (typeof v === 'string' || typeof v === 'boolean') return lit(v)
  if (Array.isArray(v)) {
    const els: ExprIR[] = []
    for (const x of v) {
      const e = forwardedLiteral(x)
      if (e === undefined) return undefined
      els.push(e)
    }
    return { kind: 'array', elements: els }
  }
  if (isPlainRecord(v)) {
    const fields: { name: string; value: ExprIR }[] = []
    for (const [k, x] of Object.entries(v)) {
      const e = forwardedLiteral(x)
      if (e === undefined) return undefined
      fields.push({ name: k, value: e })
    }
    return { kind: 'object', fields }
  }
  return undefined
}

/** Put the compiled series' forwarded fields on a mark's options, replacing what the hand lowering set for the same name. */
function forwardCompiledSeries(opts: { name: string; value: ExprIR }[], series: Record<string, unknown> | object): void {
  const rec = series as Record<string, unknown>
  for (const name of FORWARDED_SERIES_FIELDS) {
    const v = rec[name]
    if (v === undefined) continue
    const e = forwardedLiteral(v)
    if (e === undefined) continue
    const at = opts.findIndex((o) => o.name === name)
    if (at >= 0) opts[at] = { name, value: e }
    else opts.push({ name, value: e })
  }
}

/** The compiled spec's forwarded fields as one object literal (the synthesized host's `optionSpec`). */
function optionSpecLiteral(spec: Record<string, unknown> | object): Extract<ExprIR, { kind: 'object' }> {
  const rec = spec as Record<string, unknown>
  const fields: { name: string; value: ExprIR }[] = []
  for (const name of FORWARDED_SPEC_FIELDS) {
    const e = rec[name] === undefined ? undefined : forwardedLiteral(rec[name])
    if (e !== undefined) fields.push({ name, value: e })
  }
  return { kind: 'object', fields }
}

/** The generated `ChartSpec`'s field order — Swift's memberwise init takes its arguments in it. */
const CHART_SPEC_ORDER: readonly string[] = CHART_ENGINE_STRUCTS.find((s) => s.name === 'ChartSpec')?.fields.map((f) => f.name) ?? []

/**
 * A synthesized host's `optionSpec` fields, split by where each goes in the
 * spec's argument list: `early` sit between `series` and `categories`, `late`
 * among the literal switches. Each is a plain value (number, string, boolean,
 * number array, or a `BarLength` object), in struct order.
 */
export function optionSpecArgs(e: Extract<ExprIR, { kind: 'jsx-element' }>): { early: { name: string; value: unknown }[]; late: { name: string; value: unknown }[] } {
  const early: { name: string; value: unknown }[] = []
  const late: { name: string; value: unknown }[] = []
  const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'optionSpec')
  if (attr === undefined || attr.kind !== 'attr' || attr.value.kind !== 'object') return { early, late }
  const cats = CHART_SPEC_ORDER.indexOf('categories')
  const entries: { name: string; value: unknown; at: number }[] = []
  for (const f of attr.value.fields) {
    const v = irToValue(f.value, () => undefined)
    if (!v.ok) continue
    entries.push({ name: f.name, value: v.value, at: CHART_SPEC_ORDER.indexOf(f.name) })
  }
  entries.sort((a, b) => a.at - b.at)
  for (const en of entries) (en.at < cats ? early : late).push({ name: en.name, value: en.value })
  return { early, late }
}

/** The index of a ChartSpec field in the generated struct (for ordering literal arguments). */
export function chartSpecFieldIndex(name: string): number {
  return CHART_SPEC_ORDER.indexOf(name)
}

/**
 * The web facade's family compile of a literal option, when it is the given
 * plan kind: the plan plus the first series (its placement keys). Absent when
 * the option is not literal or compiles to another kind.
 */
function compiledFamilyPlan(raw: Extract<ExprIR, { kind: 'object' }>, resolve: (n: string) => ExprIR | undefined, kind: string): { plan: NonNullable<ReturnType<typeof compileFamily>>['plan']; series: Record<string, unknown> } | undefined {
  // The tooltip never shapes the plan, and native runs no formatter — so a function there
  // (a `valueFormatter`) must not cost the chart its arcs, labels and placement.
  const planInput: Extract<ExprIR, { kind: 'object' }> = { ...raw, fields: raw.fields.filter((f) => f.name !== 'tooltip') }
  const plainOption = irToValue(planInput, resolve)
  if (!plainOption.ok || !isPlainRecord(plainOption.value)) return undefined
  const compiled = compileFamily(plainOption.value as never)
  if (compiled === null || compiled.plan.kind !== kind) return undefined
  const s = plainOption.value['series']
  const s0 = Array.isArray(s) ? s[0] : s
  return isPlainRecord(s0) ? { plan: compiled.plan, series: s0 } : undefined
}

/**
 * A plain value (a web-compiled engine struct: a pie's `ArcConfig`, a gauge's
 * `DialSpec`, a `FrameSpec`) as a Swift or Kotlin constructor call. The shape
 * comes from the GENERATED struct itself (`CHART_ENGINE_STRUCTS`), field by
 * field in declaration order, so Swift's order-sensitive memberwise init and
 * each field's numeric type (Double vs Int) can never drift from the engine.
 * Returns undefined when the value does not fit the struct.
 */
export function engineStructLiteral(structName: string, value: unknown, target: 'swift' | 'kotlin'): string | undefined {
  const struct = CHART_ENGINE_STRUCTS.find((st) => st.name === structName)
  if (struct === undefined || !isPlainRecord(value)) return undefined
  const args: string[] = []
  for (const f of struct.fields) {
    const v = value[f.name]
    const optional = f.type.kind === 'union' && f.type.branches.some((b) => b.kind === 'undefined')
    if (v === undefined) {
      if (optional) continue
      return undefined
    }
    const type = optional && f.type.kind === 'union' ? f.type.branches.find((b) => b.kind !== 'undefined')! : f.type
    const text = engineValueLiteral(type, v, target)
    if (text === undefined) return undefined
    args.push(target === 'swift' ? `${f.name}: ${text}` : `${f.name} = ${text}`)
  }
  return `${structName}(${args.join(', ')})`
}

function engineValueLiteral(type: TypeIR, v: unknown, target: 'swift' | 'kotlin'): string | undefined {
  if (type.kind === 'typeRef' && type.name === 'Double') return typeof v === 'number' && Number.isFinite(v) ? chartDouble(v) : undefined
  if (type.kind === 'number') return typeof v === 'number' && Number.isInteger(v) ? String(v) : typeof v === 'number' && type.float === true ? chartDouble(v) : undefined
  if (type.kind === 'boolean') return typeof v === 'boolean' ? String(v) : undefined
  if (type.kind === 'string') return typeof v === 'string' ? (target === 'swift' ? swiftStr(v) : kotlinStr(v)) : undefined
  if (type.kind === 'array') {
    if (!Array.isArray(v)) return undefined
    const items: string[] = []
    for (const x of v) {
      const t = engineValueLiteral(type.element, x, target)
      if (t === undefined) return undefined
      items.push(t)
    }
    if (target === 'swift') return `[${items.join(', ')}]`
    return items.length === 0 ? `listOf<${kotlinElementType(type.element)}>()` : `listOf(${items.join(', ')})`
  }
  if (type.kind === 'typeRef') return engineStructLiteral(type.name, v, target)
  return undefined
}

function kotlinElementType(t: TypeIR): string {
  if (t.kind === 'typeRef') return t.name
  if (t.kind === 'number') return 'Int'
  if (t.kind === 'boolean') return 'Boolean'
  return 'String'
}

/** Mark constructor → the `Series.kind` it produces. `bubble` carries a radius accessor and is declined by name. */
export const PLOT_MARK_KINDS: Readonly<Record<string, string>> = {
  bars: 'bars',
  stackedBars: 'stacked',
  groupedBars: 'grouped',
  stackedArea: 'stackedArea',
  band: 'band',
  line: 'line',
  area: 'area',
  points: 'points',
  waterfall: 'waterfall',
}

/** Mark options that lower as literal fields of `Series`, with their default when absent. */
/** Whether a state's `label` asks to be shown; its own styling is named, as the web reader names it. */
function stateLabelShows(state: Extract<ExprIR, { kind: 'object' }>, name: string, si: number, resolve: (n: string) => ExprIR | undefined, warn: (m: string) => void): boolean {
  const raw = objectField(state, 'label')
  if (raw === undefined) return false
  if (raw.kind === 'literal') return raw.value === true
  const obj = literalOf(raw, resolve)
  if (obj?.kind !== 'object') return false
  for (const f of obj.fields) {
    if (f.name === 'show') continue
    warn(`<OptionChart option.series[${si}].${name}.label.${f.name}>: a state label takes the series' own label style; it was ignored.`)
  }
  return litBoolean(objectField(obj, 'show')) !== false
}

export const PLOT_MARK_OPTION_FIELDS: ReadonlyArray<{ name: string; kind: 'string' | 'number' | 'boolean' | 'numbers' | 'strings' | 'rich'; default?: string | number | boolean }> = [
  { name: 'color', kind: 'string' },
  { name: 'width', kind: 'number', default: 2 },
  { name: 'radius', kind: 'number', default: 3 },
  { name: 'label', kind: 'string' },
  { name: 'smoothAmount', kind: 'number' },
  { name: 'smoothMonotone', kind: 'string' },
  { name: 'connectNulls', kind: 'boolean' },
  { name: 'areaFill', kind: 'boolean' },
  { name: 'areaOpacity', kind: 'number' },
  { name: 'areaColor', kind: 'string' },
  { name: 'areaOrigin', kind: 'string' },
  { name: 'areaOriginAt', kind: 'number' },
  { name: 'showValues', kind: 'boolean', default: false },
  { name: 'axis', kind: 'string' },
  { name: 'axisExtra', kind: 'number' },
  { name: 'onX2', kind: 'boolean' },
  { name: 'xs', kind: 'numbers' },
  { name: 'effect', kind: 'boolean' },
  { name: 'symbol', kind: 'string' },
  { name: 'symbolRepeat', kind: 'boolean' },
  { name: 'symbolMargin', kind: 'number' },
  { name: 'symbolOffset', kind: 'numbers' },
  { name: 'symbolPosition', kind: 'string' },
  { name: 'symbolRotate', kind: 'number' },
  { name: 'symbolHollow', kind: 'boolean' },
  { name: 'symbolShow', kind: 'string' },
  { name: 'symbolClip', kind: 'boolean' },
  { name: 'symbolBoundingData', kind: 'number' },
  { name: 'negativeColor', kind: 'string' },
  { name: 'labelTexts', kind: 'strings' },
  { name: 'labelColor', kind: 'string' },
  { name: 'labelSize', kind: 'number' },
  { name: 'labelRich', kind: 'rich' },
  { name: 'labelPosition', kind: 'string' },
  { name: 'labelDistance', kind: 'number' },
  { name: 'labelBorderColor', kind: 'string' },
  { name: 'labelBorderWidth', kind: 'number' },
  { name: 'labelRotate', kind: 'number' },
  { name: 'labelOffset', kind: 'numbers' },
  { name: 'labelAlign', kind: 'string' },
  { name: 'labelVerticalAlign', kind: 'string' },
  { name: 'focus', kind: 'string' },
  { name: 'emphasisColor', kind: 'string' },
  { name: 'selectColor', kind: 'string' },
  { name: 'blurOpacity', kind: 'number' },
  { name: 'emphasisScale', kind: 'number' },
  { name: 'emphasisDisabled', kind: 'boolean' },
  { name: 'emphasisWidth', kind: 'number' },
  { name: 'blurWidth', kind: 'number' },
  { name: 'emphasisAreaOpacity', kind: 'number' },
  { name: 'blurAreaOpacity', kind: 'number' },
  { name: 'emphasisLabel', kind: 'boolean' },
  { name: 'selectLabel', kind: 'boolean' },
]

/**
 * Mark options that are ACCESSORS rather than literals: `errorLow` /
 * `errorHigh`, a per-datum bound each. They lower like the bubble mark's
 * radius channel — mapped over the same rows the values came from, into
 * `Series.errLow` / `errHigh` — so an emitter reads them here rather than
 * through the literal-field path, which would reject a function.
 *
 * BOTH are needed for a whisker (a single bound has no extent), so exactly
 * one is a named warning rather than a silent half-drop.
 */
export const PLOT_MARK_ACCESSOR_OPTIONS: readonly string[] = ['errorLow', 'errorHigh']

/**
 * The literal `<PlotChart>` props that land on the spec as they are — a
 * string or boolean literal each, in `ChartSpec` field order — so the batch-2
 * switches (the log view, calendar y labels, the 100% stack, axis titles,
 * the label mode) lower on every target through the generated engine.
 */
export const PLOT_SPEC_LITERAL_PROPS: ReadonlyArray<{ name: string; kind: 'string' | 'boolean' | 'number' }> = [
  { name: 'yScale', kind: 'string' },
  { name: 'yTime', kind: 'boolean' },
  { name: 'stackNormalize', kind: 'boolean' },
  { name: 'xTitle', kind: 'string' },
  { name: 'yTitle', kind: 'string' },
  { name: 'y2Title', kind: 'string' },
  { name: 'xLabels', kind: 'string' },
  { name: 'yInverse', kind: 'boolean' },
  { name: 'xInverse', kind: 'boolean' },
  { name: 'xTop', kind: 'boolean' },
  { name: 'yRight', kind: 'boolean' },
  { name: 'xOffset', kind: 'number' },
  { name: 'yOffset', kind: 'number' },
  { name: 'y2Offset', kind: 'number' },
]

/**
 * `<PlotChart>` props with no native form YET — the web events/actions model
 * (a handle's signals, a pick-to-pin mode, the change callbacks). Each warns
 * BY NAME; the chart renders without it. Event props are matched against the
 * parser's lowercased event names, so `onHighlight` is found as `highlight`.
 */
/**
 * Why a prop is web-only, where the answer is a MECHANISM rather than a
 * to-do. "Not lowered yet" is the right thing to say about work not done; it
 * is the wrong thing to say about a prop that cannot cross, because a reader
 * waits for a release that is never coming.
 */
/**
 * WHY each unlowered prop does not lower.
 *
 * Every one of them, not a chosen few: a reason is what a user gets INSTEAD of
 * the feature, and a bare name is a status. Sixteen of these nineteen used to
 * warn with only their name, against this repo's own standard — the
 * `<MapChart>` decline had a spec asserting it "names the blocker and a path,
 * not just a status", and nothing held the rest to it.
 *
 * The reasons divide into two kinds, and saying which is the point: a prop
 * whose MECHANISM is web (a DOM element, a hover, a download) will never
 * cross, and a prop that is EMIT WORK says so, so the next person reads a
 * backlog item rather than a wall.
 */
const PLOT_UNLOWERED_REASON: Readonly<Record<string, string>> = {
  // ── Mechanism is the web platform ──────────────────────────────────────
  crosshair: 'it is a HOVER readout, and a touch target has no hover state to read',
  link: 'it couples two charts through a shared DOM-side controller',
  keyboard: 'it makes the canvas focusable and announces through a DOM live region; the native canvas is named for VoiceOver / TalkBack instead (`describeChart`, which does cross)',
  accessibleTable: 'it renders a hidden DOM `<table>`; the native canvas carries `describeChart`\'s sentence instead',
  facet: 'it renders a GRID of sub-plots rather than a chart setting; compose the panels yourself',
  facetColumns: 'it sizes the `facet` grid, which is web-only',
  // ── Emit work, not an obstacle ─────────────────────────────────────────
  // Each of these names what is MISSING, because "not lowered" without that
  // reads as impossible when it is merely unbuilt.
  emphasis: 'it is the HOVER band (`mouseover`/`mouseout`), and a touch target has no hover state to draw it for — the same wall `crosshair` hits. The engine\'s `ChartSpec.emphasis` does cross and IS fed on native, by `selectedMode`: a tap pins a datum and the pinned outline draws. What stays web-only is the hover half',
  onClick: 'it reports a DOM click by datum; on native a tap is a pick, which is `onSelect`',
  onDoubleClick: 'it reports a DOM double-click by datum; the native canvas has the tap gesture only',
  onContextMenu: 'it reports a DOM context-menu gesture by datum; the native canvas has the tap gesture only',
  onRendered: 'it follows a canvas paint; the SwiftUI / Compose canvas draws with no paint callback to hand back',
  onHighlight: 'it reports the HOVERED datum and -1 when the pointer leaves, so a touch target has nothing to report — a tap is a pick, which is `onSelect`. Firing this on tap would report a hover that did not happen',
}

/** The one warning both emitters raise for the props `<PlotChart>` does not lower. */
export function plotUnloweredWarning(tag: string, present: readonly string[]): string {
  const named = present.map((p) => {
    const why = PLOT_UNLOWERED_REASON[p]
    return why === undefined ? `\`${p}\`` : `\`${p}\` (${why})`
  })
  return `<${tag}>: ${named.join(', ')} ${present.length === 1 ? 'is' : 'are'} not lowered on native; the chart renders without.`
}

// The shared chrome props every host carries (`legendPosition`, `keyboard`,
// `updateAnimation`, `updateDuration`, `toolbox`, `onSaveImage`,
// `accessibleTable`) are reported through `chartChromeUnlowered` for the plot
// host too — listing them here as well would warn twice.
export const PLOT_UNLOWERED_PROPS: readonly string[] = ['onHighlight', 'onClick', 'onDoubleClick', 'onContextMenu', 'onRendered', 'emphasis', 'crosshair', 'link', 'keyboard', 'accessibleTable', 'facet', 'facetColumns']

/**
 * A host's `visualMap` at COMPILE time: the web `VisualMapSpec` (as the web
 * host takes it), or an ECharts `visualMap` object read through the web's own
 * `visualMapSpec`, as the engine's `VisualStrip` literal plus the initial
 * selection. Null when absent; a non-literal value is named.
 */
export function chartVisualMap(
  expr: ExprIR | undefined,
  resolve: (name: string) => ExprIR | undefined,
  t: ChartHostTarget,
  warn: (m: string) => void,
  tag: string,
): { strip: string; lo: string; hi: string; selected: string } | null {
  if (expr === undefined) return null
  const literal = literalOf(expr, resolve)
  const v = literal === undefined ? undefined : irToValue(literal, resolve)
  if (v === undefined || !v.ok || !isPlainRecord(v.value)) {
    warn(`<${tag} visualMap>: native needs a literal visualMap; the chart renders without the strip.`)
    return null
  }
  const raw = v.value
  const spec: VisualMapSpec | undefined = Array.isArray(raw['domain']) && Array.isArray(raw['range']) ? (raw as unknown as VisualMapSpec) : visualMapSpec({ visualMap: raw, series: [] })?.spec
  if (spec === undefined) return null
  const s = visualStripOf(spec)
  const str = (x: string): string => JSON.stringify(x)
  const pieces = s.pieces.map((p) => t.struct('VisualPiece', [['label', str(p.label)], ['color', str(p.color)], ...(p.min !== undefined ? [['min', chartDouble(p.min)] as const] : []), ...(p.max !== undefined ? [['max', chartDouble(p.max)] as const] : [])]))
  const strip = t.struct('VisualStrip', [
    ['piecewise', String(s.piecewise)],
    ['stops', t.list(s.stops.map(str))],
    ['domain', t.struct('Domain', [['min', chartDouble(s.domain.min)], ['max', chartDouble(s.domain.max)]])],
    ['pieces', t.list(pieces)],
    ['vertical', String(s.vertical)],
    ['highText', str(s.highText)],
    ['lowText', str(s.lowText)],
    ['fontSize', chartDouble(s.fontSize)],
    ['labelColor', str(s.labelColor)],
    ['itemSize', chartDouble(s.itemSize)],
    ['itemLength', chartDouble(s.itemLength)],
    ['calculable', String(s.calculable)],
    ['outColor', str(s.outColor)],
  ])
  return { strip, lo: chartDouble(spec.range[0]), hi: chartDouble(spec.range[1]), selected: t.list(spec.selected.map(String)) }
}

/**
 * `<PlotChart initialZoom zoomLimits>` on native: the window the chart opens
 * on and the span limits every gesture is held to, as target literals. A
 * non-literal value is named and ignored.
 */
export function chartZoomConfig(
  readExpr: (name: string) => ExprIR | undefined,
  resolve: (name: string) => ExprIR | undefined,
  t: ChartHostTarget,
  warn: (m: string) => void,
  tag: string,
): { initial: string | null; limits: string | null } {
  const plainOf = (name: string): Record<string, unknown> | null | undefined => {
    const e = readExpr(name)
    if (e === undefined) return undefined
    const literal = literalOf(e, resolve)
    const v = literal === undefined ? undefined : irToValue(literal, resolve)
    if (v === undefined || !v.ok || !isPlainRecord(v.value)) {
      warn(`<${tag} ${name}>: native needs a literal object; the chart ignores it.`)
      return null
    }
    return v.value
  }
  const init = plainOf('initialZoom')
  const lim = plainOf('zoomLimits')
  const n = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const initial = init == null ? null : t.struct('ZoomWindow', [['start', chartDouble(Math.max(0, Math.min(1, n(init['start'], 0))))], ['end', chartDouble(Math.max(0, Math.min(1, n(init['end'], 1))))]])
  const limits = lim == null ? null : t.struct('ZoomLimits', [['lock', String(lim['lock'] === true)], ['minSpan', chartDouble(n(lim['minSpan'], 0))], ['maxSpan', chartDouble(n(lim['maxSpan'], 1))]])
  return { initial, limits }
}

/**
 * `<PlotChart toolbox>` on native, read at compile time: the ordered tool
 * names the engine lays out (the web's `toolboxTools` order) and whether a
 * saved image was asked for as SVG, which a phone saves as PNG.
 */
export function chartToolboxConfig(
  expr: ExprIR | undefined,
  resolve: (name: string) => ExprIR | undefined,
  warn: (m: string) => void,
  tag: string,
): { tools: string[]; dataZoom: boolean; magic: boolean; dataView: boolean; save: boolean; brush: string[] } | null {
  if (expr === undefined) return null
  const literal = literalOf(expr, resolve)
  const v = literal === undefined ? undefined : irToValue(literal, resolve)
  if (v === undefined || !v.ok || !isPlainRecord(v.value)) {
    warn(`<${tag} toolbox>: native needs a literal toolbox object; the chart renders without it.`)
    return null
  }
  const cfg = v.value
  const tools: string[] = []
  if (cfg['dataZoom'] === true) tools.push('dataZoom', 'dataZoomBack')
  if (cfg['dataView'] === true) tools.push('dataView')
  const magic = Array.isArray(cfg['magicType']) ? (cfg['magicType'] as unknown[]) : []
  for (const t of magic) {
    if (t === 'line') tools.push('magicLine')
    else if (t === 'bar') tools.push('magicBar')
    else if (t === 'stack') tools.push('magicStack')
    else if (t === 'tiled') tools.push('magicTiled')
  }
  // The area-brush tools, as the web toolbox names them.
  const brush: string[] = []
  const BRUSH_TOOLS: Readonly<Record<string, string>> = { rect: 'brushRect', polygon: 'brushPolygon', lineX: 'brushLineX', lineY: 'brushLineY', keep: 'brushKeep', clear: 'brushClear' }
  for (const b of Array.isArray(cfg['brush']) ? (cfg['brush'] as unknown[]) : []) {
    const t = typeof b === 'string' ? BRUSH_TOOLS[b] : undefined
    if (t === undefined) {
      warn(`<${tag} toolbox.brush>: "${String(b)}" is not a brush tool (rect, polygon, lineX, lineY, keep, clear); it was skipped.`)
      continue
    }
    tools.push(t)
    brush.push(t)
  }
  if (cfg['restore'] === true) tools.push('restore')
  const save = cfg['saveAsImage'] === true || cfg['saveAsImage'] === 'png' || cfg['saveAsImage'] === 'svg'
  if (cfg['saveAsImage'] === 'svg') warn(`<${tag} toolbox.saveAsImage>: a phone saves the chart as a PNG, not an SVG.`)
  if (save) tools.push('saveAsImage')
  return { tools, dataZoom: cfg['dataZoom'] === true, magic: magic.length > 0, dataView: cfg['dataView'] === true, save, brush }
}


/**
 * `handle.dispatch({ type, ... })` — the action literal as the crossing
 * reducer's flat `ChartActionInput` fields (`legendInverseSelect`'s `count`
 * rides in `series`, as the web handle's `toActionInput` puts it). A field the
 * action does not name is absent here and takes the reducer's default at emit.
 * Returns null when the argument is not an inline object with a string `type`.
 */
export function chartActionFields(arg: ExprIR | undefined): Partial<Record<'type' | 'index' | 'series' | 'start' | 'end' | 'brushType' | 'areas' | 'playing', ExprIR>> | null {
  if (arg === undefined || arg.kind !== 'object' || (arg.spreads !== undefined && arg.spreads.length > 0)) return null
  const out: Partial<Record<'type' | 'index' | 'series' | 'start' | 'end' | 'brushType' | 'areas' | 'playing', ExprIR>> = {}
  for (const f of arg.fields) {
    if (f.name === 'count') out.series = f.value
    else if (f.name === 'type' || f.name === 'index' || f.name === 'series' || f.name === 'start' || f.name === 'end' || f.name === 'brushType' || f.name === 'areas' || f.name === 'playing') out[f.name] = f.value
  }
  return out.type === undefined ? null : out
}
