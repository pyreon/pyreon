import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * A literal OptionChart's cartesian option crosses AS THE WEB FACADE COMPILED
 * IT: the spec fields (ECharts' default grid and its label containment, the
 * axis label and stroke rules, the value-axis ticks) ride the synthesized
 * host's `optionSpec`, and the series fields (smoothing, gaps, area fills,
 * label placement, symbols) ride each mark. One interpretation of the option,
 * not two that drift.
 */
const OPTION = `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return (
    <OptionChart option={{
      xAxis: { type: 'category', data: ['a', 'b', 'c'], axisTick: { show: true, length: 7 }, axisLabel: { margin: 12 } },
      yAxis: { type: 'value', axisLine: { show: true }, splitLine: { lineStyle: { type: 'dashed', color: '#aaaaaa' } } },
      series: [
        { type: 'bar', data: [3, -2, 8], label: { show: true, position: 'insideTop' } },
        { type: 'line', smooth: true, connectNulls: true, data: [1, null, 4], areaStyle: { opacity: 0.4 } },
      ],
    }} />
  )
}`

describe.each(['swift', 'kotlin'] as const)('forwarded option fields on %s', (target) => {
  const sep = target === 'swift' ? ': ' : ' = '
  const r = transform(OPTION, { target })

  it('lowers with zero warnings', () => {
    expect(r.warnings).toEqual([])
  })

  it('carries the compiled spec: the default grid, containment, label margins, axis strokes', () => {
    // ECharts 6's grid, as the facade resolved it in pixels.
    for (const f of ['gridLeft', 'gridTop', 'gridRight', 'gridBottom']) expect(r.code).toContain(`${f}${sep}`)
    expect(r.code).toContain(`gridContain${sep}true`)
    expect(r.code).toContain(`xLabels${sep}"echarts"`)
    expect(r.code).toContain(`xLabelMargin${sep}12.0`)
    expect(r.code).toContain(`yLabelMargin${sep}8.0`)
    expect(r.code).toContain(`yAxisLine${sep}true`)
    expect(r.code).toContain(`xTicks${sep}true`)
    expect(r.code).toContain(`xTickLength${sep}7.0`)
    expect(r.code).toContain(`xTickBands${sep}true`)
    expect(r.code).toContain(`gridColor${sep}"#aaaaaa"`)
    expect(r.code).toContain(target === 'swift' ? 'gridDash: [4.0, 2.0]' : 'gridDash = listOf(4.0, 2.0)')
    expect(r.code).toContain(`xAxisOnZero${sep}true`)
  })

  it('carries the compiled series: label placement, smoothing, gaps, the area fill', () => {
    expect(r.code).toContain(`labelPosition${sep}"insideTop"`)
    expect(r.code).toContain(`smoothAmount${sep}0.5`)
    expect(r.code).toContain(`connectNulls${sep}true`)
    expect(r.code).toContain(`areaFill${sep}true`)
    expect(r.code).toContain(`areaOpacity${sep}0.4`)
  })

  it("keeps Swift's memberwise order: the early fields sit between series and categories", () => {
    if (target !== 'swift') return
    const spec = r.code.slice(r.code.indexOf('ChartSpec('))
    const at = (name: string): number => spec.indexOf(`${name}:`)
    expect(at('series')).toBeLessThan(at('gridLeft'))
    expect(at('gridContain')).toBeLessThan(at('categories'))
    expect(at('xLabels')).toBeLessThan(at('xLabelMargin'))
    expect(at('xLabelMargin')).toBeLessThan(at('gridColor'))
  })

  it('the toolchain accepts it', () => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})
