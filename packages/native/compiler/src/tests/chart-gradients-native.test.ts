import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' gradient colour objects lower to the mark's `gradient` (stops +
 * direction, or the radial shape) on native, with the first stop as the solid
 * colour; an image pattern is named.
 */
const OPTION = `
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return (
    <OptionChart option={{
      xAxis: { type: 'category', data: ['a', 'b'] },
      yAxis: {},
      series: [
        { type: 'bar', itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] } }, data: [1, 2] },
        { type: 'line', areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#00ff00' }, { offset: 1, color: '#000000' }] } }, data: [2, 1] },
      ],
    }} />
  )
}`

describe.each(['swift', 'kotlin'] as const)('gradient colours on %s', (target) => {
  it('lowers linear gradients to mark gradients with zero warnings, and compiles', () => {
    const r = transform(OPTION, { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`offset${sep}0.0`)
    expect(r.code).toContain(`color${sep}"#0000ff"`)
    expect(r.code).toContain(`direction${sep}"horizontal"`)
    // The solid colour is the first stop.
    expect(r.code).toContain(`color${sep}"#ff0000"`)
    expect(r.code).toContain(`color${sep}"#00ff00"`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('a radial gradient lowers to the radial mark gradient with zero warnings, and compiles', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'bar', itemStyle: { color: { type: 'radial', x: 0.5, y: 0.5, r: 0.5, colorStops: [{ offset: 0, color: '#111111' }, { offset: 1, color: '#222222' }] } }, data: [1] }] }} />
}`, { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`shape${sep}"radial"`)
    expect(r.code).toContain(`color${sep}"#222222"`)
    // The solid colour is the first stop.
    expect(r.code).toContain(`color${sep}"#111111"`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('an image fill crosses as an image pattern; a line stroke image is named', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'bar', itemStyle: { color: { image: 'texture.png', repeat: 'repeat' } }, data: [1] }, { type: 'line', lineStyle: { color: { image: 'texture.png' } }, data: [2] }] }} />
}`, { target })
    expect(r.warnings).toEqual([expect.stringContaining('option.series[1].lineStyle.color>: A line stroke cannot be an image pattern')])
    expect(r.code).toContain(`image${target === 'swift' ? ': ' : ' = '}"texture.png"`)
    expect(r.code).not.toContain('gradient')
  })

})

describe.each(['swift', 'kotlin'] as const)('grammar gradient on %s', (target) => {
  it('a PlotChart mark with a literal gradient option lowers the same SeriesGradient', () => {
    const r = transform(`
import { PlotChart, bars, line } from '@pyreon/charts/engine'
export function App() {
  return <PlotChart data={[{ x: 'a', v: 1 }, { x: 'b', v: 2 }]} x={(d) => d.x} marks={[
    bars((d) => d.v, { gradient: { stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }], direction: 'horizontal' } }),
    line((d) => d.v, { color: '#123456' }),
  ]} />
}`, { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`gradient${sep}SeriesGradient(`)
    expect(r.code).toContain(`direction${sep}"horizontal"`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})
