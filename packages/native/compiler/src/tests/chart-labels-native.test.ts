import { describe, expect, it } from 'vitest'
import { compileOption } from '@pyreon/charts/engine'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' series `label` crosses the OptionChart: the `{a}`/`{b}`/`{c}`/`{d}`
 * template is resolved at COMPILE time through the web facade's own
 * `labelFields` (`@pyreon/charts/option-layer`), so the native chart shows the
 * strings the web shows, and the engine owns the rich `{name|text}`
 * segmentation on both targets.
 */
const app = (label: string): string => `
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['Mon', 'Tue'] }, yAxis: {}, series: [{ type: 'bar', name: 'Sales', data: [30, 10], label: ${label} }] }} />
}`

describe.each(['swift', 'kotlin'] as const)('series labels on %s', (target) => {
  it('resolves the template per datum — the same strings the web resolves — with zero warnings, and compiles', () => {
    const r = transform(app(`{ show: true, formatter: '{a}: {b} = {c} ({d}%)' }`), { target })
    expect(r.warnings).toEqual([])
    const web = compileOption({ xAxis: { type: 'category', data: ['Mon', 'Tue'] }, yAxis: {}, series: [{ type: 'bar', name: 'Sales', data: [30, 10], label: { show: true, formatter: '{a}: {b} = {c} ({d}%)' } }] }).spec
    for (const text of web.series[0]!.labelTexts!) expect(r.code).toContain(JSON.stringify(text))
    expect(r.code).toContain('labelTexts')
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('carries the colour, the size and the rich styles', () => {
    const r = transform(app(`{ show: true, color: '#abcdef', fontSize: 18, rich: { big: { color: '#ff0000', fontSize: 30 } }, formatter: '{big|{c}}' }`), { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`labelColor${sep}"#abcdef"`)
    expect(r.code).toContain(`labelSize${sep}18.0`)
    expect(r.code).toContain(`RichStyle(name${sep}"big", color${sep}"#ff0000", fontSize${sep}30.0)`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('a FUNCTION formatter cannot run at compile time and is named, not silently dropped', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1], label: { show: true, formatter: (p: { value: number }) => String(p.value) } }] }} />
}`, { target })
    expect(r.warnings).toEqual([expect.stringContaining('native needs a literal label object')])
    expect(r.code).not.toContain('labelTexts')
  })

  it('a label with no formatter still shows the value, and carries nothing extra', () => {
    const r = transform(app(`{ show: true }`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).not.toContain('labelTexts')
    expect(r.code).toContain('showValues')
  })
})
