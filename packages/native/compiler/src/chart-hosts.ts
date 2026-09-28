// `@pyreon/charts` family hosts on native — the table both emitters lower
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

import { visualMap, visualStripOf } from '@pyreon/charts/engine'
import type { VisualMapOptions, VisualMapSpec } from '@pyreon/charts/engine'
import type { AttrIR, ExprIR } from './types'
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

const objectField = (e: ExprIR, name: string): ExprIR | undefined =>
  e.kind === 'object' && (e.spreads === undefined || e.spreads.length === 0)
    ? e.fields.find((f) => f.name === name)?.value
    : undefined

/** A Double literal; NaN is `0.0 / 0.0` — the engine's own gap idiom, valid in Swift and Kotlin alike. */
const doubleLiteralIr = (value: number): ExprIR =>
  Number.isNaN(value)
    ? { kind: 'binary', op: '/', left: { kind: 'literal', value: 0, float: true }, right: { kind: 'literal', value: 0, float: true } }
    : { kind: 'literal', value, float: true }

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

/** The grammar host and its mark/config children — `<Chart>` desugars to `<PlotChart marks>` before the plot emit runs. */
export const GRAMMAR_CHART_HOST = 'Chart'
export const GRAMMAR_MARK_TAGS: Readonly<Record<string, string>> = { Bar: 'bars', Line: 'line', Area: 'area', Dot: 'points', StackedArea: 'stackedArea', Band: 'band' }
/**
 * The indicator marks — `<Sma>` etc. — and the array-form factory each
 * desugars to. They are DERIVED marks with their own arguments (a window, a
 * width), so they are not in `GRAMMAR_MARK_TAGS`, whose entries all take the
 * shared `y` + options shape. `bollinger` expands to two marks, so it
 * desugars to a SPREAD (`...bollinger(…)`), exactly as the array form writes
 * it. Mirrors `GRAMMAR_INDICATOR_TAGS` in the charts package's
 * `grammar-indicators.test.tsx`.
 */
export const GRAMMAR_INDICATOR_TAGS: Readonly<Record<string, string>> = { Sma: 'sma', Ema: 'ema', Trend: 'trend', Bollinger: 'bollinger' }
export const GRAMMAR_CONFIG_TAGS: readonly string[] = ['Rule', 'Axis', 'Tooltip', 'Legend', 'Zoom', 'Toolbox', 'Label', 'Scale', 'Histogram']
/** The FAMILY marks: `<Chart>` with one of these desugars to the row-array host it names, channels as accessors. */
export const GRAMMAR_FAMILY_TAGS: Readonly<Record<string, string>> = { Arc: 'PieChart', Stage: 'FunnelChart', Cell: 'HeatmapChart', Candle: 'CandlestickChart' }
/** The channels of each family mark (the host's accessor props); every other attr is an option. */
const FAMILY_CHANNELS: Readonly<Record<string, readonly string[]>> = { Arc: ['value', 'label', 'color'], Stage: ['value', 'label', 'color'], Cell: ['x', 'y', 'value'], Candle: ['open', 'high', 'low', 'close'] }
/** Where a family mark's option attrs go: an options struct prop, or straight onto the host. */
const FAMILY_OPTIONS_PROP: Readonly<Record<string, string | undefined>> = { Stage: 'funnel', Candle: 'candle' }

