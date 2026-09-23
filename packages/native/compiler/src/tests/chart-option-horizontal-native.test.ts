import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' horizontal bar chart — a category y axis over a value x axis — on
 * native, as on the web: the option lowers with its axes swapped into the
 * host's horizontal frame, the bands counted up from the bottom as ECharts'
 * category y axis runs. Before, the native lowering read the value x axis as
 * a scatter axis and emitted nothing. A category y axis over non-bar series
 * keeps the upright chart and says so.
 */
const src = (series: string, yAxis = "{ type: 'category', data: ['Mon', 'Tue', 'Wed'], splitArea: { show: true } }"): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'value', minorTick: { show: true } }, yAxis: ${yAxis}, series: ${series} }} />
}`

describe.each(['swift', 'kotlin'] as const)('horizontal option on %s', (target) => {
  const sep = target === 'swift' ? ': ' : ' = '
  const bars = transform(src("[{ type: 'bar', data: [120, 200, 150] }, { type: 'bar', stack: 's', data: [80, 70, 110] }]"), { target })
  const mixed = transform(src("[{ type: 'bar', data: [1, 2, 3] }, { type: 'line', data: [1, 2, 3] }]"), { target })

  it('lowers bars into the horizontal frame, bottom-up, with zero warnings', () => {
    expect(bars.warnings).toEqual([])
    expect(bars.code).toContain(`horizontal${sep}true`)
    expect(bars.code).toContain(`bandsFromBottom${sep}true`)
    // The category axis's decoration and the value axis's minor ticks cross with it.
    expect(bars.code).toContain('xSplitArea')
    expect(bars.code).toContain('yMinorTicks')
  })

  it('a category y axis over a non-bar series keeps the upright chart, and says so', () => {
    expect(mixed.warnings.some((w) => w.includes('lays out bar series only'))).toBe(true)
    expect(mixed.code).not.toContain(`horizontal${sep}true`)
  })

  it('the toolchain accepts it against the generated engine', () => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(bars.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(bars.code)).toMatchObject({ ok: true })
  })
})
