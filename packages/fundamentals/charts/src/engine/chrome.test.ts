// The crossing chrome: legend entries and tooltip lines per family, and the
// tooltip box as draw commands. Every function here is what the web host AND
// the native emit call, so the assertions are about the CONTRACT (which entry,
// which line, empty on a miss) rather than about any one host.
import { describe, expect, it } from 'vitest'
import { layoutArcs } from './arc'
import { layoutCalendar } from './calendar'
import {
  calendarTip,
  funnelLegend,
  funnelTip,
  ganttTip,
  graphTip,
  pieLegend,
  pieTip,
  polarLegend,
  polarTip,
  renderTooltip,
  riverLegend,
  riverTip,
  sankeyLegend,
  sankeyTip,
  sunburstLegend,
  sunburstTip,
  treeLegend,
  treeTip,
  treemapLegend,
  treemapTip,
} from './chrome'
import { layoutFunnel } from './funnel'
import { layoutGantt } from './gantt'
import { layoutGraph } from './graph'
import { layoutPolar } from './polar'
import { layoutRiver } from './river'
import { layoutSankey } from './sankey'
import { layoutSunburst } from './sunburst'
import { layoutTree } from './tree'
import { layoutTreemap } from './treemap'
import type { TreeNode } from './treemap'

const measure = (t: string, size: number) => t.length * size * 0.6
const BOX = { x: 0, y: 0, w: 400, h: 300 }
const TREE: TreeNode[] = [
  { name: 'src', children: [{ name: 'core', value: 50 }, { name: 'ui', value: 20 }] },
  { name: 'docs', value: 30 },
]

