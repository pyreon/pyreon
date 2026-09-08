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

import type { AttrIR, ExprIR } from './types'

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
   * The options with the theme palette as the DEFAULT — `Struct(palette: p)`
   * when no options were given, else a copy whose `palette` is filled only
   * when the user left it unset (the web host's `{ palette: theme.palette,
   * ...props.x }` merge; an explicit palette in the options wins).
   */
  withPalette: (options: string, struct: string, palette: string) => string
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
  /** The theme's font size as emitted text (the pie's label size); the default when absent. */
  fontSize?: string
}

export interface ChartHostSpec {
  /** Required data props, in engine argument order. */
  readonly data: readonly string[]
  /** The options prop (an `XOptions` struct); optional. */
  readonly options: string
  /** The engine struct the options prop holds — steers an inline literal and names the entrance copy. */
  readonly optionsStruct: string
  /** The options struct has a `palette` — the theme's palette is its default (the web host's merge). */
  readonly paletteOption?: true
  /** The web host's default `height`. */
  readonly defaultHeight: number
  /** Builds the layout expression (`layoutX(...)`). */
  readonly layout: (a: ChartHostArgs, t: ChartHostTarget) => string
  /** Builds the `[PyreonDrawCmd]` expression from a layout expression. */
  readonly render: (layout: string, a: ChartHostArgs, t: ChartHostTarget) => string
  /** Builds the index-hit expression for a tap at (x, y) — what `onSelectIndex` receives. */
  readonly hit: (layout: string, x: string, y: string, a: ChartHostArgs, t: ChartHostTarget) => string
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

/** Turns one data prop's IR (with every data prop's IR to hand) into an engine argument, or `'unsupported'` after warning. */
export type ChartHostAdapter = (attrs: Readonly<Record<string, ExprIR>>, t: ChartHostTarget, warn: (msg: string) => void, resolve: (name: string) => ExprIR | undefined) => string | 'unsupported'

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

function litNumber(e: ExprIR | undefined): number | undefined {
  return e !== undefined && e.kind === 'literal' && typeof e.value === 'number' ? e.value : undefined
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

const box00 = (a: ChartHostArgs, t: ChartHostTarget): string => t.rect('0.0', '0.0', a.W, a.H)

/** `options?.field` — or the target's nil when no options were given (`nil?.x` is not Swift). */
const optField = (a: ChartHostArgs, t: ChartHostTarget, field: string): string =>
  a.options === t.nil ? t.nil : `(${a.options}).${field}`

export const CHART_HOSTS: Readonly<Record<string, ChartHostSpec>> = {
  SankeyChart: {
    data: ['nodes', 'links'],
    options: 'sankey',
    optionsStruct: 'SankeyOptions',
    paletteOption: true,
    defaultHeight: 300,
    layout: (a, t) => {
      const box = t.rect(a.gutter, '8.0', t.max0(`${a.W} - ${a.gutter} * 2.0`), t.max0(`${a.H} - 16.0`))
      return `layoutSankey(${a.data[0]}, ${a.data[1]}, ${box}, ${a.options})`
    },
    render: (l, a) => `renderSankey(${l}, ${a.options})`,
    hit: (l, x, y) => `hitSankeyIndex(${l}, ${x}, ${y})`,
    legend: (l) => `sankeyLegend(${l})`,
    tooltip: (l, x, y) => `sankeyTip(${l}, ${x}, ${y})`,
  },
  GraphChart: {
    data: ['nodes', 'links'],
    options: 'graph',
    optionsStruct: 'GraphOptions',
    paletteOption: true,
    defaultHeight: 300,
    layout: (a, t) => `layoutGraph(${a.data[0]}, ${a.data[1]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a, t) => `renderGraph(${l}, ${box00(a, t)}, ${a.options})`,
    hit: (l, x, y) => `hitGraphIndex(${l}, ${x}, ${y})`,
    tooltip: (l, x, y) => `graphTip(${l}, ${x}, ${y})`,
  },
  TreemapChart: {
    data: ['data'],
    options: 'treemap',
    optionsStruct: 'TreemapOptions',
    paletteOption: true,
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
    paletteOption: true,
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
    paletteOption: true,
    defaultHeight: 300,
    layout: (a, t) => `layoutTree(${a.data[0]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a) => `renderTree(${l}, ${a.options})`,
    hit: (l, x, y, a, t) => `hitTreeIndex(${l}, ${x}, ${y}, ${optField(a, t, 'symbolSize')})`,
    legend: (l) => `treeLegend(${l})`,
    tooltip: (l, x, y, a, t) => `treeTip(${l}, ${x}, ${y}, ${optField(a, t, 'symbolSize')})`,
  },
  RiverChart: {
    data: ['series'],
    options: 'river',
    optionsStruct: 'RiverOptions',
    paletteOption: true,
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
    paletteOption: true,
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
    paletteOption: true,
    defaultHeight: 300,
    layout: (a, t) => `layoutPolar(${a.data[0]}, ${a.data[1]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a) => `renderPolar(${l}, ${a.options})`,
    hit: (l, x, y) => `hitPolarIndex(${l}, ${x}, ${y})`,
    // The engine's DEFAULT_PALETTE is a private module constant in the generated Swift; the web default is inlined instead.
    legend: (_l, a, t) => `polarLegend(${a.data[1]}, ${t.coalesce(optField(a, t, 'palette'), t.list(CHART_HOST_PALETTE.map((c) => JSON.stringify(c))))})`,
    tooltip: (l, x, y, a) => `polarTip(${l}, ${a.data[1]}, ${x}, ${y})`,
  },
  CalendarChart: {
    data: ['start', 'end', 'values'],
    options: 'calendar',
    optionsStruct: 'CalendarOptions',
    defaultHeight: 140,
    layout: (a, t) => `layoutCalendar(${a.data[0]}, ${a.data[1]}, ${t.rect('4.0', '4.0', `${a.W} - 8.0`, `${a.H} - 8.0`)}, ${a.options})`,
    render: (l, a) => `renderCalendar(${l}, ${a.data[2]}, ${a.options})`,
    hit: (l, x, y) => `hitCalendarIndex(${l}, ${x}, ${y})`,
    tooltip: (l, x, y, a) => `calendarTip(${l}, ${a.data[2]}, ${x}, ${y})`,
    adapt: { values: calendarValuesAdapter },
  },
  ParallelChart: {
    data: ['axes', 'rows'],
    options: 'parallel',
    optionsStruct: 'ParallelOptions',
    paletteOption: true,
    defaultHeight: 300,
    gutterDefault: 40,
    layout: (a, t) => `layoutParallel(${a.data[0]}, ${a.data[1]}, ${t.rect(a.gutter, '8.0', t.max0(`${a.W} - ${a.gutter} * 2.0`), t.max0(`${a.H} - 16.0`))}, ${a.options})`,
    render: (l, a) => `renderParallel(${l}, ${a.options})`,
    hit: (l, x, y) => `hitParallelIndex(${l}, ${x}, ${y})`,
    adapt: { rows: parallelRowsAdapter },
    warnProps: ['rowColor'],
  },
}

