// Draw-list goldens: every family's SVG for a fixed dataset, committed under
// `__goldens__/` and compared byte-for-byte.
//
// Why draw lists and not pixels: the SVG string IS the draw list (the engine's
// `renderSvg` walks the same `DrawCmd[]` the canvases paint), it is
// deterministic across platforms (`measureApprox`, rounded coordinates,
// normalised negative zero — see svg.ts), and a diff names the command that
// moved. A pixel baseline captured on macOS drifts against ubuntu's font
// anti-aliasing and Chromium's version, so it would either flake or need a
// tolerance wide enough to miss the regressions it exists for. What pixels
// prove — that the executors paint what the list says — the real-Chromium
// suites assert per host with inked-pixel and checksum comparisons.
//
// Updating: `bunx vitest run src/engine/goldens.test.ts -u` after an
// INTENTIONAL geometry change, and read the diff of the golden in review.
import { describe, expect, it } from 'vitest'
import { chartToSvg } from './svg-chart'
import { area, bars, line, points, stackedBars } from './marks'
import {
  calendarToSvg, candlestickToSvg, funnelToSvg, ganttToSvg, gaugeToSvg, graphToSvg, heatmapToSvg, parallelToSvg,
  pieToSvg, polarToSvg, radarToSvg, riverToSvg, sankeyToSvg, sunburstToSvg, treeToSvg, treemapToSvg,
} from './family-svg'
import { boxplotToSvg } from './boxplot-svg'
import { geoToSvg } from './geo-web'
import type { GeoJson } from './geo-web'
import type { TreeNode } from './treemap'

interface Row { month: string; revenue: number; cost: number }
const ROWS: Row[] = [
  { month: 'Jan', revenue: 120, cost: 80 },
  { month: 'Feb', revenue: 90, cost: 70 },
  { month: 'Mar', revenue: 160, cost: 95 },
  { month: 'Apr', revenue: 140, cost: 100 },
]
const TREE: TreeNode[] = [{ name: 'docs', value: 30 }, { name: 'src', children: [{ name: 'core', value: 50 }, { name: 'ui', value: 20 }] }]
// Two squares side by side plus a MULTIPOLYGON of two smaller ones — the same
// shape `geo.test.ts` uses, so the golden exercises both geometry kinds. That
// matters here specifically: `Polygon` and `MultiPolygon` are the union that
// the normalisation in #3411 collapses, and this is the only golden that would
// notice if that reduction started dropping one of them.
const WORLD: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'West' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'East' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
    { type: 'Feature', properties: { name: 'Isles' }, geometry: { type: 'MultiPolygon', coordinates: [[[[0, 12], [2, 12], [2, 14], [0, 14], [0, 12]]], [[[18, 12], [20, 12], [20, 14], [18, 14], [18, 12]]]] } },
  ],
}

const SIZE = { width: 480, height: 280 }

