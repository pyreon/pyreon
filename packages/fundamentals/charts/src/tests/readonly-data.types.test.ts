// Chart data props rejected `readonly` arrays (#4321, the class of #4319).
//
// Every family typed its dataset `T[] | (() => T[])` (and its fixed-shape
// inputs `TreeNode[]`, `GanttTask[]`, …), so immutable data — a `readonly X[]`
// prop, an `as const` literal, an accessor returning `readonly X[]` — failed
// with "The type 'readonly X[]' is 'readonly' and cannot be assigned to the
// mutable type 'X[]'". The engine only READS these arrays, so the public props,
// the `/svg` options and the nested arrays of their element types (a tree's
// `children`, a task's `dependencies`, a series' `values`, an axis'
// `categories`, a parallel row) are `readonly`. Mutable arrays still assign.
//
// The first block is TYPE assertions: this file failing to typecheck IS the
// failure (`tsc --noEmit` covers src/tests). The second block renders DEEPLY
// FROZEN data through the `/svg` renderers, which share the engine with the
// canvas hosts: an engine write into a caller's array would throw here.

import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  BoxplotChartProps,
  CandlestickChartProps,
  ChordChartProps,
  FunnelChartProps,
  GanttChartProps,
  GraphChartProps,
  HeatmapChartProps,
  MapChartProps,
  ParallelChartProps,
  PieChartProps,
  PlotChartProps,
  PolarChartProps,
  RadarChartProps,
  RiverChartProps,
  SankeyChartProps,
  SingleAxisChartProps,
  SunburstChartProps,
  TreeChartProps,
  TreemapChartProps,
} from '../engine'
import type { ChartProps } from '../engine/grammar'
import { line } from '../engine/marks'
import {
  chartToSvg,
  ganttToSvg,
  parallelToSvg,
  pieToSvg,
  polarToSvg,
  riverToSvg,
  treemapToSvg,
} from '../svg'

interface Row {
  month: string
  sales: number
}

const rows = [
  { month: 'Jan', sales: 3 },
  { month: 'Feb', sales: 5 },
] as const satisfies readonly Row[]

const readonlyRows: readonly Row[] = rows
const readRows = (): readonly Row[] => readonlyRows
const mutableRows: Row[] = [{ month: 'Mar', sales: 2 }]

const tree = [
  { name: 'root', children: [{ name: 'a', value: 2 }, { name: 'b', value: 3 }] },
] as const

const tasks = [
  { id: 'a', name: 'Design', start: '2024-01-01', end: '2024-01-10' },
  { id: 'b', name: 'Build', start: '2024-01-08', end: '2024-01-20', dependencies: ['a'] },
] as const

const polarSeries = [{ name: 's', kind: 'bar', values: [1, 2, 3] }] as const
const polarAxes = { categories: ['x', 'y', 'z'] } as const
const riverSeries = [{ name: 'r', values: [1, 2] }] as const
const parallelAxes = [{ name: 'size' }, { name: 'kind', type: 'category', categories: ['s', 'm'] }] as const
const parallelRows = [[1, 's'], [2, 'm']] as const

describe('chart props accept readonly data (#4321) — type level', () => {
  it('row-data families take readonly arrays, `as const` and readonly accessors', () => {
    const value = (d: Row): number => d.sales
    const label = (d: Row): string => d.month
    expectTypeOf(rows).toExtend<PieChartProps<Row>['data']>()
    expectTypeOf(readRows).toExtend<PieChartProps<Row>['data']>()
    expectTypeOf(mutableRows).toExtend<PieChartProps<Row>['data']>()
    const pie: PieChartProps<Row> = { data: rows, value, label }
    const funnel: FunnelChartProps<Row> = { data: readRows, value, label }
    const radar: RadarChartProps<Row> = { data: rows, axes: [{ label: 'sales', max: 10 }] as const, values: (d) => [d.sales], label }
    const heat: HeatmapChartProps<Row> = { data: rows, x: label, y: label, value, colors: ['#fff', '#000'] as const }
    const box: BoxplotChartProps<Row> = { data: readonlyRows, values: (d) => [d.sales] }
    const candle: CandlestickChartProps<Row> = { data: rows, open: value, high: value, low: value, close: value }
    const plot: PlotChartProps<Row> = {
      data: rows,
      marks: [line<Row>((d) => d.sales)] as const,
      seriesLabels: ['Sales'] as const,
      zoomPresets: [{ label: 'All', count: 2 }] as const,
    }
    const grammar: Pick<ChartProps<Row>, 'data'> = { data: readRows }
    expect([pie, funnel, radar, heat, box, candle, plot, grammar]).toHaveLength(8)
  })

  it('fixed-shape families take readonly arrays down to their nested arrays', () => {
    const treemap: TreemapChartProps = { data: tree }
    const sunburst: SunburstChartProps = { data: () => tree }
    const treeChart: TreeChartProps = { data: tree }
    const gantt: GanttChartProps = { tasks }
    const polar: PolarChartProps = { axes: polarAxes, series: polarSeries }
    const river: RiverChartProps = { series: riverSeries }
    const parallel: ParallelChartProps = { axes: parallelAxes, rows: parallelRows }
    const sankey: SankeyChartProps = { nodes: [{ name: 'a' }, { name: 'b' }] as const, links: [{ source: 'a', target: 'b', value: 1 }] as const }
    const graph: GraphChartProps = { nodes: [{ id: 'a' }] as const, links: [] as const }
    const chord: ChordChartProps = { nodes: [{ name: 'a' }] as const, links: [] as const }
    const single: SingleAxisChartProps = { axis: { type: 'value' }, points: [{ x: 1 }] as const }
    const map: MapChartProps = { map: [] as const, values: [{ region: 'a', value: 1 }] as const, points: [] as const }
    expect([treemap, sunburst, treeChart, gantt, polar, river, parallel, sankey, graph, chord, single, map]).toHaveLength(12)
  })
})

/** Freeze a value and everything reachable from it, so any engine write throws. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }

  return value
}

describe('the engine never writes into caller data (#4321) — runtime', () => {
  it('renders deeply frozen datasets through every widened path', () => {
    const frozenRows = deepFreeze([...rows.map((r) => ({ ...r }))])
    const out = [
      chartToSvg<Row>({ data: frozenRows, marks: deepFreeze([line<Row>((d) => d.sales)]), x: (d) => d.month }),
      pieToSvg<Row>({ data: frozenRows, value: (d) => d.sales, label: (d) => d.month }),
      treemapToSvg({ data: deepFreeze(structuredClone(tree)) }),
      ganttToSvg({ tasks: deepFreeze(structuredClone(tasks)) }),
      polarToSvg({ axes: deepFreeze(structuredClone(polarAxes)), series: deepFreeze(structuredClone(polarSeries)) }),
      riverToSvg({ series: deepFreeze(structuredClone(riverSeries)) }),
      parallelToSvg({ axes: deepFreeze(structuredClone(parallelAxes)), rows: deepFreeze(structuredClone(parallelRows)) }),
    ]
    for (const svg of out) expect(svg.startsWith('<svg')).toBe(true)
  })
})
