import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import type { EChartsOption } from './option'

const cat = (extra: EChartsOption): EChartsOption => ({ xAxis: { data: ['a', 'b', 'c', 'd'] }, yAxis: {}, ...extra })

describe('option facade — edge shapes (every branch NAMES its loss)', () => {
  it('numbers: numeric strings coerce; blanks, non-numeric text, non-finite values and arrays are zeroed with a warning each', () => {
    const c = compileOption(cat({ series: [{ type: 'bar', data: ['3', ' ', 'x', Infinity, [4]] }] }))
    expect(c.spec.series[0]!.values).toEqual([3, 0, 0, 0, 0])
    expect(c.warnings.filter((w) => w.code === 'series-data-shape')).toHaveLength(4)
    expect(c.warnings.map((w) => w.path)).toContain('series[0].data[1]')
  })

  it('axes: extra x axes warn, a third y axis is carried; min/max (even as strings) become the domain; a lone min or max does not', () => {
    const c = compileOption({
      xAxis: [{ data: ['a'] }, { data: ['b', 'c'] }],
      yAxis: [{ min: '0', max: '10' }, { min: 1 }, { max: 9 }],
      series: [{ type: 'bar', data: [1] }],
    })
    const w = c.warnings.map((x) => `${x.code}@${x.path}`)
    expect(w).toContain('axis-count-unsupported@xAxis')
    expect(w).toContain('option-key-unsupported@yAxis[1].min')
    expect(w).toContain('option-key-unsupported@yAxis[2].max')
    expect(c.spec.extraYAxes).toEqual([{ side: 'right', domain: undefined, title: undefined, offset: undefined }])
    expect(c.spec.yDomain).toMatchObject({ min: 0, max: 10 })
    expect(c.spec.y2Domain).toBeUndefined()
    // A single y-axis object and no y axis at all both compile.
    expect(compileOption(cat({ yAxis: { min: 1, max: 5 }, series: [{ type: 'bar', data: [1] }] })).spec.yDomain).toMatchObject({ min: 1, max: 5 })
    expect(compileOption({ series: [{ type: 'bar', data: [1] }] }).spec.yDomain).toBeUndefined()
  })

  it('axis formatters: a function passes through, the {value} template maps, any other template warns, no axisLabel means the ECharts default grouping', () => {
    const c = compileOption({
      xAxis: { data: ['a'], axisLabel: { formatter: 'nope' } },
      yAxis: [{ axisLabel: { formatter: (v: number) => `v${v}` } }, { axisLabel: { formatter: '{value}%' } }],
      series: [{ type: 'bar', data: [1] }],
    })
    expect(c.warnings.map((w) => `${w.code}@${w.path}`)).toContain('axis-formatter-template@xAxis.axisLabel.formatter')
    expect(c.spec.xFormat).toBeUndefined()
    expect(c.spec.yFormat!(1)).toBe('v1')
    expect(c.spec.y2Format!(5)).toBe('5%')
    // No formatter of the author's: ECharts' default label, grouped by thousands.
    expect(compileOption(cat({ yAxis: { axisLabel: {} }, series: [] })).spec.yFormat!(12500)).toBe('12,500')
    expect(compileOption(cat({ yAxis: { axisLabel: 'x' }, series: [] })).spec.yFormat!(-1234.5)).toBe('-1,234.5')
  })

  it('series shapes: a single object, a non-object entry (unsupported), garbage, stacked lines, areaStyle forms, missing data', () => {
    expect(compileOption(cat({ series: { type: 'line', data: [1] } })).spec.series).toHaveLength(1)
    const bad = compileOption(cat({ series: [5] }))
    expect(bad.supported).toBe(false)
    expect(bad.warnings.map((w) => `${w.code}@${w.path}`)).toEqual(['series-data-shape@series[0]'])
    expect(compileOption(cat({ series: 'garbage' })).spec.series).toHaveLength(0)
    // Stacked lines sit on the running total of their stack; a gap carries the
    // total without dropping the lines above it; other stacks are independent;
    // a stacked AREA is the engine's own stackedArea kind over raw values.
    const stacked = compileOption(cat({ series: [
      { type: 'line', stack: 'a', data: [1, 2, 3] },
      { type: 'line', stack: 'a', data: [3, null, 4] },
      { type: 'line', stack: 'a', data: [1, 1, 1] },
      { type: 'line', stack: 'b', data: [10, 10, 10] },
      { type: 'line', stack: 'a', areaStyle: {}, data: [5, 5, 5] },
    ] }))
    expect(stacked.spec.series.map((x) => x.kind)).toEqual(['line', 'line', 'line', 'line', 'stackedArea'])
    expect(stacked.spec.series[0]!.values).toEqual([1, 2, 3])
    expect(stacked.spec.series[1]!.values).toEqual([4, NaN, 7])
    expect(stacked.spec.series[2]!.values).toEqual([5, 3, 8])
    expect(stacked.spec.series[3]!.values).toEqual([10, 10, 10])
    expect(stacked.spec.series[4]!.values).toEqual([5, 5, 5])
    expect(stacked.warnings.map((w) => `${w.code}@${w.path}`)).not.toContain('series-option-unsupported@series[0].stack')
    expect(compileOption(cat({ series: [{ type: 'line', areaStyle: true, data: [1] }] })).spec.series[0]!.kind).toBe('area')
    expect(compileOption(cat({ series: [{ type: 'line', areaStyle: {}, data: [1] }] })).spec.series[0]!.kind).toBe('area')
    const missing = compileOption(cat({ series: [{ type: 'bar' }] }))
    expect(missing.spec.series[0]!.values).toEqual([])
    expect(missing.warnings.map((w) => `${w.code}@${w.path}`)).toContain('series-data-shape@series[0].data')
  })

  it('pairs and value objects: a non-numeric pair is zeroed at its index and disqualifies xValues; object values coerce', () => {
    const c = compileOption({ xAxis: { type: 'value' }, yAxis: {}, series: [{ type: 'line', data: [[1, 2], ['x', 3], [4, 5]] }] })
    expect(c.spec.series[0]!.values).toEqual([2, 0, 5])
    expect(c.spec.xValues).toEqual([1, 1, 4])
    expect(c.warnings.map((w) => w.path)).toContain('series[0].data[1]')
    const objs = compileOption(cat({ series: [{ type: 'bar', data: [{ value: 'z' }, { value: '7' }] }] }))
    expect(objs.spec.series[0]!.values).toEqual([0, 7])
    expect(objs.warnings.map((w) => w.path)).toEqual(['series[0].data[0].value'])
    // Plain numbers on a value axis carry no x positions.
    expect(compileOption({ xAxis: { type: 'value' }, yAxis: {}, series: [{ type: 'line', data: [1, 2] }] }).spec.xValues).toBeUndefined()
    expect(compileOption({ xAxis: { type: 'time' }, yAxis: {}, series: [{ type: 'line', data: [[1, 2]] }] }).spec.xTime).toBe(true)
  })

  it('colour precedence itemStyle > lineStyle > series.color > option palette (non-strings dropped) > default palette', () => {
    const c = compileOption(cat({
      color: ['#111111', 7],
      series: [
        { type: 'bar', data: [1], itemStyle: { color: '#aaaaaa' }, lineStyle: { color: '#bbbbbb' }, color: '#cccccc' },
        { type: 'line', data: [1], lineStyle: { color: '#bbbbbb' }, color: '#cccccc' },
        { type: 'line', data: [1], color: '#cccccc' },
        { type: 'line', data: [1] },
      ],
    }))
    expect(c.spec.series.map((s) => s.color)).toEqual(['#aaaaaa', '#bbbbbb', '#cccccc', '#111111'])
    expect(compileOption(cat({ series: [{ type: 'bar', data: [1] }] })).spec.series[0]!.color).toBe('#0f766e')
  })

  it('symbolSize halves into the radius; smooth as number, step as string; label.show; lineStyle.width; yAxisIndex forms', () => {
    const c = compileOption(cat({
      yAxis: [{}, {}],
      series: [
        { type: 'line', data: [1], symbolSize: 10, smooth: 0.5, lineStyle: { width: '3' }, label: { show: true }, yAxisIndex: '1' },
        { type: 'line', data: [1], step: 'end' },
        { type: 'line', data: [1], step: false, yAxisIndex: 2 },
      ],
    }))
    const [a, b, d] = c.spec.series
    expect(a!.radius).toBe(5)
    expect(a!.curve).toBeDefined()
    expect(a!.width).toBe(3)
    expect(a!.showValues).toBe(true)
    expect(a!.axis).toBe('right')
    expect(b!.curve).toBeDefined()
    expect(b!.radius).toBe(3)
    expect(d!.curve).toBeUndefined()
    expect(c.warnings.map((w) => `${w.code}@${w.path}`)).toContain('axis-count-unsupported@series[2].yAxisIndex')
    expect(compileOption(cat({ series: [{ type: 'line', data: [1] }] })).spec.series[0]!.label).toBe('Series 1')
  })

  it('markLine: max/min/yAxis/xAxis map, other shapes warn, non-objects are skipped; markPoint: coord maps, other shapes warn', () => {
    const c = compileOption(cat({
      series: [{
        type: 'line', data: [1, 5, 3],
        markLine: { data: [{ type: 'max', name: 'top' }, { type: 'min' }, { yAxis: '5' }, { xAxis: 1, name: 'x' }, { foo: 1 }, 7] },
        markPoint: { data: [{ coord: [2, 0], name: 'here' }, { coord: ['q'] }, { type: 'min' }, 3] },
      }, { type: 'line', data: [1], markLine: 'no', markPoint: { data: 'no' } }],
    }))
    const ann = c.spec.annotations!
    expect(ann.map((a) => [a.y, a.x, a.label])).toEqual([[5, undefined, 'top'], [1, undefined, 'min'], [5, undefined, undefined], [undefined, 1, 'x']])
    expect(c.spec.markers!.map((m) => [m.at, m.atIndex, m.label])).toEqual([[undefined, 2, 'here'], ['min', undefined, undefined]])
    const w = c.warnings.map((x) => `${x.code}@${x.path}`)
    expect(w).toContain('mark-shape-unsupported@series[0].markLine.data[4]')
    expect(w).toContain('mark-shape-unsupported@series[0].markPoint.data[1]')
    expect(compileOption(cat({ series: [{ type: 'line', data: [1] }] })).spec.annotations).toBeUndefined()
  })

  it('title (object or array, with or without subtext, non-string text), legend show:false, tooltip forms', () => {
    const base = { xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }
    expect(compileOption({ ...base, title: [{ text: 'T', subtext: 'S' }] }).title).toEqual({ text: 'T', subtext: 'S' })
    expect(compileOption({ ...base, title: { text: 'T' } }).title).toEqual({ text: 'T', subtext: undefined })
    expect(compileOption({ ...base, title: { text: 5 } }).title).toBeNull()
    expect(compileOption({ ...base, legend: { show: false } }).legend).toBeNull()
    expect(compileOption({ ...base, legend: {} }).legend).toHaveLength(1)
    expect(compileOption(base).tooltip).toBe(false)
    expect(compileOption({ ...base, tooltip: {} }).tooltip).toBe(true)
    expect(compileOption({ ...base, tooltip: { show: false } }).tooltip).toBe(false)
    expect(compileOption({ ...base, tooltip: true }).tooltip).toBe(true)
    // Category entries may be objects with a value, objects without one, or bare numbers.
    expect(compileOption({ xAxis: { data: [{ value: 'q' }, { name: 'n' }, 3] }, yAxis: {}, series: [] }).spec.categories).toEqual(['q', '', '3'])
  })
})