/** Whether a JSX tag is a `@pyreon/charts` host, lowered or not (the grammar's mark tags included, so a stray one warns instead of emitting a phantom component). */
export function isChartHostTag(tag: string): boolean {
  return (
    Object.hasOwn(CHART_HOSTS, tag) ||
    Object.hasOwn(ACCESSOR_CHART_HOSTS, tag) ||
    Object.hasOwn(FRAME_CHART_HOSTS, tag) ||
    Object.hasOwn(UNLOWERED_CHART_HOSTS, tag) ||
    tag === GRAMMAR_CHART_HOST ||
    Object.hasOwn(GRAMMAR_MARK_TAGS, tag) ||
    Object.hasOwn(GRAMMAR_INDICATOR_TAGS, tag) ||
    Object.hasOwn(GRAMMAR_FAMILY_TAGS, tag) ||
    GRAMMAR_CONFIG_TAGS.includes(tag)
  )
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
 * `<Chart data x>` with mark children → the `<PlotChart data x marks={[…]}>`
 * element the plot emit already lowers, so the grammar is the SAME spec on
 * native as on the web. Field-name channels become accessors; mark children
 * become mark calls with their options; Rule/Axis/Tooltip/Legend/Zoom become the
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
    else if (a.kind === 'attr' && a.name === 'color') warn('<Chart color>: the long-format pivot is resolved on the web at runtime and is not lowered on native; the chart renders wide-format (one mark, one series).')
    else attrs.push(a)
  }
  for (const c of e.children) {
    if (c.kind !== 'expr' || c.expr.kind !== 'jsx-element') continue
    const child = c.expr
    const tag = child.tag
    const indicator = GRAMMAR_INDICATOR_TAGS[tag]
    if (indicator !== undefined) {
      // `<Sma y window>` → `sma(y, window, { …rest })`, the array form's own
      // call, so the indicator lowering the emitters already have runs
      // unchanged. `<Bollinger>` becomes `...bollinger(y, window, k, { … })`.
      const y = attrOf(child, 'y')
      const window = attrOf(child, 'window')
      if (y === undefined) {
        warn(`<${tag}>: needs a \`y\` channel; the mark is skipped on native.`)
        continue
      }
      if (indicator !== 'trend' && window === undefined) {
        warn(`<${tag}>: needs a \`window\`; the mark is skipped on native.`)
        continue
      }
      const k = attrOf(child, 'k')
      const fields: { name: string; value: ExprIR }[] = []
      for (const a of child.attrs) {
        if (a.kind !== 'attr' || ['y', 'window', 'k'].includes(a.name)) continue
        fields.push({ name: a.name, value: a.value })
      }
      const args: ExprIR[] = [channelArrow(y)]
      if (window !== undefined && indicator !== 'trend') args.push(window)
      // bollinger's options are its FOURTH argument, so an absent `k` still
      // needs its default in place when options follow.
      if (indicator === 'bollinger' && (k !== undefined || fields.length > 0)) args.push(k ?? doubleLiteralIr(2))
      if (fields.length > 0) args.push({ kind: 'object', fields })
      const call: ExprIR = { kind: 'call', callee: ident(indicator), args }
      marks.push(indicator === 'bollinger' ? { kind: 'spread', argument: call } : call)
      continue
    }
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
      case 'Tooltip':
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
      case 'Toolbox': {
        // `<Toolbox saveAsImage magicType={[…]}>` → `toolbox={{ … }}`: the
        // child's attributes ARE the config object the host takes.
        const fields: { name: string; value: ExprIR }[] = []
        for (const a of child.attrs) if (a.kind === 'attr') fields.push({ name: a.name, value: a.value })
        attrs.push({ kind: 'attr', name: 'toolbox', value: { kind: 'object', fields } })
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
        warn(`<Chart>: child <${tag}> is not a mark or a chart setting; it is ignored on native.`)
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
      warn('<Histogram>: <Chart> needs a `data` attribute to bin; the plot renders without it on native.')
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
 * `<Chart data><Arc value label /></Chart>` → `<PieChart data value={(d) => d.value} label={…}>`
 * (and Stage → Funnel, Cell → Heatmap, Candle → Candlestick): the plot's shared
 * props carry over, the mark's channels become the host's accessors, its
 * option attrs go where the host keeps them (`funnel={{…}}` / `candle={{…}}`
 * or straight on), `<Tooltip>` / `<Legend>` / `<Axis y format>` set the host's
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
      else warn(`<Chart x>: a ${host.replace('Chart', '').toLowerCase()} has no x channel; it is ignored.`)
    } else if (a.kind === 'attr' && (a.name === 'xValue' || a.name === 'color' || a.name === 'horizontal' || a.name === 'showGrid')) {
      warn(`<Chart ${a.name}>: not a ${host.replace('Chart', '').toLowerCase()} prop; it is ignored.`)
    } else if (a.kind === 'event' && a.name === 'select') {
      // `<Chart onSelect>` reports the drawn item's INDEX on every target. A
      // family host's own `onSelect` is shaped per family (a heatmap reports
      // its cell, which native cannot build); its `onSelectIndex` is the
      // index — the same routing the web grammar does.
      attrs.push({ kind: 'event', name: 'selectindex', handler: a.handler })
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
      warn(`<Chart>: one family per plot — <${child.tag}> is ignored beside <${mark.tag}>.`)
      continue
    }
    if (child.tag === 'Tooltip') attrs.push({ kind: 'attr', name: 'tooltip', value: lit(true) })
    else if (child.tag === 'Legend') attrs.push({ kind: 'attr', name: 'showLegend', value: lit(true) })
    else if (child.tag === 'Toolbox') {
      // A family host's toolbox is PNG-only: any save form turns it on, as on the web.
      const save = attrOf(child, 'saveAsImage')
      const on = save !== undefined && !(save.kind === 'literal' && save.value === false)
      attrs.push({ kind: 'attr', name: 'toolbox', value: { kind: 'object', fields: [{ name: 'saveAsImage', value: lit(on) }] } })
    }
    else if (child.tag === 'Axis' && !flagOn(child, 'x') && !flagOn(child, 'y2') && attrOf(child, 'format') !== undefined) attrs.push({ kind: 'attr', name: 'format', value: attrOf(child, 'format')! })
    else warn(`<Chart>: <${child.tag}> does not apply to a ${host.replace('Chart', '').toLowerCase()}; it is ignored.`)
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
  if (family === '' || family === 'Plot') return 'Chart'
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
    tooltip: (items, x, y, a, t) => `funnelTip(${items}, ${t.rect('8.0', '8.0', `${a.W} - 16.0`, `${a.H} - 16.0`)}, ${x}, ${y}, ${a.options})`,
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
    render: (items, a, t) => `renderPie(${items}, ${box00(a, t)}, ${t.pieOptions(a)})`,
    hit: (items, x, y, a, t) => {
      const fit = `fitCircle(${box00(a, t)})`
      return `hitArc(layoutArcs(${items}), ${fit}.center, ${fit}.radius, ${fit}.radius * ${a.innerRatio}, ${t.pt(x, y)})`
    },
    legend: (items) => `pieLegend(${items})`,
    tooltip: (items, x, y, a, t) => `pieTip(${items}, ${box00(a, t)}, ${a.innerRatio}, ${x}, ${y})`,
  },
}

