import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import { barsFor, categoryIndex, layoutChart, renderChart } from './render'
import { plotHitIndex } from './plot-hit'
import type { DrawCmd } from './types'

const base = { xAxis: { type: 'category', data: ['a', 'b'] }, series: [{ type: 'line', data: [1, 2] }, { type: 'bar', yAxisIndex: 1, data: [100, 200] }] }

describe('option axes', () => {
  it('maps axis names to titles, both y domains and the right-axis series', () => {
    const { spec, warnings } = compileOption({
      ...base,
      xAxis: { ...base.xAxis, name: 'Day' },
      yAxis: [{ name: 'Temp', min: 0, max: 10 }, { name: 'Rain', min: 0, max: 300 }],
    })
    expect(warnings).toEqual([])
    expect(spec.xTitle).toBe('Day')
    expect(spec.yTitle).toBe('Temp')
    expect(spec.y2Title).toBe('Rain')
    expect(spec.yDomain).toEqual({ min: 0, max: 10 })
    expect(spec.y2Domain).toEqual({ min: 0, max: 300 })
    expect(spec.series[1]!.axis).toBe('right')
  })

  it('show: false hides an axis and splitLine.show: false drops the grid', () => {
    const { spec, warnings } = compileOption({ ...base, xAxis: { ...base.xAxis, show: false }, yAxis: { show: false, splitLine: { show: false } } })
    expect(warnings).toEqual([])
    expect(spec.showXAxis).toBe(false)
    expect(spec.showYAxis).toBe(false)
    expect(spec.showGrid).toBe(false)
  })

  it('a default option keeps axes and grid on, with no titles', () => {
    const { spec } = compileOption({ ...base, yAxis: {} })
    expect([spec.showXAxis, spec.showYAxis, spec.showGrid]).toEqual([true, true, true])
    expect(spec.xTitle).toBeUndefined()
    expect(spec.yScale).toBeUndefined()
  })

  it('a log y axis lowers to the log scale', () => {
    expect(compileOption({ ...base, yAxis: { type: 'log' } }).spec.yScale).toBe('log')
  })

  it('names an unmapped axis key and a one-sided domain instead of dropping them silently', () => {
    const { warnings } = compileOption({ ...base, yAxis: { offset: 8, min: 0 } })
    expect(warnings.map((w) => w.path)).toEqual(['yAxis.offset', 'yAxis.min'])
  })
})

describe('yAxis.inverse', () => {
  const measure = (t: string): number => t.length * 6
  const kinds: Record<string, unknown>[] = [
    { type: 'line', data: [1, 5, 3] },
    { type: 'bar', data: [1, -5, 3] },
    { type: 'line', areaStyle: {}, data: [1, 5, 3] },
    { type: 'bar', stack: 's', data: [1, 5, 3] },
    { type: 'scatter', data: [1, 5, 3] },
    { type: 'line', stack: 's', areaStyle: {}, data: [1, 5, 3] },
  ]
  // The inverted plot is the upright plot reflected about its horizontal
  // centreline — every mark, for every cartesian kind.
  it.each(kinds.flatMap((k) => [[k, 1], [k, 2]] as const))('%j ×%i draws the mirror image of the upright chart', (kind, count) => {
    const series = count === 1 ? [kind] : [kind, { ...kind, name: 'b' }]
    const upright = compileOption({ xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: {}, series })
    const inverted = compileOption({ xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: { inverse: true }, series })
    expect(inverted.warnings).toEqual([])
    expect(inverted.spec.yInverse).toBe(true)
    const p = layoutChart(upright.spec, measure).plot
    const r = (n: number): number => Math.round(n * 10) / 10
    const sig = (c: DrawCmd, flip: boolean): string | null => {
      const Y = (y: number): number => r(flip ? 2 * p.y + p.h - y : y)
      if (c.kind === 'rect' && c.rect.w > 0 && c.rect.y >= p.y - 1 && c.rect.y + c.rect.h <= p.y + p.h + 1) return `rect ${r(c.rect.x)} ${Y(flip ? c.rect.y + c.rect.h : c.rect.y)} ${r(c.rect.h)}`
      if (c.kind === 'circle') return `circle ${r(c.center.x)} ${Y(c.center.y)}`
      if (c.kind === 'polyline' || c.kind === 'polygon') return `${c.kind} ${c.points.map((q) => `${r(q.x)},${Y(q.y)}`).sort().join(' ')}`
      return null
    }
    const expected = renderChart(upright.spec, measure).map((c) => sig(c, true)).filter((x) => x !== null).sort()
    const actual = renderChart(inverted.spec, measure).map((c) => sig(c, false)).filter((x) => x !== null).sort()
    expect(expected.length).toBeGreaterThan(0)
    expect(actual).toEqual(expected)
  })

  it('puts the largest tick label at the bottom', () => {
    const { spec } = compileOption({ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: { inverse: true, min: 0, max: 10 }, series: [{ type: 'line', data: [1, 9] }] })
    const ticks = layoutChart(spec, measure).yTicks
    const top = ticks.reduce((a, b) => (a.pos < b.pos ? a : b))
    const bottom = ticks.reduce((a, b) => (a.pos > b.pos ? a : b))
    expect(top.value).toBe(0)
    expect(bottom.value).toBe(10)
  })
})

