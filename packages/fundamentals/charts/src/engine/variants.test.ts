import { describe, expect, it } from 'vitest'
import { defaultTheme, renderChart } from './render'
import type { ChartSpec, Series } from './render'
import { measureApprox } from './svg'
import { bars, points, resolveMarks } from './marks'
import { compileOption, optionToSvg } from './option'

const base = (series: Series[], horizontal = false): ChartSpec => ({
  width: 400, height: 300, series, categories: ['a', 'b', 'c'], theme: defaultTheme, showXAxis: false, showYAxis: false, showGrid: false, horizontal,
} as ChartSpec)
const S = (over: Partial<Series>): Series => ({ kind: 'bars', values: [3, 6, 9], color: '#123456', width: 2, radius: 4, label: 's', ...over })

describe('effectScatter (points with halos)', () => {
  it('draws two translucent halos under every dot, scaled with the entrance', () => {
    const cmds = renderChart(base([S({ kind: 'points', effect: true })]), measureApprox())
    const circles = cmds.filter((c) => c.kind === 'circle')
    expect(circles).toHaveLength(9)
    const [halo, mid, dot] = circles
    if (halo?.kind !== 'circle' || mid?.kind !== 'circle' || dot?.kind !== 'circle') throw new Error('circle')
    expect(halo.radius).toBeCloseTo(dot.radius * 2.6, 9)
    expect(mid.radius).toBeCloseTo(dot.radius * 1.7, 9)
    expect(halo.fill).toContain('rgba')
    expect(dot.fill).toBe('#123456')
    const plain = renderChart(base([S({ kind: 'points' })]), measureApprox())
    expect(plain.filter((c) => c.kind === 'circle')).toHaveLength(3)
    const half = renderChart({ ...base([S({ kind: 'points', effect: true })]), progress: 0.5 }, measureApprox())
    const h0 = half.filter((c) => c.kind === 'circle')[0]!
    if (h0.kind !== 'circle') throw new Error('circle')
    expect(h0.radius).toBeCloseTo(halo.radius / 2, 9)
  })
})

describe('pictorialBar (symbol bars)', () => {
  it('stretches one symbol over the bar, or repeats a unit symbol along it (partial units dropped)', () => {
    const stretched = renderChart(base([S({ symbol: 'diamond' })]), measureApprox())
    expect(stretched.filter((c) => c.kind === 'polygon')).toHaveLength(3)
    expect(stretched.filter((c) => c.kind === 'rect')).toHaveLength(0)
    // 160px wide: bars ~40px, so even the shortest bar holds a couple of units (at 400px it was one dropped partial).
    const repeated = renderChart({ ...base([S({ symbol: 'circle', symbolRepeat: true })]), width: 160 }, measureApprox())
    const circles = repeated.filter((c) => c.kind === 'circle')
    expect(circles.length).toBeGreaterThan(3)
    const plainRects = renderChart({ ...base([S({})]), width: 160 }, measureApprox()).filter((c) => c.kind === 'rect')
    if (plainRects[2]!.kind !== 'rect' || plainRects[0]!.kind !== 'rect') throw new Error('rect')
    const tall = plainRects[2]!.rect
    const unit = tall.w
    const expectedTall = Math.floor(tall.h / unit + 1e-9)
    const inTall = circles.filter((c) => c.kind === 'circle' && Math.abs(c.center.x - (tall.x + tall.w / 2)) < 1e-6)
    expect(inTall).toHaveLength(expectedTall)
    const lowest = inTall[0]!
    if (lowest.kind !== 'circle') throw new Error('circle')
    expect(lowest.center.y).toBeCloseTo(tall.y + tall.h - unit / 2, 6)
    const tri = renderChart({ ...base([S({ symbol: 'triangle', symbolRepeat: true })]), width: 160 }, measureApprox())
    expect(tri.filter((c) => c.kind === 'polygon').length).toBeGreaterThan(3)
    const rects = renderChart({ ...base([S({ symbol: 'rect', symbolRepeat: true })]), width: 160 }, measureApprox()).filter((c) => c.kind === 'rect')
    expect(rects.length).toBeGreaterThan(3)
  })
  it('repeats along x on a horizontal chart', () => {
    const cmds = renderChart(base([S({ symbol: 'circle', symbolRepeat: true })], true), measureApprox())
    const circles = cmds.filter((c) => c.kind === 'circle')
    const ys = new Set(circles.map((c) => (c.kind === 'circle' ? Math.round(c.center.y) : 0)))
    expect(ys.size).toBe(3)
    expect(circles.length).toBeGreaterThan(3)
  })
})

describe('marks + facade', () => {
  it('mark options carry effect/symbol/symbolRepeat into the Series', () => {
    const rows = [{ v: 1 }, { v: 2 }]
    const s = resolveMarks(rows, [points((d: { v: number }) => d.v, { effect: true }), bars((d: { v: number }) => d.v, { symbol: 'triangle', symbolRepeat: true })])
    expect(s[0]!.effect).toBe(true)
    expect(s[1]!.symbol).toBe('triangle')
    expect(s[1]!.symbolRepeat).toBe(true)
  })
  it('effectScatter and pictorialBar lower from the option facade; an unsupported symbol falls back with a warning', () => {
    const c = compileOption({ xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'effectScatter', data: [1, 2] }, { type: 'pictorialBar', symbol: 'circle', symbolRepeat: true, data: [3, 4] }] })
    expect(c.warnings).toEqual([])
    expect(c.spec.series[0]).toMatchObject({ kind: 'points', effect: true })
    expect(c.spec.series[1]).toMatchObject({ kind: 'bars', symbol: 'circle', symbolRepeat: true })
    const svg = optionToSvg({ xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'pictorialBar', symbol: 'diamond', data: [3, 4] }] })
    expect(svg).toContain('<polygon')
    const bad = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', symbol: 'path://M0 0L1 1', data: [1] }] })
    expect(bad.warnings.map((w) => w.code)).toEqual(['mark-shape-unsupported'])
    expect(bad.spec.series[0]!.symbol).toBe('rect')
    const stacked = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', stack: 's', data: [1] }, { type: 'pictorialBar', stack: 's', data: [1] }] })
    expect(stacked.spec.series[0]!.kind).toBe('stacked')
  })
})
