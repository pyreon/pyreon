import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' `symbol` / `showSymbol` / `symbolSize` on line and scatter series
 * reach the native marks: a scatter datum shape, a line's default (emptyCircle) datum
 * symbols, and the radius (half the ECharts diameter).
 */
const OPTION = `
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return (
    <OptionChart option={{
      xAxis: { type: 'category', data: ['a', 'b'] },
      yAxis: {},
      series: [
        { type: 'scatter', symbol: 'diamond', symbolSize: 14, data: [1, 2] },
        { type: 'scatter', symbol: 'roundRect', data: [2, 1] },
        { type: 'scatter', symbol: 'emptyCircle', data: [2, 1] },
        { type: 'line', showSymbol: true, data: [1, 2] },
        { type: 'line', showSymbol: true, symbol: 'triangle', symbolSize: 8, data: [2, 1] },
        { type: 'line', symbol: 'diamond', data: [1, 1] },
      ],
    }} />
  )
}`

describe.each(['swift', 'kotlin'] as const)('series symbols on %s', (target) => {
  it('lowers scatter shapes, opt-in line symbols and symbolSize with zero warnings, and compiles', () => {
    const r = transform(OPTION, { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`symbol${sep}"diamond"`)
    expect(r.code).toContain(`symbol${sep}"rect"`)
    expect(r.code).toContain(`symbol${sep}"triangle"`)
    // A line with showSymbol and no symbol draws circles; a scatter's default circle is not stated.
    // ECharts 6: a line shows an emptyCircle at its data unless told otherwise,
    // and an emptyCircle stays hollow — the web facade's reading, which native
    // now takes as it compiled it. Circles: the scatter emptyCircle and the
    // default line; both hollow.
    expect(r.code.match(new RegExp(`symbol${sep}"circle"`, 'g'))?.length).toBe(2)
    expect(r.code.match(new RegExp(`symbol${sep}"`, 'g'))?.length).toBe(6)
    expect(r.code.match(new RegExp(`symbolHollow${sep}true`, 'g'))?.length).toBe(2)
    expect(r.code).toContain(`radius${sep}7.0`)
    expect(r.code).toContain(`radius${sep}4.0`)
    // A scatter with no symbolSize takes ECharts' 10 (radius 5).
    expect(r.code).toContain(`radius${sep}5.0`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('an unsupported symbol is named and drawn as a circle', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'scatter', symbol: 'pin', data: [1] }] }} />
}`, { target })
    expect(r.warnings).toEqual([expect.stringContaining('option.series[0].symbol>: native series symbols support circle, emptyCircle, rect, roundRect, diamond, or triangle')])
    expect(r.code).not.toContain('symbol')
  })
})
