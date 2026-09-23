import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * An OptionChart bar / line chart's tooltip takes ECharts' default content on
 * native, as on the web: an ITEM tooltip (ECharts' default trigger) is the
 * series name over one row — swatch, category, grouped value — for the series
 * under the tap; an AXIS tooltip is the category over a row per series. A
 * series the option did not name shows no name. A formatter keeps the plain
 * lines (native runs no formatter function).
 */
const src = (tooltip: string, names = true): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return (
    <OptionChart option={{
      tooltip: ${tooltip},
      xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
      yAxis: { type: 'value' },
      series: [{ ${names ? "name: 'Sales', " : ''}type: 'bar', data: [120, 2000, 150] }, { type: 'line', data: [80, 90, 1234.5] }],
    }} />
  )
}`

describe.each(['swift', 'kotlin'] as const)('OptionChart cartesian tooltip on %s', (target) => {
  const item = transform(src('{}'), { target })
  const axis = transform(src("{ trigger: 'axis' }"), { target })
  const formatted = transform(src("{ trigger: 'axis', valueFormatter: (v: number) => v + ' kg' }"), { target })

  it('lowers with zero warnings', () => {
    expect(item.warnings).toEqual([])
    expect(axis.warnings).toEqual([])
  })

  it('the default trigger is item: the series under the tap, drawn as ECharts rows edged in its colour', () => {
    expect(item.code).toContain('tooltipItemCells(')
    expect(item.code).toContain('plotHitSeriesIn(')
    expect(item.code).toMatch(/renderTooltipRows\([^\n]*true\)/)
  })

  it("an axis trigger: a row per series, and only the option's own names show", () => {
    expect(axis.code).toContain('tooltipAxisCells(')
    expect(axis.code).toMatch(target === 'swift' ? /\[true, false\]/ : /listOf\(true, false\)/)
    expect(axis.code).toMatch(/renderTooltipRows\([^\n]*false\)/)
  })

  it('a formatter keeps the plain lines', () => {
    expect(formatted.code).not.toContain('tooltipAxisCells(')
    expect(formatted.code).not.toContain('renderTooltipRows(')
  })

  it('the toolchain accepts both against the generated engine', () => {
    for (const r of [item, axis]) {
      if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
      if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
    }
  })
})

describe.each(['swift', 'kotlin'] as const)('OptionChart funnel tooltip on %s', (target) => {
  const funnel = (series: string, tooltip = '{}'): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ tooltip: ${tooltip}, series: [{ ${series}type: 'funnel', data: [{ name: 'Visits', value: 1000 }, { name: 'Orders', value: 50 }] }] }} />
}`
  const named = transform(funnel("name: 'Pipeline', "), { target })
  const unnamed = transform(funnel(''), { target })
  const shaped = transform(funnel("name: 'Pipeline', ", "{ valueFormatter: (v: number) => v + ' x' }"), { target })

  it("ECharts' rows under the series name (none when unnamed); a formatter keeps plain lines", () => {
    expect(named.warnings).toEqual([])
    expect(named.code).toMatch(/funnelTipRowsWith\([^;]*?, "Pipeline", /)
    expect(named.code).toContain('renderTooltipRows(')
    expect(unnamed.code).toMatch(/funnelTipRowsWith\([^;]*?, "", /)
    expect(shaped.code).toContain('funnelTip(')
    expect(shaped.code).not.toContain('renderTooltipRows(')
  })

  it('the toolchain accepts it', () => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(named.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(named.code)).toMatchObject({ ok: true })
  })
})
