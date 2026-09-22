import { describe, expect, it } from 'vitest'
import { applyLegendHidden, legendClick, readOptionLegend } from './option-legend'
import { compileOption } from './option'
import type { Series } from './render'

const s = (label: string, color: string, values = [1, 2]): Series => ({ kind: 'line', values, color, label }) as Series
const series = [s('A', '#a'), s('B', '#b'), s('A', '#c')]

describe('readOptionLegend', () => {
  it('no legend, or show false: none', () => {
    expect(readOptionLegend(undefined, series)).toBeNull()
    expect(readOptionLegend({ show: false }, series)).toBeNull()
  })
  it('one entry per name, the first series\' colour, in series order', () => {
    expect(readOptionLegend({}, series)).toEqual({ entries: [{ label: 'A', color: '#a' }, { label: 'B', color: '#b' }], selectedMode: 'multiple', hidden: [] })
  })
  it('legend.data picks and orders entries; unknown names are skipped; object form reads name', () => {
    expect(readOptionLegend({ data: ['B', { name: 'A' }, 'Z', 7] }, series)!.entries.map((e) => e.label)).toEqual(['B', 'A'])
  })
  it('legend.selected turns names off; array legend reads the first', () => {
    expect(readOptionLegend([{ selected: { B: false, A: true } }], series)!.hidden).toEqual(['B'])
  })
  it('selectedMode: false and single; single keeps exactly the first on-entry', () => {
    expect(readOptionLegend({ selectedMode: false }, series)!.selectedMode).toBe(false)
    expect(readOptionLegend({ selectedMode: 'single' }, series)!.hidden).toEqual(['B'])
    expect(readOptionLegend({ selectedMode: 'single', selected: { A: false } }, series)!.hidden).toEqual(['A'])
  })
})

describe('legendClick', () => {
  it('multiple toggles; single keeps only the clicked one; false does nothing', () => {
    expect(legendClick([], 'A', ['A', 'B'], 'multiple')).toEqual(['A'])
    expect(legendClick(['A'], 'A', ['A', 'B'], 'multiple')).toEqual([])
    expect(legendClick([], 'B', ['A', 'B'], 'single')).toEqual(['A'])
    const h = ['A']
    expect(legendClick(h, 'B', ['A', 'B'], false)).toBe(h)
  })
})

describe('applyLegendHidden', () => {
  it('empties every series of a hidden name (keeping its slot) and mutes its entry', () => {
    const entries = [{ label: 'A', color: '#a' }, { label: 'B', color: '#b' }]
    const out = applyLegendHidden(series, entries, ['A'])
    expect(out.series.map((x) => x.values.length)).toEqual([0, 2, 0])
    expect(out.entries).toEqual([{ label: 'A', color: '#a', muted: true }, { label: 'B', color: '#b' }])
    expect(applyLegendHidden(series, entries, [])).toEqual({ series, entries })
  })
})

describe('compiled legend', () => {
  it('carries the mode and the names legend.selected starts off', () => {
    const c = compileOption({ legend: { selected: { B: false } }, xAxis: { data: ['x'] }, yAxis: {}, series: [{ type: 'bar', name: 'A', data: [1] }, { type: 'bar', name: 'B', data: [2] }] })
    expect(c.legendMode).toBe('multiple')
    expect(c.legendHidden).toEqual(['B'])
    expect(compileOption({ xAxis: { data: ['x'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }).legendMode).toBeUndefined()
  })
})
