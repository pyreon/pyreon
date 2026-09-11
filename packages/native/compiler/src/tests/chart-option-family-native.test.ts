import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const PIE = `import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart width={320} height={240} option={{
    title: { text: 'Share' }, legend: {}, tooltip: {},
    series: [{ type: 'pie', radius: ['40%', '80%'], label: { show: false }, data: [
      { value: 3, name: 'A' }, { value: 2, name: 'B' },
    ] }],
  }} />
}`

const GAUGE = `import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ series: [{ type: 'gauge', min: 10, max: 90, detail: { show: false }, data: [{ value: 42 }] }] }} />
}`

describe('OptionChart family options lower to native hosts', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: pie preserves data, donut radius, labels, legend, tooltip, title, and size`, () => {
      const r = transform(PIE, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      expect(r.code).toContain('renderPie(')
      expect(r.code).toContain(target === 'swift' ? 'innerRadius: 0.5, showLabels: false' : 'innerRadius = 0.5, showLabels = false')
      expect(r.code).toContain('"Share"')
      expect(r.code).toContain('pieLegend(')
      expect(r.code).toContain('pieTip(')
    })

    it(`${target}: gauge preserves its numeric domain, value, and hidden detail`, () => {
      const r = transform(GAUGE, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      expect(r.code).toContain('renderGauge(')
      expect(r.code).toContain(target === 'swift' ? 'min: 10.0, max: 90.0' : 'min = 10.0, max = 90.0')
      expect(r.code).not.toContain('plain(42.0)')
    })
  }

  it('names unsupported dynamic and cartesian option shapes', () => {
    const dynamic = transform(`import { OptionChart } from '@pyreon/charts/plot'; export function App(p: { option: object }) { return <OptionChart option={p.option} /> }`, { target: 'swift' })
    expect(dynamic.warnings.join('\n')).toContain('<OptionChart option>')
    const line = transform(`import { OptionChart } from '@pyreon/charts/plot'; export function App() { return <OptionChart option={{ series: [{ type: 'line', data: [1, 2] }] }} /> }`, { target: 'kotlin' })
    expect(line.warnings.join('\n')).toContain('option.series[0].type')
  })

  it('does not misroute OptionChart rich callbacks into index-only family handlers', () => {
    const r = transform(PIE.replace(' />', ' onSelect={() => {}} onFamilySelect={() => {}} />'), { target: 'swift' })
    expect(r.warnings.join('\n')).toContain('<OptionChart onSelect>')
    expect(r.warnings.join('\n')).toContain('<OptionChart onFamilySelect>')
  })

  it.skipIf(!isSwiftcAvailable())('swiftc accepts both family emits', () => {
    for (const src of [PIE, GAUGE]) {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts both family emits', () => {
    for (const src of [PIE, GAUGE]) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
})
