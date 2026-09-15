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

const STATIC_FAMILIES = `import { OptionChart } from '@pyreon/charts/plot'
export function App() { return <>
  <OptionChart option={{ radar: { indicator: [{ name: 'Speed', max: 100 }, { name: 'Power', max: 100 }] }, legend: {}, series: [{ type: 'radar', areaStyle: { opacity: 0.4 }, data: [{ name: 'A', value: [80, 60] }] }] }} />
  <OptionChart option={{ xAxis: { data: ['Mon', 'Tue'] }, yAxis: {}, series: [{ type: 'candlestick', data: [[10, 12, 8, 14], [12, 11, 9, 15]] }] }} />
  <OptionChart option={{ xAxis: { data: ['AM', 'PM'] }, yAxis: { data: ['Mon'] }, series: [{ type: 'heatmap', data: [[0, 0, 3], [1, 0, 7]] }] }} />
  <OptionChart option={{ series: [{ type: 'funnel', sort: 'none', gap: 3, data: [{ name: 'Visit', value: 100 }, { name: 'Buy', value: 20 }] }] }} />
</> }`

const HIERARCHY_AND_NETWORK = `import { OptionChart } from '@pyreon/charts/plot'
export function App() { return <>
  <OptionChart option={{ series: [{ type: 'treemap', label: { show: false }, data: [{ name: 'A', children: [{ name: 'A1', value: 3, itemStyle: { color: '#3366ff' } }] }] }] }} />
  <OptionChart option={{ series: [{ type: 'sunburst', radius: ['30%', '90%'], data: [{ name: 'A', children: [{ name: 'A1', value: 3 }] }] }] }} />
  <OptionChart option={{ series: [{ type: 'tree', symbolSize: 12, data: [{ name: 'Root', children: [{ name: 'Leaf', value: 2 }] }] }] }} />
  <OptionChart option={{ series: [{ type: 'sankey', nodeWidth: 18, nodeGap: 7, nodeAlign: 'justify', data: [{ name: 'From' }, { name: 'To' }], links: [{ source: 'From', target: 'To', value: 5 }] }] }} />
  <OptionChart option={{ series: [{ type: 'graph', data: [{ id: 'a', name: 'Alpha', value: 2, symbolSize: 20 }, { id: 'b', name: 'Beta' }], links: [{ source: 'a', target: 'b', value: 3 }] }] }} />
</> }`

const CALENDAR = `import { OptionChart } from '@pyreon/charts/plot'
export function App() { return <>
  <OptionChart option={{ calendar: { range: '2026' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2026-01-03', 4], ['2026-06-12', 9]] }] }} />
  <OptionChart option={{ calendar: { range: ['2025-12-20', '2026-01-10'] }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2025-12-25', 7]] }] }} />
</> }`

const PARALLEL = `import { OptionChart } from '@pyreon/charts/plot'
export function App() { return <OptionChart option={{
  parallelAxis: [
    { dim: 0, name: 'Score', min: 0, max: 10 },
    { dim: 1, name: 'Band', type: 'category', data: ['low', 'high'], inverse: true },
  ],
  series: [{ type: 'parallel', lineStyle: { width: 3, opacity: 0.6, color: '#123456' }, data: [[4, 'low'], [9, 'high']] }],
}} /> }`

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

    it(`${target}: radar, candlestick, heatmap, and funnel options use their native renderers`, () => {
      const r = transform(STATIC_FAMILIES, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      for (const renderer of ['renderRadar', 'renderCandlestickChart', 'renderHeatChart', 'renderFunnel']) expect(r.code).toContain(renderer)
      for (const label of ['Speed', 'Power', 'Mon', 'Tue', 'AM', 'PM', 'Visit', 'Buy']) expect(r.code).toContain(`"${label}"`)
    })

    it(`${target}: hierarchy and network options use their native renderers`, () => {
      const r = transform(HIERARCHY_AND_NETWORK, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      for (const renderer of ['renderTreemap', 'renderSunburst', 'renderTree', 'renderSankey', 'renderGraph']) expect(r.code).toContain(renderer)
      for (const label of ['A1', 'Root', 'Leaf', 'From', 'To', 'Alpha', 'Beta']) expect(r.code).toContain(`"${label}"`)
      expect(r.code).toContain('#3366ff')
    })

    it(`${target}: calendar heatmap options preserve year/range and dated values`, () => {
      const r = transform(CALENDAR, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      expect(r.code).toContain('renderCalendar')
      for (const value of ['2026-01-01', '2026-12-31', '2025-12-20', '2026-01-10', '2026-01-03', '2026-06-12', '2025-12-25']) expect(r.code).toContain(`"${value}"`)
    })

    it(`${target}: parallel options preserve axes, categories, rows, domains, and line style`, () => {
      const r = transform(PARALLEL, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      expect(r.code).toContain('renderParallel')
      for (const value of ['Score', 'Band', 'low', 'high', '#123456']) expect(r.code).toContain(`"${value}"`)
      expect(r.code).toContain(target === 'swift' ? 'lineWidth: Double(3)' : 'lineWidth = (3).toDouble()')
      expect(r.code).toContain(target === 'swift' ? 'lineOpacity: 0.6' : 'lineOpacity = 0.6')
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
    for (const src of [PIE, GAUGE, CARTESIAN, STATIC_FAMILIES]) {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  }, 90_000)

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the family and cartesian emits', () => {
    for (const src of [PIE, GAUGE, CARTESIAN, STATIC_FAMILIES]) {
      const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  }, 90_000)

  it.skipIf(!isSwiftcAvailable())('swiftc accepts hierarchy and network option emits', () => {
    const r = validateSwiftWithStubs(transform(HIERARCHY_AND_NETWORK, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 30_000)

  it.skipIf(!isKotlincAvailable())('kotlinc accepts hierarchy and network option emits', () => {
    const r = validateKotlin(transform(HIERARCHY_AND_NETWORK, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 30_000)

  it.skipIf(!isSwiftcAvailable())('swiftc accepts calendar option emits', () => {
    const r = validateSwiftWithStubs(transform(CALENDAR, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 30_000)

  it.skipIf(!isKotlincAvailable())('kotlinc accepts calendar option emits', () => {
    const r = validateKotlin(transform(CALENDAR, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 30_000)

  it.skipIf(!isSwiftcAvailable())('swiftc accepts parallel option emits', () => {
    const r = validateSwiftWithStubs(transform(PARALLEL, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 30_000)

  it.skipIf(!isKotlincAvailable())('kotlinc accepts parallel option emits', () => {
    const r = validateKotlin(transform(PARALLEL, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 90_000)
})
