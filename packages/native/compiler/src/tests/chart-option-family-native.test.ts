import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const PIE = `import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart width={320} height={240} option={{
    title: { text: 'Share' }, legend: {}, tooltip: {},
    series: [{ type: 'pie', radius: ['40%', '80%'], label: { show: false }, data: [
      { value: 3, name: 'A' }, { value: 2, name: 'B' },
    ] }],
  }} />
}`

const GAUGE = `import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={{ series: [{ type: 'gauge', min: 10, max: 90, detail: { show: false }, data: [{ value: 42 }] }] }} />
}`

const TIMELINE_PIE = `import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart timelineIndex={1} option={{
    baseOption: {
      timeline: { data: ['first', 'second'], currentIndex: 0 },
      title: { text: 'Timeline share' },
      series: [{ type: 'pie', radius: ['40%', '80%'], label: { show: false, position: 'inside' }, data: [{ value: 3, name: 'Base' }] }],
    },
    options: [
      { series: [{ data: [{ value: 1, name: 'First' }] }] },
      { series: [{ label: { position: 'outside' }, data: [{ value: 7, name: 'Second' }] }] },
    ],
  }} />
}`

const CARTESIAN = `import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart height={260} option={{
    title: { text: 'Quarterly' }, legend: {}, tooltip: {},
    xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3'], name: 'Quarter' },
    yAxis: { min: 0, max: 100, name: 'Value' },
    series: [
      { type: 'bar', name: 'Actual', itemStyle: { color: '#3366ff', decal: { symbol: 'circle', color: '#ffffff', dashArrayX: 9, dashArrayY: 2 } }, data: [20, 45, 70], markArea: { itemStyle: { color: '#224466' }, data: [[{ name: 'Target', yAxis: 30 }, { yAxis: 60 }], [{ xAxis: 0.5 }, { xAxis: 1.5 }]] } },
      { type: 'bar', name: 'Plan', data: [30, 50, 80] },
      { type: 'line', name: 'Trend', lineStyle: { color: '#ff6633' }, areaStyle: {}, data: [25, 48, 75] },
      { type: 'scatter', name: 'Events', data: [15, 60, 90] },
    ],
  }} />
}`

const PICTORIAL = `import { OptionChart } from '@pyreon/charts/option'
export function App() { return <OptionChart option={{
  xAxis: { type: 'category', data: ['A', 'B'] }, yAxis: {},
  series: [{ type: 'pictorialBar', name: 'Units', symbol: 'diamond', symbolRepeat: 'fixed', data: [3, 5] }],
}} /> }`

const STATIC_FAMILIES = `import { OptionChart } from '@pyreon/charts/option'
export function App() { return <>
  <OptionChart option={{ radar: { indicator: [{ name: 'Speed', max: 100 }, { name: 'Power', max: 100 }] }, legend: {}, series: [{ type: 'radar', areaStyle: { opacity: 0.4 }, data: [{ name: 'A', value: [80, 60] }] }] }} />
  <OptionChart option={{ xAxis: { data: ['Mon', 'Tue'] }, yAxis: {}, series: [{ type: 'candlestick', data: [[10, 12, 8, 14], [12, 11, 9, 15]] }] }} />
  <OptionChart option={{ xAxis: { data: ['AM', 'PM'] }, yAxis: { data: ['Mon'] }, series: [{ type: 'heatmap', data: [[0, 0, 3], [1, 0, 7]] }] }} />
  <OptionChart option={{ series: [{ type: 'funnel', sort: 'none', gap: 3, data: [{ name: 'Visit', value: 100 }, { name: 'Buy', value: 20 }] }] }} />
</> }`

const HIERARCHY_AND_NETWORK = `import { OptionChart } from '@pyreon/charts/option'
export function App() { return <>
  <OptionChart option={{ series: [{ type: 'treemap', label: { show: false }, data: [{ name: 'A', children: [{ name: 'A1', value: 3, itemStyle: { color: '#3366ff' } }] }] }] }} />
  <OptionChart option={{ series: [{ type: 'sunburst', radius: ['30%', '90%'], data: [{ name: 'A', children: [{ name: 'A1', value: 3 }] }] }] }} />
  <OptionChart option={{ series: [{ type: 'tree', symbolSize: 12, data: [{ name: 'Root', children: [{ name: 'Leaf', value: 2 }] }] }] }} />
  <OptionChart option={{ series: [{ type: 'sankey', nodeWidth: 18, nodeGap: 7, nodeAlign: 'justify', data: [{ name: 'From' }, { name: 'To' }], links: [{ source: 'From', target: 'To', value: 5 }] }] }} />
  <OptionChart option={{ series: [{ type: 'graph', data: [{ id: 'a', name: 'Alpha', value: 2, symbolSize: 20 }, { id: 'b', name: 'Beta' }], links: [{ source: 'a', target: 'b', value: 3 }] }] }} />
</> }`

