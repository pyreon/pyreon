// Branch coverage for the hierarchy and multi-axis families — sankey, tree,
// sunburst, parallel, radar, chord — plus the indicator arithmetic and the
// single-axis strip. The uncovered arms here are the degenerate shapes each
// layout has to survive: a one-column sankey, a radial tree in a tall box, an
// arc too small for its label, an axis with one category, a window of zero.
import { describe, expect, it } from 'vitest'
import { layoutSankey, renderSankey, ribbonPoints, sankeyRgba } from './sankey'
import { layoutTree, linkPoints, renderTree } from './tree'
import { layoutSunburst, renderSunburst, hitSunburstIndex } from './sunburst'
import { layoutParallel, parallelPlace, renderParallel, hitParallelIndex } from './parallel'
import { hitRadarIndex, withAlpha } from './radar'
import { layoutChord, renderChord, ribbonPolygon } from './chord'
import { emaValues, smaValues, stdevValues, trendValues } from './indicator-values'
import { layoutSingleAxis, renderSingleAxis } from './single-axis'
import { singleAxisToSvg } from './single-axis-web'

const box = { x: 0, y: 0, w: 400, h: 300 }

describe('sankey', () => {
  const nodes = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
  const links = [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 3 }]

  it('a MALFORMED colour passes through the alpha helper untouched', () => {
    expect(sankeyRgba('#fff', 0.5)).toBe('#fff')
    expect(sankeyRgba('', 0.5)).toBe('')
    expect(sankeyRgba('#204060', 0.5)).toBe('rgba(32, 64, 96, 0.5)')
  })
  it('a SINGLE column (no links) places every node at the left edge instead of dividing by zero depth', () => {
    const l = layoutSankey(nodes, [], box)
    for (const nd of l.nodes) expect(nd.rect.x).toBe(box.x)
  })
  it('a CYCLE is cut rather than looping the depth assignment forever', () => {
    const l = layoutSankey(nodes, [...links, { source: 'c', target: 'a', value: 1 }], box)
    expect(l.nodes).toHaveLength(3)
    for (const nd of l.nodes) expect(Number.isFinite(nd.rect.x)).toBe(true)
    expect(l.links.length, 'the back edge is dropped').toBeLessThan(3)
  })
  it('a single relaxation iteration does not divide by (iterations - 1)', () => {
    const l = layoutSankey(nodes, links, box, { iterations: 1 })
    for (const nd of l.nodes) expect(Number.isFinite(nd.rect.y)).toBe(true)
    const none = layoutSankey(nodes, links, box, { iterations: 0 })
    for (const nd of none.nodes) expect(Number.isFinite(nd.rect.y)).toBe(true)
  })
  it('a crossing flow forces the column sort to actually reorder', () => {
    // Two sources feeding two targets in the opposite order: relaxation pulls
    // the second target above the first, so the insertion sort must walk.
    const crossing = layoutSankey(
      [{ name: 's1' }, { name: 's2' }, { name: 't1' }, { name: 't2' }],
      [
        { source: 's1', target: 't2', value: 10 },
        { source: 's2', target: 't1', value: 10 },
      ],
      box,
      { iterations: 8 },
    )
    for (const nd of crossing.nodes) expect(Number.isFinite(nd.rect.y)).toBe(true)
  })
  it('ribbon progress is clamped at both ends', () => {
    const l = layoutSankey(nodes, links, box)
    const settled = ribbonPoints(l, l.links[0]!)
    expect(ribbonPoints(l, l.links[0]!, 9)).toEqual(settled)
    const zero = ribbonPoints(l, l.links[0]!, -1)
    const xs = zero.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs), 'a zero-progress ribbon has no reach').toBeCloseTo(0, 9)
  })
  it('render progress is clamped, and labels wait for the settled frame', () => {
    const l = layoutSankey(nodes, links, box)
    expect(renderSankey(l, { progress: 4 })).toEqual(renderSankey(l))
    expect(renderSankey(l, { progress: 0.5 }).some((c) => c.kind === 'text')).toBe(false)
    expect(renderSankey(l, { showLabels: false }).some((c) => c.kind === 'text')).toBe(false)
  })
  it('a ZERO-value link and a valueless node are skipped rather than drawn flat', () => {
    const l = layoutSankey([{ name: 'a' }, { name: 'b' }, { name: 'orphan' }], [{ source: 'a', target: 'b', value: 0 }], box)
    expect(renderSankey(l).filter((c) => c.kind === 'polygon'), 'no ribbon for a zero flow').toHaveLength(0)
    expect(renderSankey(l).filter((c) => c.kind === 'rect'), 'and no band for a node worth nothing').toHaveLength(0)
  })
})

