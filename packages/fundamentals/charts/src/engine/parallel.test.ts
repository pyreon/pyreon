import { describe, expect, it } from 'vitest'
import { hitParallel, layoutParallel, lineRuns, parallelToSvg, renderParallel } from './parallel'
import type { ParallelAxis, ParallelRow } from './parallel'
import { compileFamily, familyToSvg } from './option-family'

const box = { x: 0, y: 0, w: 600, h: 300 }
const axes: ParallelAxis[] = [{ name: 'price' }, { name: 'weight', inverse: true }, { name: 'size', type: 'category', categories: ['S', 'M', 'L'] }]
const rows: ParallelRow[] = [[10, 1, 'S'], [30, 3, 'L'], [20, 2, 'M']]

describe('parallel layout', () => {
  it('axes are evenly spaced; value axes map linearly (inverse flips); category axes by position', () => {
    const l = layoutParallel(axes, rows, box)
    expect(l.axes.map((a) => a.x)).toEqual([0, 300, 600])
    const price = l.axes[0]!
    expect(price.domain).toEqual([10, 30])
    expect(price.place(10)).toBeCloseTo(price.y1, 9)
    expect(price.place(30)).toBeCloseTo(price.y0, 9)
    expect(price.place(20)).toBeCloseTo((price.y0 + price.y1) / 2, 9)
    const weight = l.axes[1]!
    expect(weight.place(1)).toBeCloseTo(weight.y0, 9)
    expect(weight.place(3)).toBeCloseTo(weight.y1, 9)
    const size = l.axes[2]!
    expect(size.place('S')).toBeCloseTo(size.y1, 9)
    expect(size.place('L')).toBeCloseTo(size.y0, 9)
    expect(size.place('XL')).toBeNull()
    expect(size.ticks.map((t) => t.label)).toEqual(['S', 'M', 'L'])
    expect(price.ticks.map((t) => t.label)).toEqual(['10', '30'])
  })
  it('a fixed domain clamps; nulls and non-numbers become gaps', () => {
    const l = layoutParallel([{ name: 'v', domain: [0, 100] }], [[150], [null], ['x']], box)
    const v = l.axes[0]!
    expect(l.lines[0]!.points[0]!.y).toBeCloseTo(v.y0, 9)
    expect(l.lines[1]!.points[0]).toBeNull()
    expect(l.lines[2]!.points[0]).toBeNull()
    expect(lineRuns([{ x: 0, y: 0 }, null, { x: 1, y: 1 }, { x: 2, y: 2 }])).toEqual([[{ x: 1, y: 1 }, { x: 2, y: 2 }]])
  })
  it('lineColor can be a string or a per-row function', () => {
    expect(layoutParallel(axes, rows, box, { lineColor: '#123456' }).lines[0]!.color).toBe('#123456')
    const l = layoutParallel(axes, rows, box, { lineColor: (r) => ((r[0] as number) > 15 ? '#aa0000' : '#00aa00') })
    expect(l.lines.map((x) => x.color)).toEqual(['#00aa00', '#aa0000', '#aa0000'])
  })
  it('renders every row as a polyline, highlighted rows last and opaque, then axes/ticks/names', () => {
    const l = layoutParallel(axes, rows, box)
    const cmds = renderParallel(l, { highlight: [1] })
    const polys = cmds.filter((c) => c.kind === 'polyline')
    expect(polys).toHaveLength(3)
    const last = polys[2]!
    if (last.kind !== 'polyline') throw new Error('polyline')
    expect(last.stroke).toBe('#b42318')
    expect(last.width).toBe(2)
    expect(cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))).toContain('weight')
    const half = renderParallel(l, { progress: 0.5 })
    expect(half.filter((c) => c.kind === 'text')).toHaveLength(0)
    expect(half.filter((c) => c.kind === 'polyline')).toHaveLength(0)
  })
  it('hit-testing finds the nearest line within tolerance', () => {
    const l = layoutParallel(axes, rows, box)
    const line = l.lines[1]!
    const a = line.points[0]!
    const b = line.points[1]!
    // A quarter of the way along — every line crosses at the exact midpoint of this fixture.
    expect(hitParallel(l, a.x + (b.x - a.x) * 0.25, a.y + (b.y - a.y) * 0.25 + 2)!.index).toBe(1)
    expect(hitParallel(l, 150, 5)).toBeNull()
  })
  it('parallelToSvg renders and describes', () => {
    const svg = parallelToSvg({ axes, rows, title: 'Products' })
    expect(svg).toContain('<polyline')
    expect(svg).toContain('3 rows across 3 axes (price, weight, size)')
    expect(svg).not.toContain('NaN')
  })
})

describe('parallel option mapping', () => {
  it('parallelAxis + a parallel series lower dims/types/min-max/inverse/lineStyle', () => {
    const f = compileFamily({
      parallelAxis: [{ dim: 0, name: 'a', min: 0, max: 10 }, { dim: 1, name: 'b', inverse: true }, { dim: 2, name: 'c', type: 'category', data: ['x', 'y'] }],
      series: [{ type: 'parallel', lineStyle: { width: 2, opacity: 0.8, color: '#123456' }, data: [[1, 2, 'x'], [3, 4, 'y']] }],
    })!
    if (f.plan.kind !== 'parallel') throw new Error('kind')
    expect(f.plan.axes).toEqual([
      { name: 'a', domain: [0, 10] },
      { name: 'b', inverse: true },
      { name: 'c', type: 'category', categories: ['x', 'y'] },
    ])
    expect(f.plan.rows).toEqual([[1, 2, 'x'], [3, 4, 'y']])
    expect(f.plan.parallel).toMatchObject({ lineWidth: 2, lineOpacity: 0.8, lineColor: '#123456' })
    expect(f.warnings).toEqual([])
    expect(familyToSvg(f.plan)).toContain('<polyline')
    const vert = compileFamily({ parallel: { layout: 'vertical' }, parallelAxis: [{ dim: 0 }], series: [{ type: 'parallel', data: [[1]] }] })!
    expect(vert.warnings.map((w) => w.code)).toContain('series-option-unsupported')
  })
})
