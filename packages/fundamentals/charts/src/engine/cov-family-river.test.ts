// Branch coverage for the streamgraph family: the value reader that has to
// treat a gap, a non-finite and a negative alike, the single-column spacing
// that cannot divide by (n-1), the entrance's two-point floor, and the label
// rules that drop a label a band cannot hold.
import { describe, expect, it } from 'vitest'
import { hitRiver, hitRiverIndex, layerPolygon, layoutRiver, renderRiver, smoothPoints } from './river'
import type { RiverSeries } from './river'

const box = { x: 0, y: 0, w: 300, h: 200 }
const series: RiverSeries[] = [
  { name: 'alpha', values: [1, 2, 3, 2] },
  { name: 'beta', values: [2, 1, 1, 3] },
]

describe('river — the value reader', () => {
  it('a MISSING, non-finite or NEGATIVE value all read as zero thickness', () => {
    const ragged = layoutRiver([{ name: 'a', values: [5, 5, 5, 5] }, { name: 'b', values: [5] }], box)
    expect(ragged.layers[1]!.top).toHaveLength(4)
    const nan = layoutRiver([{ name: 'a', values: [5, Number.NaN, 5] }], box)
    expect(nan.layers[0]!.top[1]!.y, 'the NaN column has no thickness').toBeCloseTo(nan.layers[0]!.bottom[1]!.y, 9)
    const neg = layoutRiver([{ name: 'a', values: [5, -5, 5] }], box)
    expect(neg.layers[0]!.top[1]!.y).toBeCloseTo(neg.layers[0]!.bottom[1]!.y, 9)
  })
  it('a series of ONLY zeros has no thickness at all', () => {
    const l = layoutRiver([{ name: 'flat', values: [0, 0, 0] }], box)
    expect(l.layers[0]!.thickness).toBe(0)
  })
})

describe('river — the column grid', () => {
  it('columns are spread across the plot, first on the left edge and last on the right', () => {
    const l = layoutRiver(series, box)
    expect(l.xs).toHaveLength(4)
    expect(l.xs[0]).toBe(0)
    expect(l.xs.at(-1)).toBe(300)
  })
  it('a SINGLE column is centred rather than dividing by zero spans', () => {
    const l = layoutRiver([{ name: 'a', values: [5] }], box)
    expect(l.xs).toEqual([150])
  })
  it('explicit categories can add columns beyond the longest series', () => {
    const l = layoutRiver([{ name: 'a', values: [1, 2] }], box, { categories: ['q1', 'q2', 'q3', 'q4'] })
    expect(l.xs).toHaveLength(4)
    expect(l.ticks.map((t) => t.label)).toEqual(['q1', 'q2', 'q3', 'q4'])
  })
  it('without categories the ticks are 1-based column numbers', () => {
    expect(layoutRiver([{ name: 'a', values: [1, 2, 3] }], box).ticks.map((t) => t.label)).toEqual(['1', '2', '3'])
  })
  it('many columns are thinned to about eight ticks', () => {
    const l = layoutRiver([{ name: 'a', values: Array.from({ length: 40 }, () => 1) }], box)
    expect(l.ticks.length).toBeLessThanOrEqual(8)
    expect(l.ticks.length).toBeGreaterThan(1)
  })
  it('NO data at all produces no columns, no layers and no ticks', () => {
    const l = layoutRiver([], box)
    expect(l.xs).toEqual([])
    expect(l.layers).toEqual([])
    expect(l.ticks).toEqual([])
  })
  it('a series with an EMPTY value list still gets a layer, anchored at the plot origin', () => {
    const l = layoutRiver([{ name: 'empty', values: [] }], box)
    expect(l.layers).toHaveLength(1)
    expect(l.layers[0]!.thickness).toBe(0)
    expect(l.layers[0]!.labelAt).toEqual({ x: l.plot.x, y: l.plot.y })
  })
})

describe('river — the plot rectangle', () => {
  it('the axis gutter is taken out of the plot, and given back when the axis is hidden', () => {
    const withAxis = layoutRiver(series, box)
    const without = layoutRiver(series, box, { showAxis: false })
    expect(without.plot.h).toBe(200)
    expect(withAxis.plot.h).toBeLessThan(200)
    expect(without.ticks, 'no axis means no ticks').toEqual([])
  })
  it('a box shorter than the gutter collapses the plot rather than inverting it', () => {
    const l = layoutRiver(series, { x: 0, y: 0, w: 300, h: 2 })
    expect(l.plot.h).toBe(0)
  })
})

describe('river — baselines', () => {
  it('the default wiggle centres the stack; `zero` anchors it to the bottom', () => {
    const centred = layoutRiver(series, box)
    const zeroed = layoutRiver(series, box, { baseline: 'zero' })
    expect(zeroed.layers[0]!.bottom[0]!.y).toBeGreaterThan(centred.layers[0]!.bottom[0]!.y)
  })
  it('layers stack: one layer\'s top is the next one\'s bottom', () => {
    const l = layoutRiver(series, box)
    for (let i = 0; i < l.xs.length; i++) expect(l.layers[1]!.bottom[i]!.y).toBeCloseTo(l.layers[0]!.top[i]!.y, 9)
  })
})