/** Plot hosts that exist on the web but have no native lowering yet, with the reason. */
export const UNLOWERED_CHART_HOSTS: Readonly<Record<string, string>> = {
  OptionChart: 'the ECharts option facade is web-only',
  BoxplotChart: 'the boxplot host reduces raw samples per row (`fiveNumber`) on the web side; a native lowering is a follow-up',
}

/** The grammar host and its mark/config children — `<Plot>` desugars to `<PlotChart marks>` before the plot emit runs. */
export const GRAMMAR_CHART_HOST = 'Plot'
export const GRAMMAR_MARK_TAGS: Readonly<Record<string, string>> = { Bar: 'bars', Line: 'line', Area: 'area', Dot: 'points' }
export const GRAMMAR_CONFIG_TAGS: readonly string[] = ['Rule', 'Axis', 'Tip', 'Legend', 'Zoom', 'Label']
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
    tag === GRAMMAR_CHART_HOST ||
    Object.hasOwn(GRAMMAR_MARK_TAGS, tag) ||
    Object.hasOwn(GRAMMAR_FAMILY_TAGS, tag) ||
    GRAMMAR_CONFIG_TAGS.includes(tag)
  )
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
      const y = attrOf(child, 'y')
      if (y === undefined) {
        warn(`<${tag}>: needs a \`y\` channel; the mark is skipped on native.`)
        continue
      }
      const stack = flagOn(child, 'stack')
      const group = flagOn(child, 'group')
      const r = attrOf(child, 'r')
      const callee = tag === 'Bar' ? (stack ? 'stackedBars' : group ? 'groupedBars' : 'bars') : tag === 'Dot' && r !== undefined ? 'bubble' : markKind
      const fields: { name: string; value: ExprIR }[] = []
      for (const a of child.attrs) {
        if (a.kind !== 'attr' || ['y', 'r', 'stack', 'group'].includes(a.name)) continue
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
        if (flagOn(child, 'x')) {
          if (format !== undefined) attrs.push({ kind: 'attr', name: 'xFormat', value: format })
          if (flagOn(child, 'time')) attrs.push({ kind: 'attr', name: 'xTime', value: lit(true) })
          if (flagOn(child, 'hidden')) attrs.push({ kind: 'attr', name: 'showXAxis', value: lit(false) })
        } else if (flagOn(child, 'y2')) {
          if (format !== undefined) attrs.push({ kind: 'attr', name: 'y2Format', value: format })
          if (domain !== undefined) attrs.push({ kind: 'attr', name: 'y2Domain', value: domain })
        } else {
          if (format !== undefined) attrs.push({ kind: 'attr', name: 'format', value: format })
          if (flagOn(child, 'hidden')) attrs.push({ kind: 'attr', name: 'showYAxis', value: lit(false) })
        }
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
): Record<keyof typeof CHART_THEME_DEFAULT, string> {
  const out = {} as Record<keyof typeof CHART_THEME_DEFAULT, string>
  const named = namedChartTheme(v)
  // A named theme replaces the scope wholesale (as on the web, where a `theme`
  // prop is merged OVER the provider's — and a whole theme has every field).
  const base = named ?? scope ?? CHART_THEME_DEFAULT
  const palette = named === undefined ? chartThemePalette(v, tag, warn, base.palette as readonly string[]) : (named.palette as readonly string[])
  for (const f of CHART_THEME_FIELDS) {
    const d = base[f.name]
    out[f.name] = f.kind === 'strings' ? list(palette.map((c) => JSON.stringify(c))) : f.kind === 'number' ? (d as string) : JSON.stringify(d)
  }
  if (v === undefined || named !== undefined) return out
  if (v.kind !== 'object' || (v.spreads !== undefined && v.spreads.length > 0)) {
    warn(`<${tag} theme>: only an object literal with literal fields lowers on native; the default theme applies.`)
    return out
  }
  for (const f of v.fields) {
    const spec = CHART_THEME_FIELDS.find((x) => x.name === f.name)
    if (spec === undefined || spec.kind === 'strings') continue
    if (f.value.kind !== 'literal' || typeof f.value.value !== spec.kind) {
      warn(`<${tag} theme>: \`${f.name}\` must be a ${spec.kind} literal on native; its default applies.`)
      continue
    }
    out[spec.name] = spec.kind === 'number' ? chartDouble(f.value.value as number) : JSON.stringify(f.value.value)
  }
  return out
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

/** The heatmap's default ramp (`HEAT_RAMP`), inlined for the same reason. */
export const HEAT_RAMP_DEFAULT = ['#eff6ff', '#93c5fd', '#3b82f6', '#1e40af'] as const

/**
 * The shared canvas host's chrome props (canvas-host.tsx). On native, the
 * plot host draws the title and legend (the #3265 chrome emit); the family
 * hosts draw title, legend and a tap tooltip through the crossing `chrome.ts`;
 * and every host whose engine takes an entrance `progress` plays the same
 * cubic ease-out entrance the web host does (`PyreonChartEntrance`). What a
 * target does NOT draw MUST warn by name rather than drop silently.
 */
export const CHART_CHROME_PROPS: readonly string[] = ['showTitle', 'subtitle', 'showLegend', 'tooltip', 'animate', 'legendPosition', 'keyboard', 'updateAnimation', 'updateDuration', 'toolbox', 'onSaveImage', 'accessibleTable']
const CHROME_LOWERED: Readonly<Record<string, readonly string[]>> = {
  PlotChart: ['showTitle', 'subtitle', 'showLegend', 'tooltip', 'animate'],
  HeatmapChart: ['animate'],
  RadarChart: ['showLegend'],
}
/** Title + legend + tap tooltip — what the generic and accessor hosts draw natively through the crossing chrome. */
const FAMILY_CHROME: readonly string[] = ['showTitle', 'subtitle', 'showLegend', 'tooltip']
/**
 * Whether `<tag>`'s engine takes an entrance `progress` — the same set the web
 * canvas host tweens (`animates: true`). A host outside it (Pie, Radar,
 * Candlestick, Gauge) draws fully formed on EVERY target, so `animate` there
 * is inert rather than "not lowered yet".
 */
export function chartHostAnimates(tag: string): boolean {
  if (tag === 'PlotChart' || tag === 'HeatmapChart') return true
  const host = CHART_HOSTS[tag]
  if (host !== undefined) return host.optionsStruct !== undefined
  return ACCESSOR_CHART_HOSTS[tag]?.optionsStruct !== undefined
}
/** The chrome props `<tag>` does NOT lower — each present one warns. */
export function chartChromeUnlowered(tag: string): readonly string[] {
  const family = Object.hasOwn(CHART_HOSTS, tag) || Object.hasOwn(ACCESSOR_CHART_HOSTS, tag)
  const lowered = [...(CHROME_LOWERED[tag] ?? (family ? FAMILY_CHROME : [])), ...(family && chartHostAnimates(tag) ? ['animate'] : [])]
  return CHART_CHROME_PROPS.filter((p) => !lowered.includes(p))
}
/** The warning for a chrome prop `<tag>` carries but does not draw — `animate` on an engine with no entrance is inert everywhere, not a native gap. */
export function chartChromeWarning(tag: string, prop: string): string {
  if (prop === 'animate' && !chartHostAnimates(tag)) return `<${tag}>: \`animate\` has no effect on any target — its engine draws fully formed; the prop is ignored.`
  return `<${tag}>: \`${prop}\` is not lowered on native yet; the chart renders without it.`
}
/** The entrance duration — the theme's `enterMs` (a literal object or a named theme), else the default; the family hosts read nothing else off `theme`, so this never warns. */
export function chartEnterMs(theme: ExprIR | undefined, tag: string, list: (items: readonly string[]) => string, scope?: RawChartTheme): string {
  return chartThemeFields(theme, tag, () => {}, list, scope).enterMs
}
/** The resolved theme as emitted TEXT per field — what `chartThemeFields` returns. */
export type ChartThemeText = Record<keyof typeof CHART_THEME_DEFAULT, string>
/** The tooltip box from the theme — the web host's `tooltipStyle` (surface / grid / text, radius at least 4). */
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
export const FRAME_CHART_HOSTS: Readonly<Record<string, true>> = { GaugeChart: true, CandlestickChart: true, HeatmapChart: true, RadarChart: true, PlotChart: true }


// ---------------------------------------------------------------------------
// `<PlotChart marks>` — the cartesian family. A mark call (`bars((d) => d.v,
// { label })`) lowers to a `Series` whose values are the accessor inlined
// into a map over the rows; the spec is built inline and `renderChart` /
// `plotHitBars` do the rest. The constants below are the web host's own
// defaults (`resolveMarks`), inlined because the engine's are module-private.
// ---------------------------------------------------------------------------

/** Mark constructor → the `Series.kind` it produces. `bubble` carries a radius accessor and is declined by name. */
export const PLOT_MARK_KINDS: Readonly<Record<string, string>> = {
  bars: 'bars',
  stackedBars: 'stacked',
  groupedBars: 'grouped',
  line: 'line',
  area: 'area',
  points: 'points',
}

/** Mark options that lower as literal fields of `Series`, with their default when absent. */
export const PLOT_MARK_OPTION_FIELDS: ReadonlyArray<{ name: string; kind: 'string' | 'number' | 'boolean'; default?: string | number | boolean }> = [
  { name: 'color', kind: 'string' },
  { name: 'width', kind: 'number', default: 2 },
  { name: 'radius', kind: 'number', default: 3 },
  { name: 'label', kind: 'string' },
  { name: 'showValues', kind: 'boolean', default: false },
  { name: 'axis', kind: 'string' },
  { name: 'effect', kind: 'boolean' },
  { name: 'symbol', kind: 'string' },
  { name: 'symbolRepeat', kind: 'boolean' },
]

/**
 * `<PlotChart>` props with no native form YET — the web events/actions model
 * (a handle's signals, a pick-to-pin mode, the change callbacks). Each warns
 * BY NAME; the chart renders without it. Event props are matched against the
 * parser's lowercased event names, so `onHighlight` is found as `highlight`.
 */
export const PLOT_UNLOWERED_PROPS: readonly string[] = ['handle', 'selectedMode', 'onSelectChange', 'onHighlight', 'onLegendChange', 'emphasis', 'maxPoints', 'crosshair', 'link', 'keyboard', 'updateAnimation', 'updateDuration', 'seriesLabels', 'toolbox', 'onSaveImage', 'accessibleTable', 'legendPosition', 'yDomain']
