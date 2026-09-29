// Branch matrix for `chart-hosts.ts`'s `<OptionChart>` adapter
// (`desugarOptionChartHost` and its wrappers) and `chart-webview-lowering.ts`.
//
// The option adapter lowers an ECharts option literal to a native host, and
// its whole contract is: a shape that cannot cross is REFUSED by name —
// never an empty/half-drawn chart. So the refusal table below pairs each
// shape the adapter must refuse with the warning that names it, and the
// lowering specs pair a shape that takes an optional arm (a label hidden, a
// radius ratio, a vertical layout, …) with the emitted Swift/Kotlin text.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { configureChartWebViewHost, legacyChartHostProp } from '../chart-webview-lowering'
import { DEFAULT_CHART_WEBVIEW_HOST_HTML } from '../generated-chart-webview-host'
import { transform } from '../index'
import type { ExprIR } from '../types'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const REPO = resolve(import.meta.dirname, '../../../../..')
const readRepo = (p: string): string => readFileSync(join(REPO, p), 'utf8')

const optionSrc = (option: string, props = '') => `import { OptionChart } from '@pyreon/charts/option'
export function App() { return <OptionChart ${props} option={${option}} /> }`

const swift = (option: string, props = '') => transform(optionSrc(option, props), { target: 'swift' })
const kotlin = (option: string, props = '') => transform(optionSrc(option, props), { target: 'kotlin' })

/** The canvas every lowered option host draws into. */
const CANVAS = 'PyreonChartCanvas'

function expectRefused(option: string, message: string, props = ''): void {
  const r = swift(option, props)
  expect(r.warnings.join('\n'), option).toContain(message)
  expect(r.code, option).not.toContain(CANVAS)
}

// ─── Refusals: every "emitting nothing" arm, by family ───────────────

