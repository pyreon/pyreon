import { describe, expect, it } from 'vitest'
import { compileOption, optionToSvg } from './option'
import type { EChartsOption } from './option'

// A gallery-shaped corpus: each fixture is written the way an ECharts user
// writes it. `expectClean` fixtures must compile with ZERO warnings and render.
// The pass-rate is the program's conformance metric; it ratchets UP only.
const CORPUS: { name: string; option: EChartsOption; expectClean: boolean }[] = [
  { name: 'basic bar', expectClean: true, option: {
    xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] }, yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [120, 200, 150] }] } },
  { name: 'stacked bar with legend + tooltip', expectClean: true, option: {
    tooltip: { trigger: 'axis' }, legend: { data: ['Email', 'Ads'] },
    xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: { type: 'value' },
    series: [
      { name: 'Email', type: 'bar', stack: 'total', data: [1, 2] },
      { name: 'Ads', type: 'bar', stack: 'total', data: [3, 4] },
    ] } },
  { name: 'grouped bars', expectClean: true, option: {
    xAxis: { type: 'category', data: ['2019', '2020'] }, yAxis: {},
    series: [{ type: 'bar', data: [1, 2] }, { type: 'bar', data: [2, 3] }] } },
  { name: 'smooth line + area', expectClean: true, option: {
    xAxis: { type: 'category', data: ['a', 'b', 'c', 'd'] }, yAxis: { type: 'value' },
    series: [{ type: 'line', smooth: true, areaStyle: {}, data: [1, 4, 2, 5] }] } },
  { name: 'step line', expectClean: true, option: {
    xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: {},
    series: [{ type: 'line', step: 'start', data: [1, 4, 2] }] } },
  { name: 'scatter pairs on a value axis', expectClean: true, option: {
    xAxis: { type: 'value' }, yAxis: { type: 'value' },
    series: [{ type: 'scatter', symbolSize: 10, data: [[10, 8], [8, 6], [13, 7]] }] } },
  { name: 'time axis', expectClean: true, option: {
    xAxis: { type: 'time' }, yAxis: {},
    series: [{ type: 'line', data: [[1700000000000, 3], [1700086400000, 5], [1700172800000, 4]] }] } },
  { name: 'dual y axes (bar + line on yAxisIndex 1)', expectClean: true, option: {
    xAxis: { type: 'category', data: ['q1', 'q2'] },
    yAxis: [{ type: 'value', name: 'units' }, { type: 'value', name: 'rate', axisLabel: { formatter: '{value}%' } }],
    series: [{ type: 'bar', data: [100, 140] }, { type: 'line', yAxisIndex: 1, data: [12, 18] }] } },
  { name: 'markLine average + markPoint max/min', expectClean: true, option: {
    xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: {},
    series: [{ type: 'line', data: [3, 9, 1],
      markLine: { data: [{ type: 'average', name: 'avg' }] },
      markPoint: { data: [{ type: 'max', name: 'Max' }, { type: 'min', name: 'Min' }] } }] } },
  { name: 'title + subtext + palette + itemStyle color', expectClean: true, option: {
    title: { text: 'Sales', subtext: 'FY26' }, color: ['#111111', '#222222'],
    xAxis: { type: 'category', data: ['a'] }, yAxis: { min: 0, max: 10 },
    series: [{ type: 'bar', data: [5], itemStyle: { color: '#abcdef' } }, { type: 'bar', data: [3] }] } },
  { name: 'pie (not yet mapped)', expectClean: false, option: {
    series: [{ type: 'pie', data: [{ value: 1, name: 'a' }] }] } },
  { name: 'radar + dataZoom (unmapped keys)', expectClean: false, option: {
    dataZoom: [{ type: 'inside' }], radar: { indicator: [] },
    xAxis: { type: 'category', data: ['a'] }, yAxis: {},
    series: [{ type: 'bar', data: [1] }] } },
]

