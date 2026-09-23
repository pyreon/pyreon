import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * An option's axis decoration and label placement cross as the web facade
 * compiled them: `splitArea` bands, `minorTick` / `minorSplitLine` on a value
 * axis, and a series label's `rotate` / `offset` / `align` / `verticalAlign`.
 * The generated engine draws them exactly as the web does (the ECharts
 * differential holds the web half); this proves the fields reach it and the
 * emit compiles.
 */
const OPTION = `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return (
    <OptionChart option={{
      xAxis: { type: 'category', data: ['a', 'b', 'c'], splitArea: { show: true } },
      yAxis: { splitArea: { show: true, areaStyle: { color: ['#eeeeee', '#ffffff'] } }, minorTick: { show: true, splitNumber: 4, length: 4 }, minorSplitLine: { show: true, lineStyle: { color: '#f0f0f0' } } },
      series: [{ type: 'bar', data: [3, 5, 2], label: { show: true, rotate: 90, offset: [2, -3], align: 'left', verticalAlign: 'middle' } }],
    }} />
  )
}`

describe.each(['swift', 'kotlin'] as const)('axis decoration and label placement on %s', (target) => {
  const sep = target === 'swift' ? ': ' : ' = '
  const r = transform(OPTION, { target })

  it('lowers with zero warnings', () => {
    expect(r.warnings).toEqual([])
  })

  it('carries splitArea, the minor ticks and the minor split lines', () => {
    expect(r.code).toContain(`xSplitArea${sep}`)
    expect(r.code).toMatch(target === "swift" ? /ySplitArea: \["#eeeeee", "#ffffff"\]/ : /ySplitArea = listOf\("#eeeeee", "#ffffff"\)/)
    expect(r.code).toContain(`yMinorTicks${sep}4.0`)
    expect(r.code).toContain(`yMinorTickLength${sep}4.0`)
    expect(r.code).toContain(`yMinorSplit${sep}4.0`)
    expect(r.code).toContain(`yMinorSplitColor${sep}"#f0f0f0"`)
  })

  it('a colour list crosses as strings (the spec printer once wrote every array as numbers: NaN)', () => {
    expect(r.code).not.toContain('NaN')
  })

  it("carries the label's rotate, offset and alignment", () => {
    expect(r.code).toContain(`labelRotate${sep}90.0`)
    expect(r.code).toContain(`labelAlign${sep}"left"`)
    expect(r.code).toContain(`labelVerticalAlign${sep}"middle"`)
    expect(r.code).toContain('labelOffset')
  })

  it('the toolchain accepts it against the generated engine', () => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})