describe('chart-hosts desugarOptionChartHost — refusals name the shape', () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    // option itself
    ['option with a spread', `{ ...BASE, series: [] }`, 'native needs an inline option object'],
    // gauge
    ['gauge non-numeric datum', `{ series: [{ type: 'gauge', data: [{ value: 'x' }] }] }`, 'a native gauge needs a literal numeric value'],
    ['gauge no data', `{ series: [{ type: 'gauge' }] }`, 'a native gauge needs a literal numeric value'],
    // pie
    ['pie non-array data', `{ series: [{ type: 'pie', data: 3 }] }`, 'a native pie needs a literal data array'],
    ['pie non-numeric datum', `{ series: [{ type: 'pie', data: [{ value: 'x', name: 'A' }] }] }`, 'a pie datum needs a literal numeric value'],
    // radar
    ['radar no indicators', `{ series: [{ type: 'radar', data: [] }] }`, 'a native radar needs literal indicators and series data'],
    ['radar axis without max', `{ radar: { indicator: [{ name: 'A' }] }, series: [{ type: 'radar', data: [] }] }`, 'option.radar.indicator[0]>: a native radar axis needs literal name and max values'],
    ['radar axis not an object', `{ radar: { indicator: [5] }, series: [{ type: 'radar', data: [] }] }`, 'a native radar axis needs literal name and max values'],
    ['radar row wrong length', `{ radar: { indicator: [{ name: 'A', max: 5 }, { name: 'B', max: 5 }] }, series: [{ type: 'radar', data: [{ value: [1] }] }] }`, 'data[0].value>: a native radar row needs one literal number per indicator'],
    ['radar row not an object', `{ radar: { indicator: [{ name: 'A', max: 5 }] }, series: [{ type: 'radar', data: [[1]] }] }`, 'a native radar row needs one literal number per indicator'],
    ['radar row non-numeric', `{ radar: { indicator: [{ name: 'A', max: 5 }] }, series: [{ type: 'radar', data: [{ value: ['x'] }] }] }`, 'a native radar row needs one literal number per indicator'],
    // boxplot
    ['boxplot no xAxis', `{ series: [{ type: 'boxplot', data: [[1, 2, 3, 4, 5]] }] }`, 'native boxplots need literal five-number rows matching xAxis.data'],
    ['boxplot count mismatch', `{ xAxis: { data: ['a', 'b'] }, series: [{ type: 'boxplot', data: [[1, 2, 3, 4, 5]] }] }`, 'native boxplots need literal five-number rows'],
    ['boxplot short row', `{ xAxis: { data: ['a'] }, series: [{ type: 'boxplot', data: [[1, 2, 3]] }] }`, 'data[0]>: a native boxplot needs [min, q1, median, q3, max]'],
    ['boxplot non-array row', `{ xAxis: { data: ['a'] }, series: [{ type: 'boxplot', data: [7] }] }`, 'a native boxplot needs [min, q1, median, q3, max]'],
    ['boxplot non-numeric row', `{ xAxis: { data: ['a'] }, series: [{ type: 'boxplot', data: [[1, 2, 'x', 4, 5]] }] }`, 'a native boxplot needs [min, q1, median, q3, max]'],
    // candlestick
    ['candle no xAxis', `{ series: [{ type: 'candlestick', data: [[1, 2, 0, 3]] }] }`, 'native candlesticks need literal OHLC rows matching xAxis.data'],
    ['candle short row', `{ xAxis: { data: ['a'] }, series: [{ type: 'candlestick', data: [[1, 2]] }] }`, 'data[0]>: a native candle needs [open, close, low, high]'],
    ['candle non-numeric row', `{ xAxis: { data: ['a'] }, series: [{ type: 'candlestick', data: [[1, 'x', 0, 3]] }] }`, 'a native candle needs [open, close, low, high]'],
    // parallel
    ['parallel no axes', `{ series: [{ type: 'parallel', data: [] }] }`, 'native parallel coordinates need literal axes and data rows'],
    ['parallel axis not object', `{ parallelAxis: [3], series: [{ type: 'parallel', data: [] }] }`, 'parallelAxis[0]>: a native parallel axis must be a literal object'],
    ['parallel negative dim', `{ parallelAxis: [{ dim: -1 }], series: [{ type: 'parallel', data: [] }] }`, 'parallelAxis[0].dim>: a native parallel dimension must be a non-negative integer'],
    ['parallel fractional dim', `{ parallelAxis: [{ dim: 0.5 }], series: [{ type: 'parallel', data: [] }] }`, 'a native parallel dimension must be a non-negative integer'],
    ['parallel non-string categories', `{ parallelAxis: [{ type: 'category', data: [1, 2] }], series: [{ type: 'parallel', data: [] }] }`, 'parallelAxis[0].data>: a native category axis needs literal string categories'],
    ['parallel category without data', `{ parallelAxis: [{ type: 'category' }], series: [{ type: 'parallel', data: [] }] }`, 'a native category axis needs literal string categories'],
    ['parallel gap in dims', `{ parallelAxis: [{ dim: 0 }, { dim: 2 }], series: [{ type: 'parallel', data: [] }] }`, 'native parallel dimensions must be contiguous'],
    ['parallel short row', `{ parallelAxis: [{ dim: 0 }, { dim: 1 }], series: [{ type: 'parallel', data: [[1]] }] }`, 'data[0]>: a native parallel datum needs one literal value per axis'],
    ['parallel non-array row', `{ parallelAxis: [{ dim: 0 }], series: [{ type: 'parallel', data: [5] }] }`, 'a native parallel datum needs one literal value per axis'],
    // themeRiver
    ['river non-array data', `{ series: [{ type: 'themeRiver', data: 1 }] }`, 'a native river chart needs literal [category, value, series] rows'],
    ['river bad tuple', `{ series: [{ type: 'themeRiver', data: [['2026-01-01', 'x', 'A']] }] }`, 'data[0]>: a native river datum needs a literal [category, number, series] tuple'],
    ['river non-array row', `{ series: [{ type: 'themeRiver', data: [{ a: 1 }] }] }`, 'a native river datum needs a literal [category, number, series] tuple'],
    ['river missing series name', `{ series: [{ type: 'themeRiver', data: [['d', 1]] }] }`, 'a native river datum needs a literal [category, number, series] tuple'],
    // singleAxis
    ['single-axis non-scatter', `{ singleAxis: {}, series: [{ type: 'line', coordinateSystem: 'singleAxis', data: [1] }] }`, 'native single-axis charts support scatter series; line cannot lower'],
    ['single-axis no axis', `{ series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [1] }] }`, 'native single-axis charts need a literal axis and data'],
    ['single-axis no data', `{ singleAxis: {}, series: [{ type: 'scatter', coordinateSystem: 'singleAxis' }] }`, 'native single-axis charts need a literal axis and data'],
    ['single-axis bad categories', `{ singleAxis: { type: 'category', data: [1] }, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [1] }] }`, 'option.singleAxis.data>: a native category axis needs literal string categories'],
    ['single-axis category no data', `{ singleAxis: { type: 'category' }, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [1] }] }`, 'a native category axis needs literal string categories'],
    ['single-axis bad datum', `{ singleAxis: {}, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: ['x'] }] }`, 'data[0]>: a native single-axis datum needs a literal value or [position, size]'],
    ['single-axis bad pair', `{ singleAxis: {}, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [['x', 2]] }] }`, 'a native single-axis datum needs a literal value or [position, size]'],
    // polar
    ['polar no axes', `{ series: [{ type: 'bar', coordinateSystem: 'polar', data: [1] }] }`, 'native polar charts need literal angleAxis and radiusAxis objects'],
    ['polar only angle axis', `{ angleAxis: {}, series: [{ type: 'bar', coordinateSystem: 'polar', data: [1] }] }`, 'native polar charts need literal angleAxis and radiusAxis objects'],
    ['polar non-string categories', `{ angleAxis: { data: [1, 2] }, radiusAxis: {}, series: [{ type: 'bar', coordinateSystem: 'polar', data: [1] }] }`, 'native polar charts need literal string categories'],
    ['polar pie series', `{ angleAxis: { data: ['a'] }, radiusAxis: {}, series: [{ type: 'bar', coordinateSystem: 'polar', data: [1] }, { type: 'pie', coordinateSystem: 'polar', data: [1] }] }`, 'option.series[1]>: native polar charts support literal polar bar, line and scatter series'],
    ['polar series off-coordinate', `{ angleAxis: { data: ['a'] }, radiusAxis: {}, series: [{ type: 'bar', coordinateSystem: 'polar', data: [1] }, { type: 'line', data: [1] }] }`, 'native polar charts support literal polar bar, line and scatter series'],
    ['polar series no data', `{ angleAxis: { data: ['a'] }, radiusAxis: {}, series: [{ type: 'bar', coordinateSystem: 'polar' }] }`, 'series[0].data>: a native polar series needs literal numeric data'],
    ['polar bad datum', `{ angleAxis: { data: ['a'] }, radiusAxis: {}, series: [{ type: 'bar', coordinateSystem: 'polar', data: ['x'] }] }`, 'series[0].data[0]>: a native polar datum needs a literal number'],
    // calendar heatmap
    ['calendar no range', `{ calendar: {}, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [] }] }`, 'a native calendar needs a literal year, month, date, or [start, end] ISO-date range'],
    ['calendar no calendar', `{ series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [] }] }`, 'a native calendar needs a literal year, month'],
    ['calendar month 13', `{ calendar: { range: '2026-13' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [] }] }`, 'a native calendar needs a literal year, month'],
    ['calendar garbage range', `{ calendar: { range: 'soon' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [] }] }`, 'a native calendar needs a literal year, month'],
    ['calendar no data', `{ calendar: { range: 2026 }, series: [{ type: 'heatmap', coordinateSystem: 'calendar' }] }`, 'a native calendar needs literal [date, value] rows'],
    ['calendar bad cell', `{ calendar: { range: 2026 }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2026/01/01', 3]] }] }`, 'data[0]>: a native calendar cell needs a literal [ISO-date, number]'],
    ['calendar non-array cell', `{ calendar: { range: 2026 }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [5] }] }`, 'a native calendar cell needs a literal [ISO-date, number]'],
    // heatmap
    ['heatmap no y data', `{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'heatmap', data: [[0, 0, 1]] }] }`, 'a native heatmap needs literal data and category axes'],
    ['heatmap no axes', `{ series: [{ type: 'heatmap', data: [[0, 0, 1]] }] }`, 'a native heatmap needs literal data and category axes'],
    ['heatmap out-of-range', `{ xAxis: { data: ['a'] }, yAxis: { data: ['b'] }, series: [{ type: 'heatmap', data: [[3, 0, 1]] }] }`, 'data[0]>: a native heatmap cell needs valid [xIndex, yIndex, value]'],
    ['heatmap non-array cell', `{ xAxis: { data: ['a'] }, yAxis: { data: ['b'] }, series: [{ type: 'heatmap', data: [7] }] }`, 'a native heatmap cell needs valid [xIndex, yIndex, value]'],
    // funnel
    ['funnel non-array', `{ series: [{ type: 'funnel', data: 3 }] }`, 'a native funnel needs a literal data array'],
    ['funnel bad datum', `{ series: [{ type: 'funnel', data: [5] }] }`, 'data[0]>: a funnel datum needs a literal value'],
    // sankey / graph
    ['sankey no links', `{ series: [{ type: 'sankey', data: [{ name: 'a' }] }] }`, 'native sankey needs literal node and link arrays'],
    ['graph no nodes', `{ series: [{ type: 'graph', links: [] }] }`, 'native graph needs literal node and link arrays'],
    ['sankey nameless node', `{ series: [{ type: 'sankey', data: [{ value: 1 }], links: [] }] }`, 'data[0]>: a native sankey node needs a literal string name'],
    ['graph non-object node', `{ series: [{ type: 'graph', nodes: ['a'], edges: [] }] }`, 'a native graph node needs a literal string name'],
    ['sankey bad link', `{ series: [{ type: 'sankey', data: [{ name: 'a' }], links: [{ source: 'a' }] }] }`, 'links[0]>: a native sankey link needs literal string endpoints'],
    ['graph non-object link', `{ series: [{ type: 'graph', data: [{ name: 'a' }], links: [1] }] }`, 'a native graph link needs literal string endpoints'],
    ['sankey valueless link', `{ series: [{ type: 'sankey', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b' }] }] }`, 'links[0].value>: a native sankey link needs a literal value'],
    // lines
    ['lines mixed series', `{ series: [{ type: 'lines', data: [] }, { type: 'bar', data: [1] }] }`, 'native lines charts need every series to be a lines series'],
    ['lines non-literal option', `{ series: [{ type: 'lines', data: DATA }] }`, 'native lines series need a literal option'],
    // cartesian
    ['cartesian mixed family', `{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }, { type: 'pie', data: [1] }] }`, 'series[1].type>: this cartesian adapter needs line, bar, pictorialBar, or scatter series'],
    ['cartesian non-object series', `{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }, 5] }`, 'this cartesian adapter needs line, bar, pictorialBar, or scatter series'],
    ['cartesian single series object', `{ xAxis: { data: ['a'] }, yAxis: {}, series: { type: 'bar', data: [1] } }`, 'native cartesian options need a non-empty literal series array'],
    ['cartesian count mismatch', `{ xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }`, 'series[0].data>: native cartesian series need one literal numeric value per xAxis category'],
    ['cartesian non-numeric', `{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: ['x'] }] }`, 'native cartesian series need one literal numeric value per xAxis category'],
    // unknown family
    ['unknown type', `{ series: [{ type: 'wordCloud', data: [] }] }`, 'native option adapter does not lower `wordCloud` yet'],
    ['series without type', `{ series: [{ data: [1] }] }`, 'native needs a literal series with a string `type`'],
    ['series missing', `{ title: { text: 'x' } }`, 'native needs a literal series with a string `type`'],
  ]
  for (const [name, option, message] of cases) {
    it(`refuses: ${name}`, () => {
      expectRefused(option, message)
    })
  }

  it('refuses a value-x series on the second axis whose point count differs from the first', () => {
    expectRefused(
      `{ xAxis: [{ type: 'value' }, { type: 'value' }], yAxis: {}, series: [{ type: 'line', data: [[0, 1], [1, 2]] }, { type: 'line', xAxisIndex: 1, data: [[0, 1]] }] }`,
      'a native series on the second value x axis needs as many points as the first series',
    )
  })

  it('refuses value-x series on one axis that disagree on their x positions', () => {
    expectRefused(
      `{ xAxis: { type: 'value' }, yAxis: {}, series: [{ type: 'line', data: [[0, 1], [1, 2]] }, { type: 'line', data: [[0, 1], [2, 2]] }] }`,
      'native series on one value x axis must share their x positions',
    )
    expectRefused(
      `{ xAxis: { type: 'value' }, yAxis: {}, series: [{ type: 'line', data: [[0, 1], [1, 2]] }, { type: 'line', data: [[0, 1]] }] }`,
      'native series on one value x axis must share their x positions',
    )
  })
})

// ─── Chrome shared by every family ────────────────────────────────────

