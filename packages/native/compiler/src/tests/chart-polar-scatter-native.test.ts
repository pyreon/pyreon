import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * Scatter (and effectScatter) on the polar coordinate: the third polar series
 * kind. The native OptionChart desugar carries `kind: "scatter"` and the
 * symbol radius into the engine's PolarSeries, whose generated layout places
 * scatter points exactly where a line would and draws circles only.
 */
const OPTION = `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return (
    <OptionChart option={{
      polar: {},
      angleAxis: { type: 'category', data: ['a', 'b', 'c'] },
      radiusAxis: { min: 0, max: 12 },
      series: [
        { type: 'scatter', coordinateSystem: 'polar', name: 'Dots', symbolSize: 12, data: [1, 2, 3] },
        { type: 'effectScatter', coordinateSystem: 'polar', name: 'Pulse', itemStyle: { color: '#ff0000' }, data: [3, 2, 1] },
        { type: 'bar', coordinateSystem: 'polar', name: 'Bars', symbolSize: 12, data: [2, 2, 2] },
      ],
    }} />
  )
}`

describe.each(['swift', 'kotlin'] as const)('polar scatter on %s', (target) => {
  it('a polar option with no value extent still types its axes (a categories-only literal used to emit an untyped object)', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ polar: {}, angleAxis: { type: 'category', data: ['a'] }, radiusAxis: {}, series: [{ type: 'scatter', coordinateSystem: 'polar', data: [1] }] }} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).not.toContain('__Obj0')
    expect(r.code).toMatch(target === 'swift' ? /PolarAxes\(categories: \["a"\], categoryOn: "angle"\)/ : /PolarAxes\(categories = listOf\("a"\), categoryOn = "angle"\)/)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('lowers scatter and effectScatter polar series with the symbol radius, zero warnings, and compiles', () => {
    const r = transform(OPTION, { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code.match(new RegExp(`kind${sep}"scatter"`, 'g'))?.length).toBe(2)
    expect(r.code).toContain(`radius${sep}6.0`)
    expect(r.code).toContain(`color${sep}"#ff0000"`)
    // A bar's symbolSize is not a radius.
    expect(r.code.match(new RegExp(`radius${sep}6\\.0`, 'g'))?.length).toBe(1)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})