describe('tree', () => {
  const roots = [{ name: 'root', children: [{ name: 'a' }, { name: 'b', children: [{ name: 'b1' }] }] }]

  it('a RADIAL layout is sized by the shorter side and survives a tiny box', () => {
    const wide = layoutTree(roots, { x: 0, y: 0, w: 400, h: 200 }, { orient: 'radial' })
    const tall = layoutTree(roots, { x: 0, y: 0, w: 200, h: 400 }, { orient: 'radial' })
    for (const n of [...wide.nodes, ...tall.nodes]) expect(Number.isFinite(n.at.x)).toBe(true)
    const tiny = layoutTree(roots, { x: 0, y: 0, w: 4, h: 4 }, { orient: 'radial' })
    for (const n of tiny.nodes) expect(Number.isFinite(n.at.x)).toBe(true)
  })
  it('a radial layout of a SINGLE node has no slot span to divide by', () => {
    const one = layoutTree([{ name: 'only' }], box, { orient: 'radial' })
    expect(one.nodes).toHaveLength(1)
    expect(Number.isFinite(one.nodes[0]!.at.x)).toBe(true)
  })
  it('a box narrower or shorter than the gutter collapses the span rather than inverting it', () => {
    const l = layoutTree(roots, { x: 0, y: 0, w: 2, h: 2 }, { orient: 'LR' })
    for (const n of l.nodes) expect(Number.isFinite(n.at.x)).toBe(true)
  })
  it('all four orientations place the root on the matching edge', () => {
    const at = (orient: 'LR' | 'RL' | 'TB' | 'BT') => layoutTree(roots, box, { orient }).nodes[0]!.at
    expect(at('LR').x).toBeLessThan(at('RL').x)
    expect(at('TB').y).toBeLessThan(at('BT').y)
  })
  it('an ELBOW link turns through the mid-point on the layout axis', () => {
    const link = { from: { x: 0, y: 0 }, to: { x: 10, y: 20 }, path: [0], depth: 1 }
    expect(linkPoints(link, 'LR', 'elbow')).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 20 }, { x: 10, y: 20 }])
    expect(linkPoints(link, 'TB', 'elbow'), 'a vertical tree turns the other way').toEqual([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }])
  })
  it('a CURVE eases along the tree axis, and a radial link is a straight spoke', () => {
    const link = { from: { x: 0, y: 0 }, to: { x: 12, y: 60 }, path: [0], depth: 1 }
    const h = linkPoints(link, 'LR', 'curve')
    const v = linkPoints(link, 'TB', 'curve')
    expect(h).toHaveLength(13)
    expect(v).toHaveLength(13)
    expect(h[3]!.x, 'horizontal marches x linearly').toBeCloseTo(3, 9)
    expect(v[3]!.y, 'vertical marches y linearly').toBeCloseTo(15, 9)
    expect(h[3], 'and each eases the OTHER axis, so the two disagree').not.toEqual(v[3])
    expect(linkPoints(link, 'radial', 'curve')).toEqual([link.from, link.to])
  })
  it('render progress is clamped at both ends', () => {
    const l = layoutTree(roots, box)
    expect(renderTree(l, { progress: 7 })).toEqual(renderTree(l))
    expect(renderTree(l, { progress: -2 }).length).toBeLessThan(renderTree(l).length)
  })
})