const CALENDAR = `import { OptionChart } from '@pyreon/charts/option'
export function App() { return <>
  <OptionChart option={{ calendar: { range: 2026, cellSize: 14, dayLabel: { show: false, firstDay: 1 }, monthLabel: { show: false }, itemStyle: { color: '#eeeeee', borderWidth: 2 } }, visualMap: { min: 0, max: 10, inRange: { color: ['#ffffff', '#008800'] } }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2026-01-03', 4], ['2026-06-12', 9]] }] }} />
  <OptionChart option={{ calendar: { range: ['2025-12-20', '2026-01-10'] }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2025-12-25', 7]] }] }} />
  <OptionChart option={{ calendar: { range: '2024-02' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2024-02-29', 5]] }] }} />
  <OptionChart option={{ calendar: { range: '2027-03-04' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2027-03-04', 6]] }] }} />
</> }`

const PARALLEL = `import { OptionChart } from '@pyreon/charts/option'
export function App() { return <OptionChart option={{
  parallelAxis: [
    { dim: 0, name: 'Score', min: 0, max: 10 },
    { dim: 1, name: 'Band', type: 'category', data: ['low', 'high'], inverse: true },
  ],
  series: [{ type: 'parallel', lineStyle: { width: 3, opacity: 0.6, color: '#123456' }, data: [[4, 'low'], [9, 'high']] }],
}} /> }`

const RIVER = `import { OptionChart } from '@pyreon/charts/option'
export function App() { return <OptionChart option={{
  singleAxis: { type: 'time' },
  series: [{ type: 'themeRiver', label: { show: false }, data: [
    ['2026-01-02', 3, 'Alpha'], ['2026-01-01', 2, 'Alpha'],
    ['2026-01-01', 5, 'Beta'], ['2026-01-02', 1, 'Alpha'],
  ] }],
}} /> }`

const POLAR = `import { OptionChart } from '@pyreon/charts/option'
export function App() { return <OptionChart option={{
  polar: { radius: ['20%', '80%'] },
  angleAxis: { type: 'category', data: ['North', 'East', 'South'], startAngle: 90, clockwise: false },
  radiusAxis: { min: 0, max: 12 },
  series: [
    { type: 'bar', coordinateSystem: 'polar', name: 'Actual', stack: 'total', itemStyle: { color: '#123456' }, data: [3, 6, 9] },
    { type: 'line', coordinateSystem: 'polar', name: 'Trend', lineStyle: { color: '#abcdef' }, data: [2, 5, 8] },
  ],
}} /> }`

const BOXPLOT = `import { OptionChart } from '@pyreon/charts/option'
export function App() { return <OptionChart option={{
  xAxis: { type: 'category', data: ['A', 'B'] }, yAxis: {},
  series: [{ type: 'boxplot', itemStyle: { color: '#ddeeff', borderColor: '#112233' }, data: [
    [1, 2, 3, 4, 5], [10, 12, 15, 18, 20],
  ] }],
}} /> }`

