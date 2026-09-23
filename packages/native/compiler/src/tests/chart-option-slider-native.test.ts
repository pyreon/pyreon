import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' slider dataZoom on native, drawn as ECharts draws it. Under
 * ECharts' grid the web lays the strip out in the grid's bottom margin with
 * the ported `sliderRect` / `renderSliderZoom` (held to ECharts by the web
 * differential); native used to draw Pyreon's own navigator band below a
 * shrunk plot instead. The option now carries the slider's box to the host,
 * which lays out and paints the same strip, and its drag overlay covers it.
 */
const src = (zoom: string): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a', 'b', 'c', 'd'] }, yAxis: { type: 'value' }, dataZoom: ${zoom}, series: [{ type: 'line', data: [3, 9, 4, 7] }] }} />
}`

describe.each(['swift', 'kotlin'] as const)('slider dataZoom on %s', (target) => {
  const slider = transform(src("[{ type: 'slider', start: 25, end: 75 }]"), { target })
  const placed = transform(src("[{ type: 'slider', bottom: 4, height: 20, showDataShadow: true }]"), { target })
  const inside = transform(src("[{ type: 'inside' }]"), { target })

  it('lays the strip out as ECharts does, from the slider box, with zero warnings', () => {
    expect(slider.warnings).toEqual([])
    expect(slider.code).toContain('sliderRect(')
    expect(slider.code).toContain('renderSliderZoom(')
    // Pyreon's navigator band is not drawn under ECharts' grid.
    expect(slider.code).not.toContain('renderNavigator(')
  })

  it('carries the option\'s own box sides', () => {
    const sep = target === 'swift' ? ': ' : ' = '
    expect(placed.code).toMatch(new RegExp(`bottom${sep}FrameLength\\(mode${sep}"px", amount${sep}4\\.0\\)`))
    expect(placed.code).toMatch(new RegExp(`height${sep}FrameLength\\(mode${sep}"px", amount${sep}20\\.0\\)`))
  })

  it('an inside zoom draws no strip', () => {
    expect(inside.code).not.toContain('renderSliderZoom(')
    expect(inside.code).not.toContain('renderNavigator(')
  })

  it('the toolchain accepts it against the generated engine', () => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(slider.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(slider.code)).toMatchObject({ ok: true })
  })
})
