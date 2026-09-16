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

  it('carries xAxis.inverse', () => {
    const r = transform(app(`xAxis: undefined, yAxis: {}`, `{ type: 'line', data: [3, 4] }`).replace("name: 'Day' }", "name: 'Day', inverse: true }").replace('xAxis: undefined, ', ''), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`xInverse${sep}true`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('carries axis positions and swaps two axes whose first sits right', () => {
    const top = transform(app(`yAxis: { position: 'right' }`, `{ type: 'line', data: [3, 4] }`).replace("name: 'Day' }", "name: 'Day', position: 'top' }"), { target })
    expect(top.warnings).toEqual([])
    expect(top.code).toContain(`xTop${sep}true`)
    expect(top.code).toContain(`yRight${sep}true`)
    const swapped = transform(app(`yAxis: [{ position: 'right', name: 'R' }, { position: 'left', name: 'L' }]`), { target })
    expect(swapped.warnings).toEqual([])
    expect(swapped.code).toContain(`yTitle${sep}"L"`)
    expect(swapped.code).toContain(`y2Title${sep}"R"`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(top.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(top.code)).toMatchObject({ ok: true })
  })

  it('carries axis offsets as Double literals, and compiles', () => {
    const r = transform(app(`yAxis: [{ offset: 11 }, { offset: 13 }]`).replace("name: 'Day' }", "name: 'Day', offset: 7 }"), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`xOffset${sep}7.0`)
    expect(r.code).toContain(`yOffset${sep}11.0`)
    expect(r.code).toContain(`y2Offset${sep}13.0`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('carries a third y axis and the series on it, and compiles', () => {
    const r = transform(app(`yAxis: [{}, {}, { name: 'Wind', min: 0, max: 50, offset: 40 }]`, `{ type: 'line', yAxisIndex: 2, data: [10, 20] }`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('extraYAxes')
    expect(r.code).toContain('"Wind"')
    expect(r.code).toContain(`axisExtra${sep}0.0`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('carries a second x axis as labels on the same bands, and compiles', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: [{ type: 'category', data: ['Mon', 'Tue'] }, { type: 'category', data: ['W1', 'W2'], name: 'Week' }], yAxis: {}, series: [{ type: 'bar', data: [1, 2] }, { type: 'line', xAxisIndex: 1, data: [2, 1] }] }} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"W1"')
    expect(r.code).toContain(`x2Title${sep}"Week"`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('lowers a value x axis and a second value x axis, and compiles', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: [{ type: 'value' }, { type: 'value', min: 0, max: 1000, name: 'Metres' }], yAxis: {}, series: [{ type: 'scatter', data: [[0, 1], [10, 2]] }, { type: 'scatter', xAxisIndex: 1, data: [[250, 1], [1000, 2]] }] }} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('xValue')
    expect(r.code).toContain(`onX2${sep}true`)
    expect(r.code).toContain('250.0')
    expect(r.code).toContain(`x2Title${sep}"Metres"`)
    expect(r.code).toContain('x2Domain')
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('names a yAxisIndex that points at no declared axis', () => {
    const r = transform(app(`yAxis: [{}, {}]`, `{ type: 'bar', yAxisIndex: 3, data: [1, 2] }`), { target })
    expect(r.warnings).toEqual([expect.stringContaining('names no declared y axis')])
    expect(r.code).not.toContain('axisExtra')
  })
})