describe('sunburst', () => {
  const roots = [
    { name: 'A', children: [{ name: 'A1', value: 5 }, { name: 'A2', value: 5 }] },
    { name: 'B', children: [{ name: 'B1', value: 5 }, { name: 'B2', value: 5 }] },
    { name: 'C', children: [{ name: 'C1', value: 5 }] },
    { name: 'D', children: [{ name: 'D1', value: 5 }] },
  ]
  const center = { x: 200, y: 150 }

  it('a NEGATIVE value is floored to zero in the total and in the span', () => {
    const arcs = layoutSunburst([{ name: 'neg', value: -5 }, { name: 'pos', value: 5 }], 0, 100, { padAngle: 0 })
    expect(arcs.find((a) => a.name === 'neg')!.value).toBe(0)
    expect(arcs.find((a) => a.name === 'neg')!.end - arcs.find((a) => a.name === 'neg')!.start).toBe(0)
  })
  it('SEVERAL sibling groups all push their children onto the walk', () => {
    const arcs = layoutSunburst(roots, 0, 100, { padAngle: 0 })
    expect(arcs.filter((a) => a.depth === 1).map((a) => a.name).sort()).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'D1'])
  })
  it('render progress is clamped at both ends; zero progress draws nothing', () => {
    const arcs = layoutSunburst(roots, 0, 100, { padAngle: 0 })
    expect(renderSunburst(arcs, center, { progress: 5 })).toEqual(renderSunburst(arcs, center))
    expect(renderSunburst(arcs, center, { progress: -1 })).toEqual([])
  })
  it('the depth tint is CAPPED, so level 3 and level 6 read the same', () => {
    const at = (depth: number) => ({ name: 'x', value: 1, depth, path: [0], start: 0, end: 1, innerR: 10, outerR: 40, color: '#000000', leaf: false })
    const a = renderSunburst([at(3)], center, { showLabels: false }) as { fill: string }[]
    const b = renderSunburst([at(6)], center, { showLabels: false }) as { fill: string }[]
    expect(a[0]!.fill).toBe(b[0]!.fill)
  })
  it('an arc too NARROW or too THIN for its name gets no label', () => {
    const narrow = { name: 'a-long-name', value: 1, depth: 0, path: [0], start: 0, end: 0.01, innerR: 10, outerR: 40, color: '#000000', leaf: true }
    expect(renderSunburst([narrow], center).filter((c) => c.kind === 'text')).toHaveLength(0)
    const thin = { ...narrow, name: 'x', end: 3, outerR: 12 }
    expect(renderSunburst([thin], center).filter((c) => c.kind === 'text')).toHaveLength(0)
    const roomy = { ...narrow, name: 'x', end: 3 }
    expect(renderSunburst([roomy], center).filter((c) => c.kind === 'text')).toHaveLength(1)
  })
  it('the DEEPEST arc under a point wins, and a same-depth sibling does not displace it', () => {
    const arcs = layoutSunburst(roots, 0, 100, { padAngle: 0 })
    const a = arcs.find((x) => x.depth === 1)!
    const mid = (a.start + a.end) / 2
    const r = (a.innerR + a.outerR) / 2
    const hit = hitSunburstIndex(arcs, center, center.x + Math.cos(mid) * r, center.y + Math.sin(mid) * r)
    expect(arcs[hit]!.depth).toBe(1)
    const holed = layoutSunburst(roots, 20, 100, { padAngle: 0 })
    expect(hitSunburstIndex(holed, center, center.x, center.y), 'the hole is a miss').toBe(-1)
    expect(hitSunburstIndex(arcs, center, center.x + 5000, center.y), 'and so is a point past the rim').toBe(-1)
  })
})

