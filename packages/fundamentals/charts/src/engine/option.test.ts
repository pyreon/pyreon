import { describe, expect, it } from 'vitest'
import { compileOption, optionToSvg, planOption } from './option'
import type { EChartsOption } from './option'
import { compileFamily } from './option-family'

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
  { name: 'donut pie with legend', expectClean: true, option: {
    legend: {}, series: [{ type: 'pie', radius: ['40%', '70%'], data: [{ value: 1048, name: 'Search' }, { value: 735, name: 'Direct' }] }] } },
  { name: 'gauge', expectClean: true, option: {
    series: [{ type: 'gauge', min: 0, max: 100, data: [{ value: 72, name: 'Load' }] }] } },
  { name: 'radar', expectClean: true, option: {
    radar: { indicator: [{ name: 'Sales', max: 100 }, { name: 'Admin', max: 100 }, { name: 'IT', max: 100 }] },
    series: [{ type: 'radar', data: [{ value: [60, 70, 80], name: 'Budget' }] }] } },
  { name: 'candlestick', expectClean: true, option: {
    xAxis: { data: ['d1', 'd2'] }, yAxis: {},
    series: [{ type: 'candlestick', data: [[20, 34, 10, 38], [40, 35, 30, 50]] }] } },
  { name: 'heatmap with visualMap ramp', expectClean: true, option: {
    xAxis: { type: 'category', data: ['12a', '1a'] }, yAxis: { type: 'category', data: ['Sat', 'Sun'] },
    visualMap: { min: 0, max: 10, inRange: { color: ['#eff6ff', '#1e40af'] } },
    series: [{ type: 'heatmap', data: [[0, 0, 5], [1, 1, 9]] }] } },
  { name: 'funnel', expectClean: true, option: {
    series: [{ type: 'funnel', sort: 'descending', minSize: '10%', data: [{ value: 60, name: 'Visit' }, { value: 40, name: 'Inquiry' }, { value: 20, name: 'Order' }] }] } },
  { name: 'pictorialBar (repeated circles) + effectScatter', expectClean: true, option: {
    xAxis: { data: ['a', 'b', 'c'] }, yAxis: {},
    series: [{ type: 'pictorialBar', symbol: 'circle', symbolRepeat: true, data: [3, 6, 9] }, { type: 'effectScatter', symbolSize: 10, data: [2, 5, 7] }] } },
  { name: 'derived dataset (filter + sort) bars', expectClean: true, option: {
    dataset: [
      { source: [['name', 'score', 'team'], ['a', 5, 'x'], ['b', 9, 'y'], ['c', 1, 'x'], ['d', 7, 'y']] },
      { transform: [{ type: 'filter', config: { dimension: 'team', eq: 'y' } }, { type: 'sort', config: { dimension: 'score', order: 'desc' } }] },
    ],
    xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'bar', datasetIndex: 1 }] } },
  { name: 'heatmap + piecewise visualMap', expectClean: true, option: {
    visualMap: { type: 'piecewise', splitNumber: 3, min: 0, max: 9, orient: 'horizontal', left: 'center', bottom: 0 },
    xAxis: { data: ['a', 'b'] }, yAxis: { data: ['r', 's'] },
    series: [{ type: 'heatmap', data: [[0, 0, 1], [1, 0, 5], [0, 1, 9], [1, 1, 3]] }] } },
  { name: 'dataset-driven bars + graphic watermark', expectClean: true, option: {
    dataset: { source: [['product', '2023', '2024'], ['Milk', 43, 85], ['Cheese', 83, 73]] },
    graphic: [{ type: 'text', right: 8, bottom: 4, style: { text: 'demo', fontSize: 10 } }],
    xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'bar' }, { type: 'bar' }] } },
  { name: 'themeRiver', expectClean: true, option: {
    singleAxis: { type: 'time' },
    series: [{ type: 'themeRiver', data: [['2024-01-01', 3, 'x'], ['2024-01-02', 5, 'x'], ['2024-01-01', 2, 'y'], ['2024-01-02', 1, 'y']] }] } },
  { name: 'polar bar + line', expectClean: true, option: {
    angleAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] }, radiusAxis: {},
    series: [{ type: 'bar', coordinateSystem: 'polar', data: [1, 2, 3] }, { type: 'line', coordinateSystem: 'polar', data: [2, 2, 2] }] } },
  { name: 'parallel', expectClean: true, option: {
    parallelAxis: [{ dim: 0, name: 'a' }, { dim: 1, name: 'b' }, { dim: 2, name: 'c', type: 'category', data: ['x', 'y'] }],
    series: [{ type: 'parallel', data: [[1, 2, 'x'], [3, 1, 'y']] }] } },
  { name: 'calendar heatmap', expectClean: true, option: {
    calendar: { range: '2024' }, visualMap: { min: 0, max: 10, inRange: { color: ['#eff6ff', '#1e40af'] } },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2024-01-02', 3], ['2024-06-15', 9]] }] } },
  { name: 'graph (force)', expectClean: true, option: {
    series: [{ type: 'graph', layout: 'force', symbolSize: 12, data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], links: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }] }] } },
  { name: 'sankey', expectClean: true, option: {
    series: [{ type: 'sankey', data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], links: [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 3 }] }] } },
  { name: 'tree', expectClean: true, option: {
    series: [{ type: 'tree', orient: 'LR', symbolSize: 7, data: [{ name: 'root', children: [{ name: 'a', children: [{ name: 'a1' }] }, { name: 'b' }] }] }] } },
  { name: 'sunburst', expectClean: true, option: {
    series: [{ type: 'sunburst', radius: ['20%', '90%'], data: [{ name: 'A', value: 10 }, { name: 'B', children: [{ name: 'b1', value: 4 }, { name: 'b2', value: 6 }] }] }] } },
  { name: 'treemap', expectClean: true, option: {
    series: [{ type: 'treemap', data: [{ name: 'A', value: 10 }, { name: 'B', children: [{ name: 'b1', value: 4 }, { name: 'b2', value: 6 }] }] }] } },
  { name: 'boxplot with outlier scatter', expectClean: true, option: {
    xAxis: { data: ['A', 'B'] }, yAxis: {},
    series: [{ type: 'boxplot', data: [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]] }, { type: 'scatter', data: [[0, 9]] }] } },
  { name: 'rose pie (roseType unmapped)', expectClean: false, option: {
    series: [{ type: 'pie', roseType: 'area', data: [{ value: 1, name: 'a' }] }] } },
  { name: 'radar + dataZoom (unmapped keys)', expectClean: false, option: {
    dataZoom: [{ type: 'inside' }], radar: { indicator: [] },
    xAxis: { type: 'category', data: ['a'] }, yAxis: {},
    series: [{ type: 'bar', data: [1] }] } },
]

