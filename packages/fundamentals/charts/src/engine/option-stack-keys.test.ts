// The option-path halves of ECharts' stacking and bar keys that the
// differential (echarts-differential.test.ts) does not pin: what a NaN datum
// means, which series types stack, and how the background strip is coloured.
import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import type { EChartsOption } from './option'

const cat = { xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: { type: 'value' } }
const compile = (series: object[]) => compileOption({ ...cat, series } as EChartsOption, { width: 400, height: 300 })

describe('a NaN datum is ECharts\' empty datum', () => {
  it('leaves a gap, like null and \'-\', with no warning', () => {
    const c = compile([{ type: 'line', data: [1, Number.NaN, { value: Number.NaN }, null, '-'] }])
    expect(c.spec.series[0]!.values.slice(1).every((v) => Number.isNaN(v))).toBe(true)
    expect(c.warnings).toEqual([])
  })
  it('a pair with a NaN y keeps its x and leaves a gap', () => {
    const c = compileOption({ xAxis: { type: 'value' }, yAxis: { type: 'value' }, series: [{ type: 'scatter', data: [[1, 2], [3, Number.NaN]] }] } as EChartsOption, { width: 400, height: 300 })
    expect(Number.isNaN(c.spec.series[0]!.values[1]!)).toBe(true)
    expect(c.warnings).toEqual([])
  })
  it('a string that is not a number is still zeroed with a warning', () => {
    const c = compile([{ type: 'line', data: [1, 'x'] }])
    expect(c.spec.series[0]!.values[1]).toBe(0)
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[1]'])
  })
})

describe('stacking keys', () => {
  it('a bar stack carries its group, strategy and order to the engine', () => {
    const s = compile([{ type: 'bar', stack: 'total', stackStrategy: 'all', stackOrder: 'seriesDesc', data: [1, 2, 3] }]).spec.series[0]!
    expect(s).toMatchObject({ kind: 'stacked', barStack: 'stack:total', stackStrategy: 'all', stackDesc: true })
  })
  it('an unknown strategy falls back to ECharts\' samesign', () => {
    expect(compile([{ type: 'bar', stack: 's', stackStrategy: 'sideways', data: [1] }]).spec.series[0]!.stackStrategy).toBeUndefined()
  })
  it('a scatter does not stack, and says so', () => {
    const c = compile([{ type: 'scatter', stack: 's', data: [1, 2] }, { type: 'scatter', stack: 's', data: [1, 2] }])
    expect(c.spec.series[1]!.values).toEqual([1, 2])
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].stack', 'series[1].stack'])
  })
})

describe('bar background and minimum height', () => {
  it('showBackground defaults to ECharts\' translucent grey', () => {
    expect(compile([{ type: 'bar', showBackground: true, data: [1] }]).spec.series[0]!.barBackground).toBe('rgba(180, 180, 180, 0.2)')
  })
  it('backgroundStyle.opacity multiplies into an rgba colour and a hex one', () => {
    expect(compile([{ type: 'bar', showBackground: true, backgroundStyle: { opacity: 0.5 }, data: [1] }]).spec.series[0]!.barBackground).toBe('rgba(180, 180, 180, 0.1)')
    expect(compile([{ type: 'bar', showBackground: true, backgroundStyle: { color: '#ff0000', opacity: 0.5 }, data: [1] }]).spec.series[0]!.barBackground).toBe('rgba(255, 0, 0, 0.5)')
  })
  it('no showBackground, no strip; a non-positive barMinHeight is ignored', () => {
    const s = compile([{ type: 'bar', backgroundStyle: { color: '#eee' }, barMinHeight: 0, data: [1] }]).spec.series[0]!
    expect(s.barBackground).toBeUndefined()
    expect(s.barMinHeight).toBeUndefined()
  })
})
