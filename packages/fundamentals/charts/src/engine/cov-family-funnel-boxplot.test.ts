// Branch coverage for the funnel and boxplot families. Both are small enough
// that the uncovered arms are exactly their degenerate inputs — an empty
// series, one stage, a constant distribution, a zero-height plot — so each
// spec names the shape and the neighbour it must not disturb.
import { describe, expect, it } from 'vitest'
import { hitFunnel, layoutFunnel, renderFunnel } from './funnel'
import type { FunnelStage } from './funnel'
import { boxplotExtent, fiveNumber, hitBox, renderBoxplot } from './boxplot'

const plot = { x: 0, y: 0, w: 200, h: 100 }
const stages: FunnelStage[] = [
  { label: 'Visits', value: 100, color: '#111111' },
  { label: 'Signups', value: 50, color: '#222222' },
  { label: 'Paid', value: 10, color: '#333333' },
]

describe('funnel — degenerate inputs', () => {
  it('NO stages lays out nothing and renders nothing', () => {
    expect(layoutFunnel([], plot)).toEqual([])
    expect(renderFunnel([], plot)).toEqual([])
    expect(hitFunnel([], plot, 10, 10)).toBe(-1)
  })
  it('a single stage spans the whole plot height and tapers to the minimum width', () => {
    const g = layoutFunnel([stages[0]!], plot)
    expect(g).toHaveLength(1)
    expect(g[0]!.top).toBe(0)
    expect(g[0]!.bottom).toBe(100)
    expect(g[0]!.topWidth).toBe(200)
    expect(g[0]!.bottomWidth, 'the last stage narrows to minWidthRatio, which defaults to 0').toBe(0)
  })
  it('stages that are ALL zero share the full width instead of dividing by zero', () => {
    const g = layoutFunnel([{ label: 'a', value: 0, color: '#888888' }, { label: 'b', value: 0, color: '#888888' }], plot)
    expect(g[0]!.topWidth).toBe(200)
    expect(g[0]!.bottomWidth, 'the next stage is "1.0 of nothing" too').toBe(200)
  })
})

describe('funnel — minWidthRatio', () => {
  it('a stage narrower than the floor is widened to it; a wider one is left alone', () => {
    const g = layoutFunnel(stages, plot, { minWidthRatio: 0.4 })
    expect(g[0]!.topWidth, '100/100 is above the floor').toBe(200)
    expect(g[1]!.topWidth, '50/100 is above the floor').toBe(100)
    expect(g[2]!.topWidth, '10/100 is below it').toBeCloseTo(80, 9)
  })
  it('the ratio is clamped to 0..1 at both ends', () => {
    const negative = layoutFunnel(stages, plot, { minWidthRatio: -5 })
    expect(negative[2]!.bottomWidth).toBe(0)
    const huge = layoutFunnel(stages, plot, { minWidthRatio: 4 })
    expect(huge[2]!.topWidth, 'a floor above 1 would overflow the plot').toBe(200)
  })
})

describe('funnel — sort and alignment', () => {
  it("sort 'none' keeps the input order; ascending inverts descending", () => {
    const unsorted: FunnelStage[] = [{ label: 'a', value: 1, color: '#888888' }, { label: 'b', value: 9, color: '#888888' }]
    expect(layoutFunnel(unsorted, plot, { sort: 'none' }).map((g) => g.index)).toEqual([0, 1])
    expect(layoutFunnel(unsorted, plot, { sort: 'descending' }).map((g) => g.index)).toEqual([1, 0])
    expect(layoutFunnel(unsorted, plot, { sort: 'ascending' }).map((g) => g.index)).toEqual([0, 1])
  })
  it('left, right and centre alignment place the SAME widths at different centres', () => {
    const l = layoutFunnel(stages, plot, { align: 'left' })
    const r = layoutFunnel(stages, plot, { align: 'right' })
    const c = layoutFunnel(stages, plot)
    expect(l.map((g) => g.topWidth)).toEqual(c.map((g) => g.topWidth))
    expect(l[1]!.centerX).toBeCloseTo(50, 9)
    expect(r[1]!.centerX).toBeCloseTo(150, 9)
    expect(c[1]!.centerX).toBeCloseTo(100, 9)
  })
})

