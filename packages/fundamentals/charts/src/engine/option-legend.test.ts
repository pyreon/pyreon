import { describe, expect, it } from 'vitest'
import { applyLegendHidden, legendClick, legendText, placeOptionLegend, readLegendLayout, readOptionLegend } from './option-legend'
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
    expect(readOptionLegend({}, series)).toMatchObject({ entries: [{ label: 'A', color: '#a' }, { label: 'B', color: '#b' }], selectedMode: 'multiple', hidden: [] })
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

describe('legend placement (ECharts defaults and keys)', () => {
  const entries = [{ label: 'Alpha', color: '#a' }, { label: 'Beta', color: '#b' }]
  const box = { x: 0, y: 0, w: 400, h: 300 }
  const theme = { fontSize: 12, label: '#666' }
  const m = (t: string) => t.length * 6
  const at = (l: Record<string, unknown>) => placeOptionLegend(entries, readLegendLayout(l), box, theme, m)
  it('horizontal, centred at the top by default', () => {
    const p = at({})
    expect(p.side).toBe('top')
    expect(p.rect.y).toBe(0)
    expect(p.rect.x + p.rect.w / 2).toBeCloseTo(200, 5)
  })
  it('left / right keywords, pixels and percents; right alone measures from the right', () => {
    expect(at({ left: 'left' }).rect.x).toBe(0)
    expect(at({ left: 'right' }).rect.x + at({ left: 'right' }).rect.w).toBeCloseTo(400, 5)
    expect(at({ left: 30 }).rect.x).toBe(30)
    expect(at({ left: '10%' }).rect.x).toBe(40)
    const r = at({ right: 10 })
    expect(r.rect.x + r.rect.w).toBeCloseTo(390, 5)
  })
  it('bottom puts it at the bottom; top pixels move it down (an overlay)', () => {
    const b = at({ bottom: 0 })
    expect(b.side).toBe('bottom')
    expect(b.rect.y + b.rect.h).toBeCloseTo(300, 5)
    expect(at({ top: 'bottom' }).side).toBe('bottom')
    expect(at({ top: 40 }).side).toBe('over')
    expect(at({ top: 'middle' }).rect.y).toBeCloseTo((300 - at({}).rect.h) / 2, 5)
  })
  it('vertical: stacked, on the side it sits', () => {
    const v = at({ orient: 'vertical', right: 0, top: 'middle' })
    expect(v.side).toBe('right')
    expect(v.boxes[1]!.y).toBeGreaterThan(v.boxes[0]!.y)
    expect(at({ orient: 'vertical', left: 0 }).side).toBe('left')
  })
  it('formatter (template or function), itemGap and textStyle', () => {
    expect(legendText('A', '{name}!')).toBe('A!')
    expect(legendText('A', (n: string) => n + '?')).toBe('A?')
    expect(legendText('A', undefined)).toBe('A')
    const p = placeOptionLegend(entries, readLegendLayout({ formatter: 'x {name}', textStyle: { color: '#f00', fontSize: 20 }, itemGap: 30 }), box, theme, m)
    const texts = p.cmds.filter((c) => c.kind === 'text') as { text: string; fill: string; size: number }[]
    expect(texts.map((t) => t.text)).toEqual(['x Alpha', 'x Beta'])
    expect(texts[0]).toMatchObject({ fill: '#f00', size: 20 })
  })
})