describe('xAxis.inverse', () => {
  const measure = (t: string): number => t.length * 6
  const cats = ['a', 'b', 'c', 'd']
  const kinds: Record<string, unknown>[] = [
    { type: 'line', data: [1, 5, 3, 2] },
    { type: 'bar', data: [1, -5, 3, 2] },
    { type: 'line', areaStyle: {}, data: [1, 5, 3, 2] },
    { type: 'bar', stack: 's', data: [1, 5, 3, 2] },
    { type: 'scatter', data: [1, 5, 3, 2] },
  ]
  const build = (series: Record<string, unknown>[], inverse: boolean) =>
    compileOption({ xAxis: { type: 'category', data: cats, ...(inverse ? { inverse: true } : {}) }, yAxis: {}, series })
  it.each(kinds.flatMap((k) => [[k, 1], [k, 2]] as const))('%j ×%i draws the left-right mirror of the upright chart', (kind, count) => {
    const series = count === 1 ? [kind] : [kind, { ...kind, name: 'b' }]
    const upright = build(series, false)
    const inverted = build(series, true)
    expect(inverted.warnings).toEqual([])
    const p = layoutChart(upright.spec, measure).plot
    const r = (n: number): number => Math.round(n * 10) / 10
    const sig = (c: DrawCmd, flip: boolean): string | null => {
      const X = (x: number): number => r(flip ? 2 * p.x + p.w - x : x)
      if (c.kind === 'rect' && c.rect.w > 0 && c.rect.x >= p.x - 1 && c.rect.x + c.rect.w <= p.x + p.w + 1 && c.rect.h < p.h) return `rect ${X(flip ? c.rect.x + c.rect.w : c.rect.x)} ${r(c.rect.y)} ${r(c.rect.w)}`
      if (c.kind === 'circle') return `circle ${X(c.center.x)} ${r(c.center.y)}`
      if (c.kind === 'polyline' || c.kind === 'polygon') return `${c.kind} ${c.points.map((q) => `${X(q.x)},${r(q.y)}`).sort().join(' ')}`
      return null
    }
    const expected = renderChart(upright.spec, measure).map((c) => sig(c, true)).filter((x) => x !== null).sort()
    const actual = renderChart(inverted.spec, measure).map((c) => sig(c, false)).filter((x) => x !== null).sort()
    expect(expected.length).toBeGreaterThan(0)
    expect(actual).toEqual(expected)
  })

  it('labels the categories right to left and a hit still names the ORIGINAL datum', () => {
    const { spec } = build([{ type: 'bar', data: [10, 20, 30, 40] }], true)
    const l = layoutChart(spec, measure)
    expect([...l.xTicks].sort((a, b) => a.pos - b.pos).map((t) => t.label)).toEqual(['d', 'c', 'b', 'a'])
    // The leftmost bar is datum 3 ('d').
    const bars = barsFor(spec, 0, measure)
    const leftmost = bars.reduce((a, b) => (a.x < b.x ? a : b))
    expect(plotHitIndex(spec, measure, leftmost.x + leftmost.w / 2, leftmost.y + leftmost.h - 1)).toBe(3)
    expect(categoryIndex(spec, 0)).toBe(3)
  })

  it('a continuous x axis inverts through its domain', () => {
    const { spec } = compileOption({ xAxis: { type: 'value', inverse: true }, yAxis: {}, series: [{ type: 'scatter', data: [[0, 1], [10, 2]] }] })
    const l = layoutChart(spec, measure)
    const first = l.xTicks.reduce((a, b) => (a.pos < b.pos ? a : b))
    expect(first.value).toBe(10)
  })
})