/**
 * The web hosts' default `ChartTheme` — inlined because the engine's own
 * `defaultTheme` is module-private in both targets. Field ORDER is the struct's
 * declaration order (Swift's memberwise init rejects reordered arguments), and
 * every value is the emitted TEXT of that field. Drift against
 * `@pyreon/charts`'s `defaultTheme` is locked by `chart-theme-default.test.ts`.
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
 * The named palettes `@pyreon/charts` exports as `palettes.*`, so a theme
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
/**
 * How each compile-time theme scope was built: the colour mode pinned above it
 * (null when none is — the platform scheme decides) and the
 * `<ChartThemeProvider>` elements in force, outermost first. Keyed by the
 * scope's resolved theme so the emitters keep passing one object around.
 *
 * The chain, not just the resolved theme, is kept because on the web a
 * provider hands down a theme PER MODE and the mode is applied where the chart
 * sits — so a `<ColorModeProvider mode="dark">` BELOW a provider must re-resolve
 * that provider's `light` / `dark` overrides, not inherit a theme resolved for
 * the outer mode.
 */
interface ThemeChain {
  mode: 'light' | 'dark' | null
  providers: readonly (ExprIR & { kind: 'jsx-element' })[]
}
const SCOPE_CHAIN = new WeakMap<RawChartTheme, ThemeChain>()

/** Merge one theme-object literal's fields over `raw`, warning by name on what cannot lower. */
function applyThemeLiteral(raw: Record<string, string | readonly string[]>, v: ExprIR, attr: string, warn: (m: string) => void): void {
  if (v.kind !== 'object' || (v.spreads !== undefined && v.spreads.length > 0)) {
    warn(`<ChartThemeProvider ${attr}>: only an object literal with literal fields lowers on native; it is ignored.`)
    return
  }
  raw.palette = chartThemePalette(v, 'ChartThemeProvider', warn, raw.palette as readonly string[])
  for (const f of v.fields) {
    const spec = CHART_THEME_FIELDS.find((x) => x.name === f.name)
    if (spec === undefined || spec.kind === 'strings') continue
    if (f.value.kind !== 'literal' || typeof f.value.value !== spec.kind) {
      warn(`<ChartThemeProvider ${attr}>: \`${f.name}\` must be a ${spec.kind} literal on native; the mode's value applies.`)
      continue
    }
    raw[spec.name] = spec.kind === 'number' ? chartDouble(f.value.value as number) : (f.value.value as string)
  }
}

