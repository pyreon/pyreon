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

  it('axes: extra x axes and a third y axis warn; min/max (even as strings) become the domain; a lone min does not', () => {
    const c = compileOption({
      xAxis: [{ data: ['a'] }, { data: ['b'] }],
      yAxis: [{ min: '0', max: '10' }, { min: 1 }, { max: 9 }],
      series: [{ type: 'bar', data: [1] }],
    })
    const w = c.warnings.map((x) => `${x.code}@${x.path}`)
    expect(w).toContain('axis-count-unsupported@xAxis')
    expect(w).toContain('axis-count-unsupported@yAxis')
    expect(c.spec.yDomain).toEqual({ min: 0, max: 10 })
    expect(c.spec.y2Domain).toBeUndefined()
    // A single y-axis object and no y axis at all both compile.
    expect(compileOption(cat({ yAxis: { min: 1, max: 5 }, series: [{ type: 'bar', data: [1] }] })).spec.yDomain).toEqual({ min: 1, max: 5 })
    expect(compileOption({ series: [{ type: 'bar', data: [1] }] }).spec.yDomain).toBeUndefined()
  })

  it('axis formatters: a function passes through, the {value} template maps, any other template warns, no axisLabel means none', () => {
    const c = compileOption({
      xAxis: { data: ['a'], axisLabel: { formatter: 'nope' } },
      yAxis: [{ axisLabel: { formatter: (v: number) => `v${v}` } }, { axisLabel: { formatter: '{value}%' } }],
      series: [{ type: 'bar', data: [1] }],
    })
    expect(c.warnings.map((w) => `${w.code}@${w.path}`)).toContain('axis-formatter-template@xAxis.axisLabel.formatter')
    expect(c.spec.xFormat).toBeUndefined()
    expect(c.spec.yFormat!(1)).toBe('v1')
    expect(c.spec.y2Format!(5)).toBe('5%')
    expect(compileOption(cat({ yAxis: { axisLabel: {} }, series: [] })).spec.yFormat).toBeUndefined()
    expect(compileOption(cat({ yAxis: { axisLabel: 'x' }, series: [] })).spec.yFormat).toBeUndefined()
  })

  it('series shapes: a single object, a non-object entry (unsupported), garbage, stacked lines, areaStyle forms, missing data', () => {
    expect(compileOption(cat({ series: { type: 'line', data: [1] } })).spec.series).toHaveLength(1)
    const bad = compileOption(cat({ series: [5] }))
    expect(bad.supported).toBe(false)
    expect(bad.warnings.map((w) => `${w.code}@${w.path}`)).toEqual(['series-data-shape@series[0]'])
    expect(compileOption(cat({ series: 'garbage' })).spec.series).toHaveLength(0)
    const stacked = compileOption(cat({ series: [{ type: 'line', stack: 'a', data: [1] }] }))
    expect(stacked.spec.series[0]!.kind).toBe('line')
    expect(stacked.warnings.map((w) => `${w.code}@${w.path}`)).toContain('series-option-unsupported@series[0].stack')
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