describe('legends — one entry per top-level item, coloured like the plot', () => {
  it('treemap / sunburst / tree list the ROOT level only', () => {
    const cells = layoutTreemap(TREE, BOX)
    expect(treemapLegend(cells).map((e) => e.label)).toEqual(['src', 'docs'])
    const arcs = layoutSunburst(TREE, 20, 100)
    expect(sunburstLegend(arcs).map((e) => e.label)).toEqual(['src', 'docs'])
    const tree = layoutTree(TREE, BOX)
    expect(treeLegend(tree).map((e) => e.label)).toEqual(['src', 'docs'])
    for (const e of treemapLegend(cells)) expect(e.color).toMatch(/^#|^rgb|^hsl/)
  })
  it('river / sankey / funnel / pie list every layer, node, stage, slice', () => {
    const river = layoutRiver([{ name: 'a', values: [1, 2] }, { name: 'b', values: [2, 1] }], BOX)
    expect(riverLegend(river).map((e) => e.label)).toEqual(['a', 'b'])
    const sankey = layoutSankey([{ name: 'coal' }, { name: 'power' }], [{ source: 'coal', target: 'power', value: 5 }], BOX)
    expect(sankeyLegend(sankey).map((e) => e.label)).toEqual(['coal', 'power'])
    expect(funnelLegend([{ value: 3, label: 'visit', color: '#111' }]).map((e) => e.label)).toEqual(['visit'])
    expect(pieLegend([{ value: 1, label: 'x', color: '#222' }])).toEqual([{ label: 'x', color: '#222' }])
  })
  it('polar takes an unset series colour from the palette slot', () => {
    const entries = polarLegend([{ name: 'a', kind: 'bar', values: [1] }, { name: 'b', kind: 'line', values: [2], color: '#abc' }], ['#111', '#222'])
    expect(entries).toEqual([{ label: 'a', color: '#111' }, { label: 'b', color: '#abc' }])
  })
})

describe('tooltips — the lines for a hit, an EMPTY list for a miss', () => {
  it('treemap: name + value on a cell, nothing off the box', () => {
    const cells = layoutTreemap(TREE, BOX)
    const leaf = cells.find((c) => c.name === 'core')!
    expect(treemapTip(cells, leaf.rect.x + 1, leaf.rect.y + 1)).toEqual(['core', '50'])
    expect(treemapTip(cells, -10, -10)).toEqual([])
  })
  it('sunburst: name + value on an arc', () => {
    const arcs = layoutSunburst(TREE, 20, 100)
    const a = arcs.find((x) => x.name === 'docs')!
    const mid = (a.start + a.end) / 2
    const r = (a.innerR + a.outerR) / 2
    expect(sunburstTip(arcs, { x: 0, y: 0 }, Math.cos(mid) * r, Math.sin(mid) * r)).toEqual(['docs', '30'])
    expect(sunburstTip(arcs, { x: 0, y: 0 }, 500, 500)).toEqual([])
  })
  it('tree: a leaf reports its value, a parent only its name', () => {
    const tree = layoutTree(TREE, BOX)
    const leaf = tree.nodes.find((n) => n.name === 'core')!
    expect(treeTip(tree, leaf.at.x, leaf.at.y)).toEqual(['core', '50'])
    const root = tree.nodes.find((n) => n.name === 'src')!
    expect(treeTip(tree, root.at.x, root.at.y)).toEqual(['src'])
    expect(treeTip(tree, -100, -100)).toEqual([])
  })
  it('river and sankey name the layer / node, and a link reads from → to', () => {
    const river = layoutRiver([{ name: 'a', values: [1, 2] }, { name: 'b', values: [2, 1] }], BOX)
    const l = river.layers[0]!
    const p = l.top[0]!
    expect(riverTip(river, p.x + 1, (p.y + l.bottom[0]!.y) / 2)).toEqual(['a'])
    const sankey = layoutSankey([{ name: 'coal' }, { name: 'power' }], [{ source: 'coal', target: 'power', value: 5 }], BOX)
    const n = sankey.nodes[0]!
    expect(sankeyTip(sankey, n.rect.x + 1, n.rect.y + 1)).toEqual(['coal', '5'])
    expect(sankeyTip(sankey, -5, -5)).toEqual([])
  })
  it('graph: name (+ value when set); gantt: task + duration', () => {
    const g = layoutGraph([{ id: 'a', value: 3 }, { id: 'b' }], [{ source: 'a', target: 'b' }], BOX, { layout: 'circular' })
    const a = g.nodes.find((n) => n.id === 'a')!
    expect(graphTip(g, a.at.x, a.at.y)).toEqual(['a', '3'])
    const b = g.nodes.find((n) => n.id === 'b')!
    expect(graphTip(g, b.at.x, b.at.y)).toEqual(['b'])
    const gantt = layoutGantt([{ id: 't', name: 'Design', start: '2024-03-01', end: '2024-03-10' }], BOX)
    const row = gantt.rows[0]!
    expect(ganttTip(gantt, row.rect.x + 1, row.rect.y + 1)).toEqual(['Design', '9 days'])
  })
  it('polar: a sector reports the series name + value', () => {
    const series = [{ name: 'a', kind: 'bar' as const, values: [3, 4] }]
    const layout = layoutPolar({ categories: ['x', 'y'] }, series, BOX)
    const s = layout.sectors[0]!
    const mid = (s.start + s.end) / 2
    const r = (s.innerR + s.outerR) / 2
    expect(polarTip(layout, series, layout.center.x + Math.cos(mid) * r, layout.center.y + Math.sin(mid) * r)).toEqual(['a', '3'])
  })
  it('calendar: date + value when recorded, date alone otherwise', () => {
    const layout = layoutCalendar('2024-03-01', '2024-03-07', BOX)
    const c = layout.cells[1]!
    expect(calendarTip(layout, [{ date: c.date, value: 4 }], c.rect.x + 1, c.rect.y + 1)).toEqual([c.date, '4'])
    expect(calendarTip(layout, [], c.rect.x + 1, c.rect.y + 1)).toEqual([c.date])
  })
  it('funnel + pie: label + value, the pie with its share of the whole', () => {
    const stages = [{ value: 4, label: 'visit', color: '#111' }, { value: 1, label: 'buy', color: '#222' }]
    const plot = { x: 8, y: 8, w: 384, h: 284 }
    const g = layoutFunnel(stages, plot)[0]!
    expect(funnelTip(stages, plot, plot.x + plot.w / 2, (g.top + g.bottom) / 2)).toEqual(['visit', '4'])
    const slices = [{ value: 3, label: 'a', color: '#111' }, { value: 1, label: 'b', color: '#222' }]
    const arc = layoutArcs(slices)[0]!
    const mid = (arc.start + arc.end) / 2
    expect(pieTip(slices, BOX, 0, BOX.w / 2 + Math.cos(mid) * 60, BOX.h / 2 + Math.sin(mid) * 60)).toEqual(['a', '3 (75%)'])
    expect(pieTip(slices, BOX, 0, -1, -1)).toEqual([])
  })
})

describe('renderTooltip — a rounded box, a border and one text per line, placed inside the bounds', () => {
  const opts = { fontSize: 11, fill: '#fff', border: '#ccc', text: '#111', pad: 8, radius: 4 }
  it('draws nothing for no lines', () => {
    expect(renderTooltip([], { x: 10, y: 10 }, BOX, opts, measure)).toEqual([])
  })
  it('sizes the box from the widest line and flips left at the right edge', () => {
    const near = renderTooltip(['abc', 'a much longer line'], { x: 10, y: 10 }, BOX, opts, measure)
    expect(near[0]!.kind).toBe('rect')
    expect(near.filter((c) => c.kind === 'text')).toHaveLength(2)
    const rect = near[0]!.kind === 'rect' ? near[0]!.rect : null
    expect(rect!.x).toBe(22)
    expect(rect!.w).toBeCloseTo(measure('a much longer line', 11) + 16)
    const far = renderTooltip(['abc'], { x: 395, y: 10 }, BOX, opts, measure)
    const fr = far[0]!.kind === 'rect' ? far[0]!.rect : null
    expect(fr!.x + fr!.w).toBeLessThanOrEqual(395)
  })
})