describe('ECharts option facade — conformance corpus', () => {
  it('every expectClean fixture compiles with zero warnings and renders', () => {
    const misses: string[] = []
    for (const f of CORPUS) {
      const c = compileOption(f.option)
      const svg = optionToSvg(f.option)
      const clean = c.supported && c.warnings.length === 0 && svg.startsWith('<svg')
      if (f.expectClean && !clean) misses.push(`${f.name}: ${c.warnings.map((w) => `${w.path}:${w.code}`).join(', ') || 'unsupported'}`)
      if (!f.expectClean && clean) misses.push(`${f.name}: expected warnings but got a clean compile`)
    }
    expect(misses, misses.join('\n')).toEqual([])
  })

  it('reports the conformance pass-rate and never regresses below the locked floor', () => {
    const clean = CORPUS.filter((f) => {
      const c = compileOption(f.option)
      return c.supported && c.warnings.length === 0
    }).length
    // 10 of 12 today. Raise this number as families land; never lower it.
    expect(clean).toBeGreaterThanOrEqual(10)
  })
})

describe('ECharts option facade — mappings', () => {
  it('maps series kinds: bar / stacked / grouped / line / area / scatter', () => {
    const c = compileOption({
      xAxis: { data: ['a'] }, yAxis: {},
      series: [
        { type: 'bar', stack: 's', data: [1] }, { type: 'bar', stack: 's', data: [1] },
        { type: 'line', data: [1] }, { type: 'line', areaStyle: {}, data: [1] }, { type: 'scatter', data: [1] },
      ],
    })
    expect(c.spec.series.map((s) => s.kind)).toEqual(['stacked', 'stacked', 'line', 'area', 'points'])
  })

  it('a second y axis lands on the right with its own {value} formatter', () => {
    const c = compileOption({
      xAxis: { data: ['a'] }, yAxis: [{}, { axisLabel: { formatter: '{value}%' } }],
      series: [{ type: 'bar', data: [1] }, { type: 'line', yAxisIndex: 1, data: [0.5] }],
    })
    expect(c.spec.series[1]!.axis).toBe('right')
    expect(c.spec.y2Format!(50)).toBe('50%')
  })

  it('markLine average becomes a y annotation; markPoint max/min become markers', () => {
    const c = compileOption({
      xAxis: { data: ['a', 'b', 'c'] }, yAxis: {},
      series: [{ type: 'line', data: [3, 9, 6], markLine: { data: [{ type: 'average' }] }, markPoint: { data: [{ type: 'max' }, { coord: [1, 9] }] } }],
    })
    expect(c.spec.annotations![0]!.y).toBeCloseTo(6, 9)
    expect(c.spec.markers!.map((m) => m.at ?? m.atIndex)).toEqual(['max', 1])
  })

  it('never drops silently: unknown top-level keys, series options and types are all NAMED', () => {
    const c = compileOption({
      visualMap: {}, xAxis: { data: ['a'] }, yAxis: {},
      series: [{ type: 'bar', data: [1], barWidth: 20 }, { type: 'funnel', data: [] }],
    })
    const codes = c.warnings.map((w) => `${w.code}@${w.path}`)
    expect(codes).toContain('option-key-unsupported@visualMap')
    expect(codes).toContain('series-option-unsupported@series[0].barWidth')
    expect(codes).toContain('series-type-unsupported@series[1].type')
    expect(c.supported).toBe(false)
  })

  it('pairs on a value axis feed xValues; categories come from xAxis.data', () => {
    const pairs = compileOption({ xAxis: { type: 'value' }, yAxis: {}, series: [{ type: 'scatter', data: [[1, 2], [3, 4]] }] })
    expect(pairs.spec.xValues).toEqual([1, 3])
    expect(pairs.spec.categories).toEqual([])
    const cats = compileOption({ xAxis: { type: 'category', data: ['x', 'y'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] })
    expect(cats.spec.categories).toEqual(['x', 'y'])
  })

  it('legend: absent → null; show:false → null; otherwise one entry per series in palette order', () => {
    expect(compileOption({ series: [{ type: 'bar', data: [1] }] }).legend).toBeNull()
    expect(compileOption({ legend: { show: false }, series: [{ type: 'bar', data: [1] }] }).legend).toBeNull()
    const c = compileOption({ legend: {}, color: ['#aaa', '#bbb'], series: [{ type: 'bar', name: 'A', data: [1] }, { type: 'bar', name: 'B', data: [1] }] })
    expect(c.legend).toEqual([{ label: 'A', color: '#aaa' }, { label: 'B', color: '#bbb' }])
  })

  it('optionToSvg composes title + legend above the plot', () => {
    const svg = optionToSvg({ title: { text: 'Hello' }, legend: {}, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', name: 'S', data: [1] }] })
    expect(svg).toContain('Hello')
    expect(svg).toContain('>S<')
    expect(svg).not.toContain('NaN')
  })
})
