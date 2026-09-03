// `@pyreon/charts/plot` family hosts on native — the table both emitters lower
// from.
//
// Every plot family's GEOMETRY is generated into the native runtimes
// (PyreonChartEngine.swift / .kt, see gen-chart-engine.ts), and both runtimes
// ship `PyreonChartCanvas`, a Canvas that walks the engine's flat draw list.
// What was missing was the HOST: on the web `<SankeyChart nodes links>` is a
// component that lays out into its canvas element; natively that component
// does not exist. This table says, per host, which props are the engine's
// data arguments, which prop is the options struct, and how the draw list is
// built from them — the same box arithmetic the web host uses, so a chart
// lays out identically on all three targets for the same size.
//
// The hosts NOT here take accessor callbacks (`value={(d) => d.total}`),
// records, mixed-type rows or marks — shapes with no native form. They warn
// BY NAME (`UNLOWERED_CHART_HOSTS`) rather than falling through to the generic
// component emit, which would name a SwiftUI/Compose view that does not exist.

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
  /** Builds the `[PyreonDrawCmd]` expression. */
  readonly cmds: (a: ChartHostArgs, t: ChartHostTarget) => string
}

const box00 = (a: ChartHostArgs, t: ChartHostTarget): string => t.rect('0.0', '0.0', a.W, a.H)

export const CHART_HOSTS: Readonly<Record<string, ChartHostSpec>> = {
  SankeyChart: {
    data: ['nodes', 'links'],
    options: 'sankey',
    defaultHeight: 300,
    cmds: (a, t) => {
      const box = t.rect(a.gutter, '8.0', t.max0(`${a.W} - ${a.gutter} * 2.0`), t.max0(`${a.H} - 16.0`))
      return `renderSankey(layoutSankey(${a.data[0]}, ${a.data[1]}, ${box}, ${a.options}), ${a.options})`
    },
  },
  GraphChart: {
    data: ['nodes', 'links'],
    options: 'graph',
    defaultHeight: 300,
    cmds: (a, t) => `renderGraph(layoutGraph(${a.data[0]}, ${a.data[1]}, ${box00(a, t)}, ${a.options}), ${box00(a, t)}, ${a.options})`,
  },
  TreemapChart: {
    data: ['data'],
    options: 'treemap',
    defaultHeight: 300,
    cmds: (a, t) => `renderTreemap(layoutTreemap(${a.data[0]}, ${box00(a, t)}, ${a.options}), ${a.options})`,
  },
  SunburstChart: {
    data: ['data'],
    options: 'sunburst',
    defaultHeight: 300,
    cmds: (a, t) => {
      const outer = t.max0(`${t.min(a.W, a.H)} / 2.0 - 4.0`)
      return `renderSunburst(layoutSunburst(${a.data[0]}, ${outer} * ${a.innerRatio}, ${outer}, ${a.options}), ${t.pt(`${a.W} / 2.0`, `${a.H} / 2.0`)}, ${a.options})`
    },
  },
  TreeChart: {
    data: ['data'],
    options: 'tree',
    defaultHeight: 300,
    cmds: (a, t) => `renderTree(layoutTree(${a.data[0]}, ${box00(a, t)}, ${a.options}), ${a.options})`,
  },
  RiverChart: {
    data: ['series'],
    options: 'river',
    defaultHeight: 300,
    cmds: (a, t) => `renderRiver(layoutRiver(${a.data[0]}, ${t.rect('8.0', '8.0', t.max0(`${a.W} - 16.0`), t.max0(`${a.H} - 16.0`))}, ${a.options}), ${a.options})`,
  },
  GanttChart: {
    data: ['tasks'],
    options: 'gantt',
    defaultHeight: 320,
    cmds: (a, t) => `renderGantt(layoutGantt(${a.data[0]}, ${t.rect('4.0', '4.0', `${a.W} - 8.0`, `${a.H} - 8.0`)}, ${a.options}), ${a.options})`,
  },
  PolarChart: {
    data: ['axes', 'series'],
    options: 'polar',
    defaultHeight: 300,
    cmds: (a, t) => `renderPolar(layoutPolar(${a.data[0]}, ${a.data[1]}, ${box00(a, t)}, ${a.options}), ${a.options})`,
  },
}

/** Plot hosts that exist on the web but have no native lowering yet, with the reason. */
export const UNLOWERED_CHART_HOSTS: Readonly<Record<string, string>> = {
  PlotChart: 'its `marks` are accessor closures over your rows (`bars((d) => d.total)`); natively, build a `ChartSpec` and call `renderChart` yourself',
  PieChart: 'its `value` / `label` props are accessor closures; call `renderPie` over `Slice[]` yourself',
  GaugeChart: 'call `renderGauge(value, box, options)` yourself',
  RadarChart: 'its `value` prop is an accessor closure; call `renderRadar` yourself',
  FunnelChart: 'its `value` / `label` props are accessor closures; build `FunnelStage[]` and call `renderFunnel` yourself',
  HeatmapChart: 'its `x` / `y` / `value` props are accessor closures; call `buildHeatGrid` + `renderHeat` yourself',
  CandlestickChart: 'its `open` / `high` / `low` / `close` props are accessor closures; call `renderCandles` over `Ohlc[]` yourself',
  CalendarChart: 'its `values` prop is a record; natively pass a `CalendarValue[]` to `renderCalendar` yourself',
  ParallelChart: 'its rows mix strings and nulls; natively pass numeric rows to `layoutParallel` yourself',
  OptionChart: 'the ECharts option facade is web-only',
}

/** Whether a JSX tag is a `@pyreon/charts/plot` host, lowered or not. */
export function isChartHostTag(tag: string): boolean {
  return Object.hasOwn(CHART_HOSTS, tag) || Object.hasOwn(UNLOWERED_CHART_HOSTS, tag)
}

/** A Double literal the way both targets accept it (`240` → `240.0`). */
export function chartDouble(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : `${n}`
}
