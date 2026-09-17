import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * Decals cross through the web facade's own mapping (`fillPattern`) at compile
 * time — the tiled symbol, pitch and angle the web draws — and `aria.decal.show`
 * hands each series its default texture. The native painters draw the engine's
 * `patternMarks`, the geometry every target shares.
 */
const app = (option: string): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={${option}} />
}`

describe.each(['swift', 'kotlin'] as const)('decals on %s', (target) => {
  const sep = target === 'swift' ? ': ' : ' = '
  it('a triangle decal rotated by the option crosses with its pitch, and compiles', () => {
    const r = transform(app(`{ xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', itemStyle: { decal: { symbol: 'triangle', dashArrayX: [6, 4], dashArrayY: 8, rotation: 0.5, symbolSize: 0.5 } }, data: [3, 5] }] }`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`kind${sep}"symbols"`)
    expect(r.code).toContain(`symbol${sep}"triangle"`)
    expect(r.code).toContain(`spacing${sep}10.0`)
    expect(r.code).toContain(`spacingY${sep}16.0`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('aria.decal.show gives each series a distinct default texture', () => {
    const r = transform(app(`{ aria: { decal: { show: true } }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }, { type: 'bar', data: [2] }] }`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`kind${sep}"diagonal"`)
    expect(r.code).toContain(`symbol${sep}"circle"`)
  })

  it('names an undrawable decal symbol, like the web', () => {
    const r = transform(app(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', itemStyle: { decal: { symbol: 'path://M0 0L1 1' } }, data: [1] }] }`), { target })
    expect(r.warnings).toEqual([expect.stringContaining('Decal symbol "path://')])
  })
})