describe('funnel — render', () => {
  it('progress is clamped at both ends', () => {
    const settled = renderFunnel(stages, plot)
    expect(renderFunnel(stages, plot, { progress: 3 })).toEqual(settled)
    const zero = renderFunnel(stages, plot, { progress: -1 })
    const poly = zero.find((c) => c.kind === 'polygon') as { points: { x: number }[] }
    expect(poly.points[0]!.x, 'at zero width the two top corners coincide').toBe(poly.points[1]!.x)
  })
  it('labels are drawn only on the settled frame, and only when asked for', () => {
    expect(renderFunnel(stages, plot).filter((c) => c.kind === 'text')).toHaveLength(3)
    expect(renderFunnel(stages, plot, { progress: 0.5 }).filter((c) => c.kind === 'text')).toHaveLength(0)
    expect(renderFunnel(stages, plot, { showLabels: false }).filter((c) => c.kind === 'text')).toHaveLength(0)
  })
  it('a left-aligned funnel keeps its LEFT edge fixed while it grows', () => {
    const half = renderFunnel(stages, plot, { align: 'left', progress: 0.5 })
    const poly = half.find((c) => c.kind === 'polygon') as { points: { x: number }[] }
    expect(poly.points[0]!.x, 'the top-left corner stays on the plot edge').toBeCloseTo(0, 9)
    expect(poly.points[3]!.x, 'and so does the bottom-left').toBeCloseTo(0, 9)
  })
  it('a right-aligned funnel pins its BOTTOM-right corner to the plot edge while it grows', () => {
    // Only the bottom edge is re-derived from the tweened width; the top keeps
    // the settled centre, so a right-aligned funnel grows in from the right.
    const half = renderFunnel(stages, plot, { align: 'right', progress: 0.5 })
    const poly = half.find((c) => c.kind === 'polygon') as { points: { x: number }[] }
    expect(poly.points[2]!.x).toBeCloseTo(200, 9)
    const settled = renderFunnel(stages, plot, { align: 'right' }).find((c) => c.kind === 'polygon') as { points: { x: number }[] }
    expect(settled.points[1]!.x, 'and the settled frame pins the top-right too').toBeCloseTo(200, 9)
  })
  it('a centred funnel grows from the middle in both directions', () => {
    const half = renderFunnel(stages, plot, { progress: 0.5 })
    const poly = half.find((c) => c.kind === 'polygon') as { points: { x: number }[] }
    expect((poly.points[0]!.x + poly.points[1]!.x) / 2).toBeCloseTo(100, 9)
  })
})

describe('funnel — hit test', () => {
  it('a point inside a stage reports its INPUT index, not its draw order', () => {
    const unsorted: FunnelStage[] = [{ label: 'small', value: 1, color: '#888888' }, { label: 'big', value: 9, color: '#888888' }]
    expect(hitFunnel(unsorted, plot, 100, 10), 'the widest stage is drawn first').toBe(1)
    expect(hitFunnel(unsorted, plot, 100, 90)).toBe(0)
  })
  it('a point in the gap beside a narrow stage is a miss', () => {
    expect(hitFunnel(stages, plot, 2, 95)).toBe(-1)
  })
  it('a ZERO-HEIGHT plot uses the top width rather than dividing by a zero span', () => {
    const flat = { x: 0, y: 0, w: 200, h: 0 }
    expect(hitFunnel([{ label: 'a', value: 1, color: '#888888' }], flat, 100, 0)).toBe(0)
    expect(hitFunnel([{ label: 'a', value: 1, color: '#888888' }], flat, 100, 5)).toBe(-1)
  })
})

describe('boxplot — the five-number summary', () => {
  it('an EMPTY sample is all zeroes with no outliers', () => {
    expect(fiveNumber([])).toEqual({ min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [] })
  })
  it('non-finite values are dropped before the quartiles are taken', () => {
    expect(fiveNumber([Number.NaN, 1, Number.POSITIVE_INFINITY, 3])).toEqual(fiveNumber([1, 3]))
    expect(fiveNumber([Number.NaN])).toEqual(fiveNumber([]))
  })
  it('a SINGLE observation is its own quartile — the interpolation has no upper neighbour', () => {
    expect(fiveNumber([42])).toEqual({ min: 42, q1: 42, median: 42, q3: 42, max: 42, outliers: [] })
  })
  it('a CONSTANT sample collapses every statistic onto the one value', () => {
    const f = fiveNumber([5, 5, 5, 5])
    expect(f).toEqual({ min: 5, q1: 5, median: 5, q3: 5, max: 5, outliers: [] })
  })
  it('a point past 1.5 IQR is an outlier and the whisker stops at the last value inside the fence', () => {
    const f = fiveNumber([1, 2, 3, 4, 5, 100])
    expect(f.outliers).toEqual([100])
    expect(f.max, 'the whisker stops before the outlier').toBe(5)
    expect(f.min).toBe(1)
  })
  it('outliers on BOTH sides are reported, low first', () => {
    const f = fiveNumber([-100, 10, 11, 12, 13, 14, 200])
    expect(f.outliers).toEqual([-100, 200])
    expect(f.min).toBe(10)
    expect(f.max).toBe(14)
  })
})

