import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import { defaultTheme, renderChart } from './render'
import type { Double } from './types'

/**
 * ECharts' gradient colour objects on itemStyle / areaStyle / lineStyle /
 * series colour resolve to the engine's series gradient; the first stop is
 * the solid colour everything else (legend, tooltip, fallbacks) reads.
 */
const measure = (text: string, _s: Double): Double => text.length * 7.0
const linear = (over: Record<string, unknown> = {}) => ({ type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }], ...over })
const run = (series: Record<string, unknown>[]) => compileOption({ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series })

describe('gradient colours', () => {
  it('a vertical linear gradient on itemStyle becomes the series gradient with the first stop as the colour', () => {
    const { spec, warnings } = run([{ type: 'bar', itemStyle: { color: linear() }, data: [1, 2] }])
    expect(warnings).toEqual([])
    expect(spec.series[0]!.gradient).toEqual({ stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] })
    expect(spec.series[0]!.color).toBe('#ff0000')
    // The ramp reaches the draw list on the bar rects.
    const rects = renderChart({ ...spec, width: 300, height: 200, theme: defaultTheme }, measure).filter((c) => c.kind === 'rect' && c.grad !== undefined)
    expect(rects).toHaveLength(2)
  })

  it('the dominant axis picks the direction; a backwards ramp reverses its stops so offset 0 stays where it was written', () => {
    const h = run([{ type: 'bar', itemStyle: { color: linear({ x2: 1, y2: 0 }) }, data: [1] }]).spec.series[0]!.gradient
    expect(h).toEqual({ stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }], direction: 'horizontal' })
    const up = run([{ type: 'bar', itemStyle: { color: linear({ y: 1, y2: 0 }) }, data: [1] }]).spec.series[0]!.gradient
    expect(up).toEqual({ stops: [{ offset: 0, color: '#0000ff' }, { offset: 1, color: '#ff0000' }] })
  })

  it('areaStyle, lineStyle and series colour slots are read in itemStyle-first order; a plain colour still wins the solid slot', () => {
    const { spec } = run([
      { type: 'line', areaStyle: { color: linear() }, data: [1, 2] },
      { type: 'line', lineStyle: { color: '#123456' }, areaStyle: { color: linear({ colorStops: [{ offset: 0, color: '#00ff00' }] }) }, data: [1, 2] },
      { type: 'bar', color: linear({ colorStops: [{ offset: 0, color: '#abcdef' }] }), data: [1, 2] },
    ])
    expect(spec.series.map((s) => [s.color, s.gradient?.stops.length])).toEqual([['#ff0000', 2], ['#123456', 1], ['#abcdef', 1]])
  })

  it('a gradient with no usable stops is ignored without a warning', () => {
    const { spec, warnings } = run([{ type: 'bar', itemStyle: { color: { type: 'linear', colorStops: [{ offset: 'x' }] } }, data: [1] }])
    expect(warnings).toEqual([])
    expect(spec.series[0]!.gradient).toBeUndefined()
  })
})

describe('radial gradients and image patterns', () => {
  it('a radial gradient keeps every stop as the radial series gradient with zero warnings', () => {
    const { spec, warnings } = compileOption({
      xAxis: { type: 'category', data: ['a', 'b'] },
      yAxis: {},
      series: [{ type: 'bar', itemStyle: { color: { type: 'radial', x: 0.5, y: 0.5, r: 0.5, colorStops: [{ offset: 0, color: '#111111' }, { offset: 1, color: '#222222' }] } }, data: [1, 2] }],
    })
    expect(warnings).toEqual([])
    expect(spec.series[0]!.gradient).toEqual({ stops: [{ offset: 0, color: '#111111' }, { offset: 1, color: '#222222' }], shape: 'radial' })
    expect(spec.series[0]!.color).toBe('#111111')
  })

  it('an image fill becomes an image pattern with its repeat', () => {
    const { spec, warnings } = compileOption({
      xAxis: { type: 'category', data: ['a'] },
      yAxis: {},
      series: [{ type: 'bar', itemStyle: { color: { image: 'texture.png', repeat: 'repeat-x' } }, data: [1] }],
    })
    expect(warnings).toEqual([])
    expect(spec.series[0]!.pattern).toMatchObject({ kind: 'image', image: 'texture.png', repeat: 'repeat-x' })
  })

})
