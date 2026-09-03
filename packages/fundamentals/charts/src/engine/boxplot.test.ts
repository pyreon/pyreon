import { describe, expect, it } from 'vitest'
import { boxplotExtent, boxplotToSvg, fiveNumber, hitBox, renderBoxplot } from './boxplot'
import { compileFamily, familyToSvg } from './option-family'

const plot = { x: 0, y: 0, w: 300, h: 100 }

describe('fiveNumber', () => {
  it('interpolated quartiles (R-7), Tukey fences, outliers beyond them', () => {
    const f = fiveNumber([1, 2, 3, 4, 5, 6, 7, 8, 9, 100])
    expect(f.q1).toBeCloseTo(3.25, 9)
    expect(f.median).toBeCloseTo(5.5, 9)
    expect(f.q3).toBeCloseTo(7.75, 9)
    expect(f.outliers).toEqual([100])
    expect(f.max).toBe(9)
    expect(f.min).toBe(1)
  })
  it('drops NaN, handles a single value and an empty set', () => {
    expect(fiveNumber([NaN, 4]).median).toBe(4)
    expect(fiveNumber([]).median).toBe(0)
    const one = fiveNumber([7])
    expect(one.q1).toBe(7)
    expect(one.outliers).toEqual([])
  })
})

describe('boxplot geometry', () => {
  const rows = [fiveNumber([1, 2, 3, 4, 5]), fiveNumber([10, 20, 30, 40, 50, 200])]
  it('extent covers whiskers and outliers', () => {
    const e = boxplotExtent(rows)
    expect(e.min).toBe(1)
    expect(e.max).toBe(200)
  })
  it('renders whiskers, caps, box, median and outlier dots per category', () => {
    const cmds = renderBoxplot(rows, plot, { min: 0, max: 200 })
    expect(cmds.filter((c) => c.kind === 'rect')).toHaveLength(2)
    expect(cmds.filter((c) => c.kind === 'circle')).toHaveLength(1)
    // 4 whisker/cap lines + 1 median per box
    expect(cmds.filter((c) => c.kind === 'line')).toHaveLength(10)
  })
  it('the box spans Q1..Q3 on the value scale', () => {
    const cmds = renderBoxplot([fiveNumber([0, 25, 50, 75, 100])], plot, { min: 0, max: 100 })
    const box = cmds.find((c) => c.kind === 'rect')!
    if (box.kind !== 'rect') throw new Error('rect')
    expect(box.rect.y).toBeCloseTo(25, 9)
    expect(box.rect.h).toBeCloseTo(50, 9)
  })
  it('the entrance grows out of the median and hides outliers until settled', () => {
    // A wide box, so the halved height is not swallowed by the 1px minimum.
    const wide = [fiveNumber([0, 25, 50, 75, 100])]
    const half = renderBoxplot(rows, plot, { min: 0, max: 200 }, { progress: 0.5 })
    expect(half.filter((c) => c.kind === 'circle')).toHaveLength(0)
    const full = renderBoxplot(wide, plot, { min: 0, max: 100 })
    const halfWide = renderBoxplot(wide, plot, { min: 0, max: 100 }, { progress: 0.5 })
    const hb0 = halfWide.find((c) => c.kind === 'rect')!
    const fb0 = full.find((c) => c.kind === 'rect')!
    if (hb0.kind !== 'rect' || fb0.kind !== 'rect') throw new Error('rect')
    expect(hb0.rect.h).toBeCloseTo(fb0.rect.h / 2, 9)
  })
  it('hitBox maps a point to its band, -1 outside the plot', () => {
    expect(hitBox(3, plot, 10, 50)).toBe(0)
    expect(hitBox(3, plot, 150, 50)).toBe(1)
    expect(hitBox(3, plot, 290, 50)).toBe(2)
    expect(hitBox(3, plot, 150, 500)).toBe(-1)
  })
  it('boxplotToSvg renders axes + boxes and derives a description', () => {
    const svg = boxplotToSvg({ data: [[1, 2, 3], [4, 5, 6]], values: (d) => d, x: (_d, i) => `g${i}`, title: 'Spread' })
    expect(svg).toContain('<svg')
    expect(svg).toContain('2 boxes')
    expect(svg).not.toContain('NaN')
  })
})

describe('boxplot option mapping', () => {
  it('ECharts tuples are [min, Q1, median, Q3, max]; outliers come from a companion scatter', () => {
    const f = compileFamily({
      xAxis: { data: ['a', 'b'] }, yAxis: {},
      series: [{ type: 'boxplot', data: [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]] }, { type: 'scatter', data: [[1, 9]] }],
    })!
    if (f.plan.kind !== 'boxplot') throw new Error('kind')
    expect(f.plan.rows[0]).toMatchObject({ x: 'a', min: 1, q1: 2, median: 3, q3: 4, max: 5 })
    expect(f.plan.rows[1]!.outliers).toEqual([9])
    expect(f.warnings).toEqual([])
    expect(familyToSvg(f.plan)).toContain('<rect')
  })
})