describe('parallel coordinates', () => {
  const axes = [{ label: 'a' }, { label: 'b' }, { label: 'c' }]
  const rows = [[1, 2, 3], [3, 2, 1]]

  it('a COLLAPSED axis domain puts the value in the middle of the axis', () => {
    const flat = { name: 'a', x: 0, y0: 0, y1: 100, domain: { min: 5, max: 5 }, isCategory: false, inverse: false, ticks: [] }
    expect(parallelPlace(flat as never, 5).y).toBe(50)
    const flatCat = { ...flat, isCategory: true, domain: { min: 0, max: 0 } }
    expect(parallelPlace(flatCat as never, 0).y).toBe(50)
  })
  it('a value OUTSIDE the domain is clamped onto the axis ends', () => {
    const a = { name: 'a', x: 0, y0: 0, y1: 100, domain: { min: 0, max: 10 }, isCategory: false, inverse: false, ticks: [] }
    expect(parallelPlace(a as never, -5).y).toBe(100)
    expect(parallelPlace(a as never, 50).y).toBe(0)
  })
  it('a non-finite value, or a category index off the axis, is a gap', () => {
    const a = { name: 'a', x: 0, y0: 0, y1: 100, domain: { min: 0, max: 2 }, isCategory: true, inverse: false, ticks: [] }
    expect(parallelPlace(a as never, Number.NaN).ok).toBe(false)
    expect(parallelPlace(a as never, -1).ok).toBe(false)
    expect(parallelPlace(a as never, 5).ok).toBe(false)
  })
  it('a category axis with ONE category (or none) has no span to divide by', () => {
    const one = layoutParallel([{ label: 'a', type: 'category', categories: ['only'] }] as never, [[0]], box)
    expect(one.axes[0]!.domain.max).toBe(0)
    const none = layoutParallel([{ label: 'a', type: 'category' }] as never, [[0]], box)
    expect(none.axes[0]!.domain.max).toBe(0)
  })
  it('a RAGGED row contributes nothing to the axes it does not reach', () => {
    const l = layoutParallel(axes as never, [[1], [5, 6, 7]], box)
    expect(l.axes[2]!.domain, 'only the long row reaches axis c').toEqual({ min: 7, max: 7 })
    expect(l.axes[0]!.domain, 'while both rows reach axis a').toEqual({ min: 1, max: 5 })
  })
  it('render progress is clamped at both ends', () => {
    const l = layoutParallel(axes as never, rows, box)
    expect(renderParallel(l, { progress: 6 })).toEqual(renderParallel(l))
    expect(renderParallel(l, { progress: -1 }).some((c) => c.kind === 'polyline')).toBe(false)
  })
  it('a run of a SINGLE visible point is not a line', () => {
    // b is a gap on both sides of a, so a's run is one point long.
    const gappy = layoutParallel(axes as never, [[1, Number.NaN, 3]], box)
    expect(renderParallel(gappy).filter((c) => c.kind === 'polyline')).toHaveLength(0)
  })
  it('a hit walks the segments, including a DEGENERATE one', () => {
    const l = layoutParallel(axes as never, rows, box)
    // The FIRST vertex — the two rows cross at the middle axis, so a point
    // there is equidistant from both and the winner is an accident.
    const p = l.lines[0]!.points[0]!
    expect(hitParallelIndex(l, p.x, p.y)).toBe(0)
    expect(hitParallelIndex(l, -1000, -1000)).toBe(-1)
    const flat = layoutParallel([{ label: 'a' }, { label: 'b' }] as never, [[1, 1]], { x: 0, y: 0, w: 0, h: 300 })
    expect(hitParallelIndex(flat, flat.lines[0]!.points[0]!.x, flat.lines[0]!.points[0]!.y)).toBe(0)
  })
})