describe('boxplot — the extent across summaries', () => {
  it('no rows gives a unit domain rather than an empty one', () => {
    expect(boxplotExtent([])).toEqual({ min: 0, max: 1 })
  })
  it('a later row can lower the minimum and raise the maximum', () => {
    const a = fiveNumber([10, 11, 12])
    const b = fiveNumber([1, 2, 3])
    const c = fiveNumber([30, 31, 32])
    expect(boxplotExtent([a, b, c])).toEqual({ min: 1, max: 32 })
  })
  it('OUTLIERS widen the domain on both sides, past the whiskers', () => {
    const d = boxplotExtent([fiveNumber([-100, 10, 11, 12, 13, 14, 200])])
    expect(d).toEqual({ min: -100, max: 200 })
  })
  it('a COLLAPSED extent is padded by one so the scale is never degenerate', () => {
    expect(boxplotExtent([fiveNumber([7, 7, 7])])).toEqual({ min: 6, max: 8 })
  })
})

describe('boxplot — render', () => {
  const rows = [fiveNumber([1, 2, 3, 4, 5, 100]), fiveNumber([2, 4, 6, 8])]
  const domain = boxplotExtent(rows)
  it('no rows renders nothing', () => {
    expect(renderBoxplot([], plot, domain)).toEqual([])
  })
  it('the box width ratio is clamped to 0.05..0.9 at both ends', () => {
    const widthOf = (ratio: number) => {
      const r = renderBoxplot(rows, plot, domain, { widthRatio: ratio }).find((c) => c.kind === 'rect') as { rect: { w: number } }
      return r.rect.w
    }
    expect(widthOf(-1)).toBeCloseTo((plot.w / 2) * 0.05, 9)
    expect(widthOf(9)).toBeCloseTo((plot.w / 2) * 0.9, 9)
    expect(widthOf(0.5)).toBeCloseTo((plot.w / 2) * 0.5, 9)
  })
  it('progress is clamped at both ends; outliers appear only on the settled frame', () => {
    const settled = renderBoxplot(rows, plot, domain)
    expect(renderBoxplot(rows, plot, domain, { progress: 4 })).toEqual(settled)
    expect(settled.filter((c) => c.kind === 'circle')).toHaveLength(1)
    expect(renderBoxplot(rows, plot, domain, { progress: -1 }).filter((c) => c.kind === 'circle')).toHaveLength(0)
  })
  it('at zero progress the whole box collapses onto the median line', () => {
    const zero = renderBoxplot([rows[0]!], plot, domain, { progress: 0 })
    const rect = zero.find((c) => c.kind === "rect") as { rect: { y: number; h: number } }
    const med = zero.filter((c) => c.kind === 'line').at(-1) as { from: { y: number } }
    expect(rect.rect.h, 'a collapsed box still gets a one-pixel floor').toBe(1)
    expect(rect.rect.y).toBeCloseTo(med.from.y, 9)
  })
  it('a CONSTANT row draws a box of the minimum height rather than an inverted one', () => {
    const flat = [fiveNumber([9, 9, 9])]
    const rect = renderBoxplot(flat, plot, boxplotExtent(flat)).find((c) => c.kind === 'rect') as { rect: { h: number } }
    expect(rect.rect.h).toBe(1)
  })
})

describe('boxplot — hit test', () => {
  it('each band claims its own third of the plot', () => {
    expect(hitBox(3, plot, 10, 50)).toBe(0)
    expect(hitBox(3, plot, 100, 50)).toBe(1)
    expect(hitBox(3, plot, 190, 50)).toBe(2)
  })
  it('a point outside the plot, or a plot with no rows, is a miss', () => {
    expect(hitBox(3, plot, -1, 50)).toBe(-1)
    expect(hitBox(3, plot, 201, 50)).toBe(-1)
    expect(hitBox(3, plot, 10, -1)).toBe(-1)
    expect(hitBox(3, plot, 10, 101)).toBe(-1)
    expect(hitBox(0, plot, 10, 50)).toBe(-1)
  })
})
