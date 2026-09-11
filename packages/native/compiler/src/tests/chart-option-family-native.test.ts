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

const CARTESIAN = `import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart height={260} option={{
    title: { text: 'Quarterly' }, legend: {}, tooltip: {},
    xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3'], name: 'Quarter' },
    yAxis: { min: 0, max: 100, name: 'Value' },
    series: [
      { type: 'bar', name: 'Actual', itemStyle: { color: '#3366ff' }, data: [20, 45, 70] },
      { type: 'bar', name: 'Plan', data: [30, 50, 80] },
      { type: 'line', name: 'Trend', lineStyle: { color: '#ff6633' }, areaStyle: {}, data: [25, 48, 75] },
      { type: 'scatter', name: 'Events', data: [15, 60, 90] },
    ],
  }} />
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

    it(`${target}: cartesian options preserve categories, series kinds, names, colours, and domain`, () => {
      const r = transform(CARTESIAN, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      for (const kind of ['grouped', 'area', 'points']) expect(r.code).toContain(`"${kind}"`)
      for (const label of ['Actual', 'Plan', 'Trend', 'Events']) expect(r.code).toContain(`"${label}"`)
      for (const category of ['Q1', 'Q2', 'Q3']) expect(r.code).toContain(`"${category}"`)
      expect(r.code).toContain('#3366ff')
      expect(r.code).toContain('#ff6633')
      expect(r.code).toContain(target === 'swift' ? 'yDomain: Domain(min: 0.0, max: 100.0)' : 'yDomain = Domain(min = 0.0, max = 100.0)')
    })
  }

  it('names unsupported dynamic and cartesian option shapes', () => {
    const dynamic = transform(`import { OptionChart } from '@pyreon/charts/plot'; export function App(p: { option: object }) { return <OptionChart option={p.option} /> }`, { target: 'swift' })
    expect(dynamic.warnings.join('\n')).toContain('<OptionChart option>')
    const line = transform(`import { OptionChart } from '@pyreon/charts/plot'; export function App() { return <OptionChart option={{ series: [{ type: 'line', data: [1, 2] }] }} /> }`, { target: 'kotlin' })
    expect(line.warnings.join('\n')).toContain('option.xAxis.data')
  })

  it('does not misroute OptionChart rich callbacks into index-only family handlers', () => {
    const r = transform(PIE.replace(' />', ' onSelect={() => {}} onFamilySelect={() => {}} />'), { target: 'swift' })
    expect(r.warnings.join('\n')).toContain('<OptionChart onSelect>')
    expect(r.warnings.join('\n')).toContain('<OptionChart onFamilySelect>')
  })

  it.skipIf(!isSwiftcAvailable())('swiftc accepts the family and cartesian emits', () => {
    for (const src of [PIE, GAUGE, CARTESIAN]) {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the family and cartesian emits', () => {
    for (const src of [PIE, GAUGE, CARTESIAN]) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
})