describe('radar', () => {
  it('a hex digit outside 0-9/a-f/A-F reads as zero rather than NaN', () => {
    expect(withAlpha('#GGGGGG', 0.5)).toBe('rgba(0, 0, 0, 0.5)')
    expect(withAlpha('#ABCDEF', 0.5)).toBe(withAlpha('#abcdef', 0.5))
    expect(withAlpha('#abc', 0.5)).toBe('rgba(170, 187, 204, 0.5)')
    expect(withAlpha('#abcd', 0.5), 'an unsupported length passes through').toBe('#abcd')
  })
  it('fewer than three axes cannot form a polygon, so every hit is a miss', () => {
    const opts = { showLabels: true, fontSize: 11 }
    expect(hitRadarIndex([{ label: 'a' }, { label: 'b' }] as never, [{ name: 's', values: [1, 1] }] as never, box, opts as never, 10, 10)).toEqual({ series: -1, axis: -1 })
  })
  it('a tap near a vertex reports its series and axis, with the DEFAULT tolerance', () => {
    const axes = [{ label: 'a', max: 10 }, { label: 'b', max: 10 }, { label: 'c', max: 10 }]
    const series = [{ name: 's', values: [10, 10, 10] }]
    const opts = { showLabels: false, fontSize: 11 }
    // The first vertex of a full-value polygon sits on the rim, straight up.
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
    const radius = Math.min(box.w, box.h) / 2
    const hit = hitRadarIndex(axes as never, series as never, box, opts as never, center.x, center.y - radius)
    expect(hit.series).toBe(0)
    expect(hit.axis).toBe(0)
    expect(hitRadarIndex(axes as never, series as never, box, opts as never, center.x, center.y), 'the centre is too far from every vertex').toEqual({ series: -1, axis: -1 })
  })
  it('showing the labels shrinks the radius, so the same tap misses', () => {
    const axes = [{ label: 'a', max: 10 }, { label: 'b', max: 10 }, { label: 'c', max: 10 }]
    const series = [{ name: 's', values: [10, 10, 10] }]
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
    const radius = Math.min(box.w, box.h) / 2
    const padded = hitRadarIndex(axes as never, series as never, box, { showLabels: true, fontSize: 11 } as never, center.x, center.y - radius)
    expect(padded).toEqual({ series: -1, axis: -1 })
  })
})

describe('chord', () => {
  const nodes = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
  const links = [{ source: 'A', target: 'B', value: 4 }, { source: 'B', target: 'C', value: 2 }]
  const layout = layoutChord(nodes, links, box)

  it('ribbon progress is clamped at both ends', () => {
    const settled = ribbonPolygon(layout, layout.ribbons[0]!, 1)
    expect(ribbonPolygon(layout, layout.ribbons[0]!, 9)).toEqual(settled)
    expect(ribbonPolygon(layout, layout.ribbons[0]!, -1)).toEqual(ribbonPolygon(layout, layout.ribbons[0]!, 0))
  })
  it('render progress is clamped at both ends', () => {
    expect(renderChord(layout, { progress: 4 })).toEqual(renderChord(layout))
    expect(renderChord(layout, { progress: -1 })).toEqual(renderChord(layout, { progress: 0 }))
  })
  it('labels can be turned off', () => {
    expect(renderChord(layout).some((c) => c.kind === 'text')).toBe(true)
    expect(renderChord(layout, { showLabels: false }).some((c) => c.kind === 'text')).toBe(false)
  })
})

