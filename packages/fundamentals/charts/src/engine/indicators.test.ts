import { describe, expect, it } from 'vitest'
import { bollinger, ema, emaValues, sma, smaValues, stdevValues, trend, trendValues } from './indicators'
import { line, resolveMarks } from './marks'
import { defaultTheme, renderChart, resolveYDomain } from './render'
import type { ChartSpec, Series } from './render'
import { compileOption } from './option'
import type { Double } from './types'

const measure = (t: string, _s: Double): Double => t.length * 7.0

describe('indicator math', () => {
  it('sma: warm-up is NaN, then the trailing mean', () => {
    expect(smaValues([1, 2, 3, 4], 2)).toEqual([NaN, 1.5, 2.5, 3.5])
    expect(smaValues([5], 1)).toEqual([5])
  })
  it('ema: seeded with the first window SMA, then exponentially weighted', () => {
    const e = emaValues([1, 2, 3, 4], 2)
    expect(e[0]).toBeNaN()
    expect(e[1]).toBeCloseTo(1.5, 9)
    // alpha = 2/3: 3*2/3 + 1.5*1/3 = 2.5
    expect(e[2]).toBeCloseTo(2.5, 9)
  })
  it('stdev: population deviation over the window', () => {
    const s = stdevValues([2, 4, 4, 4], 2)
    expect(s[0]).toBeNaN()
    expect(s[1]).toBeCloseTo(1, 9)
    expect(s[2]).toBeCloseTo(0, 9)
  })
  it('trend: least squares through the points; gaps are skipped', () => {
    expect(trendValues([1, 2, 3, 4]).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 2, 3, 4])
    const t = trendValues([1, NaN, 3, 4])
    expect(t.every(Number.isFinite)).toBe(true)
  })
  it('marks carry the transform into resolveMarks; bollinger spreads to three lines', () => {
    const data = [1, 2, 3, 4, 5]
    const s = resolveMarks(data, [sma((d: number) => d, 2), ...bollinger((d: number) => d, 3, 2, { label: 'BB' }), ema((d: number) => d, 2), trend((d: number) => d)])
    expect(s).toHaveLength(6)
    expect(s[0]!.values[0]).toBeNaN()
    expect(s[0]!.values[1]).toBe(1.5)
    expect(s.slice(1, 4).map((x) => x.label)).toEqual(['BB upper', 'BB middle', 'BB lower'])
    expect(s[1]!.values[4]!).toBeGreaterThan(s[2]!.values[4]!)
    expect(s[3]!.values[4]!).toBeLessThan(s[2]!.values[4]!)
  })
})

const S = (over: Partial<Series>): Series => ({ kind: 'line', values: [], color: '#111', width: 2, radius: 3, label: 's', ...over })
const spec = (series: Series[]): ChartSpec => ({ width: 400, height: 200, series, categories: [], theme: defaultTheme, showXAxis: false, showYAxis: false, showGrid: false })

describe('gaps (NaN) in the engine', () => {
  it('a line breaks into runs at a gap instead of bridging or zeroing', () => {
    const cmds = renderChart(spec([S({ values: [1, 2, NaN, 4, 5] })]), measure)
    const polys = cmds.filter((c) => c.kind === 'polyline')
    expect(polys).toHaveLength(2)
    if (polys[0]!.kind !== 'polyline' || polys[1]!.kind !== 'polyline') throw new Error('polyline')
    expect(polys[0]!.points).toHaveLength(2)
    expect(polys[1]!.points).toHaveLength(2)
    // The run after the gap keeps its ORIGINAL x positions (index 3 and 4).
    const full = renderChart(spec([S({ values: [1, 2, 3, 4, 5] })]), measure).filter((c) => c.kind === 'polyline')[0]!
    if (full.kind !== 'polyline') throw new Error('polyline')
    expect(polys[1]!.points[0]!.x).toBeCloseTo(full.points[3]!.x, 9)
  })
  it('an area splits the same way; points skip the gap; a single-point run draws nothing', () => {
    const area = renderChart(spec([S({ kind: 'area', values: [1, NaN, 3, 4] })]), measure)
    expect(area.filter((c) => c.kind === 'polygon')).toHaveLength(1)
    const dots = renderChart(spec([S({ kind: 'points', values: [1, NaN, 3] })]), measure)
    expect(dots.filter((c) => c.kind === 'circle')).toHaveLength(2)
  })
  it('the derived domain ignores gaps', () => {
    const d = resolveYDomain(spec([S({ values: [10, NaN, 20] })]))
    expect(Number.isFinite(d.min) && Number.isFinite(d.max)).toBe(true)
    expect(d.max).toBeGreaterThanOrEqual(20)
  })
  it('the option facade maps null and "-" data to gaps, silently', () => {
    const c = compileOption({ xAxis: { data: ['a', 'b', 'c'] }, yAxis: {}, series: [{ type: 'line', data: [1, null, '-'] }, { type: 'line', data: [{ value: null }] }] })
    expect(c.warnings).toEqual([])
    expect(c.spec.series[0]!.values[1]).toBeNaN()
    expect(c.spec.series[0]!.values[2]).toBeNaN()
    expect(c.spec.series[1]!.values[0]).toBeNaN()
  })
})
