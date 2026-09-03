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

import type { ExprIR } from './types'

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
}

export interface ChartHostSpec {
  /** Required data props, in engine argument order. */
  readonly data: readonly string[]
  /** The options prop (an `XOptions` struct); optional. */
  readonly options: string
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
  a.options === t.nil ? t.nil : `${a.options}?.${field}`

export const CHART_HOSTS: Readonly<Record<string, ChartHostSpec>> = {
  SankeyChart: {
    data: ['nodes', 'links'],
    options: 'sankey',
    defaultHeight: 300,
    layout: (a, t) => {
      const box = t.rect(a.gutter, '8.0', t.max0(`${a.W} - ${a.gutter} * 2.0`), t.max0(`${a.H} - 16.0`))
      return `layoutSankey(${a.data[0]}, ${a.data[1]}, ${box}, ${a.options})`
    },
    render: (l, a) => `renderSankey(${l}, ${a.options})`,
    hit: (l, x, y) => `hitSankeyIndex(${l}, ${x}, ${y})`,
  },
  GraphChart: {
    data: ['nodes', 'links'],
    options: 'graph',
    defaultHeight: 300,
    layout: (a, t) => `layoutGraph(${a.data[0]}, ${a.data[1]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a, t) => `renderGraph(${l}, ${box00(a, t)}, ${a.options})`,
    hit: (l, x, y) => `hitGraphIndex(${l}, ${x}, ${y})`,
  },
  TreemapChart: {
    data: ['data'],
    options: 'treemap',
    defaultHeight: 300,
    layout: (a, t) => `layoutTreemap(${a.data[0]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a) => `renderTreemap(${l}, ${a.options})`,
    hit: (l, x, y) => `hitTreemapIndex(${l}, ${x}, ${y})`,
  },
  SunburstChart: {
    data: ['data'],
    options: 'sunburst',
    defaultHeight: 300,
    layout: (a, t) => {
      const outer = t.max0(`${t.min(a.W, a.H)} / 2.0 - 4.0`)
      return `layoutSunburst(${a.data[0]}, ${outer} * ${a.innerRatio}, ${outer}, ${a.options})`
    },
    render: (l, a, t) => `renderSunburst(${l}, ${t.pt(`${a.W} / 2.0`, `${a.H} / 2.0`)}, ${a.options})`,
    hit: (l, x, y, a, t) => `hitSunburstIndex(${l}, ${t.pt(`${a.W} / 2.0`, `${a.H} / 2.0`)}, ${x}, ${y})`,
  },
  TreeChart: {
    data: ['data'],
    options: 'tree',
    defaultHeight: 300,
    layout: (a, t) => `layoutTree(${a.data[0]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a) => `renderTree(${l}, ${a.options})`,
    hit: (l, x, y, a, t) => `hitTreeIndex(${l}, ${x}, ${y}, ${optField(a, t, 'symbolSize')})`,
  },
  RiverChart: {
    data: ['series'],
    options: 'river',
    defaultHeight: 300,
    layout: (a, t) => `layoutRiver(${a.data[0]}, ${t.rect('8.0', '8.0', t.max0(`${a.W} - 16.0`), t.max0(`${a.H} - 16.0`))}, ${a.options})`,
    render: (l, a) => `renderRiver(${l}, ${a.options})`,
    hit: (l, x, y, a, t) => `hitRiverIndex(${l}, ${x}, ${y}, ${optField(a, t, 'curve')})`,
  },
  GanttChart: {
    data: ['tasks'],
    options: 'gantt',
    defaultHeight: 320,
    layout: (a, t) => `layoutGantt(${a.data[0]}, ${t.rect('4.0', '4.0', `${a.W} - 8.0`, `${a.H} - 8.0`)}, ${a.options})`,
    render: (l, a) => `renderGantt(${l}, ${a.options})`,
    hit: (l, x, y) => `hitGanttIndex(${l}, ${x}, ${y})`,
  },
  PolarChart: {
    data: ['axes', 'series'],
    options: 'polar',
    defaultHeight: 300,
    layout: (a, t) => `layoutPolar(${a.data[0]}, ${a.data[1]}, ${box00(a, t)}, ${a.options})`,
    render: (l, a) => `renderPolar(${l}, ${a.options})`,
    hit: (l, x, y) => `hitPolarIndex(${l}, ${x}, ${y})`,
  },
  CalendarChart: {
    data: ['start', 'end', 'values'],
    options: 'calendar',
    defaultHeight: 140,
    layout: (a, t) => `layoutCalendar(${a.data[0]}, ${a.data[1]}, ${t.rect('4.0', '4.0', `${a.W} - 8.0`, `${a.H} - 8.0`)}, ${a.options})`,
    render: (l, a) => `renderCalendar(${l}, ${a.data[2]}, ${a.options})`,
    hit: (l, x, y) => `hitCalendarIndex(${l}, ${x}, ${y})`,
    adapt: { values: calendarValuesAdapter },
  },
  ParallelChart: {
    data: ['axes', 'rows'],
    options: 'parallel',
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
}

/** Whether a JSX tag is a `@pyreon/charts/plot` host, lowered or not. */
export function isChartHostTag(tag: string): boolean {
  return Object.hasOwn(CHART_HOSTS, tag) || Object.hasOwn(ACCESSOR_CHART_HOSTS, tag) || Object.hasOwn(FRAME_CHART_HOSTS, tag) || Object.hasOwn(UNLOWERED_CHART_HOSTS, tag)
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
  readonly defaultHeight: number
  /** Builds the draw-list expression from the mapped items. */
  readonly render: (items: string, a: ChartHostArgs, t: ChartHostTarget) => string
  /** Builds the index-hit expression for a tap at (x, y). */
  readonly hit: (items: string, x: string, y: string, a: ChartHostArgs, t: ChartHostTarget) => string
}

/** The palette the web Funnel / Pie hosts colour unaccessored rows with. */
export const CHART_HOST_PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed'] as const

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
    defaultHeight: 240,
    render: (items, a, t) => `renderFunnel(${items}, ${t.rect('8.0', '8.0', `${a.W} - 16.0`, `${a.H} - 16.0`)}, ${a.options})`,
    hit: (items, x, y, a, t) => `hitFunnel(${items}, ${t.rect('8.0', '8.0', `${a.W} - 16.0`, `${a.H} - 16.0`)}, ${x}, ${y}, ${a.options})`,
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
  },
}

/** The web hosts' default `ChartTheme` — inlined because the engine's own `defaultTheme` is module-private in both targets. */
export const CHART_THEME_DEFAULT = { axis: '#8496a5', grid: 'rgba(132,150,165,0.18)', label: '#5a6b7a', fontSize: '11.0' } as const

/** The heatmap's default ramp (`HEAT_RAMP`), inlined for the same reason. */
export const HEAT_RAMP_DEFAULT = ['#eff6ff', '#93c5fd', '#3b82f6', '#1e40af'] as const

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

/** PlotChart props that change what is DRAWN and have no native lowering yet — reported by name when present. */
// Every PlotChart prop lowers now; the list stays as the mechanism (a new prop
// lands here first and warns by name until it crosses).
export const PLOT_UNLOWERED_PROPS: readonly string[] = []
