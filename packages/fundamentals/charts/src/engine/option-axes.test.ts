import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import { layoutChart, renderChart } from './render'
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
