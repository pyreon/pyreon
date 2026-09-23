import { describe, expect, it } from 'vitest'
import { compileOption, compiledCommands } from './option'
import type { EChartsOption } from './option'
import { barsFor, renderChart } from './render'
import type { ChartSpec } from './render'
import { measureApprox } from './svg'
import { tooltipAxisCells, tooltipItemCells } from './tooltip'

const m = measureApprox()

describe('horizontal options', () => {
  it('a category y axis over a line series keeps the upright chart and names why', () => {
    const c = compileOption({ xAxis: { type: 'value' }, yAxis: { type: 'category', data: ['a', 'b'] }, series: [{ type: 'bar', data: [1, 2] }, { type: 'line', data: [1, 2] }] } as EChartsOption)
    expect(c.spec.horizontal).toBeUndefined()
    expect(c.warnings.some((w) => w.path === 'yAxis.type')).toBe(true)
  })

  it('a log value axis flips too, with the bands counted from the bottom', () => {
    const c = compileOption({ xAxis: { type: 'log' }, yAxis: { type: 'category', data: ['a', 'b'] }, series: [{ type: 'bar', data: [10, 100] }] } as EChartsOption, { width: 400, height: 300 })
    expect(c.spec.horizontal).toBe(true)
    expect(c.spec.bandsFromBottom).toBe(true)
    const [a, b] = barsFor(c.spec, 0, m)
    // The first category is the lower band.
    expect(a!.y).toBeGreaterThan(b!.y)
  })

  it('without bandsFromBottom the bands run down from the top (the PlotChart frame)', () => {
    const c = compileOption({ xAxis: { type: 'value' }, yAxis: { type: 'category', data: ['a', 'b'] }, series: [{ type: 'bar', data: [1, 2] }] } as EChartsOption, { width: 400, height: 300 })
    const topDown: ChartSpec = { ...c.spec, bandsFromBottom: false }
    const [a, b] = barsFor(topDown, 0, m)
    expect(a!.y).toBeLessThan(b!.y)
    // The category bands follow the same order.
    const bands = renderChart({ ...topDown, xSplitArea: ['#010101', '#020202'] }, m).filter((d) => d.kind === 'rect' && (d.fill === '#010101' || d.fill === '#020202'))
    expect(bands.map((d) => (d as { fill: string }).fill)).toEqual(['#010101', '#020202'])
  })
})

describe('a vertical scroll legend with a background and border', () => {
  it('draws the block backdrop and its outline around the column', () => {
    const names = Array.from({ length: 20 }, (_, i) => `Series number ${i}`)
    const option = { legend: { type: 'scroll', orient: 'vertical', right: 0, top: 0, backgroundColor: '#fafafa', borderWidth: 1 }, xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: names.map((name) => ({ type: 'bar', name, data: [1] })) } as EChartsOption
    const cmds = compiledCommands(compileOption(option, { width: 400, height: 200 }), option, m).cmds
    expect(cmds.some((d) => d.kind === 'rect' && d.fill === '#fafafa')).toBe(true)
    expect(cmds.some((d) => d.kind === 'clip')).toBe(true)
  })
})

describe('tooltip cells — every row shape', () => {
  const cats = ['Mon']
  it('a band row shows its range, a bubble its size, a text dimension its text', () => {
    const band = { label: 'B', values: [5], values2: [2], color: '#111' }
    const bubble = { label: 'U', values: [5], rValues: [30], color: '#222' }
    const withText = { label: 'T', values: [5], color: '#333', extras: [{ label: 'note', texts: ['hi'] }] }
    expect(tooltipAxisCells(0, cats, [band, bubble], [true, true])).toEqual(['Mon', '#111', 'B', '2 - 5', '#222', 'U', '5 (30)'])
    expect(tooltipItemCells(0, cats, withText, true)).toEqual(['T', '#333', 'Mon', '5', '#333', 'note', 'hi'])
    expect(tooltipAxisCells(0, [], [{ label: 'X', values: [Number.NaN], color: '#000' }], [true])).toEqual([])
  })
})
