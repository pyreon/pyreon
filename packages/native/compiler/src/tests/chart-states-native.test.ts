import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' states cross the OptionChart natively as the same four Series
 * fields the web facade fills — `emphasis.focus` / `emphasis.itemStyle.color`,
 * `select.itemStyle.color`, `blur.itemStyle.opacity` — and `selectedMode`
 * becomes the host's tap-to-pin mode. What a state changes beyond its fill
 * is named, never dropped.
 */
const app = (series: string): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: {}, series: [${series}] }} />
}`

describe.each(['swift', 'kotlin'] as const)('states on %s', (target) => {
  it('lowers emphasis / select / blur / selectedMode with zero warnings, and compiles', () => {
    const r = transform(app(`{ type: 'bar', data: [1, 2, 3], selectedMode: 'multiple', emphasis: { focus: 'self', itemStyle: { color: '#ee0000' } }, select: { itemStyle: { color: '#0000ee' } }, blur: { itemStyle: { opacity: 0.3 } } }`), { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`focus${sep}"self"`)
    expect(r.code).toContain(`emphasisColor${sep}"#ee0000"`)
    expect(r.code).toContain(`selectColor${sep}"#0000ee"`)
    expect(r.code).toContain(`blurOpacity${sep}0.3`)
    // `selectedMode` becomes the host's pin state, fed into the spec's emphasis.
    expect(r.code).toContain('pyreonSelected')
    expect(r.code).toMatch(/Emphasis\(highlight(: | = )-1, selected(: | = )/)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('names what has no engine form, like the web', () => {
    const r = transform(app(`{ type: 'bar', data: [1, 2, 3], selectedMode: 'series', emphasis: { focus: 'sibling', label: { show: true } }, blur: { label: { show: false } } }`), { target })
    expect(r.warnings).toEqual([
      expect.stringContaining('option.series[0].emphasis.focus>'),
      expect.stringContaining('option.series[0].emphasis.label>'),
      expect.stringContaining('option.series[0].blur.label>'),
      expect.stringContaining('option.series[0].selectedMode>'),
    ])
    expect(r.code).not.toContain('focus')
  })
})