describe('pictorialBar geometry keys', () => {
  it('maps symbolClip / symbolMargin / symbolBoundingData / symbolOffset / symbolPosition / symbolRotate to the series with zero warnings', () => {
    const { spec, warnings } = compileOption({ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', symbol: 'circle', symbolRepeat: true, symbolClip: true, symbolMargin: 4, symbolBoundingData: 10, symbolOffset: [0, 2], symbolPosition: 'end', symbolRotate: 30, data: [3] }] })
    expect(warnings).toEqual([])
    expect(spec.series[0]).toMatchObject({ symbol: 'circle', symbolRepeat: true, symbolClip: true, symbolMargin: 4, symbolBoundingData: 10, symbolOffset: [0, 2], symbolPosition: 'end', symbolRotate: 30 })
  })

  it('names what has no engine form — percent strings and an unknown position — rather than swallowing them', () => {
    const { spec, warnings } = compileOption({ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', symbolMargin: '10%', symbolOffset: ['5%', 0], symbolPosition: 'middle', data: [3] }] })
    expect(warnings.map((w) => w.code + '@' + w.path).sort()).toEqual([
      'series-option-unsupported@series[0].symbolMargin',
      'series-option-unsupported@series[0].symbolOffset',
      'series-option-unsupported@series[0].symbolPosition',
    ])
    expect(spec.series[0]!.symbolMargin).toBeUndefined()
    expect(spec.series[0]!.symbolOffset).toBeUndefined()
    expect(spec.series[0]!.symbolPosition).toBeUndefined()
  })
})
