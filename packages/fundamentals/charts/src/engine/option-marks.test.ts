import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import { defaultTheme, renderChart } from './render'
import type { Annotation, ChartSpec, PointMarker } from './render'
import type { DrawCmd, Double } from './types'

/**
 * markLine / markPoint — the ECharts spellings beyond max/min/coord: `median`,
 * `average` points, point-to-point lines, category-named coords, per-mark
 * styles. The facade resolves them to the engine's Annotation / PointMarker
 * contract; the engine draws segments and nearest-to-mean markers.
 */
const measure = (text: string, _s: Double): Double => text.length * 7.0
const opt = (series: Record<string, unknown>, xAxis: Record<string, unknown> = { type: 'category', data: ['a', 'b', 'c', 'd'] }) =>
  compileOption({ xAxis, yAxis: {}, series: [{ type: 'line', data: [3, 9, 1, 6], ...series }] })

describe('markLine spellings', () => {
  it('median is a y rule; per-mark and markLine-level lineStyle colours win over the series colour', () => {
    const { spec, warnings } = opt({ lineStyle: { color: '#111111' }, markLine: { lineStyle: { color: '#aaaaaa' }, data: [{ type: 'median' }, { type: 'max', lineStyle: { color: '#bbbbbb' } }, { yAxis: 2 }] } })
    expect(warnings).toEqual([])
    expect(spec.annotations).toEqual([
      { y: 4.5, label: 'median', color: '#aaaaaa' },
      { y: 9, label: 'max', color: '#bbbbbb' },
      { y: 2, label: undefined, color: '#aaaaaa' },
    ])
  })

  it('a [from, to] pair is a segment: statistics pick datums, coords name categories, axis pairs are literal', () => {
    const { spec, warnings } = opt({ markLine: { data: [
      [{ type: 'max', name: 'range' }, { type: 'min' }],
      [{ coord: ['a', 2] }, { coord: ['d', 8] }],
      [{ xAxis: 0.5, yAxis: 1 }, { xAxis: 2.5, yAxis: 7 }],
      [{ type: 'average' }, { coord: ['zzz', 1] }],
    ] } })
    expect(warnings.map((w) => w.code + '@' + w.path)).toEqual(['mark-shape-unsupported@series[0].markLine.data[3]'])
    expect(spec.annotations).toEqual([
      { x1: 1, y1: 9, x2: 2, y2: 1, label: 'range', color: spec.series[0]!.color },
      { x1: 0, y1: 2, x2: 3, y2: 8, label: undefined, color: spec.series[0]!.color },
      { x1: 0.5, y1: 1, x2: 2.5, y2: 7, label: undefined, color: spec.series[0]!.color },
    ])
  })

  it('on a continuous x the segment endpoints carry the datum x, not its index', () => {
    const { spec } = compileOption({ xAxis: { type: 'value' }, yAxis: {}, series: [{ type: 'line', data: [[10, 3], [20, 9], [30, 1]], markLine: { data: [[{ type: 'max' }, { type: 'min' }]] } }] })
    expect(spec.annotations).toEqual([{ x1: 20, y1: 9, x2: 30, y2: 1, label: undefined, color: spec.series[0]!.color }])
  })
})

describe('markPoint spellings', () => {
  it('average anchors by name; a category-named coord resolves to its index; value labels a nameless mark', () => {
    const { spec, warnings } = opt({ markPoint: { data: [{ type: 'average', name: 'avg' }, { coord: ['c', 1], value: 42 }] } })
    expect(warnings).toEqual([])
    expect(spec.markers).toEqual([
      { seriesIndex: 0, at: 'average', label: 'avg' },
      { seriesIndex: 0, atIndex: 2, label: '42' },
    ])
  })

  it('itemStyle colour and symbolSize (a diameter) map per mark, with markPoint-level defaults', () => {
    const { spec } = opt({ markPoint: { itemStyle: { color: '#ff0000' }, symbolSize: 20, data: [{ type: 'max' }, { type: 'min', itemStyle: { color: '#00ff00' }, symbolSize: 8 }] } })
    expect(spec.markers).toEqual([
      { seriesIndex: 0, at: 'max', label: undefined, color: '#ff0000', radius: 10 },
      { seriesIndex: 0, at: 'min', label: undefined, color: '#00ff00', radius: 4 },
    ])
  })

  it('a continuous-x coord anchors the nearest datum; a non-y valueDim warns and is ignored', () => {
    const { spec, warnings } = compileOption({ xAxis: { type: 'value' }, yAxis: {}, series: [{ type: 'line', data: [[10, 3], [20, 9], [30, 1]], markPoint: { data: [{ coord: [24, 5] }, { type: 'max', valueDim: 'x' }] } }] })
    expect(warnings.map((w) => w.code + '@' + w.path)).toEqual(['mark-shape-unsupported@series[0].markPoint.data[1].valueDim'])
    expect(spec.markers).toEqual([{ seriesIndex: 0, atIndex: 1, label: undefined }, { seriesIndex: 0, at: 'max', label: undefined }])
  })
})

describe('engine: segment annotations and average markers', () => {
  const base = (annotations: Annotation[], markers: PointMarker[]): ChartSpec => ({
    width: 400.0,
    height: 200.0,
    series: [{ kind: 'line', values: [3.0, 9.0, 1.0, 6.0], color: '#123456', width: 2.0, radius: 3.0, label: 's' }],
    categories: [],
    theme: defaultTheme,
    showXAxis: false,
    showYAxis: false,
    showGrid: false,
    annotations,
    markers,
  })
  const lines = (cmds: DrawCmd[]) => cmds.filter((c) => c.kind === 'line' && c.dash !== undefined)

  it('a segment is one dashed line from datum to datum, labelled at its end; an incomplete segment draws nothing', () => {
    const cmds = renderChart(base([{ x1: 1.0, y1: 9.0, x2: 2.0, y2: 1.0, label: 'drop', color: '#abcdef' }, { x1: 0.0, y1: 1.0 }], []), measure)
    const seg = lines(cmds)
    expect(seg).toHaveLength(1)
    const c = seg[0]!
    if (c.kind !== 'line') throw new Error('kind')
    expect(c.stroke).toBe('#abcdef')
    expect(c.to.x).toBeGreaterThan(c.from.x)
    expect(c.to.y).toBeGreaterThan(c.from.y)
    const label = cmds.find((k) => k.kind === 'text' && k.text === 'drop')
    if (label === undefined || label.kind !== 'text') throw new Error('label')
    expect(label.at.x).toBe(c.to.x)
    expect(label.at.y).toBe(c.to.y - 4.0)
  })

  it('an average marker sits on the datum nearest the mean', () => {
    // mean 4.75 → nearest datum is 6 at index 3, the last point.
    const cmds = renderChart(base([], [{ at: 'average', label: 'avg' }, { atIndex: 3.0, label: 'last' }]), measure)
    const circles = cmds.filter((c) => c.kind === 'circle')
    expect(circles).toHaveLength(2)
    expect(circles[0]).toEqual(circles[1])
  })
})
