import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts axes cross the OptionChart: names become titles, `yAxis` as an array
 * gives the right axis its domain and title, `yAxisIndex: 1` scales a series on
 * it, and `show` / `splitLine.show` / `type: 'log'` reach the spec.
 */
const app = (axes: string, series2 = `{ type: 'bar', yAxisIndex: 1, data: [100, 200] }`): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a', 'b'], name: 'Day' }, ${axes}, series: [{ type: 'line', data: [1, 2] }, ${series2}] }} />
}`

describe.each(['swift', 'kotlin'] as const)('option axes on %s', (target) => {
  const sep = target === 'swift' ? ': ' : ' = '
  it('carries titles, both domains and the right-axis series, and compiles', () => {
    const r = transform(app(`yAxis: [{ name: 'Temp', min: 0, max: 10 }, { name: 'Rain', min: 0, max: 300 }]`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`xTitle${sep}"Day"`)
    expect(r.code).toContain(`yTitle${sep}"Temp"`)
    expect(r.code).toContain(`y2Title${sep}"Rain"`)
    expect(r.code).toContain(`axis${sep}"right"`)
    expect(r.code).toMatch(/300\.0/)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('hides the grid and uses the log scale', () => {
    const r = transform(app(`yAxis: { type: 'log', splitLine: { show: false } }`, `{ type: 'line', data: [3, 4] }`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`showGrid${sep}false`)
    expect(r.code).toContain('"log"')
  })

  it('carries yAxis.inverse, and compiles against the generated engine', () => {
    const r = transform(app(`yAxis: { inverse: true }`, `{ type: 'line', data: [3, 4] }`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`yInverse${sep}true`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('names a third y axis and an unsupported yAxisIndex', () => {
    const r = transform(app(`yAxis: [{}, {}, {}]`, `{ type: 'bar', yAxisIndex: 2, data: [1, 2] }`), { target })
    expect(r.warnings).toEqual([expect.stringContaining('yAxisIndex'), expect.stringContaining('at most two y axes')])
    expect(r.code).not.toContain(`axis${sep}"right"`)
  })
})
