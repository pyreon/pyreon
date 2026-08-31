// The horizontal frame: categories on Y, values on X, bars growing rightward.

import { describe, expect, it } from 'vitest'
import { bandTicksY, layoutBarsH } from './layout'
import { bars, line, resolveCategories, resolveMarks } from './marks'
import { compact } from './format'
import { defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec } from './render'
import type { Rect } from './types'

const PLOT: Rect = { x: 50, y: 10, w: 300, h: 200 }

function spec(overrides: Partial<ChartSpec>): ChartSpec {
  return {
    width: 400,
    height: 240,
    series: [],
    categories: [],
    theme: defaultTheme,
    showXAxis: true,
    showYAxis: true,
    showGrid: true,
    horizontal: true,
    ...overrides,
  }
}

const DATA = [
  { name: 'Engineering', v: 40 },
  { name: 'Design', v: 25 },
  { name: 'Operations and Logistics', v: 60 },
]
const SERIES = resolveMarks(DATA, [bars((d: (typeof DATA)[number]) => d.v)])
const CATS = resolveCategories(DATA, (d: (typeof DATA)[number]) => d.name)

describe('layoutBarsH', () => {
  it('bands run down the plot; values run along it', () => {
    const rects = layoutBarsH([10, 20], PLOT, { min: 0, max: 20 }, 0)
    expect(rects).toHaveLength(2)
    // Both bars start at the zero line (the plot's left edge here).
    expect(rects[0]!.x).toBeCloseTo(PLOT.x, 5)
    expect(rects[1]!.x).toBeCloseTo(PLOT.x, 5)
    // The 20 fills the width; the 10 fills half.
    expect(rects[1]!.w).toBeCloseTo(PLOT.w, 5)
    expect(rects[0]!.w).toBeCloseTo(PLOT.w / 2, 5)
    // Stacked vertically, half the height each with no gap ratio.
    expect(rects[0]!.h).toBeCloseTo(PLOT.h / 2, 5)
    expect(rects[1]!.y).toBeGreaterThan(rects[0]!.y)
  })

  it('a negative value extends LEFT of the zero line', () => {
    const rects = layoutBarsH([-10, 10], PLOT, { min: -10, max: 10 }, 0)
    const zeroX = PLOT.x + PLOT.w / 2
    // Negative: right edge at zero, extending left.
    expect(rects[0]!.x + rects[0]!.w).toBeCloseTo(zeroX, 5)
    expect(rects[0]!.x).toBeCloseTo(PLOT.x, 5)
    // Positive: left edge at zero, extending right.
    expect(rects[1]!.x).toBeCloseTo(zeroX, 5)
  })

  it('is empty for no values', () => {
    expect(layoutBarsH([], PLOT, { min: 0, max: 1 }, 0.25)).toHaveLength(0)
  })
})

describe('the horizontal layout frame', () => {
  it('sizes the left gutter by the widest CATEGORY label, not value labels', () => {
    // Category text is much wider than any value label under this measure —
    // a gutter sized for numbers would clip every category.
    const measure = (t: string): number => t.length * 7
    const l = layoutChart(spec({ series: SERIES, categories: CATS }), measure)
    const widest = Math.max(...CATS.map(measure))
    expect(l.plot.x).toBeGreaterThanOrEqual(widest)
  })

  it('puts category bands on Y and value ticks on X, keeping the formatter', () => {
    const l = layoutChart(
      spec({ series: SERIES, categories: CATS, yDomain: { min: 0, max: 3_000_000 }, yFormat: compact }),
      () => 30,
    )
    expect(l.yTicks.map((t) => t.label)).toEqual(CATS)
    // Value ticks along x carry the y-formatter — a chart flipped horizontal
    // keeps its "$3.2K"-style labels without re-wiring.
    expect(l.xTicks.length).toBeGreaterThan(0)
    expect(l.xTicks.some((t) => t.label.endsWith('M'))).toBe(true)
  })

  it('bandTicksY centres each band', () => {
    const ticks = bandTicksY(['a', 'b'], PLOT)
    expect(ticks[0]!.pos).toBeCloseTo(PLOT.y + PLOT.h / 4, 5)
    expect(ticks[1]!.pos).toBeCloseTo(PLOT.y + (3 * PLOT.h) / 4, 5)
  })
})