describe('indicator arithmetic', () => {
  it('a window below one is treated as one', () => {
    expect(smaValues([1, 2, 3], 0)).toEqual([1, 2, 3])
    expect(smaValues([1, 2, 3], -5)).toEqual(smaValues([1, 2, 3], 1))
    expect(emaValues([1, 2, 3], 0)).toEqual(emaValues([1, 2, 3], 1))
    expect(stdevValues([1, 2, 3], 0)).toEqual([0, 0, 0])
  })
  it('a GAP contributes zero to the rolling sums rather than poisoning them', () => {
    const out = smaValues([2, Number.NaN, 2, 2], 2)
    for (const v of out.slice(1)) expect(Number.isFinite(v)).toBe(true)
    expect(out[1]).toBe(1)
  })
  it('a gap leaving the window is subtracted as zero too', () => {
    const out = smaValues([Number.NaN, 2, 2, 2], 2)
    expect(out[2]).toBe(2)
  })
  it('the EMA seed averages the first window, gaps included as zero', () => {
    expect(emaValues([Number.NaN, 4], 2)![1]).toBe(2)
  })
  it('an EMPTY series has no trend line', () => {
    expect(trendValues([])).toEqual([])
  })
  it('a series with fewer than TWO usable points has a flat trend at its own value', () => {
    expect(trendValues([5])).toEqual([5])
    expect(trendValues([Number.NaN, 5, Number.NaN])).toEqual([5, 5, 5])
  })
  it('a series with NO usable points has a flat trend at zero', () => {
    expect(trendValues([Number.NaN, Number.NaN])).toEqual([0, 0])
  })
  it('a straight line is recovered exactly', () => {
    expect(trendValues([0, 2, 4, 6])).toEqual([0, 2, 4, 6])
  })
})

describe('single-axis strip', () => {
  const pts = [{ x: 1 }, { x: 5 }, { x: 9 }]
  it('the tick step picks the 1/2/5 multiple of its decade', () => {
    const labels = (max: number) => layoutSingleAxis({ name: 'v' }, [{ x: 0 }, { x: max }], box).axis.ticks.map((t) => t.label)
    expect(labels(60)).toEqual(['0', '10', '20', '30', '40', '50', '60'])
    expect(labels(12)).toEqual(['0', '2', '4', '6', '8', '10', '12'])
    expect(labels(30)).toEqual(['0', '5', '10', '15', '20', '25', '30'])
  })
  it('a category axis with NO category list has an empty axis rather than a negative span', () => {
    const l = layoutSingleAxis({ name: 'v', type: 'category' } as never, [{ x: 0 }], box)
    expect(l.axis.ticks).toEqual([])
    expect(Number.isFinite(l.points[0]!.at.x)).toBe(true)
  })
  it('a category axis places one tick per category', () => {
    const l = layoutSingleAxis({ name: 'v', type: 'category', categories: ['a', 'b'] } as never, [{ x: 0 }, { x: 1 }], box)
    expect(l.axis.ticks.map((t) => t.label)).toEqual(['a', 'b'])
  })
  it('NO points and no domain falls back to a 0..1 axis instead of an infinite one', () => {
    const l = layoutSingleAxis({ name: 'v' }, [], box)
    expect(l.points).toEqual([])
    expect(l.axis.ticks.length).toBeGreaterThan(0)
    for (const t of l.axis.ticks) expect(Number.isFinite(t.x)).toBe(true)
  })
  it('render progress is clamped at both ends', () => {
    const l = layoutSingleAxis({ name: 'v' }, pts, box)
    expect(renderSingleAxis(l, { progress: 5 })).toEqual(renderSingleAxis(l))
    expect(renderSingleAxis(l, { progress: -1 }).length).toBeLessThanOrEqual(renderSingleAxis(l).length)
  })
  it('the SVG description is derived from the title, and an explicit one wins', () => {
    const withTitle = singleAxisToSvg({ axis: { name: 'v' }, points: pts, title: 'Strip' })
    expect(withTitle).toContain('3 points')
    const explicit = singleAxisToSvg({ axis: { name: 'v' }, points: pts, title: 'Strip', description: 'Mine' })
    expect(explicit).toContain('Mine')
    expect(explicit).not.toContain('3 points')
    const bare = singleAxisToSvg({ axis: { name: 'v' }, points: pts })
    expect(bare).not.toContain('3 points')
  })
})
