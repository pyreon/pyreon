// The render paths a `<Chart>` / `<PlotChart>` reaches that no other spec
// drove: datum symbols on a line and non-circle symbols on points, the
// `average` marker, bar hit rects for stacked / grouped / horizontal series,
// a category x-band annotation, a pinned domain under a stacked area, and a
// band whose lower bound runs short. Every assertion is on the draw list or the
// geometry, so it holds for canvas, SVG and the generated native engines.
import { describe, expect, it } from 'vitest'
import { barsFor, barsForIn, defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const series = (kind: Series['kind'], values: number[], over: Partial<Series> = {}): Series => ({
  kind,
  values,
  color: '#0f766e',
  width: 2,
  radius: 4,
  label: 'S',
  ...over,
})
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400,
  height: 240,
  series: [series('line', [1, 2, 3])],
  categories: ['a', 'b', 'c'],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: false,
  ...over,
})
const ofKind = <K extends DrawCmd['kind']>(cmds: DrawCmd[], kind: K) => cmds.filter((c): c is Extract<DrawCmd, { kind: K }> => c.kind === kind)

describe('datum symbols', () => {
  it('a line with a `symbol` draws one at every finite datum, and none at a gap', () => {
    const plain = renderChart(spec({ series: [series('line', [1, Number.NaN, 3])] }), measure)
    expect(ofKind(plain, 'circle')).toHaveLength(0)
    const dotted = renderChart(spec({ series: [series('line', [1, Number.NaN, 3], { symbol: 'circle' })] }), measure)
    const circles = ofKind(dotted, 'circle').filter((c) => c.fill === '#0f766e')
    expect(circles).toHaveLength(2)
    expect(circles.every((c) => c.radius === 4)).toBe(true)
  })

  it('a line symbol draws the shape it names', () => {
    const cmds = renderChart(spec({ series: [series('line', [1, 2, 3], { symbol: 'rect' })] }), measure)
    const cells = ofKind(cmds, 'rect').filter((c) => c.fill === '#0f766e')
    expect(cells).toHaveLength(3)
    expect(cells.every((c) => c.rect.w === 8 && c.rect.h === 8)).toBe(true)
  })

  it('points draw diamonds, triangles and rects as their own outlines', () => {
    for (const [symbol, sides] of [['diamond', 4], ['triangle', 3]] as const) {
      const cmds = renderChart(spec({ series: [series('points', [1, 2, 3], { symbol })] }), measure)
      const shapes = ofKind(cmds, 'polygon').filter((c) => c.fill === '#0f766e')
      expect(shapes, symbol).toHaveLength(3)
      expect(shapes.every((c) => c.points.length === sides), symbol).toBe(true)
    }
    const rects = ofKind(renderChart(spec({ series: [series('points', [1, 2, 3], { symbol: 'rect' })] }), measure), 'rect').filter((c) => c.fill === '#0f766e')
    expect(rects).toHaveLength(3)
  })
})

describe('the `average` marker', () => {
  it('sits on the datum nearest the mean, not at the mean itself', () => {
    const s = spec({ series: [series('line', [0, 1, 9, 10])], categories: ['a', 'b', 'c', 'd'], markers: [{ at: 'average', label: 'avg', color: '#ff0000' }] })
    const cmds = renderChart(s, measure)
    const dot = ofKind(cmds, 'circle').find((c) => c.fill === '#ff0000')!
    // The mean is 5. Datums 1 and 9 are both 4 away; the scan keeps the first, index 1.
    const l = layoutChart(s, measure)
    const band = l.plot.w / 4
    expect(dot.center.x).toBeCloseTo(l.plot.x + band * 1.5, 6)
    expect(ofKind(cmds, 'text').some((t) => t.text === 'avg')).toBe(true)
  })
})

