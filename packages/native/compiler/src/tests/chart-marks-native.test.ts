import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * markLine / markPoint on native: the option facade's resolution runs at
 * compile time over the literal series, so a statistic (`max`, `median`,
 * `average`), a category-named `coord`, and a point-to-point pair name the
 * same datums the web names — and the engine's segment / average-marker
 * paths are the generated twins of the web renderer.
 */
const OPTION = `
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return (
    <OptionChart option={{
      xAxis: { type: 'category', data: ['a', 'b', 'c', 'd'] },
      yAxis: {},
      series: [{ type: 'line', data: [3, 9, 1, 6],
        markLine: { lineStyle: { color: '#aaaaaa' }, data: [
          { type: 'median' },
          { type: 'max', name: 'top', lineStyle: { color: '#bbbbbb' } },
          { xAxis: 2 },
          [{ type: 'max', name: 'range' }, { type: 'min' }],
          [{ coord: ['a', 2] }, { coord: ['d', 8] }],
        ] },
        markPoint: { itemStyle: { color: '#ff0000' }, symbolSize: 20, data: [
          { type: 'average', name: 'avg' },
          { coord: ['c', 1], value: 42, symbolSize: 8 },
        ] },
      }],
    }} />
  )
}`

describe.each(['swift', 'kotlin'] as const)('markLine / markPoint on %s', (target) => {
  it('lowers statistics, coords and point-to-point pairs to the engine annotations and markers, with zero warnings', () => {
    const r = transform(OPTION, { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    // median of [3, 9, 1, 6] = 4.5; max 9; a rule at x = 2.
    expect(r.code).toContain(`y${sep}4.5`)
    expect(r.code).toContain(`label${sep}"median"`)
    expect(r.code).toContain(`label${sep}"top"`)
    expect(r.code).toContain(`color${sep}"#bbbbbb"`)
    expect(r.code).toContain(`x${sep}2.0`)
    // max → min segment: datums 1 (9) and 2 (1); the coord pair names a and d.
    expect(r.code).toMatch(new RegExp(`x1${sep}1\\.0, y1${sep}9\\.0, x2${sep}2\\.0, y2${sep}1\\.0`))
    expect(r.code).toMatch(new RegExp(`x1${sep}0\\.0, y1${sep}2\\.0, x2${sep}3\\.0, y2${sep}8\\.0`))
    // Markers: the average by name (the engine picks the nearest datum), the
    // category coord by index, `value` as the label, the diameter halved.
    expect(r.code).toMatch(new RegExp(`at${sep}"average"`))
    expect(r.code).toMatch(new RegExp(`atIndex${sep}2\\.0`))
    expect(r.code).toContain(`label${sep}"42"`)
    expect(r.code).toContain(`radius${sep}10.0`)
    expect(r.code).toContain(`radius${sep}4.0`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('an endpoint or a mark the facade cannot place is named, never dropped silently', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1],
    markLine: { data: [[{ type: 'max' }, { coord: ['zzz', 1] }], { foo: 1 }] },
    markPoint: { data: [{ x: 10, y: 10 }] } }] }} />
}`, { target })
    expect(r.warnings).toEqual([
      expect.stringContaining('option.series[0].markLine.data[0]>: a native point-to-point mark line needs two literal endpoints'),
      expect.stringContaining('option.series[0].markLine.data[1]>: native mark lines map average/max/min/median'),
      expect.stringContaining('option.series[0].markPoint.data[0]>: native mark points map max/min/average and coord'),
    ])
  })
})