describe('ECharts option facade — conformance corpus', () => {
  it('every expectClean fixture compiles with zero warnings and renders', () => {
    const misses: string[] = []
    for (const f of CORPUS) {
      const c = planOption(f.option).compiled
      const svg = optionToSvg(f.option)
      const clean = c.supported && c.warnings.length === 0 && svg.startsWith('<svg')
      if (f.expectClean && !clean) misses.push(`${f.name}: ${c.warnings.map((w) => `${w.path}:${w.code}`).join(', ') || 'unsupported'}`)
      if (!f.expectClean && clean) misses.push(`${f.name}: expected warnings but got a clean compile`)
    }
    expect(misses, misses.join('\n')).toEqual([])
  })

  it('reports the conformance pass-rate and never regresses below the locked floor', () => {
    const clean = CORPUS.filter((f) => {
      const c = planOption(f.option).compiled
      return c.supported && c.warnings.length === 0
    }).length
    // 29 of 31 today. Raise this number as families land; never lower it.
    expect(clean).toBeGreaterThanOrEqual(29)
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
      brush: {}, xAxis: { data: ['a'] }, yAxis: {},
      series: [{ type: 'bar', data: [1], barWidth: 20 }, { type: 'funnel', data: [] }],
    })
    const codes = c.warnings.map((w) => `${w.code}@${w.path}`)
    expect(codes).toContain('option-key-unsupported@brush')
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


describe('ECharts option facade — family mappings', () => {
  it('pie: radius pair becomes the donut hole ratio; itemStyle colours and names carry', () => {
    const f = compileFamily({ series: [{ type: 'pie', radius: ['40%', '80%'], data: [{ value: 3, name: 'a', itemStyle: { color: '#123' } }, { value: 1, name: 'b' }] }] })!
    expect(f.plan.kind).toBe('pie')
    if (f.plan.kind !== 'pie') return
    expect(f.plan.innerRadius).toBeCloseTo(0.5, 9)
    expect(f.plan.rows.map((r) => r.name)).toEqual(['a', 'b'])
    expect(f.plan.rows[0]!.color).toBe('#123')
  })

  it('candlestick tuples are [open, close, low, high] — ECharts order, not OHLC', () => {
    const f = compileFamily({ xAxis: { data: ['x'] }, series: [{ type: 'candlestick', data: [[20, 34, 10, 38]] }] })!
    if (f.plan.kind !== 'candlestick') throw new Error('kind')
    expect(f.plan.rows[0]).toEqual({ x: 'x', open: 20, close: 34, low: 10, high: 38 })
  })

  it('heatmap triples index into the category axes; visualMap colours become the ramp', () => {
    const f = compileFamily({ xAxis: { data: ['c0', 'c1'] }, yAxis: { data: ['r0'] }, visualMap: { inRange: { color: ['#000', '#fff'] } }, series: [{ type: 'heatmap', data: [[1, 0, 7]] }] })!
    if (f.plan.kind !== 'heatmap') throw new Error('kind')
    expect(f.plan.rows[0]).toEqual({ x: 'c1', y: 'r0', value: 7 })
    expect(f.plan.colors).toEqual(['#000', '#fff'])
  })

  it('radar indicators become axes; fewer than three is unsupported', () => {
    const ok = compileFamily({ radar: { indicator: [{ name: 'a', max: 10 }, { name: 'b', max: 10 }, { name: 'c', max: 10 }] }, series: [{ type: 'radar', areaStyle: { opacity: 0.5 }, data: [{ value: [1, 2, 3] }] }] })!
    if (ok.plan.kind !== 'radar') throw new Error('kind')
    expect(ok.plan.axes.map((a) => a.label)).toEqual(['a', 'b', 'c'])
    expect(ok.plan.fillAlpha).toBe(0.5)
    const bad = compileFamily({ radar: { indicator: [{ name: 'a' }] }, series: [{ type: 'radar', data: [] }] })!
    expect(bad.supported).toBe(false)
  })

  it('gauge: value, bounds, detail.show and progress colour', () => {
    const f = compileFamily({ series: [{ type: 'gauge', min: 0, max: 200, detail: { show: false }, progress: { itemStyle: { color: '#0f0' } }, data: [{ value: 150 }] }] })!
    if (f.plan.kind !== 'gauge') throw new Error('kind')
    expect(f.plan).toMatchObject({ value: 150, min: 0, max: 200, showValue: false, valueColor: '#0f0' })
  })

  it('a cartesian option is NOT a family option (routing stays honest)', () => {
    expect(compileFamily({ series: [{ type: 'bar', data: [1] }] })).toBeNull()
    expect(planOption({ series: [{ type: 'bar', data: [1] }] }).kind).toBe('cartesian')
  })

  it('family SVGs render without NaN for every family', () => {
    for (const f of CORPUS) {
      if (!f.expectClean) continue
      const svg = optionToSvg(f.option)
      expect(svg, f.name).toContain('<svg')
      expect(svg, f.name).not.toContain('NaN')
    }
  })
})

describe('funnel option mapping', () => {
  it('sort/minSize/funnelAlign map onto FunnelOptions; a funnel option renders', () => {
    const f = compileFamily({ series: [{ type: 'funnel', sort: 'ascending', minSize: '20%', funnelAlign: 'left', data: [{ value: 1, name: 'a' }, { value: 2, name: 'b' }, { value: 3, name: 'c' }] }] })!
    if (f.plan.kind !== 'funnel') throw new Error('kind')
    expect(f.plan.funnel).toMatchObject({ sort: 'ascending', minWidthRatio: 0.2, align: 'left' })
    expect(f.plan.rows.map((r) => r.name)).toEqual(['a', 'b', 'c'])
    expect(optionToSvg({ series: [{ type: 'funnel', data: [{ value: 5, name: 'x' }] }] })).toContain('<polygon')
  })
})