describe('chart-hosts desugarOptionChartHost — chrome and callbacks', () => {
  const GAUGE = `{ series: [{ type: 'gauge', data: [42] }] }`

  it('names every rich callback by its PUBLIC prop, and still lowers the chart', () => {
    const r = swift(GAUGE, 'onSelect={() => {}} onFamilySelect={() => {}} onTimelineChange={() => {}} onClick={() => {}}')
    const w = r.warnings.join('\n')
    for (const prop of ['onSelect', 'onFamilySelect', 'onTimelineChange', 'onclick']) expect(w).toContain(`<OptionChart ${prop}>: this rich callback shape does not cross yet`)
    expect(r.code).toContain(CANVAS)
  })

  it('names a theme and a locale prop, and honours legend/tooltip `show: false`', () => {
    const r = swift(`{ legend: { show: false }, tooltip: { show: false }, series: [{ type: 'gauge', data: [42] }] }`, 'theme="dark" locale="fr"')
    expect(r.warnings.join('\n')).toContain('<OptionChart theme>: registered ECharts themes do not cross yet')
    expect(r.warnings.join('\n')).toContain('<OptionChart locale>: locale formatting for family options is not used')
    expect(r.code).toContain(CANVAS)
  })

  it('an EMPTY literal graphic list draws nothing extra; a non-literal one is named', () => {
    const empty = swift(`{ graphic: [], series: [{ type: 'gauge', data: [42] }] }`)
    expect(empty.warnings).toEqual([])
    expect(empty.code).not.toContain('graphicElements')
    const nonLit = swift(`{ graphic: G, series: [{ type: 'gauge', data: [42] }] }`)
    expect(nonLit.warnings.join('\n')).toContain('<OptionChart option.graphic>: native needs literal graphic elements')
  })

  it('a category y axis over a value x axis with a NON-bar series keeps the category on x, by name', () => {
    const r = swift(`{ xAxis: { type: 'value' }, yAxis: { type: 'category', data: ['a'] }, series: [{ type: 'line', data: [1] }] }`)
    expect(r.warnings.join('\n')).toContain('a category y axis lays out bar series only; this chart keeps the category on x')
  })

  it('a single (non-array) bar series under a horizontal frame is still judged bars-only', () => {
    // The swap happens (a lone object series is inspected as a one-element list), then the
    // cartesian adapter refuses the non-array series by name — never a silent upright chart.
    const r = swift(`{ xAxis: { type: 'log' }, yAxis: { type: 'category', data: ['a'] }, series: { type: 'bar', data: [1] } }`)
    expect(r.warnings.join('\n')).not.toContain('a category y axis lays out bar series only')
    expect(r.warnings.join('\n')).toContain('native cartesian options need a non-empty literal series array')
  })

  it('a visualMap inside a non-literal option is named; a literal one draws the strip', () => {
    const nonLit = swift(`{ visualMap: { min: M }, xAxis: { data: ['a'] }, yAxis: { data: ['b'] }, series: [{ type: 'heatmap', data: [[0, 0, 5]] }] }`)
    expect(nonLit.warnings.join('\n')).toContain('<OptionChart option.visualMap>: a native visualMap needs a fully literal option')
    const lit = swift(`{ visualMap: { min: 0, max: 10, calculable: true }, xAxis: { data: ['a'] }, yAxis: { data: ['b'] }, series: [{ type: 'heatmap', data: [[0, 0, 5]] }] }`)
    expect(lit.warnings).toEqual([])
    expect(lit.code).toContain('renderVisualStrip')
  })
})

// ─── Family lowerings: the optional arms each family takes ───────────

describe('chart-hosts desugarOptionChartHost — gauge and pie', () => {
  it('an uncompiled gauge (function formatter) keeps min/max and hides its value', () => {
    const r = swift(`{ series: [{ type: 'gauge', min: 10, max: 90, detail: { show: false, formatter: (v) => v }, data: [42] }] }`)
    expect(r.code).toContain('renderGauge(Double(42.0)')
    expect(r.code).toContain('GaugeOptions(min: 10.0, max: 90.0')
    // detail.show: false → no value text command.
    expect(r.code).not.toContain('text: plain(Double(42.0))')
  })

  it('a gauge datum object lowers through the compiled dial; a non-numeric min is ignored', () => {
    const r = swift(`{ series: [{ type: 'gauge', min: 'x', detail: {}, data: [{ value: 42 }] }] }`)
    expect(r.code).toContain('DialDatum(value: 42.0')
    expect(r.code).toContain('min: 0.0, max: 100.0')
  })

  it('an uncompiled pie: bare numbers, generated labels, the % ratio and hidden labels', () => {
    const r = swift(`{ series: [{ type: 'pie', radius: ['50%', '100%'], label: { show: false, formatter: (p) => p }, data: [3, { value: 4 }] }] }`)
    expect(r.code).toContain('PolarTick(value: 3.0, label: "Slice 1")')
    expect(r.code).toContain('PolarTick(value: 4.0, label: "Slice 2")')
    expect(r.code).toContain('innerRadius: 0.5, showLabels: false')
  })

  it('a pie radius that is not a percent pair leaves the pie solid', () => {
    const r = swift(`{ series: [{ type: 'pie', radius: ['10', '0%'], data: [3] }] }`)
    expect(r.code).toContain('innerRadius: 0.0')
  })

  it('a compiled pie carries a datum itemStyle.color, and a tooltip formatter drops the default header', () => {
    const r = swift(`{ tooltip: { formatter: '{b}' }, series: [{ type: 'pie', name: 'S', data: [{ value: 3, name: 'A', itemStyle: { color: '#f00' } }, { value: 4, name: 'B' }] }] }`)
    expect(r.code).toContain('"#f00"')
    expect(r.code).toContain('texts: ["A", "B"]')
  })
})

describe('chart-hosts desugarOptionChartHost — radar, boxplot, candlestick, heatmap', () => {
  it('radar: a nameless row is "Series N", areaStyle.opacity is the fill alpha', () => {
    const r = swift(`{ radar: { indicator: [{ name: 'A', max: 5 }] }, series: [{ type: 'radar', areaStyle: { opacity: 0.3 }, data: [{ value: [1] }] }] }`)
    expect(r.code).toContain('label: "Series 1"')
    expect(r.code).toContain('fillAlpha: 0.3')
    const named = swift(`{ radar: { indicator: [{ name: 'A', max: 5 }] }, series: [{ type: 'radar', areaStyle: {}, data: [{ name: 'X', value: [1] }] }] }`)
    expect(named.code).toContain('label: "X"')
    expect(named.code).not.toContain('fillAlpha: 0.3')
  })

  it('boxplot: numeric categories stringify, a non-scalar category falls back to its index, itemStyle is the box', () => {
    const r = swift(`{ xAxis: { data: [2024, 'b'] }, series: [{ type: 'boxplot', itemStyle: { color: '#abc', borderColor: '#123' }, data: [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]] }] }`)
    expect(r.code).toContain('x: "2024", min: 1, q1: 2, median: 3, q3: 4, max: 5')
    expect(r.code).toContain('BoxplotOptions(fill: "#abc", stroke: "#123")')
    const fallback = swift(`{ xAxis: { data: [true] }, series: [{ type: 'boxplot', itemStyle: {}, data: [[1, 2, 3, 4, 5]] }] }`)
    expect(fallback.code).toContain('x: "1", min: 1')
    expect(fallback.code).toContain('BoxplotOptions()')
  })

  it('candlestick and heatmap: numeric axis categories stringify', () => {
    expect(swift(`{ xAxis: { data: [7] }, series: [{ type: 'candlestick', data: [[1, 2, 0, 3]] }] }`).code).toContain('x: "7"')
    expect(swift(`{ xAxis: { data: [1, 2] }, yAxis: { data: [3] }, series: [{ type: 'heatmap', data: [[1, 0, 5]] }] }`).code).toContain('x: "2", y: "3", value: 5')
  })
})

describe('chart-hosts desugarOptionChartHost — parallel and river', () => {
  it('parallel: category axis, value domain, inverse, line style and a vertical layout', () => {
    const r = swift(`{ parallel: { layout: 'vertical' }, parallelAxis: [{ name: 'A', type: 'category', data: ['x', 'y'], inverse: true }, { dim: 1, min: 0, max: 10 }], series: [{ type: 'parallel', lineStyle: { width: 2, opacity: 0.5, color: '#f00' }, data: [['x', 3]] }] }`)
    expect(r.code).toContain('ParallelAxis(name: "A", type: "category", categories: ["x", "y"], domain: nil, inverse: true)')
    expect(r.code).toContain('ParallelAxis(name: "dim 1", type: nil, categories: nil, domain: Domain(min: 0.0, max: 10.0), inverse: nil)')
    expect(r.code).toContain('ParallelOptions(lineColor: "#f00", lineOpacity: 0.5, lineWidth: Double(2))')
    expect(r.code).toContain('pyreonTransposeCmds(renderParallel(')
  })

  it('parallel: an empty lineStyle and a horizontal layout add nothing', () => {
    const r = swift(`{ parallel: {}, parallelAxis: [{ dim: 0, max: 10 }], series: [{ type: 'parallel', lineStyle: {}, data: [[3]] }] }`)
    expect(r.code).toContain('ParallelAxis(name: "dim 0", type: nil, categories: nil, domain: nil, inverse: nil)')
    expect(r.code).not.toContain('pyreonTransposeCmds')
  })

  it('a dim GAP is refused (regression: a sparse axes list crashed the emitter)', () => {
    // `Array.prototype.some` skips holes, so `[a, , c].some(isUndefined)` was false and the
    // hole reached the emitter as `undefined.kind` — a TypeError out of transform().
    const r = swift(`{ parallelAxis: [{ dim: 0 }, { dim: 2 }], series: [{ type: 'parallel', data: [[1, 2, 3]] }] }`)
    expect(r.warnings.join('\n')).toContain('native parallel dimensions must be contiguous')
    expect(r.code).not.toContain(CANVAS)
  })

  it('river: rows sum per (series, category) with sorted categories; label.show false is carried', () => {
    const r = swift(`{ singleAxis: { type: 'time' }, series: [{ type: 'themeRiver', label: { show: false }, data: [['d1', 1, 'A'], ['d2', 2, 'A'], ['d1', 3, 'B'], ['d1', 1, 'A']] }] }`)
    expect(r.code).toContain('RiverSeries(name: "A", values: [2.0, 2.0])')
    expect(r.code).toContain('RiverSeries(name: "B", values: [3.0, 0.0])')
    expect(r.code).toContain('RiverOptions(categories: ["d1", "d2"], showLabels: false)')
    expect(swift(`{ series: [{ type: 'themeRiver', label: {}, data: [['d1', 1, 'A']] }] }`).code).toContain('RiverOptions(categories: ["d1"]')
  })
})

