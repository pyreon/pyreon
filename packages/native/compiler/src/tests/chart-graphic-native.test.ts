import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' `graphic` layer crosses the OptionChart natively: the elements are
 * positioned at COMPILE time by the web facade's own `graphicElements`
 * (`@pyreon/charts/option-layer`) and painted by the engine's
 * `graphicDrawCommands`, so the native canvas draws what the web draws.
 */
const app = (graphic: string, extra = ''): string => `
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart${extra} option={{ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }], graphic: ${graphic} }} />
}`

describe.each(['swift', 'kotlin'] as const)('graphic layer on %s', (target) => {
  it('lowers text / rect / circle and the round shapes with zero warnings, and compiles', () => {
    const r = transform(app(`[
      { type: 'text', left: 10, top: 5, style: { text: 'Peak', fill: '#ff0000', fontSize: 14, textAlign: 'center' } },
      { type: 'sector', x: 40, y: 40, shape: { cx: 0, cy: 0, r: 12, r0: 4, startAngle: 0, endAngle: 1.5 }, style: { fill: '#00ff00' } },
      { type: 'ring', shape: { cx: 5, cy: 5, r: 9, r0: 3 } },
      { type: 'arc', shape: { cx: 1, cy: 2, r: 7, startAngle: 0, endAngle: 2 }, style: { stroke: '#0000ff', lineWidth: 2 } },
      { type: 'bezierCurve', shape: { x1: 0, y1: 0, cpx1: 5, cpy1: 9, x2: 10, y2: 0 } }
    ]`), { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain('graphicDrawCommands(')
    expect(r.code).toContain(`kind${sep}"text"`)
    expect(r.code).toContain(`text${sep}"Peak"`)
    expect(r.code).toContain(`align${sep}"middle"`)
    expect(r.code).toContain(`kind${sep}"sector"`)
    expect(r.code).toContain(`kind${sep}"ring"`)
    expect(r.code).toContain(`kind${sep}"arc"`)
    expect(r.code).toContain(`kind${sep}"bezier"`)
    // The bezier's control polygon crosses as real points.
    expect(r.code).toMatch(/points(: | = )(\[|listOf<PyreonChartPt>\()PyreonChartPt/)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('positions against the option\'s static size, and a group offsets its children', () => {
    const r = transform(app(`[{ type: 'group', right: 0, top: 0, children: [{ type: 'circle', shape: { cx: 0, cy: 0, r: 4 } }] }]`, ' width={500} height={200}'), { target })
    expect(r.warnings).toEqual([])
    // right: 0 on a zero-width group anchors it at the far edge of the 500px canvas.
    expect(r.code).toContain('500.0')
  })

  it('names an image element instead of dropping it, and keeps the rest', () => {
    const r = transform(app(`[{ type: 'image', style: { image: 'logo.png' } }, { type: 'circle', shape: { cx: 1, cy: 1, r: 2 } }]`), { target })
    expect(r.warnings).toEqual([expect.stringContaining('graphic image elements are not supported')])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`kind${sep}"circle"`)
  })

  it('a non-literal graphic option is named, not silently dropped', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/option'
export function App(props: { g: unknown }) {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }], graphic: props.g }} />
}`, { target })
    expect(r.warnings).toEqual([expect.stringContaining('option.graphic>: native needs literal graphic elements')])
    expect(r.code).not.toContain('graphicDrawCommands')
  })
})
