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
  // Positions are ECharts' getLayoutRect inside the legend's 5px padding; the
  // exact geometry is held against ECharts in echarts-differential.
  it('horizontal, centred 15 above the bottom by default (ECharts 6)', () => {
    const p = at({})
    expect(p.side).toBe('bottom')
    expect(p.rect.y + p.rect.h).toBeCloseTo(300 - 15 - 5, 5)
    expect(p.rect.x + p.rect.w / 2).toBeCloseTo(200, 5)
  })
  it('left / right keywords, pixels and percents; right alone measures from the right', () => {
    expect(at({ left: 'left' }).rect.x).toBe(5)
    expect(at({ left: 'right' }).rect.x + at({ left: 'right' }).rect.w).toBeCloseTo(395, 5)
    expect(at({ left: 30 }).rect.x).toBe(35)
    expect(at({ left: '10%' }).rect.x).toBe(45)
    const r = at({ right: 10 })
    expect(r.rect.x + r.rect.w).toBeCloseTo(385, 5)
  })
  it('bottom / top place it; a legend in the top half reserves the top, the bottom half the bottom', () => {
    const b = at({ bottom: 0 })
    expect(b.side).toBe('bottom')
    expect(b.rect.y + b.rect.h).toBeCloseTo(295, 5)
    expect(at({ top: 'bottom' }).side).toBe('bottom')
    expect(at({ top: 40 }).side).toBe('top')
    expect(at({ top: 40 }).rect.y).toBe(45)
    expect(at({ top: 'middle' }).rect.y).toBeCloseTo((300 - at({}).rect.h) / 2, 5)
  })
  it('icons: a rounded rect by default, a line with its symbol, a symbol; a hidden entry greys out', () => {
    const icons = { Alpha: 'line:emptyCircle', Beta: 'triangle' }
    const p = placeOptionLegend([{ label: 'Alpha', color: '#a00' }, { label: 'Beta', color: '#0a0', muted: true }], readLegendLayout({}), box, theme, m, icons, { Alpha: 3 })
    expect(p.cmds.filter((c) => c.kind === 'line')).toMatchObject([{ stroke: '#a00', width: 3 }])
    // The empty circle: a ring of the series colour round white.
    expect(p.cmds.filter((c) => c.kind === 'circle').map((c) => (c.kind === 'circle' ? c.fill : ''))).toEqual(['#a00', '#ffffff'])
    const tri = p.cmds.find((c) => c.kind === 'polygon')
    expect(tri).toMatchObject({ fill: '#cfd2d7' })
    const plain = placeOptionLegend(entries, readLegendLayout({}), box, theme, m)
    expect(plain.cmds.filter((c) => c.kind === 'rect')).toMatchObject([{ rect: { w: 25, h: 14 }, corners: [3.5, 3.5, 3.5, 3.5] }, { rect: { w: 25, h: 14 } }])
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