describe('chart-hosts desugarOptionChartHost — single axis', () => {
  it('a category axis with object and pair data, label, symbolSize and colour', () => {
    const r = swift(`{ singleAxis: { type: 'category', data: ['a', 'b'], name: 'Ax' }, series: [{ type: 'effectScatter', coordinateSystem: 'singleAxis', label: { show: true }, symbolSize: 10, itemStyle: { color: '#0f0' }, data: [[1, 4], { value: [2, 5], name: 'P', itemStyle: { color: '#f00' } }, { value: 3 }] }] }`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('SingleAxisSpec(type: "category", categories: ["a", "b"], domain: nil, name: "Ax")')
    expect(r.code).toContain('SingleAxisPoint(x: 2.0, size: 5.0, name: "P", color: "#f00")')
    expect(r.code).toContain('SingleAxisOptions(radius: 5.0, color: "#0f0", showLabels: true)')
  })

  it('a `{ value: 3 }` datum lowers (regression: its scalar value was read off the OBJECT and refused)', () => {
    const r = swift(`{ singleAxis: {}, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [{ value: 3 }] }] }`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('SingleAxisPoint(x: 3.0')
  })

  it('bare-number points are typed SingleAxisPoint on both targets (regression: they synthesized an anonymous struct)', () => {
    // A `{ x }`-only literal matched no engine struct and became `__Obj0(x:)`, which the
    // engine's `layoutSingleAxis(_, [SingleAxisPoint], …)` cannot accept on either target.
    const src = `{ singleAxis: { min: 0, max: 10 }, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', label: {}, itemStyle: {}, data: [1, 2] }] }`
    const s = swift(src)
    expect(s.code).toContain('[SingleAxisPoint(x: 1.0, size: nil, name: nil, color: nil), SingleAxisPoint(x: 2.0, size: nil, name: nil, color: nil)]')
    expect(s.code).not.toContain('__Obj0')
    expect(s.code).toContain('domain: Domain(min: 0.0, max: 10.0)')
    const k = kotlin(src)
    expect(k.code).toContain('SingleAxisPoint(x = 1.0, size = null, name = null, color = null)')
  })

  // The two specs above assert TEXT. A typed row the engine does not declare
  // (or declares with other labels) reads identically, so both emits are
  // compiled against the REAL engine sources, not stubs.
  const SINGLE_AXIS_ROWS = `{ singleAxis: { min: 0, max: 10 }, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [1, { value: 3 }, [2, 5]] }] }`
  it.skipIf(!isSwiftUIAvailable())('the SingleAxisPoint rows compile against real SwiftUI + the real chart canvas + engine', () => {
    const r = validateSwiftTypecheck(
      readRepo('packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift') +
        '\n' +
        readRepo('packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift') +
        '\n' +
        swift(SINGLE_AXIS_ROWS).code,
    )
    expect(r.ok, r.error ?? '').toBe(true)
  }, 300_000)
  it.skipIf(!isKotlincAvailable())('the SingleAxisPoint rows compile against the real Kotlin chart engine', () => {
    const r = validateKotlin(kotlin(SINGLE_AXIS_ROWS).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 300_000)

  it('a half-pinned value domain is not a domain', () => {
    const r = swift(`{ singleAxis: { min: 0 }, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [1] }] }`)
    expect(r.code).toContain('SingleAxisSpec(type: "value", categories: nil, domain: nil, name: nil)')
  })
})

describe('chart-hosts desugarOptionChartHost — polar', () => {
  it('categories on the radius, a pinned value max, startAngle, clockwise false, inner ratio, stack and radius', () => {
    const r = swift(`{ polar: { radius: ['20%', '80%'] }, radiusAxis: { type: 'category', data: ['a', 'b'] }, angleAxis: { max: 10, startAngle: 90, clockwise: false }, series: [{ type: 'bar', coordinateSystem: 'polar', stack: 's', symbolSize: 8, itemStyle: { color: '#f00' }, data: [[1], { value: 2 }] }, { type: 'effectScatter', name: 'E', coordinateSystem: 'polar', symbolSize: 8, lineStyle: { color: '#0f0' }, data: [1, 2] }] }`)
    expect(r.code).toContain('PolarAxes(categories: ["a", "b"], categoryOn: "radius", valueDomain: Domain(min: 0.0, max: 10.0), startAngle: -1.5707963267948966, clockwise: false)')
    expect(r.code).toContain('PolarSeries(name: "Series 1", kind: "bar", values: [1.0, 2.0], color: "#f00", stack: "s")')
    expect(r.code).toContain('PolarSeries(name: "E", kind: "scatter", values: [1.0, 2.0], color: "#0f0", radius: 4.0)')
    expect(r.code).toContain('PolarOptions(innerRatio: 0.25)')
  })

  it('categories on the angle, a single series object, and polar radii that do not form a ratio', () => {
    for (const polar of [`{ radius: 5 }`, `{ radius: ['20%', '0%'] }`]) {
      const r = swift(`{ polar: ${polar}, angleAxis: { data: ['a'], clockwise: true }, radiusAxis: { min: 1 }, series: { type: 'line', coordinateSystem: 'polar', lineStyle: {}, data: [3] } }`)
      expect(r.code, polar).toContain('PolarAxes(categories: ["a"], categoryOn: "angle")')
      expect(r.code, polar).toContain('PolarSeries(name: "Series 1", kind: "line", values: [3.0])')
      expect(r.code, polar).not.toContain('innerRatio')
    }
  })
})

describe('chart-hosts desugarOptionChartHost — calendar heatmap ranges and styling', () => {
  const cal = (calendar: string, extra = '') => swift(`{ calendar: ${calendar}, ${extra} series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [] }] }`)

  it('a month range ends on its real last day — leap years by the Gregorian rule', () => {
    expect(cal(`{ range: '2024-02' }`).code).toContain('layoutCalendar("2024-02-01", "2024-02-29"')
    expect(cal(`{ range: '2023-02' }`).code).toContain('layoutCalendar("2023-02-01", "2023-02-28"')
    expect(cal(`{ range: '2100-02' }`).code).toContain('layoutCalendar("2100-02-01", "2100-02-28"')
    expect(cal(`{ range: '2000-02' }`).code).toContain('layoutCalendar("2000-02-01", "2000-02-29"')
  })

  it('a year string, a single date and a [start, end] pair each set the span', () => {
    expect(cal(`{ range: '2024' }`).code).toContain('layoutCalendar("2024-01-01", "2024-12-31"')
    expect(cal(`{ range: '2026-03-04' }`).code).toContain('layoutCalendar("2026-03-04", "2026-03-04"')
    expect(cal(`{ range: ['2026-01-01', '2026-02-01'] }`).code).toContain('layoutCalendar("2026-01-01", "2026-02-01"')
  })

  it('a vertical calendar with cell size, labels hidden, first day, empty colour, gap and a visualMap ramp', () => {
    const r = cal(`{ range: '2024', orient: 'vertical', cellSize: [12, 12], dayLabel: { show: false, firstDay: 1 }, monthLabel: { show: false }, itemStyle: { color: '#eee', borderWidth: 2 } }`, `visualMap: { min: 0, max: 10, inRange: { color: ['#fff', '#000'] } },`)
    expect(r.code).toContain('CalendarOptions(firstDay: 1.0, cellGap: 2.0, cellSize: 12.0, showMonthLabels: false, showDayLabels: false, stops: ["#fff", "#000"], emptyColor: "#eee", domain: Domain(min: 0.0, max: 10.0))')
    expect(r.code).toContain('pyreonTransposeCmds(renderCalendar(')
  })

  it('empty label/style objects, a scalar cell size and a one-colour ramp add only the cell size', () => {
    const r = cal(`{ range: '2024-02', cellSize: 14, dayLabel: {}, monthLabel: {}, itemStyle: {} }`, `visualMap: { inRange: { color: ['#fff'] } },`)
    expect(r.code).toContain('CalendarOptions(cellSize: 14.0')
    expect(r.code).not.toContain('showDayLabels: false')
  })
})

describe('chart-hosts desugarOptionChartHost — funnel, hierarchy, network, lines', () => {
  it('funnel: generated stage labels, sort/gap and the default tooltip header', () => {
    const r = swift(`{ tooltip: {}, series: [{ type: 'funnel', sort: 'ascending', gap: 2, data: [{ value: 3 }] }] }`)
    expect(r.code).toContain('label: "Stage 1"')
    expect(r.code).toContain('FunnelOptions(gap: Double(2), sort: "ascending")')
    expect(r.code).toContain('renderTooltipRows(')
  })

  it('funnel: a non-string sort / non-number gap are dropped, a formatter keeps the plain tooltip', () => {
    const r = swift(`{ tooltip: { formatter: '{b}' }, series: [{ type: 'funnel', name: 'F', sort: 5, gap: 'x', data: [{ value: 3, name: 'A' }] }] }`)
    expect(r.code).toContain('label: "A"')
    expect(r.code).not.toContain('sort: ')
    expect(r.code).not.toContain('renderTooltipRows(')
  })

  it('treemap hides labels, tree carries its symbol size, and a non-percent sunburst radius keeps the default hole', () => {
    expect(swift(`{ series: [{ type: 'treemap', label: { show: false }, data: [{ name: 'A', value: 3 }] }] }`).code).toContain('TreemapOptions(showLabels: false)')
    expect(swift(`{ series: [{ type: 'tree', symbolSize: 9, label: {}, data: [{ name: 'A', children: [{ name: 'B', value: 1 }] }] }] }`).code).toContain('TreeOptions(symbolSize: Double(9))')
    expect(swift(`{ series: [{ type: 'sunburst', radius: ['10', '90%'], data: [{ name: 'A', value: 3 }] }] }`).code).toContain('pyreonFrame.h) / 2.0 - 4.0) * 0.2')
  })

  it('sankey: nodes/edges aliases, node colours, width/gap/align and a vertical orient', () => {
    const r = swift(`{ series: [{ type: 'sankey', orient: 'vertical', nodeWidth: 5, nodeGap: 3, nodeAlign: 'left', nodes: [{ name: 'a', itemStyle: { color: '#f00' } }, { name: 'b', itemStyle: {} }], edges: [{ source: 'a', target: 'b', value: 2 }] }] }`)
    expect(r.code).toContain('SankeyNode(name: "a", color: "#f00"), SankeyNode(name: "b", color: nil)')
    expect(r.code).toContain('SankeyOptions(nodeWidth: Double(5), nodePadding: Double(3), align: "left")')
    expect(r.code).toContain('pyreonTransposeCmds(renderSankey(')
    const plain = swift(`{ series: [{ type: 'sankey', nodeAlign: 'right', data: [{ name: 'a' }], links: [] }] }`)
    expect(plain.code).not.toContain('align: "right"')
  })

  it('graph: node ids default to names, values/link values ride along, only known layouts cross', () => {
    const r = swift(`{ series: [{ type: 'graph', layout: 'circular', symbolSize: 12, data: [{ id: 'x', name: 'a', value: 2 }, { name: 'b' }], links: [{ source: 'x', target: 'b', value: 1 }, { source: 'x', target: 'b' }] }] }`)
    expect(r.code).toContain('GraphNode(id: "x", name: "a", value: 2.0')
    expect(r.code).toContain('GraphNode(id: "b", name: "b", value: nil')
    expect(r.code).toContain('GraphLink(source: "x", target: "b", value: 1.0), GraphLink(source: "x", target: "b", value: nil)')
    expect(r.code).toContain('GraphOptions(layout: "circular", symbolSize: Double(12))')
    expect(swift(`{ series: [{ type: 'graph', layout: 'grid', data: [{ name: 'a' }], links: [] }] }`).code).not.toContain('layout: "grid"')
  })

  it('lines: an effect trail runs on the chart clock; fractional x extents are Doubles', () => {
    const fx = swift(`{ xAxis: { type: 'value', min: 0, max: 10 }, yAxis: { type: 'value', min: 0, max: 10 }, series: [{ type: 'lines', coordinateSystem: 'cartesian2d', effect: { show: true, period: 3 }, data: [{ coords: [[1, 2], [3, 4]] }] }] }`)
    expect(fx.code).toContain('PyreonChartClock')
    expect(fx.code).toContain('effect: true, period: 3.0')
    const plain = swift(`{ series: [{ type: 'lines', data: [{ coords: [[1.5, 2], [3, 4]] }] }] }`)
    expect(plain.code).toContain('xv: 1.5')
    expect(plain.code).toContain('effect: false')
    expect(plain.code).not.toContain('PyreonChartClock')
  })
})

// ─── The cartesian (PlotChart) adapter ────────────────────────────────

describe('chart-hosts desugarOptionChartHost — cartesian axes', () => {
  const warned = (option: string) => swift(option).warnings.join('\n')

  it('a second VALUE x axis: its own title/domain, and series on it carry their own xs', () => {
    const r = swift(`{ xAxis: [{ type: 'value' }, { type: 'value', name: 'X2', min: 0, max: 5 }], yAxis: {}, series: [{ type: 'line', data: [[0, 1], [1, 2]] }, { type: 'line', xAxisIndex: 1, data: [[3, 1], [4, 2]] }] }`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('x2Title: "X2"')
    expect(r.code).toContain('x2Domain: Domain(min: 0.0, max: 5.0)')
    expect(r.code).toContain('onX2: true')
    expect(r.code).toContain('xs: [3.0, 4.0]')
  })

  it('a half-pinned second value axis has no domain; a time axis marks xTime', () => {
    const r = swift(`{ xAxis: [{ type: 'time' }, { type: 'value', min: 0 }], yAxis: {}, series: [{ type: 'line', data: [[0, 1.5], [1, 2]] }] }`)
    expect(r.code).not.toContain('x2Domain')
    expect(r.code).toContain('xTime: true')
  })

  it('a second CATEGORY x axis of matching count labels the same bands on the opposite edge', () => {
    const r = swift(`{ xAxis: [{ data: ['a', 'b'] }, { data: [1, 'c'], name: 'Top' }], yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] }`)
    expect(r.code).toContain('x2Labels: ["1", "c"]')
    expect(r.code).toContain('x2Title: "Top"')
  })

  it('a mismatched or third x axis is named, not silently mapped', () => {
    const msg = 'a second x axis maps as a value axis, or as a second set of category labels with the same count'
    expect(warned(`{ xAxis: [{ data: ['a'] }, { data: ['z', 'y'] }], yAxis: {}, series: [{ type: 'bar', data: [1] }] }`)).toContain(msg)
    expect(warned(`{ xAxis: [{ data: ['a'] }, { data: ['z'] }, { data: ['q'] }], yAxis: {}, series: [{ type: 'bar', data: [1] }] }`)).toContain(msg)
  })

  it('x axis offset/position/inverse/show/name and y axis log/inverse/show/name/splitLine/domain/offset', () => {
    const r = swift(`{ xAxis: { data: ['a'], offset: 4, position: 'top', inverse: true, show: false, name: 'X' }, yAxis: { type: 'log', inverse: true, show: false, name: 'Y', splitLine: { show: false }, min: 1, max: 100, offset: 3 }, series: [{ type: 'bar', data: [1] }] }`)
    for (const s of ['xOffset: 4.0', 'xTop: true', 'xInverse: true', 'showXAxis: false', 'xTitle: "X"', 'yScale: "log"', 'yInverse: true', 'showYAxis: false', 'yTitle: "Y"', 'showGrid: false', 'yOffset: 3.0', 'yDomain: Domain(min: 1.0, max: 100.0)']) {
      expect(r.code, s).toContain(s)
    }
  })

  it('a bad category list is refused, and a value axis needs [x, y] pairs', () => {
    expect(warned(`{ xAxis: { data: [true] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }`)).toContain('native cartesian options need a literal category array')
    expect(warned(`{ yAxis: {}, series: [{ type: 'bar', data: [1] }] }`)).toContain('native cartesian options need a literal category array')
    expect(warned(`{ xAxis: { type: 'value' }, yAxis: {}, series: [{ type: 'line', data: [1, 2] }] }`)).toContain('a native value x axis needs literal [x, y] pairs')
  })

  it('fractional value-x positions are Doubles; a null datum is the engine gap', () => {
    expect(swift(`{ xAxis: { type: 'value' }, yAxis: {}, series: [{ type: 'line', data: [[0.5, 1], [1.5, 2]] }] }`).code).toContain('xv: 0.5')
    const gap = swift(`{ xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'line', data: [1.5, null] }] }`)
    expect(gap.code).toContain('0.0 / 0.0')
    expect(gap.code).toContain('1.5')
  })
})

describe('chart-hosts desugarOptionChartHost — cartesian y axes', () => {
  it('yAxisIndex 1 → right axis, 2 → an extra axis, an undeclared index is named', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: [{ name: 'L' }, { name: 'R', min: 0, max: 9, offset: 2 }, { name: 'Third', position: 'left', min: 1, max: 2, offset: 30 }, { }, 5], series: [{ type: 'bar', yAxisIndex: 1, data: [1] }, { type: 'bar', yAxisIndex: 2, data: [1] }, { type: 'line', yAxisIndex: 9, data: [1] }] }`)
    expect(r.code).toContain('y2Title: "R"')
    expect(r.code).toContain('y2Domain: Domain(min: 0.0, max: 9.0)')
    expect(r.code).toContain('y2Offset: 2.0')
    expect(r.code).toContain('axisExtra: 0.0')
    expect(r.code).toContain('extraYAxes: [ExtraYAxis(side: "left"')
    expect(r.code).toContain('ExtraYAxis(side: "right"')
    expect(r.warnings.join('\n')).toContain('<OptionChart option.series[2].yAxisIndex>: yAxisIndex 9 names no declared y axis')
  })

  it('two axes whose first sits right swap sides, so an index-0 series is on the right', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: [{ position: 'right' }, { position: 'left' }], series: [{ type: 'bar', data: [1] }, { type: 'bar', yAxisIndex: 0, data: [1] }] }`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('axis: "right"')
  })

  it('two axes on one side are named; a lone right axis is placed right', () => {
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: [{ position: 'right' }, { position: 'right' }], series: [{ type: 'bar', data: [1] }] }`).warnings.join('\n')).toContain('<OptionChart option.yAxis[0].position>: both y axes cannot share a side')
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: { position: 'right' }, series: [{ type: 'bar', data: [1] }] }`).code).toContain('yRight: true')
  })
})

