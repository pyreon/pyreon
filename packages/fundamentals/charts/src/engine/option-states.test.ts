import { describe, expect, it } from 'vitest'
import { compileOption } from './option'

/**
 * ECharts' state options land on the engine's series fields: `emphasis.focus`
 * and `emphasis.itemStyle.color` (hover), `select.itemStyle.color` (pinned),
 * `blur.itemStyle.opacity` (the fade), and `selectedMode` as the host's pin
 * mode. What a state changes beyond its fill is named, never dropped.
 */
const base = { xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: {} }

describe('states', () => {
  it('maps emphasis / select / blur to the series state fields with zero warnings', () => {
    const { spec, warnings, selectedMode } = compileOption({
      ...base,
      series: [{ type: 'bar', data: [1, 2, 3], selectedMode: 'multiple', emphasis: { focus: 'self', itemStyle: { color: '#ee0000' } }, select: { itemStyle: { color: '#0000ee' } }, blur: { itemStyle: { opacity: 0.3 } } }],
    })
    expect(warnings).toEqual([])
    expect(spec.series[0]).toMatchObject({ focus: 'self', emphasisColor: '#ee0000', selectColor: '#0000ee', blurOpacity: 0.3 })
    expect(selectedMode).toBe('multiple')
  })

  it('selectedMode true is single, false is off, and the first series decides', () => {
    expect(compileOption({ ...base, series: [{ type: 'bar', data: [1, 2, 3], selectedMode: true }] }).selectedMode).toBe('single')
    expect(compileOption({ ...base, series: [{ type: 'bar', data: [1, 2, 3], selectedMode: false }] }).selectedMode).toBeUndefined()
    expect(compileOption({ ...base, series: [{ type: 'bar', data: [1, 2, 3] }, { type: 'line', data: [1, 2, 3], selectedMode: 'single' }] }).selectedMode).toBe('single')
    expect(compileOption({ ...base, series: [{ type: 'bar', data: [1, 2, 3] }] }).selectedMode).toBeUndefined()
  })

  it('names what has no engine form: a state label, a symbol scale, whole-series selection, an unknown focus', () => {
    const { warnings, spec } = compileOption({
      ...base,
      series: [{ type: 'bar', data: [1, 2, 3], selectedMode: 'series', emphasis: { focus: 'sibling', label: { show: true }, scale: 1.2 }, select: { label: { show: true } }, blur: { label: { show: false } } }],
    })
    expect(warnings.map((w) => w.path).sort()).toEqual(['series[0].blur.label', 'series[0].emphasis.focus', 'series[0].emphasis.label', 'series[0].emphasis.scale', 'series[0].select.label', 'series[0].selectedMode'])
    expect(spec.series[0]!.focus).toBeUndefined()
  })
})