describe('horizontal rendering', () => {
  it('draws bars from the zero line rightward, grid on the value axis', () => {
    const cmds = renderChart(spec({ series: SERIES, categories: CATS }), () => 30)
    const rects = cmds.filter((c) => c.kind === 'rect')
    expect(rects).toHaveLength(3)
    // All bars share the same left edge (zero line); widths order by value.
    const xs = rects.map((c) => (c.kind === 'rect' ? c.rect.x : -1))
    expect(new Set(xs.map((x) => Math.round(x))).size).toBe(1)
    const ws = rects.map((c) => (c.kind === 'rect' ? c.rect.w : -1))
    expect(ws[2]).toBeGreaterThan(ws[0]!)
    expect(ws[0]).toBeGreaterThan(ws[1]!)
    // Gridlines are VERTICAL in this frame.
    const grid = cmds.find((c) => c.kind === 'line')
    if (grid?.kind !== 'line') throw new Error('expected grid')
    expect(grid.from.x).toBeCloseTo(grid.to.x, 5)
  })

  it('SKIPS a non-bar series rather than drawing a misleading transpose', () => {
    const mixed = resolveMarks(DATA, [
      bars((d: (typeof DATA)[number]) => d.v),
      line((d: (typeof DATA)[number]) => d.v),
    ])
    const cmds = renderChart(spec({ series: mixed, categories: CATS, showGrid: false, showXAxis: false, showYAxis: false }), () => 30)
    expect(cmds.filter((c) => c.kind === 'rect')).toHaveLength(3)
    expect(cmds.filter((c) => c.kind === 'polyline')).toHaveLength(0)
  })

  it('the entrance grows bars from the zero line; a negative bar grows leftward', () => {
    const negData = [{ v: -30 }, { v: 50 }]
    const series = resolveMarks(negData, [bars((d: (typeof negData)[number]) => d.v)])
    const full = renderChart(spec({ series, showGrid: false }), () => 30)
    const half = renderChart(spec({ series, showGrid: false, progress: 0.5 }), () => 30)
    const fr = full.filter((c) => c.kind === 'rect')
    const hr = half.filter((c) => c.kind === 'rect')
    // Negative: RIGHT edge (the zero line) stays put.
    if (fr[0]!.kind !== 'rect' || hr[0]!.kind !== 'rect') throw new Error('rects')
    expect(hr[0]!.rect.x + hr[0]!.rect.w).toBeCloseTo(fr[0]!.rect.x + fr[0]!.rect.w, 5)
    expect(hr[0]!.rect.w).toBeCloseTo(fr[0]!.rect.w * 0.5, 5)
    // Positive: LEFT edge stays put.
    if (fr[1]!.kind !== 'rect' || hr[1]!.kind !== 'rect') throw new Error('rects')
    expect(hr[1]!.rect.x).toBeCloseTo(fr[1]!.rect.x, 5)
  })

  it('value labels sit past the bar end — right of positive, left of negative', () => {
    const negData = [{ v: -30 }, { v: 50 }]
    const series = resolveMarks(negData, [
      bars((d: (typeof negData)[number]) => d.v, { showValues: true }),
    ])
    const cmds = renderChart(spec({ series, showGrid: false, showXAxis: false, showYAxis: false }), () => 30)
    const rects = cmds.filter((c) => c.kind === 'rect')
    const neg = cmds.find((c) => c.kind === 'text' && c.text === '-30')
    const pos = cmds.find((c) => c.kind === 'text' && c.text === '50')
    if (neg?.kind !== 'text' || pos?.kind !== 'text') throw new Error('labels')
    if (rects[0]!.kind !== 'rect' || rects[1]!.kind !== 'rect') throw new Error('rects')
    expect(neg.at.x).toBeLessThan(rects[0]!.rect.x)
    expect(neg.align).toBe('end')
    expect(pos.at.x).toBeGreaterThan(rects[1]!.rect.x + rects[1]!.rect.w)
    expect(pos.align).toBe('start')
  })

  it('vertical output is byte-identical with horizontal absent vs false', () => {
    const a = renderChart(spec({ series: SERIES, categories: CATS, horizontal: false }), () => 30)
    const { horizontal: _h, ...rest } = spec({ series: SERIES, categories: CATS })
    const b = renderChart(rest, () => 30)
    expect(a).toEqual(b)
  })
})
