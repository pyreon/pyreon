import { describe, expect, it } from 'vitest'
import { compileOption } from './option'

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
    const { warnings } = compileOption({ ...base, yAxis: { inverse: true, min: 0 } })
    expect(warnings.map((w) => w.path)).toEqual(['yAxis.inverse', 'yAxis.min'])
  })
})