describe('chart-hosts desugarOptionChartHost — cartesian series styling', () => {
  it('a vertical linear gradient reads bottom-up (stops reversed), and its first stop is the colour', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', itemStyle: { color: { type: 'linear', x: 0, y: 1, x2: 0, y2: 0, colorStops: [{ offset: 0, color: '#f00' }, { offset: 1, color: '#00f' }, { offset: 'x' }] } }, data: [1] }] }`)
    expect(r.code).toContain('gradient: SeriesGradient(stops: [PyreonChartGradientStop(offset: 0.0, color: "#00f")')
    expect(r.code).toContain('color: "#00f"')
  })

  it('a horizontal gradient says so; a radial one is a shape; an empty stop list is no gradient', () => {
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', itemStyle: { color: { type: 'linear', x: 1, x2: 0, y2: 0, colorStops: [{ offset: 0, color: '#f00' }] } }, data: [1] }] }`).code).toContain('direction: "horizontal"')
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'line', areaStyle: { color: { type: 'radial', colorStops: [{ offset: 0, color: '#0f0' }] } }, lineStyle: { color: '#123' }, data: [1] }] }`).code).toContain('shape: "radial"')
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', itemStyle: { color: { type: 'linear', colorStops: [] } }, data: [1] }] }`).code).not.toContain('gradient: SeriesGradient')
  })

  it('an image pattern on a line STROKE is named', () => {
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'line', lineStyle: { color: { image: 'x.png' } }, data: [1] }] }`).warnings.join('\n')).toContain('A line stroke cannot be an image pattern')
  })

  it('aria.decal.show gives each series its decal pattern', () => {
    const r = swift(`{ aria: { decal: { show: true } }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }, { type: 'bar', data: [2] }] }`)
    expect(r.code).toContain('pattern: PyreonChartPattern(kind: "diagonal"')
  })

  it('stacked series pick the stacked factories', () => {
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', stack: 't', data: [1] }, { type: 'line', stack: 't', areaStyle: {}, data: [2] }] }`).code).toContain('stacked')
  })

  it('an uncompiled line with an areaStyle is an area mark', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'line', areaStyle: {}, label: { formatter: F }, data: [1] }] }`)
    expect(r.code).toContain('area')
    expect(r.warnings.join('\n')).toContain('a FUNCTION formatter cannot run at compile time')
  })

  it('scatter/line symbols: known shapes map, an unknown one is named, symbolSize is a diameter', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'scatter', symbol: 'diamond', symbolSize: 10, data: [1] }, { type: 'scatter', symbol: 'emptyCircle', data: [1] }, { type: 'scatter', symbol: 'pin', data: [1] }, { type: 'line', showSymbol: true, data: [1] }, { type: 'line', showSymbol: true, symbol: 'roundRect', data: [1] }, { type: 'scatter', data: [1] }] }`)
    expect(r.warnings.join('\n')).toContain('<OptionChart option.series[2].symbol>: native series symbols support circle')
    expect(r.code).toContain('symbol: "diamond"')
    expect(r.code).toContain('symbol: "rect"')
    expect(r.code).toContain('symbol: "circle"')
    expect(r.code).toContain('radius: 5.0')
  })
})