function scopeAttr(e: ExprIR & { kind: 'jsx-element' }, name: string): ExprIR | undefined {
  const a = e.attrs.find((x) => x.kind === 'attr' && x.name === name)
  return a?.kind === 'attr' ? a.value : undefined
}

/** Resolve a chain as the web does: the mode's built-in theme, then each provider's `theme`, then its override for the mode. */
function resolveThemeChain(chain: ThemeChain, warn: (m: string) => void): RawChartTheme {
  const mode = chain.mode ?? 'light'
  let raw: Record<string, string | readonly string[]> = { ...CHART_THEMES[mode] }
  for (const el of chain.providers) {
    const themeV = scopeAttr(el, 'theme')
    const named = themeV === undefined ? undefined : namedChartTheme(themeV)
    if (named !== undefined) raw = { ...named }
    else if (themeV !== undefined) applyThemeLiteral(raw, themeV, 'theme', warn)
    const perMode = scopeAttr(el, mode)
    if (perMode !== undefined) applyThemeLiteral(raw, perMode, mode, warn)
  }
  const out = raw as RawChartTheme
  SCOPE_CHAIN.set(out, chain)
  return out
}

/** A `<ChartThemeProvider>`: push its layers onto the chain in force. */
export function chartThemeScope(e: ExprIR & { kind: 'jsx-element' }, warn: (m: string) => void, outer?: RawChartTheme): RawChartTheme {
  const prev: ThemeChain = (outer === undefined ? undefined : SCOPE_CHAIN.get(outer)) ?? { mode: null, providers: [] }
  if (scopeAttr(e, 'mode') !== undefined) warn('<ChartThemeProvider mode>: the mode is not a provider prop any more — wrap it in `<ColorModeProvider mode>` (@pyreon/core) or set `<PyreonUI mode>`; it is ignored.')
  if (prev.mode === null && prev.providers.length === 0) warn('<ChartThemeProvider>: with no literal colour mode above it, the web follows the system scheme; natively the light theme applies — wrap it in `<ColorModeProvider mode="dark">` (or give each chart its own `theme`).')
  return resolveThemeChain({ mode: prev.mode, providers: [...prev.providers, e] }, warn)
}

/** The literal mode a `<ColorModeProvider>` pins, or undefined (absent, `'system'`, or reactive). */
export function literalColorMode(e: ExprIR & { kind: 'jsx-element' }): 'light' | 'dark' | undefined {
  const v = scopeAttr(e, 'mode')
  return v !== undefined && v.kind === 'literal' && (v.value === 'light' || v.value === 'dark') ? v.value : undefined
}

/**
 * A `<ColorModeProvider mode>` or `<PyreonUI mode>`: pin the mode for the
 * charts below. Only a literal `"light"` / `"dark"` can be read at compile
 * time; `"system"` keeps the platform scheme (the scope in force is returned
 * unchanged), and a reactive mode warns and does the same.
 */
