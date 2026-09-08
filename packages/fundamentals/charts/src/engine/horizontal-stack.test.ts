// Stacked and grouped bars on the FLIPPED frame.
//
// Before this they were filtered out of the horizontal render entirely: the
// chart drew its axes and nothing else, and said nothing about it. A
// population pyramid, a ranked breakdown, a survey result — every one of them
// an empty box. The tests below are the shape of that bug: they assert that
// something is DRAWN, that it is drawn to the right SCALE, and that it can be
// hit, because a bar you cannot click is only half-rendered.

import { describe, expect, it } from 'vitest'
import { chartToSvg } from './svg-chart'
import { groupedBars, stackedBars } from './marks'
import { layoutGroupedBarsH, layoutStackedBarsH } from './stack'
import { layoutChart } from './render'
import { plotHitBars } from './plot-hit'
import type { ChartSpec } from './render'

interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, b: 5 }, { m: 'Feb', a: 6, b: 2 }]
const SIZE = { width: 300, height: 160 }
const shapes = (svg: string): number => (svg.match(/<rect/g) ?? []).length + (svg.match(/<path/g) ?? []).length
const measure = (t: string, s: number): number => t.length * s * 0.55

const spec = (kind: 'stacked' | 'grouped'): ChartSpec => ({
  ...SIZE,
  series: [
    { kind, label: 'a', values: [3, 6], color: '#4f8' },
    { kind, label: 'b', values: [5, 2], color: '#88f' },
  ],
  categories: ['Jan', 'Feb'],
  theme: { axis: '#333', grid: '#eee', label: '#666', bg: '#fff', series: ['#4f8', '#88f'], fontSize: 11 } as never,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  horizontal: true,
})

describe('horizontal stacked / grouped bars', () => {
  it('draws segments instead of an empty plot', () => {
    // The regression, stated at the top level: same marks, `horizontal` on.
    const vertical = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [stackedBars<Row>((d) => d.a), stackedBars<Row>((d) => d.b)], ...SIZE })
    const flipped = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [stackedBars<Row>((d) => d.a), stackedBars<Row>((d) => d.b)], horizontal: true, ...SIZE })
    expect(shapes(vertical), 'vertical stacked draws one shape per segment').toBe(4)
    expect(shapes(flipped), 'horizontal stacked must draw the same four segments').toBe(4)

    const grouped = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [groupedBars<Row>((d) => d.a), groupedBars<Row>((d) => d.b)], horizontal: true, ...SIZE })
    expect(shapes(grouped)).toBe(4)
  })

  it('scales to the stack TOTAL, so no bar leaves the plot', () => {
    // The stack reaches 8 while no single series exceeds 6 — a per-series
    // domain would clip the longest bar off the right edge.
    const svg = chartToSvg({ data: ROWS, x: (d) => d.m, marks: [stackedBars<Row>((d) => d.a), stackedBars<Row>((d) => d.b)], horizontal: true, ...SIZE })
    const labels = [...svg.matchAll(/<text[^>]*>(\d+)<\/text>/g)].map((m) => Number(m[1]))
    expect(Math.max(...labels)).toBeGreaterThanOrEqual(8)
    const rightEdges = [...svg.matchAll(/<rect[^>]*x="([\d.]+)"[^>]*width="([\d.]+)"/g)].map((m) => Number(m[1]) + Number(m[2]))
    expect(rightEdges.length).toBeGreaterThan(0)
    for (const edge of rightEdges) expect(edge).toBeLessThanOrEqual(SIZE.width)
  })

  it('segments stack along X and bands run down Y', () => {
    // The defining property of the flipped frame, asserted on the geometry
    // rather than on pixels: within a band the segments advance in x and
    // share a y; across bands, y advances.
    const plot = { x: 0, y: 0, w: 200, h: 100 }
    const segs = layoutStackedBarsH([[3, 6], [5, 2]], plot, { min: 0, max: 8 }, 0.25)
    const band0 = segs.filter((s) => s.datumIndex === 0)
    expect(band0).toHaveLength(2)
    expect(band0[0]!.rect.y).toBe(band0[1]!.rect.y)
    expect(band0[1]!.rect.x).toBeGreaterThan(band0[0]!.rect.x)
    const band1 = segs.filter((s) => s.datumIndex === 1)
    expect(band1[0]!.rect.y).toBeGreaterThan(band0[0]!.rect.y)
  })

  it('grouped bars split the band DOWN, one row per series', () => {
    const plot = { x: 0, y: 0, w: 200, h: 100 }
    const segs = layoutGroupedBarsH([[3, 6], [5, 2]], plot, { min: 0, max: 6 }, 0.25)
    const band0 = segs.filter((s) => s.datumIndex === 0)
    expect(band0).toHaveLength(2)
    expect(band0[1]!.rect.y).toBeGreaterThan(band0[0]!.rect.y)
    expect(band0[0]!.rect.h).toBeCloseTo(band0[1]!.rect.h, 6)
  })

  it('a gap draws a zero-width bar rather than a NaN one', () => {
    const segs = layoutGroupedBarsH([[Number.NaN, 6]], { x: 0, y: 0, w: 200, h: 100 }, { min: 0, max: 6 }, 0.25)
    expect(segs[0]!.rect.w).toBe(0)
    expect(Number.isNaN(segs[0]!.rect.x)).toBe(false)
  })

  it('a tap reports the band it landed in', () => {
    // The other half of "drawn": before this the horizontal hit test returned
    // -1 unconditionally, which was right while nothing was painted and a
    // dead control the moment something was.
    const s = spec('stacked')
    const p = layoutChart(s, measure).plot
    expect(plotHitBars(s, measure, p.x + 10, p.y + p.h * 0.25)).toBe(0)
    expect(plotHitBars(s, measure, p.x + 10, p.y + p.h * 0.75)).toBe(1)
    const g = spec('grouped')
    const gp = layoutChart(g, measure).plot
    expect(plotHitBars(g, measure, gp.x + 5, gp.y + gp.h * 0.15)).toBe(0)
  })

  it('a tap above the plot hits nothing', () => {
    const s = spec('stacked')
    const p = layoutChart(s, measure).plot
    expect(plotHitBars(s, measure, p.x + 10, p.y - 20)).toBe(-1)
  })
})