describe('chart-hosts desugarOptionChartHost — cartesian states and labels', () => {
  it('emphasis/select/blur fills, widths and opacities cross; the unsupported bits are named', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'line', emphasis: { focus: 'series', itemStyle: { color: '#f00' }, scale: true, disabled: true, lineStyle: { width: 3 }, areaStyle: { opacity: 2 }, blurScope: 'bogus' }, select: { itemStyle: { color: '#0f0' }, disabled: true, lineStyle: {}, areaStyle: {} }, blur: { itemStyle: { opacity: 0.2 }, lineStyle: { width: 1 }, areaStyle: { opacity: 0.1 }, label: {} }, selectedMode: 'multiple', data: [1] }] }`)
    for (const s of ['focus: "series"', 'emphasisColor: "#f00"', 'emphasisScale: 1.1', 'emphasisDisabled: true', 'emphasisWidth: 3.0', 'emphasisAreaOpacity: 1.0', 'selectColor: "#0f0"', 'blurOpacity: 0.2', 'blurWidth: 1.0', 'blurAreaOpacity: 0.1']) expect(r.code, s).toContain(s)
    const w = r.warnings.join('\n')
    expect(w).toContain('emphasis.blurScope>: "bogus" is not one ECharts defines')
    expect(w).toContain('select.disabled>: not supported')
    expect(w).toContain('select.lineStyle>: has no engine form')
    expect(w).toContain('select.areaStyle>: has no engine form')
    expect(w).toContain('blur.label>: has no engine form')
  })

  it('a numeric emphasis.scale crosses as-is; an unknown focus is named', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', emphasis: { focus: 'adjacency', scale: 1.5 }, selectedMode: 'series', data: [1] }] }`)
    expect(r.code).toContain('emphasisScale: 1.5')
    expect(r.warnings.join('\n')).toContain('emphasis.focus>: only self, series and none are supported natively')
  })

  it('empty state objects add nothing; an unsupported selectedMode is named, false is silent', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', emphasis: { focus: 'none', itemStyle: {}, lineStyle: {}, areaStyle: {} }, select: {}, blur: { itemStyle: {}, lineStyle: {}, areaStyle: {} }, selectedMode: 'bogus', data: [1] }] }`)
    expect(r.warnings).toEqual(['<OptionChart option.series[0].selectedMode>: only true, single, multiple and series are supported natively; taps do not pin.'])
    expect(r.code).not.toContain('emphasisColor')
    expect(r.code).not.toContain('blurOpacity')
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', selectedMode: false, data: [1] }, { type: 'bar', selectedMode: 'single', data: [1] }] }`).warnings).toEqual([])
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', selectedMode: true, data: [1] }] }`).warnings).toEqual([])
  })

  it('a literal label resolves its template, colour, size and rich styles at compile time', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', name: 'S', label: { show: true, formatter: '{a|{c}}', color: '#f00', fontSize: 9, rich: { a: { color: '#0f0', fontSize: 12 } } }, data: [1] }] }`)
    for (const s of ['showValues: true', 'labelTexts: ["{a|1}"]', 'labelColor: "#f00"', 'labelSize: 9.0', 'labelRich: [RichStyle(name: "a"']) expect(r.code, s).toContain(s)
  })

  it('pictorial bars: every geometry key crosses in px/degrees', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', symbol: 'roundRect', symbolRepeat: 3, symbolMargin: -2, symbolOffset: [1, 2], symbolPosition: 'end', symbolRotate: 45, symbolClip: true, symbolBoundingData: 10, data: [1] }] }`)
    for (const s of ['symbol: "rect"', 'symbolRepeat: true', 'symbolMargin: 0.0', 'symbolOffset: [1.0, 2.0]', 'symbolPosition: "end"', 'symbolRotate: 45.0', 'symbolClip: true', 'symbolBoundingData: 10.0']) expect(r.code, s).toContain(s)
  })

  it('pictorial bars: an unknown symbol, percent geometry and an unknown position are each named', () => {
    const w = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', symbol: 'pin', symbolRepeat: 0, symbolMargin: '10%', symbolOffset: ['50%', 0], symbolPosition: 'middle', symbolRotate: 'x', symbolClip: 'y', data: [1] }] }`).warnings.join('\n')
    for (const s of ['symbol>: native pictorial bars support rect', 'symbolMargin>: pictorialBar symbolMargin takes a number of pixels', 'symbolOffset>: symbolOffset takes [dx, dy] in pixels', 'symbolPosition>: only start, end and center are supported', 'symbolRotate>: pictorialBar symbolRotate takes a number of pixels']) expect(w, s).toContain(s)
    const scalar = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', symbolRepeat: 'fixed', symbolOffset: 5, data: [1] }, { type: 'pictorialBar', symbolRepeat: true, data: [1] }] }`)
    expect(scalar.warnings.join('\n')).toContain('symbolOffset>: symbolOffset takes [dx, dy] in pixels')
    expect(scalar.code).toContain('symbolRepeat: true')
  })

  it('an axis-trigger tooltip without a formatter builds the default cells; a formatter suppresses them', () => {
    const r = swift(`{ tooltip: { trigger: 'axis' }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', name: 'S', data: [1] }, { type: 'bar', name: '', data: [1] }] }`)
    const k = kotlin(`{ tooltip: { trigger: 'axis' }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', name: 'S', data: [1] }, { type: 'bar', name: '', data: [1] }] }`)
    expect(r.code + k.code).toContain('tooltipAxisCells')
    const fmt = swift(`{ tooltip: { valueFormatter: (v) => v }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }`)
    expect(fmt.code).not.toContain('tooltipAxisCells')
    expect(fmt.code).not.toContain('tooltipItemCells')
  })
})