const GOLDENS: Record<string, () => string> = {
  'plot-bars-line': () => chartToSvg({ data: ROWS, marks: [bars<Row>((d) => d.revenue, { label: 'Revenue' }), line<Row>((d) => d.cost, { label: 'Cost', dash: [4, 2] })], x: (d) => d.month, title: 'Revenue', ...SIZE }),
  'plot-area-points': () => chartToSvg({ data: ROWS, marks: [area<Row>((d) => d.revenue), points<Row>((d) => d.cost)], x: (d) => d.month, ...SIZE }),
  'plot-stacked': () => chartToSvg({ data: ROWS, marks: [stackedBars<Row>((d) => d.revenue), stackedBars<Row>((d) => d.cost)], x: (d) => d.month, ...SIZE }),
  'plot-horizontal': () => chartToSvg({ data: ROWS, marks: [bars<Row>((d) => d.revenue)], x: (d) => d.month, horizontal: true, ...SIZE }),
  'plot-horizontal-stacked': () => chartToSvg({ data: ROWS, marks: [stackedBars<Row>((d) => d.revenue), stackedBars<Row>((d) => d.cost)], x: (d) => d.month, horizontal: true, ...SIZE }),
  'plot-annotated': () => chartToSvg({ data: ROWS, marks: [bars<Row>((d) => d.revenue)], x: (d) => d.month, annotations: [{ y: 100, label: 'goal' }, { yFrom: 130, yTo: 150 }], ...SIZE }),
  pie: () => pieToSvg({ data: ROWS, value: (d) => d.revenue, label: (d) => d.month, innerRadius: 0.5, showLabels: true, ...SIZE }),
  gauge: () => gaugeToSvg({ value: 0.72, max: 1, showValue: true, ...SIZE }),
  radar: () => radarToSvg({ data: ROWS, axes: [{ label: 'a', max: 200 }, { label: 'b', max: 200 }, { label: 'c', max: 200 }], values: (d) => [d.revenue, d.cost, d.revenue - d.cost], label: (d) => d.month, ...SIZE }),
  candlestick: () => candlestickToSvg({ data: ROWS, open: (d) => d.cost, high: (d) => d.revenue + 10, low: (d) => d.cost - 10, close: (d) => d.revenue, x: (d) => d.month, ...SIZE }),
  heatmap: () => heatmapToSvg({ data: ROWS, x: (d) => d.month, y: (d) => (d.revenue > 100 ? 'hi' : 'lo'), value: (d) => d.cost, ...SIZE }),
  funnel: () => funnelToSvg({ data: ROWS, value: (d) => d.revenue, label: (d) => d.month, ...SIZE }),
  treemap: () => treemapToSvg({ data: TREE, ...SIZE }),
  sunburst: () => sunburstToSvg({ data: TREE, ...SIZE }),
  tree: () => treeToSvg({ data: TREE, ...SIZE }),
  river: () => riverToSvg({ series: [{ name: 'a', values: [1, 3, 2, 4] }, { name: 'b', values: [2, 1, 3, 1] }], ...SIZE }),
  polar: () => polarToSvg({ axes: { categories: ['a', 'b', 'c'] }, series: [{ name: 'x', kind: 'bar', values: [1, 2, 3] }, { name: 'y', kind: 'line', values: [3, 1, 2] }], ...SIZE }),
  sankey: () => sankeyToSvg({ nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], links: [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 3 }, { source: 'a', target: 'c', value: 2 }], ...SIZE }),
  graph: () => graphToSvg({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], links: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'd' }, { source: 'd', target: 'a' }], ...SIZE }),
  calendar: () => calendarToSvg({ start: '2024-01-01', end: '2024-02-11', values: { '2024-01-03': 3, '2024-01-10': 7, '2024-01-17': 1, '2024-02-02': 5 }, ...SIZE }),
  gantt: () => ganttToSvg({ tasks: [{ id: '1', name: 'Design', start: '2024-01-01', end: '2024-01-10', progress: 0.5 }, { id: '2', name: 'Build', start: '2024-01-08', end: '2024-01-20' }, { id: '3', name: 'Ship', start: '2024-01-20' }], ...SIZE }),
  parallel: () => parallelToSvg({ axes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], rows: [[1, 10, 5], [2, 20, 3], [3, 30, 9]], ...SIZE }),
  boxplot: () => boxplotToSvg({ data: [{ g: 'A', obs: [1, 2, 3, 4, 5] }, { g: 'B', obs: [3, 5, 7, 9, 40] }], values: (d) => d.obs, x: (d) => d.g, ...SIZE }),
  // `map` was the only family host without a golden. One region deliberately
  // has NO value, so the ramp AND the no-data fill are both in the output.
  map: () => geoToSvg({ geo: WORLD, values: { West: 10, East: 40 }, ...SIZE }),
}

describe('draw-list goldens (SVG per family)', () => {
  it.each(Object.keys(GOLDENS))('%s matches its golden', async (name) => {
    const svg = GOLDENS[name]!()
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toContain('NaN')
    await expect(svg).toMatchFileSnapshot(`./__goldens__/${name}.svg`)
  })
  it('the goldens are deterministic — a second render is byte-identical', () => {
    for (const [name, make] of Object.entries(GOLDENS)) expect(make(), name).toBe(make())
  })
})
