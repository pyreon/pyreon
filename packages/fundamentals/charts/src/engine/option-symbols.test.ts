import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import { defaultTheme, renderChart } from './render'
import type { ChartSpec, Series } from './render'
import type { Double } from './types'

/**
 * ECharts' `symbol` / `showSymbol` on line and scatter series — the datum
 * shape. A scatter datum is a circle unless named otherwise; a line draws
 * its datum symbols only when `showSymbol` is true.
 */
const measure = (text: string, _s: Double): Double => text.length * 7.0
const spec = (series: Series[]): ChartSpec => ({ width: 400.0, height: 200.0, series, categories: [], theme: defaultTheme, showXAxis: false, showYAxis: false, showGrid: false })
const S = (over: Partial<Series>): Series => ({ kind: 'points', values: [3.0, 9.0, 1.0], color: '#123456', width: 2.0, radius: 5.0, label: 's', ...over })

describe('engine: series symbols', () => {
  it('scatter draws circles by default and the named shape otherwise, sized by the radius', () => {
    const circles = renderChart(spec([S({})]), measure).filter((c) => c.kind === 'circle')
    expect(circles).toHaveLength(3)
    const diamonds = renderChart(spec([S({ symbol: 'diamond' })]), measure).filter((c) => c.kind === 'polygon')
    expect(diamonds).toHaveLength(3)
    const d = diamonds[0]!
    if (d.kind !== 'polygon') throw new Error('kind')
    // A diamond's horizontal span is the full diameter.
    expect(d.points[1]!.x - d.points[3]!.x).toBeCloseTo(10.0, 9)
    const rects = renderChart(spec([S({ symbol: 'rect' })]), measure).filter((c) => c.kind === 'rect' && c.rect.w === 10.0)
    expect(rects).toHaveLength(3)
    // A gap draws no symbol.
    expect(renderChart(spec([S({ symbol: 'triangle', values: [3.0, NaN, 1.0] })]), measure).filter((c) => c.kind === 'polygon')).toHaveLength(2)
  })

  it('a line draws no datum symbols unless asked, then one per finite datum over the line', () => {
    const bare = renderChart(spec([S({ kind: 'line' })]), measure)
    expect(bare.filter((c) => c.kind === 'circle')).toHaveLength(0)
    const marked = renderChart(spec([S({ kind: 'line', symbol: 'circle', values: [3.0, NaN, 1.0, 4.0] })]), measure)
    const poly = marked.findIndex((c) => c.kind === 'polyline')
    const dots = marked.map((c, i) => [c, i] as const).filter(([c]) => c.kind === 'circle')
    expect(dots).toHaveLength(3)
    expect(dots.every(([, i]) => i > poly)).toBe(true)
  })
})

describe('facade: symbol and showSymbol', () => {
  const run = (series: Record<string, unknown>[]) => compileOption({ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series })
  it('maps every named shape on scatter, aliases roundRect and emptyCircle, and warns on the rest', () => {
    const { spec: sp, warnings } = run([
      { type: 'scatter', symbol: 'diamond', data: [1, 2] },
      { type: 'scatter', symbol: 'roundRect', data: [1, 2] },
      { type: 'scatter', symbol: 'emptyCircle', data: [1, 2] },
      { type: 'scatter', data: [1, 2] },
      { type: 'effectScatter', symbol: 'triangle', data: [1, 2] },
      { type: 'scatter', symbol: 'pin', data: [1, 2] },
    ])
    expect(sp.series.map((s) => s.symbol)).toEqual(['diamond', 'rect', undefined, undefined, 'triangle', undefined])
    expect(warnings.map((w) => w.code + '@' + w.path)).toEqual(['mark-shape-unsupported@series[5].symbol'])
  })
  it('a line takes symbols only with showSymbol: true, defaulting to circles', () => {
    const { spec: sp, warnings } = run([
      { type: 'line', symbol: 'diamond', data: [1, 2] },
      { type: 'line', showSymbol: true, data: [1, 2] },
      { type: 'line', showSymbol: true, symbol: 'rect', data: [1, 2] },
      { type: 'line', showSymbol: true, symbol: 'arrow', data: [1, 2] },
    ])
    expect(sp.series.map((s) => s.symbol)).toEqual([undefined, 'circle', 'rect', 'circle'])
    expect(warnings.map((w) => w.path)).toEqual(['series[3].symbol'])
  })
})