describe('chart-hosts desugarOptionChartHost — mark areas, lines and points', () => {
  it('each bad mark-area shape is named and only the good band lowers', () => {
    const r = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', markArea: 5, data: [1] }, { type: 'bar', markArea: { itemStyle: { color: '#f00' } }, data: [1] }, { type: 'bar', markArea: { data: [[1, 2], [{ yAxis: 1 }, { xAxis: 2 }], [{ yAxis: 1, name: 'Band' }, { yAxis: 2 }]] }, data: [1] }] }`)
    const w = r.warnings.join('\n')
    expect(w).toContain('series[0].markArea>: native mark areas need a literal object')
    expect(w).toContain('series[1].markArea.data>: native mark areas need a literal boundary-pair array')
    expect(w).toContain('series[2].markArea.data[0]>: native mark areas need two literal boundary objects')
    expect(w).toContain('series[2].markArea.data[1]>: native mark areas need matching numeric xAxis or yAxis boundaries')
    expect(r.code).toContain('yFrom: 1.0')
    expect(r.code).toContain('label: "Band"')
  })

  it('mark lines: statistics (average/median/max/min), fixed y/x, segments and style colours', () => {
    const r = swift(`{ xAxis: { data: ['a', 'b', 'c'] }, yAxis: {}, series: [{ type: 'line', markLine: { lineStyle: { color: '#111' }, data: [{ type: 'average' }, { type: 'median', name: 'Med' }, { type: 'max' }, { type: 'min' }, { yAxis: 3, name: 'Three', lineStyle: { color: '#222' } }, { xAxis: 1 }, { type: 'bogus' }, 7, [{ type: 'max', name: 'Seg' }, { coord: ['c', 4] }], [{ xAxis: 0, yAxis: 1 }, { type: 'average' }], [{ coord: ['zz', 1] }, { type: 'min' }], [5, 6]] }, data: [1, 5, 3] }] }`)
    for (const s of ['label: "average"', 'label: "Med"', 'label: "max"', 'label: "min"', 'label: "Three"', 'color: "#222"', 'color: "#111"', 'label: "Seg"']) expect(r.code, s).toContain(s)
    const w = r.warnings.join('\n')
    expect(w).toContain('markLine.data[6]>: native mark lines map average/max/min/median')
    expect(w).toContain('markLine.data[10]>: a native point-to-point mark line needs two literal endpoints')
    expect(w).toContain('markLine.data[11]>: a native point-to-point mark line needs two literal endpoints')
  })

  it('an even-length median averages the middle pair; a half endpoint is refused', () => {
    const r = swift(`{ xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'line', markLine: { data: [{ type: 'median' }, [{ coord: [0, 1] }, { xAxis: 1 }]] }, data: [1, 5] }] }`)
    expect(r.code).toContain('y: 3.0')
    expect(r.warnings.join('\n')).toContain('markLine.data[1]>: a native point-to-point mark line needs two literal endpoints')
  })

  it('non-object mark lines/points and missing data arrays are named', () => {
    const w = swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'line', markLine: 5, markPoint: 5, data: [1] }, { type: 'line', markLine: {}, markPoint: {}, data: [1] }] }`).warnings.join('\n')
    expect(w).toContain('series[0].markLine>: native mark lines need a literal object')
    expect(w).toContain('series[0].markPoint>: native mark points need a literal object')
    expect(w).toContain('series[1].markLine.data>: native mark lines need a literal data array')
    expect(w).toContain('series[1].markPoint.data>: native mark points need a literal data array')
  })

  it('mark points: statistics, coords by name or index, values as labels, per-point colour and size', () => {
    const r = swift(`{ xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', markPoint: { itemStyle: { color: '#333' }, symbolSize: 20, data: [{ type: 'max' }, { type: 'min', name: 'Lo', itemStyle: { color: '#444' }, symbolSize: 8 }, { type: 'average' }, { coord: ['b', 5], value: 5 }, { coord: [0, 1], value: 'hi' }, { coord: ['nope', 1] }, 9] }, data: [1, 5] }] }`)
    for (const s of ['at: "max"', 'at: "min"', 'at: "average"', 'atIndex: 1.0', 'atIndex: 0.0', 'label: "5"', 'label: "hi"', 'label: "Lo"', 'color: "#444"', 'color: "#333"', 'radius: 4.0', 'radius: 10.0']) expect(r.code, s).toContain(s)
    expect(r.warnings.join('\n')).toContain('markPoint.data[5]>: native mark points map max/min/average and coord')
  })
})

