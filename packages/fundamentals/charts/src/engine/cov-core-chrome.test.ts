// The crossing tooltip functions on the input each guard exists for: a point
// that hits NOTHING (an empty line list is the miss convention), an endpoint
// the layout does not name, a calendar day with values recorded for OTHER
// days, and a pie whose slices total zero. Paired with a hit in the same
// spec, so a guard that stopped firing changes the answer.
import { describe, expect, it } from 'vitest'
import { layoutArcs } from './arc'
import { layoutCalendar } from './calendar'
import { layoutChord } from './chord'
import type { GeoJson } from './geo-web'
import { layoutGantt } from './gantt'
import { layoutGeo } from './geo-web'
import { layoutGraph } from './graph'
import { layoutPolar } from './polar'
import { layoutRiver } from './river'
import { layoutSankey } from './sankey'
import { layoutSunburst } from './sunburst'
import { layoutTree } from './tree'
import { layoutTreemap } from './treemap'
import { layoutFunnel } from './funnel'
import {
  calendarTip,
  chordLegend,
  chordTip,
  funnelTip,
  ganttTip,
  geoTip,
  graphTip,
  pieTip,
  polarTip,
  renderTooltip,
  riverTip,
  sankeyTip,
  sunburstTip,
  treeTip,
  treemapTip,
} from './chrome'
import type { TreeNode } from './treemap'

const BOX = { x: 0, y: 0, w: 400, h: 300 }
const TREE: TreeNode[] = [{ name: 'src', children: [{ name: 'core', value: 50 }] }, { name: 'docs', value: 30 }]
const measure = (t: string, size: number) => t.length * size * 0.6

// NOTE: `treeTip`'s and `graphTip`'s `n.value ?? 0.0` cannot take their right
// arm — each sits one line after an `if (n.value === undefined) return [n.name]`
// guard. The coalesce is there for the NATIVE emit, where a ternary over
// `=== undefined` does not narrow the optional; on the web it is dead.

describe('a miss is an EMPTY line list, on every family', () => {
  it('river, chord, gantt, graph, geo and funnel all answer [] off their geometry and lines on it', () => {
    const river = layoutRiver([{ name: 'a', values: [1, 2] }, { name: 'b', values: [2, 1] }], BOX)
    const l = river.layers[0]!
    expect(riverTip(river, l.top[0]!.x + 1, (l.top[0]!.y + l.bottom[0]!.y) / 2)).toEqual(['a'])
    expect(riverTip(river, -50, -50)).toEqual([])

    const chord = layoutChord([{ name: 'a' }, { name: 'b' }], [{ source: 'a', target: 'b', value: 4 }], BOX)
    const arc = chord.arcs[0]!
    const mid = (arc.start + arc.end) / 2
    const r = chord.circle.radius - chord.thickness / 2
    expect(chordTip(chord, chord.circle.center.x + Math.cos(mid) * r, chord.circle.center.y + Math.sin(mid) * r)).toEqual(['a', '4'])
    expect(chordTip(chord, -50, -50)).toEqual([])

    const gantt = layoutGantt([{ id: 't', name: 'Design', start: '2024-03-01', end: '2024-03-10' }], BOX)
    expect(ganttTip(gantt, gantt.rows[0]!.rect.x + 1, gantt.rows[0]!.rect.y + 1)).toEqual(['Design', '9 days'])
    expect(ganttTip(gantt, -50, -50)).toEqual([])

    const g = layoutGraph([{ id: 'a', value: 3 }, { id: 'b' }], [{ source: 'a', target: 'b' }], BOX, { layout: 'circular' })
    expect(graphTip(g, g.nodes[0]!.at.x, g.nodes[0]!.at.y)).toEqual(['a', '3'])
    expect(graphTip(g, -500, -500)).toEqual([])

    const stages = [{ value: 4, label: 'visit', color: '#111' }]
    const plot = { x: 8, y: 8, w: 384, h: 284 }
    const band = layoutFunnel(stages, plot)[0]!
    expect(funnelTip(stages, plot, plot.x + plot.w / 2, (band.top + band.bottom) / 2)).toEqual(['visit', '4'])
    expect(funnelTip(stages, plot, -50, -50)).toEqual([])

    expect(treemapTip(layoutTreemap(TREE, BOX), -10, -10)).toEqual([])
    expect(sunburstTip(layoutSunburst(TREE, 20, 100), { x: 0, y: 0 }, 1e4, 1e4)).toEqual([])
    expect(treeTip(layoutTree(TREE, BOX), -1e4, -1e4)).toEqual([])
  })

  it('geo names the region and adds its value only when one was recorded', () => {
    const world: GeoJson = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } }],
    }
    const geo = layoutGeo(world, BOX, { padding: 0 })
    const inside = geo.regions[0]!.centroid
    expect(geoTip(geo, [{ region: 'A', value: 12 }], inside.x, inside.y)).toEqual(['A', '12'])
    // Values recorded for OTHER regions leave this one name-only.
    expect(geoTip(geo, [{ region: 'Z', value: 12 }], inside.x, inside.y)).toEqual(['A'])
    expect(geoTip(geo, [], -1e4, -1e4)).toEqual([])
  })
})