describe('bar hit rects', () => {
  it('stacked and grouped series answer per series, index-aligned with their values', () => {
    const stacked = spec({ series: [series('stacked', [1, 2, 3]), series('stacked', [3, 2, 1]), series('grouped', [2, 2, 2])] })
    const a = barsFor(stacked, 0, measure)
    const b = barsFor(stacked, 1, measure)
    expect(a).toHaveLength(3)
    // The second series stacks ON the first: same column, above it.
    for (let i = 0; i < 3; i++) {
      expect(b[i]!.x).toBeCloseTo(a[i]!.x, 6)
      expect(b[i]!.y + b[i]!.h).toBeCloseTo(a[i]!.y, 6)
    }
    const g = barsFor(stacked, 2, measure)
    expect(g).toHaveLength(3)
    expect(g.every((r) => r.w > 0 && r.h > 0)).toBe(true)
  })

  it('a gap in a stacked series is an empty rect nothing can land in', () => {
    const s = spec({ series: [series('stacked', [1, Number.NaN, 3])] })
    expect(barsFor(s, 0, measure)[1]).toEqual({ x: 0, y: 0, w: -1, h: -1 })
  })

  it('a horizontal chart reports its bars, stacked or plain, along the category rows', () => {
    const plain = spec({ horizontal: true, series: [series('bars', [1, 2, 3])] })
    const l = layoutChart(plain, measure)
    const rows = barsForIn(plain, 0, l.plot)
    expect(rows).toHaveLength(3)
    expect(rows[1]!.y).toBeGreaterThan(rows[0]!.y)
    expect(rows[2]!.w).toBeGreaterThan(rows[0]!.w)
    const stacked = spec({ horizontal: true, series: [series('stacked', [1, 2]), series('stacked', [1, 1])] })
    const top = barsForIn(stacked, 1, layoutChart(stacked, measure).plot)
    const base = barsForIn(stacked, 0, layoutChart(stacked, measure).plot)
    expect(top[0]!.x).toBeCloseTo(base[0]!.x + base[0]!.w, 6)
  })

  it('a line has no bar rects', () => {
    expect(barsFor(spec(), 0, measure)).toEqual([])
    expect(barsFor(spec(), 5, measure)).toEqual([])
  })
})

describe('a category x-band annotation', () => {
  it('spans from the first band start to the last band end, whichever way it is written', () => {
    const forward = spec({ annotations: [{ xFrom: 0, xTo: 1, color: '#ff0000' }] })
    const backward = spec({ annotations: [{ xFrom: 1, xTo: 0, color: '#ff0000' }] })
    const l = layoutChart(forward, measure)
    const bandOf = (s: ChartSpec) => ofKind(renderChart(s, measure), 'rect').find((c) => c.fill.startsWith('rgba(255, 0, 0'))!
    const f = bandOf(forward)
    expect(f.rect.x).toBeCloseTo(l.plot.x, 6)
    expect(f.rect.w).toBeCloseTo((l.plot.w / 3) * 2, 6)
    expect(bandOf(backward).rect).toEqual(f.rect)
  })
})

describe('a stacked area on a pinned domain', () => {
  it('a band with nothing below it closes at the nearest domain edge when the domain excludes zero', () => {
    const at = (yDomain: { min: number; max: number }) => {
      const s = spec({ yDomain, series: [series('stackedArea', yDomain.min > 0 ? [20, 30, 40] : [-20, -30, -40])] })
      const poly = ofKind(renderChart(s, measure), 'polygon')[0]!
      const l = layoutChart(s, measure)
      return { poly, l }
    }
    const up = at({ min: 10, max: 50 })
    // The floor is the plot's bottom edge (the domain's min, 10), not zero below it.
    expect(Math.max(...up.poly.points.map((p) => p.y))).toBeCloseTo(up.l.plot.y + up.l.plot.h, 6)
    const down = at({ min: -50, max: -10 })
    expect(Math.min(...down.poly.points.map((p) => p.y))).toBeCloseTo(down.l.plot.y, 6)
  })
})

describe('a band whose lower bound runs short', () => {
  it('pairs only where both bounds exist; a datum past the lower bound is a gap', () => {
    const s = spec({ categories: ['a', 'b', 'c', 'd'], series: [series('band', [5, 6, 7, 8], { values2: [1, 2] })] })
    const polys = ofKind(renderChart(s, measure), 'polygon')
    expect(polys).toHaveLength(1)
    // Two datums paired: two points along the top, two back along the bottom.
    expect(polys[0]!.points).toHaveLength(4)
  })
})