describe('chart-hosts desugarOptionChartHost — data zoom and sampling', () => {
  it('inside + slider zoom: pinch, the navigator, the opening window, the limits and a pinned y', () => {
    const r = swift(`{ xAxis: { data: ['a', 'b', 'c'] }, yAxis: {}, dataZoom: [{ type: 'inside', start: 10, end: 90, zoomLock: true, minSpan: 10, maxSpan: 90, filterMode: 'none' }, { type: 'slider' }], series: [{ type: 'bar', data: [1, 2, 3] }] }`)
    expect(r.code).toContain('navigatorHit(')
    expect(r.code).toContain('yDomain: Domain(min: 0.0')
  })

  it('a non-literal dataZoom is named', () => {
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: {}, dataZoom: [{ type: 'inside', start: S }], series: [{ type: 'bar', data: [1] }] }`).warnings.join('\n')).toContain('<OptionChart option.dataZoom>: a native dataZoom needs a fully literal option')
  })

  it('filterMode none keeps an explicit yDomain rather than overwriting it', () => {
    const r = swift(`{ xAxis: { data: ['a', 'b'] }, yAxis: { min: 0, max: 5 }, dataZoom: [{ type: 'inside', filterMode: 'none' }], series: [{ type: 'bar', data: [1, 2] }] }`)
    expect(r.code).toContain('yDomain: Domain(min: 0.0, max: 5.0)')
  })

  it('sampling thins at compile time to the static width; an unknown sampler is named', () => {
    const r = swift(`{ xAxis: { data: ['a', 'b', 'c', 'd', 'e', 'f'] }, yAxis: {}, series: [{ type: 'line', sampling: 'average', data: [1, 2, 3, 4, 5, 6] }] }`, 'width={4}')
    expect(r.code).toContain('s0: 2.5')
    expect(r.code).toContain('s0: 5.5')
    expect(swift(`{ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'line', sampling: 'bogus', data: [1] }] }`).warnings.join('\n')).toContain('sampling "bogus" is not supported')
  })
})

// ─── Hierarchies, timelines, toolbox, scroll legend, family frames ────

describe('chart-hosts optionTreeNodes — hierarchy refusals and node colours', () => {
  it('a non-array data list, a nameless node and a nameless CHILD are each refused by path', () => {
    expectRefused(`{ series: [{ type: 'treemap', data: 3 }] }`, 'option.series[0].data>: native hierarchy series need a literal data array')
    expectRefused(`{ series: [{ type: 'treemap', data: [{ value: 3 }] }] }`, 'option.series[0].data[0]>: a hierarchy node needs a literal string name')
    expectRefused(`{ series: [{ type: 'tree', data: [{ name: 'A', children: [{ value: 1 }] }] }] }`, 'option.series[0].data[0].children[0]>: a hierarchy node needs a literal string name')
  })

  it('a node colour comes from itemStyle.color, or a bare `color` when there is no itemStyle', () => {
    const r = swift(`{ series: [{ type: 'treemap', data: [{ name: 'A', value: 3, color: '#f00' }, { name: 'B', itemStyle: { color: '#0f0' } }] }] }`)
    expect(r.code).toContain('color: "#f00"')
    expect(r.code).toContain('color: "#0f0"')
  })
})

describe('chart-hosts timeline options', () => {
  it('static steps lower to a ChartTimeline: labels padded to the step count, autoplay interval, testid on the outer host', () => {
    const r = swift(`{ timeline: { data: ['a'], autoPlay: true, playInterval: 500 }, baseOption: { series: [{ type: 'pie', data: [1] }] }, options: [{ series: [{ data: [2] }] }, { series: [{ data: [3] }] }] }`, 'data-testid="tl" height={200}')
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('TimelineStrip(labels: ["a", "1"]')
    expect(r.code).toContain('accessibilityIdentifier("tl")')
    // Each step gets the height the 40pt strip leaves.
    expect(r.code).toContain('frame(height: 160.0')
  })

  it('a non-literal timeline object is named and one step renders', () => {
    const r = swift(`{ timeline: { data: D }, options: [{ series: [{ type: 'pie', data: [1] }] }], series: [{ type: 'pie', data: [1] }] }`)
    expect(r.warnings.join('\n')).toContain('<OptionChart option.timeline>: a native timeline needs a literal timeline object')
  })

  it('a step that fails to lower abandons the timeline and falls back to the pinned step (naming the failure)', () => {
    const r = swift(`{ timeline: { data: ['a', 'b'] }, options: [{ series: [{ type: 'gauge', data: ['x'] }] }] }`)
    expect(r.warnings.join('\n')).toContain('a native gauge needs a literal numeric value')
    expect(r.code).not.toContain('TimelineStrip(')
  })

  it('a pinned timelineIndex: no steps, an out-of-range step and a non-object step each render the base option', () => {
    expect(swift(`{ timeline: { currentIndex: 0 }, series: [{ type: 'pie', data: [1] }] }`, 'timelineIndex={0}').warnings.join('\n')).toContain('<OptionChart option.options>: timeline has no static steps; native renders the base option.')
    expect(swift(`{ timeline: { data: ['a'] }, options: [{ series: [{ type: 'pie', data: [1] }] }] }`, 'timelineIndex={4}').warnings.join('\n')).toContain('<OptionChart timelineIndex>: step 4 does not exist')
    const nonObj = swift(`{ timeline: { data: ['a'] }, options: [5], series: [{ type: 'pie', data: [1] }] }`, 'timelineIndex={0}')
    expect(nonObj.warnings.join('\n')).toContain('<OptionChart option.options[0]>: native needs a static option object')
    expect(nonObj.code).toContain(CANVAS)
  })

  it('a non-numeric timelineIndex is named and the option currentIndex is used', () => {
    expect(swift(`{ series: [{ type: 'pie', data: [1] }] }`, `timelineIndex={'first'}`).warnings.join('\n')).toContain('<OptionChart timelineIndex>: native needs a static numeric index')
  })

  it('a baseOption with top-level extras merges both, and the pinned step overrides the data', () => {
    const r = swift(`{ baseOption: { title: { text: 'B' }, series: [{ type: 'pie', data: [1] }] }, legend: {}, options: [{ series: [{ data: [7] }] }] }`, 'timelineIndex={0}')
    expect(r.code).toContain('"B"')
    expect(r.code).toContain('7.0, label: "Slice 1"')
  })
})

describe('chart-hosts desugarOptionChart — toolbox, scroll legend and family frames', () => {
  it('a cartesian toolbox lowers every tool, with the brush mode/opacity/series from option.brush', () => {
    const r = swift(`{ toolbox: { feature: { dataZoom: {}, dataView: {}, magicType: { type: ['line', 'bar', 'stack', 'tiled'] }, restore: {}, saveAsImage: {}, brush: { type: ['rect', 'clear'] } } }, brush: { outOfBrush: { colorAlpha: 0.3 }, brushMode: 'multiple', seriesIndex: [0] }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }`)
    expect(r.warnings).toEqual([])
    for (const tool of ['"dataView"', '"magicLine"', '"magicBar"', '"magicStack"', '"magicTiled"', '"brushRect"', '"brushClear"', '"restore"']) expect(r.code, tool).toContain(tool)
    expect(r.code).toContain('0.3')
  })

  it('a family chart keeps only the save button and names the cartesian-only tools', () => {
    const r = swift(`{ toolbox: { feature: { saveAsImage: {}, dataZoom: {}, restore: {} } }, series: [{ type: 'pie', data: [1] }] }`)
    expect(r.warnings.join('\n')).toContain("this PieChart lowers the toolbox's saveAsImage on native")
    expect(r.code).toContain('SaveGeo')
    const noSave = swift(`{ toolbox: { feature: { dataView: {} } }, series: [{ type: 'pie', data: [1] }] }`)
    expect(noSave.code).not.toContain('SaveGeo')
  })

  it('a non-literal toolbox is named; a toolbox with no tools changes nothing', () => {
    expect(swift(`{ toolbox: { feature: F }, series: [{ type: 'pie', data: [1] }] }`).warnings.join('\n')).toContain('<OptionChart option.toolbox>: a native toolbox needs a literal toolbox object')
    const none = swift(`{ toolbox: { show: false }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }`)
    expect(none.warnings).toEqual([])
    expect(none.code).not.toContain('"restore"')
  })

  it('a horizontal scroll legend pages at one row; an explicit legendMaxRows wins', () => {
    expect(swift(`{ legend: { type: 'scroll' }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }`).code).toContain('maxRows: 1.0, page: pyreonLegendPage')
    expect(swift(`{ legend: { type: 'scroll' }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }`, 'legendMaxRows={2}').code).toContain('maxRows: 2.0, page: pyreonLegendPage')
  })

  it('a vertical, family or hidden scroll legend wraps, and says which', () => {
    const msg = "'scroll' pages the legend on the web; native pages a horizontal legend on a cartesian chart only, so this"
    expect(swift(`{ legend: { type: 'scroll', orient: 'vertical' }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }`).warnings.join('\n')).toContain(`${msg} vertical legend draws every entry`)
    expect(swift(`{ legend: { type: 'scroll' }, series: [{ type: 'pie', data: [1] }] }`).warnings.join('\n')).toContain(`${msg} PieChart draws every entry`)
    expect(swift(`{ legend: { type: 'scroll', show: false }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }`).warnings.join('\n')).toContain(`${msg} PlotChart draws every entry`)
  })

  it('a placed family with a non-literal option names its first placement key; an explicit frameSpec is kept', () => {
    expect(swift(`{ series: [{ type: 'sunburst', center: ['50%', '50%'], label: L, data: [{ name: 'A', value: 1 }] }] }`).warnings.join('\n')).toContain('<OptionChart option.series[0].center>: placement needs a fully literal option on native')
    const given = swift(`{ series: [{ type: 'funnel', data: [{ value: 3 }] }] }`, 'frameSpec={{ left: 1 }}')
    expect(given.code).not.toContain('FrameLength(mode: "px", amount: 80.0)')
  })
})

// ─── chart-webview-lowering: the ChartWebView host document ───────────

describe('chart-webview-lowering configureChartWebViewHost', () => {
  type El = Extract<ExprIR, { kind: 'jsx-element' }>
  /** An element carrying `props`; `readStatic` resolves only the entries marked static. */
  const host = (props: Record<string, unknown>, dynamic: readonly string[] = []) => {
    const el: El = {
      kind: 'jsx-element',
      tag: 'ChartWebView',
      attrs: Object.keys(props).map((name) => ({ kind: 'attr' as const, name, value: { kind: 'identifier' as const, name: 'x' } })),
      children: [],
    }
    const warnings: string[] = []
    const html = configureChartWebViewHost(el, (_e, name) => (dynamic.includes(name) ? undefined : props[name]), (m) => warnings.push(m))
    return { html, warnings }
  }

  it('with no props the default host document is returned unchanged', () => {
    expect(host({}).html).toBe(DEFAULT_CHART_WEBVIEW_HOST_HTML)
  })

  it('an inline engine script replaces the CDN tag and is script-context safe', () => {
    const { html } = host({ engineScript: 'var a = "</script><!--";' })
    expect(html).not.toContain('<script src="')
    expect(html).toContain('<script>var a = "<\\/script><!\\--";</script>')
  })

  it('an engine src replaces the CDN url, attribute-escaped, and $-patterns stay verbatim', () => {
    const { html } = host({ engineSrc: 'https://x/e.js?a=1&b="2"<$&' })
    expect(html).toContain('<script src="https://x/e.js?a=1&amp;b=&quot;2&quot;&lt;$&amp;"></script>')
  })

  it('the LEGACY echarts* prop names are read when the neutral ones are absent', () => {
    expect(legacyChartHostProp('engineScript')).toBe('echartsScript')
    expect(legacyChartHostProp('engineSrc')).toBe('echartsSrc')
    expect(legacyChartHostProp('theme')).toBe('theme')
    expect(host({ echartsSrc: 'https://legacy/e.js' }).html).toContain('<script src="https://legacy/e.js"></script>')
  })

  it('theme, svg renderer, background, forwarded events and a setup script each patch the document', () => {
    const { html, warnings } = host({ theme: 'dark', renderer: 'svg', background: '#101820"<x>', forwardEvents: ['click', 'mouseover', 'mouseover', '', 3], hostSetupScript: 'window.x = 1' })
    expect(warnings).toEqual([])
    expect(html).toContain('.init(el, "dark",')
    expect(html).toContain("renderer: 'svg'")
    expect(html).toContain('background:#101820x}')
    expect(html).toContain('var forwardedEvents = ["mouseover"];')
    expect(html).toContain('<script>window.x = 1</script><script>\n(function () {')
  })

  it('a canvas renderer and non-string values leave the defaults in place', () => {
    const { html } = host({ renderer: 'canvas', theme: 3, background: 4, forwardEvents: 'click', hostSetupScript: 5 })
    expect(html).toBe(DEFAULT_CHART_WEBVIEW_HOST_HTML)
  })

  it('a present-but-dynamic host prop is named and its default kept', () => {
    const { html, warnings } = host({ theme: 'dark', engineSrc: 'x' }, ['theme', 'engineSrc'])
    expect(warnings).toEqual([
      '<ChartWebView engineSrc={…}>: native host configuration must be statically resolvable; using the documented default.',
      '<ChartWebView theme={…}>: native host configuration must be statically resolvable; using the documented default.',
    ])
    expect(html).toBe(DEFAULT_CHART_WEBVIEW_HOST_HTML)
  })
})