const SINGLE_AXIS = `import { OptionChart } from '@pyreon/charts/option'
export function App() { return <OptionChart option={{
  singleAxis: { type: 'value', min: 0, max: 100, name: 'Score' },
  series: [{ type: 'effectScatter', coordinateSystem: 'singleAxis', symbolSize: 16, label: { show: true }, itemStyle: { color: '#336699' }, data: [[20, 2], [75, 8]] }],
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
      // The tooltip hits the same laid-out arcs the web compiled (ECharts' start angle and direction).
      expect(r.code).toContain('pieTipRowsWith(')
    })

    it(`${target}: gauge preserves its numeric domain, value, and hidden detail`, () => {
      const r = transform(GAUGE, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      // ECharts' whole dial, as the web compiled it; its detail hidden by the option.
      expect(r.code).toContain('renderDialIn(DialSpec(')
      expect(r.code).toContain(target === 'swift' ? 'min: 10.0, max: 90.0' : 'min = 10.0, max = 90.0')
      expect(r.code).toContain(target === 'swift' ? 'detailShow: false' : 'detailShow = false')
      expect(r.code).not.toContain('plain(42.0)')
    })

    it(`${target}: a static timeline selects and recursively merges the requested native step`, () => {
      const r = transform(TIMELINE_PIE, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('renderPie(')
      expect(r.code).toContain('"Second"')
      expect(r.code).not.toContain('"First"')
      expect(r.code).toContain(target === 'swift' ? 'innerRadius: 0.5, showLabels: false' : 'innerRadius = 0.5, showLabels = false')
    })

    it(`${target}: cartesian options preserve categories, series kinds, names, colours, and domain`, () => {
      const r = transform(CARTESIAN, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      // A line with an areaStyle is a LINE that also fills (the web facade's reading, crossed as compiled).
      for (const kind of ['grouped', 'line', 'points']) expect(r.code).toContain(`"${kind}"`)
      expect(r.code).toContain(target === 'swift' ? 'areaFill: true, areaOpacity: 0.7' : 'areaFill = true, areaOpacity = 0.7')
      for (const label of ['Actual', 'Plan', 'Trend', 'Events']) expect(r.code).toContain(`"${label}"`)
      for (const category of ['Q1', 'Q2', 'Q3']) expect(r.code).toContain(`"${category}"`)
      expect(r.code).toContain('#3366ff')
      expect(r.code).toContain('#ff6633')
      expect(r.code).toContain('#224466')
      // The web facade's own decal mapping, run at compile time: a circle symbol tiled on the dash pitch.
      expect(r.code).toContain(target === 'swift' ? 'pattern: PyreonChartPattern(kind: "symbols", color: "#ffffff", spacing: 18.0, width: 2.0, angle: 0.0, symbol: "circle", spacingY: 4.0)' : 'pattern = PyreonChartPattern(kind = "symbols", color = "#ffffff", spacing = 18.0, width = 2.0, angle = 0.0, symbol = "circle", spacingY = 4.0)')
      expect(r.code).toContain(target === 'swift' ? 'yFrom: 30.0, yTo: 60.0' : 'yFrom = 30.0, yTo = 60.0')
      expect(r.code).toContain(target === 'swift' ? 'xFrom: 0.5, xTo: 1.5' : 'xFrom = 0.5, xTo = 1.5')
      expect(r.code).toContain(target === 'swift' ? 'yDomain: Domain(min: 0.0, max: 100.0)' : 'yDomain = Domain(min = 0.0, max = 100.0)')
    })

    it(`${target}: pictorial bars lower through the native symbol renderer`, () => {
      const r = transform(PICTORIAL, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toContain(target === 'swift' ? 'symbol: "diamond", symbolRepeat: true' : 'symbol = "diamond", symbolRepeat = true')
      expect(r.code).toContain('renderChart(')
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
      for (const value of ['2026-01-01', '2026-12-31', '2025-12-20', '2026-01-10', '2024-02-01', '2024-02-29', '2027-03-04', '#eeeeee', '#ffffff', '#008800']) expect(r.code).toContain(`"${value}"`)
      expect(r.code).toContain(target === 'swift' ? 'firstDay: 1.0' : 'firstDay = 1.0')
      expect(r.code).toContain(target === 'swift' ? 'showMonthLabels: false' : 'showMonthLabels = false')
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

    it(`${target}: river options group, sort, and aggregate literal rows`, () => {
      const r = transform(RIVER, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      expect(r.code).toContain('renderRiver')
      for (const value of ['2026-01-01', '2026-01-02', 'Alpha', 'Beta']) expect(r.code).toContain(`"${value}"`)
      expect(r.code).toContain(target === 'swift' ? 'values: [2.0, 4.0]' : 'values = listOf(2.0, 4.0)')
      expect(r.code).toContain(target === 'swift' ? 'showLabels: false' : 'showLabels = false')
    })

    it(`${target}: polar options preserve axes, multiple series, domain, direction, radius, and colours`, () => {
      const r = transform(POLAR, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      expect(r.code).toContain('renderPolar')
      for (const value of ['North', 'East', 'South', 'Actual', 'Trend', '#123456', '#abcdef', 'total']) expect(r.code).toContain(`"${value}"`)
      expect(r.code).toContain(target === 'swift' ? 'clockwise: false' : 'clockwise = false')
      expect(r.code).toContain(target === 'swift' ? 'innerRatio: 0.25' : 'innerRatio = 0.25')
    })

    it(`${target}: boxplot options preserve categories, five-number summaries, fill, and stroke`, () => {
      const r = transform(BOXPLOT, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      expect(r.code).toContain('renderBoxplotChart')
      for (const value of ['A', 'B', '#ddeeff', '#112233']) expect(r.code).toContain(`"${value}"`)
      expect(r.code).toContain('FiveNumber(')
    })

    it(`${target}: single-axis options preserve domain, point sizes, labels, and colour`, () => {
      const r = transform(SINGLE_AXIS, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('OptionChart(')
      expect(r.code).toContain('renderSingleAxis')
      for (const value of ['Score', '#336699']) expect(r.code).toContain(`"${value}"`)
      expect(r.code).toContain(target === 'swift' ? 'radius: 8.0' : 'radius = 8.0')
    })
  }

  it('names unsupported dynamic and cartesian option shapes', () => {
    const dynamic = transform(`import { OptionChart } from '@pyreon/charts/option'; export function App(p: { option: object }) { return <OptionChart option={p.option} /> }`, { target: 'swift' })
    expect(dynamic.warnings.join('\n')).toContain('<OptionChart option>')
    const line = transform(`import { OptionChart } from '@pyreon/charts/option'; export function App() { return <OptionChart option={{ series: [{ type: 'line', data: [1, 2] }] }} /> }`, { target: 'kotlin' })
    expect(line.warnings.join('\n')).toContain('option.xAxis.data')
  })

  it('does not misroute OptionChart rich callbacks into index-only family handlers', () => {
    const r = transform(PIE.replace(' />', ' onSelect={() => {}} onFamilySelect={() => {}} />'), { target: 'swift' })
    expect(r.warnings.join('\n')).toContain('<OptionChart onSelect>')
    expect(r.warnings.join('\n')).toContain('<OptionChart onFamilySelect>')
  })

  it('names invalid or missing static timeline steps and safely renders the base', () => {
    const missing = transform(TIMELINE_PIE.replace('timelineIndex={1}', 'timelineIndex={9}'), { target: 'swift' })
    expect(missing.warnings.join('\n')).toContain('step 9 does not exist')
    expect(missing.code).toContain('renderPie(')
    expect(missing.code).toContain('"Base"')

    const dynamic = transform(TIMELINE_PIE.replace('timelineIndex={1}', 'timelineIndex={Date.now()}'), { target: 'kotlin' })
    expect(dynamic.warnings.join('\n')).toContain('native needs a static numeric index')
    expect(dynamic.code).toContain('"First"')
  })

  it.skipIf(!isSwiftcAvailable())('swiftc accepts the family and cartesian emits', () => {
    for (const src of [PIE, GAUGE, TIMELINE_PIE, CARTESIAN, PICTORIAL, STATIC_FAMILIES]) {
      const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  }, 90_000)

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the family and cartesian emits', () => {
    for (const src of [PIE, GAUGE, TIMELINE_PIE, CARTESIAN, PICTORIAL, STATIC_FAMILIES]) {
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

  it.skipIf(!isSwiftcAvailable())('swiftc accepts river option emits', () => {
    const r = validateSwiftWithStubs(transform(RIVER, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 30_000)

  it.skipIf(!isKotlincAvailable())('kotlinc accepts river option emits', () => {
    const r = validateKotlin(transform(RIVER, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 90_000)

  it.skipIf(!isSwiftcAvailable())('swiftc accepts polar option emits', () => {
    const r = validateSwiftWithStubs(transform(POLAR, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 30_000)

  it.skipIf(!isKotlincAvailable())('kotlinc accepts polar option emits', () => {
    const r = validateKotlin(transform(POLAR, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 90_000)

  it.skipIf(!isSwiftcAvailable())('swiftc accepts boxplot option emits', () => {
    const r = validateSwiftWithStubs(transform(BOXPLOT, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 30_000)

  it.skipIf(!isKotlincAvailable())('kotlinc accepts boxplot option emits', () => {
    const r = validateKotlin(transform(BOXPLOT, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 90_000)

  it.skipIf(!isSwiftcAvailable())('swiftc accepts single-axis option emits', () => {
    const r = validateSwiftWithStubs(transform(SINGLE_AXIS, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 30_000)

  it.skipIf(!isKotlincAvailable())('kotlinc accepts single-axis option emits', () => {
    const r = validateKotlin(transform(SINGLE_AXIS, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 90_000)
})
