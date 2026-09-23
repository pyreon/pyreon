/**
 * ECharts' `colorBy` on family series: 'data' gives each datum its own palette
 * colour, 'series' gives every datum the series colour. Defaults are ECharts'
 * own — per datum for pie, funnel, radar, chord and theme river; the series
 * colour for a graph's uncategorised nodes.
 */
import { describe, expect, it } from 'vitest'
import { compileFamily } from './option-family'
import type { EChartsOption } from './option'
import { paletteAt } from './palette'

const plan = (o: Record<string, unknown>) => compileFamily(o as EChartsOption)!.plan as unknown as Record<string, unknown>
const P = ['#111111', '#222222', '#333333']

describe('family colorBy', () => {
  it('pie and funnel: per slice by default, one colour for colorBy "series"', () => {
    for (const type of ['pie', 'funnel']) {
      const data = [{ name: 'a', value: 1 }, { name: 'b', value: 2 }]
      const byData = plan({ color: P, series: [{ type, data }] })['rows'] as { color: string }[]
      expect(byData.map((r) => r.color)).toEqual(['#111111', '#222222'])
      const bySeries = plan({ color: P, series: [{ type, colorBy: 'series', data }] })['rows'] as { color: string }[]
      expect(bySeries.map((r) => r.color)).toEqual(['#111111', '#111111'])
    }
  })

  it('a datum\'s own colour wins over colorBy "series"', () => {
    const rows = plan({ color: P, series: [{ type: 'pie', colorBy: 'series', data: [{ value: 1, itemStyle: { color: '#abcdef' } }, { value: 2 }] }] })['rows'] as { color: string }[]
    expect(rows.map((r) => r.color)).toEqual(['#abcdef', '#111111'])
  })

  it('radar: per polygon by default; colorBy "series" gives each series its own one colour', () => {
    const radar = { indicator: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }
    const series = [
      { type: 'radar', colorBy: 'series', data: [{ value: [1, 2, 3] }, { value: [2, 3, 4] }] },
      { type: 'radar', colorBy: 'series', data: [{ value: [3, 2, 1] }] },
    ]
    expect((plan({ color: P, radar, series })['rows'] as { color: string }[]).map((r) => r.color)).toEqual(['#111111', '#111111', '#222222'])
    expect((plan({ color: P, radar, series: [{ type: 'radar', data: [{ value: [1, 2, 3] }, { value: [2, 3, 4] }] }] })['rows'] as { color: string }[]).map((r) => r.color)).toEqual(['#111111', '#222222'])
  })

  it('chord and theme river: colorBy "series" gives every arc / stream the series colour', () => {
    const chord = plan({ color: P, series: [{ type: 'chord', colorBy: 'series', data: [{ name: 'a' }, { name: 'b' }], links: [] }] })['nodes'] as { color?: string }[]
    expect(chord.map((n) => n.color)).toEqual(['#111111', '#111111'])
    const byData = plan({ series: [{ type: 'chord', data: [{ name: 'a' }], links: [] }] })['nodes'] as { color?: string }[]
    expect(byData[0]!.color).toBeUndefined()
    const river = plan({ color: P, singleAxis: {}, series: [{ type: 'themeRiver', colorBy: 'series', data: [['2024-01-01', 1, 'A'], ['2024-01-01', 2, 'B']] }] })['series'] as { color?: string }[]
    expect(river.map((r) => r.color)).toEqual(['#111111', '#111111'])
  })

  it('graph: uncategorised nodes take the series colour (or the series itemStyle colour); colorBy "data" leaves them to the palette', () => {
    const nodes = (s: Record<string, unknown>) => plan({ series: [{ type: 'graph', data: [{ name: 'a' }, { name: 'b', category: 0 }], ...s }] })['nodes'] as { color?: string }[]
    expect(nodes({}).map((n) => n.color)).toEqual([paletteAt([], 0), undefined])
    expect(nodes({ itemStyle: { color: '#0000ff' } }).map((n) => n.color)).toEqual(['#0000ff', undefined])
    expect(nodes({ colorBy: 'data' }).map((n) => n.color)).toEqual([undefined, undefined])
  })
})