describe('river — the layer polygon', () => {
  const layout = layoutRiver(series, box)
  it('a partial entrance keeps at least TWO columns, so a polygon is always a shape', () => {
    const sliver = layerPolygon(layout.layers[0]!, 'linear', 0.01)
    expect(sliver).toHaveLength(4)
  })
  it('the settled polygon walks the top forward and the bottom back', () => {
    const full = layerPolygon(layout.layers[0]!, 'linear', 1)
    expect(full).toHaveLength(8)
    expect(full[0]).toEqual(layout.layers[0]!.top[0])
    expect(full.at(-1)).toEqual(layout.layers[0]!.bottom[0])
  })
  it('the smooth curve samples more points than the linear one through the same corners', () => {
    const smooth = layerPolygon(layout.layers[0]!, 'smooth', 1)
    expect(smooth.length).toBeGreaterThan(8)
  })
  it('smoothPoints is a no-op below two points', () => {
    expect(smoothPoints([])).toEqual([])
    expect(smoothPoints([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }])
  })
})

describe('river — render', () => {
  const layout = layoutRiver(series, box)
  it('progress is clamped at both ends; zero progress draws nothing at all', () => {
    const settled = renderRiver(layout)
    expect(renderRiver(layout, { progress: 5 })).toEqual(settled)
    expect(renderRiver(layout, { progress: -1 })).toEqual([])
  })
  it('a partial frame draws the bands but no axis and no labels', () => {
    const half = renderRiver(layout, { progress: 0.5 })
    expect(half.filter((c) => c.kind === 'polygon').length).toBeGreaterThan(0)
    expect(half.some((c) => c.kind === 'text')).toBe(false)
    expect(half.some((c) => c.kind === 'line')).toBe(false)
  })
  it('a chart with fewer than two columns renders nothing', () => {
    expect(renderRiver(layoutRiver([{ name: 'a', values: [1] }], box))).toEqual([])
    expect(renderRiver(layoutRiver([], box))).toEqual([])
  })
  it('a ZERO-thickness layer is skipped while its neighbours are drawn', () => {
    const l = layoutRiver([{ name: 'flat', values: [0, 0, 0] }, ...series], box)
    expect(renderRiver(l).filter((c) => c.kind === 'polygon')).toHaveLength(2)
  })
  it('the axis can be turned off, and is absent when there are no ticks', () => {
    expect(renderRiver(layout).some((c) => c.kind === 'line')).toBe(true)
    expect(renderRiver(layout, { showAxis: false }).some((c) => c.kind === 'line')).toBe(false)
    expect(renderRiver(layoutRiver(series, box, { showAxis: false })).some((c) => c.kind === 'line')).toBe(false)
  })
  it('a band THINNER than its text gets no label', () => {
    const thin = layoutRiver([{ name: 'hair', values: [0.001, 0.001, 0.001] }, { name: 'fat', values: [100, 100, 100] }], box)
    const labels = renderRiver(thin).filter((c) => c.kind === 'text' && (c as { text: string }).text === 'hair')
    expect(labels).toHaveLength(0)
    expect(renderRiver(thin).some((c) => (c as { text?: string }).text === 'fat')).toBe(true)
  })
  it('a label WIDER than a third of the plot is dropped', () => {
    expect(renderRiver(layout, undefined, () => 1e6).some((c) => c.kind === 'text' && (c as { text: string }).text === 'alpha')).toBe(false)
  })
  it('labels can be turned off wholesale, leaving the axis ticks', () => {
    const noLabels = renderRiver(layout, { showLabels: false })
    expect(noLabels.some((c) => (c as { text?: string }).text === 'alpha')).toBe(false)
    expect(noLabels.some((c) => (c as { text?: string }).text === '1'), 'the axis is a different switch').toBe(true)
  })
})

describe('river — hit test', () => {
  const layout = layoutRiver(series, box)
  it('the FRONT-most layer wins where the bands stack', () => {
    // The MIDDLE of an interior column of the upper band — `labelAt` sits at
    // the widest column, which for this fixture is the right EDGE, where a
    // ray-cast is a boundary case rather than a containment one.
    const l = layout.layers[1]!
    const at = { x: layout.xs[1]!, y: (l.top[1]!.y + l.bottom[1]!.y) / 2 }
    expect(hitRiverIndex(layout, at.x, at.y)).toBe(1)
    expect(hitRiver(layout, at.x, at.y)!.name).toBe('beta')
  })
  it('a point outside every band is a miss on both entry points', () => {
    expect(hitRiverIndex(layout, -100, -100)).toBe(-1)
    expect(hitRiver(layout, -100, -100)).toBeNull()
  })
  it('the linear and smooth hit shapes both resolve the layer under its own label', () => {
    for (const curve of ['linear', 'smooth'] as const) {
      const l0 = layout.layers[0]!
      const at = { x: layout.xs[1]!, y: (l0.top[1]!.y + l0.bottom[1]!.y) / 2 }
      expect(hitRiverIndex(layout, at.x, at.y, curve)).toBe(0)
    }
  })
  it('a zero-thickness layer is never hit', () => {
    const l = layoutRiver([{ name: 'flat', values: [0, 0, 0] }], box)
    expect(hitRiverIndex(l, l.plot.x + 10, l.plot.y + 10)).toBe(-1)
  })
})
