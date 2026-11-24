import { describe, expect, it } from 'vitest'
import { layoutBars, layoutBarsH } from './layout'
import { layoutGroupedBars, layoutGroupedBarsH, layoutStackedBars, layoutStackedBarsH, layoutWaterfall } from './stack'
import { barsFor, defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec } from './render'
import { bars, groupedBars, resolveMarks } from './marks'

const plot = { x: 0, y: 0, w: 400, h: 200 }
const dom = { min: 0, max: 10 }
const measure = (t: string, s: number): number => t.length * s * 0.6

describe('bar thickness: barWidth', () => {
  it('unset lays out exactly as before (band * 0.75, centred)', () => {
    const r = layoutBars([5, 5], plot, dom, 0.25)
    expect(r[0]!.w).toBe(150)
    expect(r[0]!.x).toBe(25)
  })
  it('is a px ceiling, centred in the band', () => {
    const r = layoutBars([5, 5], plot, dom, 0.25, 40)
    expect(r.map((b) => [b.x, b.w])).toEqual([[80, 40], [280, 40]])
  })
  it('never exceeds the slot the band leaves', () => {
    expect(layoutBars([5, 5], plot, dom, 0.25, 999)[0]!.w).toBe(150)
  })
  it('ignores zero, negative and missing widths', () => {
    expect(layoutBars([5], plot, dom, 0.25, 0)[0]!.w).toBe(400 * 0.75)
    expect(layoutBars([5], plot, dom, 0.25, -3)[0]!.w).toBe(400 * 0.75)
  })
  it('applies to horizontal, stacked and waterfall bars', () => {
    expect(layoutBarsH([5, 5], plot, dom, 0.25, 20)[0]!.h).toBe(20)
    expect(layoutStackedBars([[1, 2], [1, 2]], plot, dom, 0.25, 30)[0]!.rect.w).toBe(30)
    expect(layoutStackedBarsH([[1, 2], [1, 2]], plot, dom, 0.25, 12)[0]!.rect.h).toBe(12)
    expect(layoutWaterfall([3, -1], plot, dom, 0.25, 25)[0]!.rect.w).toBe(25)
  })
})

describe('grouped bars: barGap and barWidth', () => {
  const vals = [[1, 2], [3, 4], [5, 6]]
  it('unset: bars abut and fill the group (unchanged)', () => {
    const g = layoutGroupedBars(vals, plot, dom, 0.25)
    expect(g[0]!.rect.w).toBe(50)
    expect(g[1]!.rect.x).toBeCloseTo(g[0]!.rect.x + g[0]!.rect.w, 9)
  })
  it('barGap spaces bars by a fraction of a bar and keeps the group inside its slot', () => {
    const g = layoutGroupedBars(vals, plot, dom, 0.25, undefined, 0.5)
    const [a, b, c] = [g[0]!.rect, g[1]!.rect, g[2]!.rect]
    expect(b.x - (a.x + a.w)).toBeCloseTo(a.w * 0.5, 9)
    expect(c.x - (b.x + b.w)).toBeCloseTo(a.w * 0.5, 9)
    const groupW = (400 / 2) * 0.75
    expect(c.x + c.w - a.x).toBeCloseTo(groupW, 9)
    // the group stays centred in its band
    expect(a.x + (c.x + c.w - a.x) / 2).toBeCloseTo(100, 9)
  })
  it('barWidth narrows each grouped bar and recentres the group', () => {
    const g = layoutGroupedBars(vals, plot, dom, 0.25, 10)
    expect(g[0]!.rect.w).toBe(10)
    expect(g[0]!.rect.x + (g[2]!.rect.x + 10 - g[0]!.rect.x) / 2).toBeCloseTo(100, 9)
  })
  it('horizontal grouped mirrors the vertical arithmetic', () => {
    const v = layoutGroupedBars(vals, plot, dom, 0.25, 10, 0.5)
    const h = layoutGroupedBarsH(vals, { x: 0, y: 0, w: 200, h: 400 }, dom, 0.25, 10, 0.5)
    expect(h.map((s) => s.rect.h)).toEqual(v.map((s) => s.rect.w))
    expect(h[1]!.rect.y - h[0]!.rect.y).toBeCloseTo(v[1]!.rect.x - v[0]!.rect.x, 9)
  })
})

describe('chart spec: barCategoryGap and byte stability', () => {
  const rows = [{ a: 1, b: 2 }, { a: 3, b: 4 }]
  const base = (extra: Partial<ChartSpec>): ChartSpec => ({
    width: 400, height: 200, series: resolveMarks(rows, [bars((d: { a: number }) => d.a)]), categories: ['x', 'y'],
    theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, ...extra,
  })
  it('a spec that sets none of the options draws the same commands as one that sets the defaults', () => {
    const a = renderChart(base({}), measure)
    const b = renderChart(base({ barCategoryGap: 0.25 }), measure)
    expect(b).toEqual(a)
  })
  it('barCategoryGap changes the band share, and the hit rects follow', () => {
    const spec = base({ barCategoryGap: 0.5 })
    const plotRect = layoutChart(spec, measure).plot
    const r = barsFor(spec, 0, measure)[0]!
    expect(r.w).toBeCloseTo((plotRect.w / 2) * 0.5, 9)
  })
  it('grouped marks follow barGap through renderChart', () => {
    const marks = [groupedBars((d: { a: number }) => d.a), groupedBars((d: { b: number }) => d.b)]
    const mk = (extra: Partial<ChartSpec>): ChartSpec => ({ ...base(extra), series: resolveMarks(rows, marks) })
    expect(renderChart(mk({ barGap: 0.4 }), measure)).not.toEqual(renderChart(mk({}), measure))
  })
})
