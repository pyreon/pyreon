import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import { invertCategories, renderChart, stateFill } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd } from './types'

const measure = (t: string, s: number) => t.length * s * 0.6
const rects = (cmds: DrawCmd[]) => cmds.filter((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect')

describe('per-datum colour (itemColors) — a datum\'s itemStyle.color and colorBy: data', () => {
  it('reads a datum\'s own itemStyle.color, leaving the others on the series colour', () => {
    const c = compileOption({ xAxis: { data: ['a', 'b', 'c'] }, yAxis: {}, series: [{ type: 'bar', data: [1, { value: 2, itemStyle: { color: '#ff0000' } }, 3], itemStyle: { color: '#0000ff' } }] })
    expect(c.spec.series[0]!.itemColors).toEqual(['', '#ff0000', ''])
    expect(c.warnings).toEqual([])
    const fills = rects(renderChart(c.spec, measure)).map((r) => r.fill).filter((f) => f === '#ff0000' || f === '#0000ff')
    expect(fills).toEqual(['#0000ff', '#ff0000', '#0000ff'])
  })

  it('colorBy "data" colours each datum from the palette', () => {
    const c = compileOption({ color: ['#111111', '#222222'], xAxis: { data: ['a', 'b', 'c'] }, yAxis: {}, series: [{ type: 'bar', colorBy: 'data', data: [1, 2, 3] }] })
    expect(c.spec.series[0]!.itemColors).toEqual(['#111111', '#222222', '#111111'])
  })

  it('no per-datum colour leaves the field absent (the series is unchanged)', () => {
    expect(compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }).spec.series[0]!.itemColors).toBeUndefined()
  })

  it('stateFill prefers the datum colour, and the states act on it', () => {
    const s: Series = { kind: 'bars', values: [1, 2], color: '#000000', width: 2, radius: 3, label: 'A', itemColors: ['', '#ff0000'] }
    const spec = { series: [s] } as unknown as ChartSpec
    expect(stateFill(spec, s, 0, '#000000')).toBe('#000000')
    expect(stateFill(spec, s, 1, '#000000')).toBe('#ff0000')
    expect(stateFill(spec, s, 5, '#000000')).toBe('#000000')
  })

  it('an inverted category axis reverses the colours with the values', () => {
    const c = compileOption({ xAxis: { data: ['a', 'b'], inverse: true }, yAxis: {}, series: [{ type: 'bar', data: [{ value: 1, itemStyle: { color: '#ff0000' } }, 2] }] })
    const inv = invertCategories(c.spec)
    expect(inv.series[0]!.itemColors).toEqual(['', '#ff0000'])
  })
})

describe('silent and the series source map', () => {
  it('records silent series and maps compiled series back to the option\'s indices', () => {
    const c = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }, { type: 'wobble', data: [1] }, { type: 'line', data: [2], silent: true }] })
    expect(c.seriesSource).toEqual([0, 2])
    expect(c.silent).toEqual([1])
  })
  it('id, colorBy, cursor, tooltip and universalTransition are known series keys (no "no mapping" warning)', () => {
    const c = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', id: 's1', colorBy: 'series', cursor: 'crosshair', tooltip: { formatter: '{a}' }, universalTransition: true, data: [1] }] })
    expect(c.warnings).toEqual([])
  })
})