export function colorModeScope(e: ExprIR & { kind: 'jsx-element' }, warn: (m: string) => void, outer?: RawChartTheme, warnReactive: boolean = true): RawChartTheme | undefined {
  const modeV = scopeAttr(e, 'mode')
  if (modeV === undefined) return outer
  if (modeV.kind === 'literal' && (modeV.value === 'light' || modeV.value === 'dark')) {
    const prev: ThemeChain = (outer === undefined ? undefined : SCOPE_CHAIN.get(outer)) ?? { mode: null, providers: [] }
    return resolveThemeChain({ mode: modeV.value, providers: prev.providers }, warn)
  }
  if (warnReactive && !(modeV.kind === 'literal' && modeV.value === 'system')) {
    warn(`<${e.tag} mode>: only a literal "light" / "dark" / "system" lowers on native (a reactive mode cannot be read at compile time); charts below follow the platform scheme.`)
  }
  return outer
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

/**
 * Each `<PlotChart>` mark's palette slot, from its LITERAL label — the web's
 * `resolveMarks` rule (`labelSlots`): marks sharing a label share a colour. A
 * mark with no literal label keeps its own slot (`Series N`), so a chart
 * without shared labels is coloured exactly as before.
 */
export function plotMarkColorSlots(marks: readonly ExprIR[]): number[] {
  const labels: string[] = []
  for (let k = 0; k < marks.length; k++) {
    const m = marks[k]!
    let label = `Series ${k + 1}`
    if (m.kind === 'call' && m.callee.kind === 'identifier') {
      const callee = m.callee.name
      const optsArg = callee === 'bubble' || callee === 'band' || PLOT_INDICATOR_MARKS[callee]?.takesWindow === true ? m.args[2] : m.args[1]
      const own = optsArg?.kind === 'object' ? litString(objectField(optsArg, 'label')) : undefined
      if (own !== undefined) label = own
    }
    labels.push(label)
  }
  return labelSlots(labels)
}

/**
 * The engine's `labelSlots` (palette.ts), mirrored: each new label takes the
 * next slot, a repeated label its first one. Not exported from
 * `@pyreon/charts/engine`, so it is restated here — three lines of pure logic.
 */
function labelSlots(labels: readonly string[]): number[] {
  const seen: string[] = []
  return labels.map((label) => {
    const at = seen.indexOf(label)
    if (at >= 0) return at
    seen.push(label)
    return seen.length - 1
  })
}

export const PLOT_INDICATOR_MARKS: Readonly<Record<string, { readonly fn: string; readonly kind: string; readonly takesWindow: boolean }>> = {
  sma: { fn: 'smaValues', kind: 'line', takesWindow: true },
  ema: { fn: 'emaValues', kind: 'line', takesWindow: true },
  trend: { fn: 'trendValues', kind: 'line', takesWindow: false },
}

/** The generated `ChartSpec`'s field order — Swift's memberwise init takes its arguments in it. */
const CHART_SPEC_ORDER: readonly string[] = CHART_ENGINE_STRUCTS.find((s) => s.name === 'ChartSpec')?.fields.map((f) => f.name) ?? []

/** The index of a ChartSpec field in the generated struct (for ordering literal arguments). */
export function chartSpecFieldIndex(name: string): number {
  return CHART_SPEC_ORDER.indexOf(name)
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
export const PLOT_MARK_OPTION_FIELDS: ReadonlyArray<{ name: string; kind: 'string' | 'number' | 'boolean'; default?: string | number | boolean }> = [
  { name: 'color', kind: 'string' },
  { name: 'width', kind: 'number', default: 2 },
  { name: 'radius', kind: 'number', default: 3 },
  { name: 'label', kind: 'string' },
  { name: 'areaOpacity', kind: 'number' },
  { name: 'showValues', kind: 'boolean', default: false },
  { name: 'axis', kind: 'string' },
  { name: 'effect', kind: 'boolean' },
  { name: 'symbol', kind: 'string' },
  { name: 'symbolRepeat', kind: 'boolean' },
  { name: 'negativeColor', kind: 'string' },
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
 * A host's `visualMap` at COMPILE time — the web `VisualMapSpec` literal, or a
 * `visualMap({ … })` builder call over a literal, run here through the
 * engine's own `visualMap` so the strip is the one the web draws — as the
 * engine's `VisualStrip` literal plus the initial selection. Null when absent;
 * a non-literal value is named.
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
  const built = literal?.kind === 'call' && literal.callee.kind === 'identifier' && literal.callee.name === 'visualMap' && literal.args.length === 1
  const v = literal === undefined ? undefined : irToValue(built && literal.kind === 'call' ? literal.args[0] : literal, resolve)
  if (v === undefined || !v.ok || !isPlainRecord(v.value) || !Array.isArray(v.value['domain'])) {
    warn(`<${tag} visualMap>: native needs a literal \`visualMap({ … })\` (or a literal VisualMapSpec); the chart renders without the strip.`)
    return null
  }
  const raw = v.value
  const spec: VisualMapSpec = built || !Array.isArray(raw['range']) || !Array.isArray(raw['pieces']) ? visualMap(raw as unknown as VisualMapOptions) : (raw as unknown as VisualMapSpec)
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
export function chartActionFields(arg: ExprIR | undefined): Partial<Record<'type' | 'index' | 'series' | 'start' | 'end' | 'brushType' | 'areas', ExprIR>> | null {
  if (arg === undefined || arg.kind !== 'object' || (arg.spreads !== undefined && arg.spreads.length > 0)) return null
  const out: Partial<Record<'type' | 'index' | 'series' | 'start' | 'end' | 'brushType' | 'areas', ExprIR>> = {}
  for (const f of arg.fields) {
    if (f.name === 'count') out.series = f.value
    else if (f.name === 'type' || f.name === 'index' || f.name === 'series' || f.name === 'start' || f.name === 'end' || f.name === 'brushType' || f.name === 'areas') out[f.name] = f.value
  }
  return out.type === undefined ? null : out
}
