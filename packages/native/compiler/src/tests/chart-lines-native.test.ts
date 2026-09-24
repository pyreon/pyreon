import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' `lines` series crosses the OptionChart: the web facade compiles the
 * literal option at compile time, the native plot carries the same lines and
 * trail parameters, and a trail wraps the host in the effect clock so the
 * engine redraws it every frame (held still under Reduce Motion by the runtime).
 */
const app = (effect: string): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: {}, yAxis: {}, series: [{ type: 'lines', lineStyle: { color: '#123456', width: 2 }${effect}, data: [{ coords: [[0, 0], [10, 10]] }, { coords: [[0, 10], [5, 5], [10, 0]] }] }] }} />
}`

describe.each(['swift', 'kotlin'] as const)('lines series on %s', (target) => {
  const sep = target === 'swift' ? ': ' : ' = '
  it('draws static lines without a clock, and compiles', () => {
    const r = transform(app(''), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('LinesSeries(')
    expect(r.code).toContain('"#123456"')
    expect(r.code).not.toContain('PyreonChartClock')
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('a trail wraps the host in the effect clock and feeds effectTime, and compiles', () => {
    const r = transform(app(`, effect: { show: true, period: 2, trailLength: 0.3, color: '#ff0000', symbolSize: 6 }`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonChartClock')
    expect(r.code).toContain(`effectTime${sep}pyreonClock`)
    expect(r.code).toContain(`effect${sep}true`)
    expect(r.code).toContain(`trailLength${sep}0.3`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('names what the trail does not map, like the web', () => {
    const r = transform(app(`, effect: { show: true, delay: 1 }`), { target })
    expect(r.warnings).toEqual([expect.stringContaining('effect.delay')])
  })
})