describe('chord legend — one entry per node arc, in ring order', () => {
  it('names every arc and colours it like its ring segment', () => {
    const chord = layoutChord([{ name: 'a' }, { name: 'b' }], [{ source: 'a', target: 'b', value: 4 }], BOX)
    const entries = chordLegend(chord)
    expect(entries.map((e) => e.label)).toEqual(chord.arcs.map((a) => a.name))
    expect(entries.map((e) => e.color)).toEqual(chord.arcs.map((a) => a.color))
    for (const e of entries) expect(e.color).toMatch(/^#|^rgb|^hsl/)
    expect(chordLegend({ ...chord, arcs: [] })).toEqual([])
  })
})

describe('sankey — node, link, and an endpoint the layout does not name', () => {
  const layout = layoutSankey([{ name: 'coal' }, { name: 'power' }], [{ source: 'coal', target: 'power', value: 5 }], BOX)

  it('a ribbon between the two nodes reads from → to', () => {
    const link = layout.links[0]!
    const src = layout.nodes[link.source]!
    const tgt = layout.nodes[link.target]!
    const midX = (src.rect.x + src.rect.w + tgt.rect.x) / 2
    const midY = (link.y0 + link.y1) / 2 + link.width / 2
    expect(sankeyTip(layout, midX, midY)).toEqual(['coal → power', '5'])
    // The node hit wins over the ribbon when both are under the pointer.
    expect(sankeyTip(layout, src.rect.x + 1, src.rect.y + 1)).toEqual(['coal', '5'])
  })

  // NOTE: `sankeyTip`'s `from === undefined` / `to === undefined` fallbacks are
  // UNREACHABLE through this entry point. Reaching them needs a link whose
  // endpoint index is out of range, and `hitSankeyIndex` runs that same link
  // through `ribbonPoints`, which dereferences `layout.nodes[link.source]!`
  // first — so an orphan link throws before the fallback can answer. They are
  // defensive for a hand-built layout only.

  it('a point on neither a node nor a ribbon is a miss', () => {
    expect(sankeyTip(layout, -100, -100)).toEqual([])
    expect(sankeyTip({ ...layout, links: [] }, BOX.w / 2, -100)).toEqual([])
  })
})

describe('polar — a sector, a LINE, and a series the list does not reach', () => {
  const series = [{ name: 'a', kind: 'bar' as const, values: [3, 4] }]
  const layout = layoutPolar({ categories: ['x', 'y'] }, series, BOX)

  it('a sector whose series index is past the list is named by its position', () => {
    const s = layout.sectors[0]!
    const mid = (s.start + s.end) / 2
    const r = (s.innerR + s.outerR) / 2
    const px = layout.center.x + Math.cos(mid) * r
    const py = layout.center.y + Math.sin(mid) * r
    expect(polarTip(layout, series, px, py)).toEqual(['a', '3'])
    // Same hit, an empty series list: the fallback names the 1-based slot.
    expect(polarTip(layout, [], px, py)).toEqual(['Series 1', '3'])
  })

  it('a line hit reports the series name (and its positional fallback), a miss reports nothing', () => {
    const lineSeries = [{ name: 'temp', kind: 'line' as const, values: [3, 4] }]
    const lineLayout = layoutPolar({ categories: ['x', 'y'] }, lineSeries, BOX)
    const pt = lineLayout.lines[0]!.points[0]!.at
    expect(polarTip(lineLayout, lineSeries, pt.x, pt.y)).toEqual(['temp'])
    expect(polarTip(lineLayout, [], pt.x, pt.y)).toEqual(['Series 1'])
    expect(polarTip(lineLayout, lineSeries, layout.center.x, layout.center.y)).toEqual([])
  })
})

describe('calendar — a day with no value of its own', () => {
  const layout = layoutCalendar('2024-03-01', '2024-03-07', BOX)

  it('walks past values recorded for other days and answers the date alone', () => {
    const c = layout.cells[2]!
    const other = layout.cells[0]!.date
    expect(calendarTip(layout, [{ date: other, value: 9 }], c.rect.x + 1, c.rect.y + 1)).toEqual([c.date])
    expect(calendarTip(layout, [{ date: other, value: 9 }, { date: c.date, value: 4 }], c.rect.x + 1, c.rect.y + 1)).toEqual([c.date, '4'])
    expect(calendarTip(layout, [], -50, -50)).toEqual([])
  })
})

describe('pie — the share of a whole that is zero', () => {
  it('reports 0% rather than a negative share when the slice values do not total a positive whole', () => {
    // `layoutArcs` draws the positive slice (its own total counts positives
    // only), while the tooltip's share is over EVERY value — which here is
    // negative, so there is no whole to take a share of.
    const mixed = [{ value: 3, label: 'a', color: '#111' }, { value: -5, label: 'b', color: '#222' }]
    const arc = layoutArcs(mixed)[0]!
    const mid = (arc.start + arc.end) / 2
    const hit = pieTip(mixed, BOX, 0, BOX.w / 2 + Math.cos(mid) * 60, BOX.h / 2 + Math.sin(mid) * 60)
    expect(hit).toEqual(['a', '3 (0%)'])
    const real = [{ value: 3, label: 'a', color: '#111' }, { value: 1, label: 'b', color: '#222' }]
    const rArc = layoutArcs(real)[0]!
    const rMid = (rArc.start + rArc.end) / 2
    expect(pieTip(real, BOX, 0, BOX.w / 2 + Math.cos(rMid) * 60, BOX.h / 2 + Math.sin(rMid) * 60)).toEqual(['a', '3 (75%)'])
  })
})

describe('renderTooltip — the box follows the WIDEST line wherever it sits', () => {
  const opts = { fontSize: 11, fill: '#fff', border: '#ccc', text: '#111', pad: 8, radius: 4 }

  it('sizes from the first line when it is the longest, not only from a later one', () => {
    const firstLongest = renderTooltip(['a much longer first line', 'abc'], { x: 10, y: 10 }, BOX, opts, measure)
    const lastLongest = renderTooltip(['abc', 'a much longer first line'], { x: 10, y: 10 }, BOX, opts, measure)
    const w = (cmds: ReturnType<typeof renderTooltip>) => (cmds[0]!.kind === 'rect' ? cmds[0]!.rect.w : -1)
    expect(w(firstLongest)).toBeCloseTo(w(lastLongest), 9)
    expect(w(firstLongest)).toBeCloseTo(measure('a much longer first line', 11) + 16, 9)
  })
})
