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

  it('reads the state extras: labels, symbol scale, state stroke and area opacity, whole-series selection', () => {
    const { warnings, spec, selectedMode } = compileOption({
      ...base,
      series: [{
        type: 'line',
        data: [1, 2, 3],
        selectedMode: 'series',
        emphasis: { focus: 'series', label: { show: true }, scale: 1.2, lineStyle: { width: 5 }, areaStyle: { opacity: 0.6 }, blurScope: 'global' },
        select: { label: { show: true } },
        blur: { lineStyle: { width: 1 }, areaStyle: { opacity: 0.05 } },
      }],
    })
    expect(warnings).toEqual([])
    expect(selectedMode).toBe('series')
    expect(spec.series[0]).toMatchObject({
      focus: 'series',
      emphasisLabel: true,
      selectLabel: true,
      emphasisScale: 1.2,
      emphasisWidth: 5,
      emphasisAreaOpacity: 0.6,
      blurWidth: 1,
      blurAreaOpacity: 0.05,
    })
  })

  it('`emphasis.scale: true` is ECharts\' own 1.1, and `disabled` stops the highlight', () => {
    const { spec } = compileOption({ ...base, series: [{ type: 'scatter', data: [1, 2], emphasis: { scale: true, disabled: true } }] })
    expect(spec.series[0]).toMatchObject({ emphasisScale: 1.1, emphasisDisabled: true })
  })

  it('still names what has no engine form: an unknown focus, a state label style, blur.label, select stroke, an unknown blurScope', () => {
    const { warnings } = compileOption({
      ...base,
      series: [{
        type: 'bar',
        data: [1, 2, 3],
        emphasis: { focus: 'sibling', label: { show: true, color: 'red' }, blurScope: 'planet' },
        select: { lineStyle: { width: 2 }, disabled: true },
        blur: { label: { show: false } },
      }],
    })
    expect(warnings.map((w) => w.path).sort()).toEqual([
      'series[0].blur.label',
      'series[0].emphasis.blurScope',
      'series[0].emphasis.focus',
      'series[0].emphasis.label.color',
      'series[0].select.disabled',
      'series[0].select.lineStyle',
    ])
  })
})
