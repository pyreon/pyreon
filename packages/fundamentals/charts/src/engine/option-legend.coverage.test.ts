import { describe, expect, it } from 'vitest'
import { legendText, placeOptionLegend, readLegendLayout, readOptionLegend } from './option-legend'
import type { LegendEntry } from './legend'
import type { Series } from './render'
import type { DrawCmd } from './types'

// Complements option-legend.test.ts: the reading edges (icons, padding shapes,
// every layout key), each icon shape's commands and bounds, vertical wrapping,
// an empty legend, and the box round the block.
const s = (label: string, color: string): Series => ({ kind: 'line', values: [1, 2], color, label }) as Series
const series = [s('A', '#a'), s('B', '#b')]
const theme = { fontSize: 12, label: '#666' }
// 'A' at 12px measures 6 wide.
const m = (t: string, size: number): number => t.length * size * 0.5
const box = { x: 0, y: 0, w: 400, h: 300 }
const one = (icon: string, lineWidth?: number) => placeOptionLegend([{ label: 'A', color: '#a00' }], readLegendLayout({}), box, theme, m, { A: icon }, lineWidth === undefined ? {} : { A: lineWidth })
const kinds = (cmds: DrawCmd[]): string[] => cmds.map((c) => c.kind)

describe('readOptionLegend — reading edges', () => {
  it('a legend that is not an object still shows, with the defaults', () => {
    expect(readOptionLegend(null, series)).toMatchObject({ entries: [{ label: 'A' }, { label: 'B' }], selectedMode: 'multiple', hidden: [] })
    expect(readOptionLegend(true, series)!.layout.orient).toBe('horizontal')
  })

  it('single mode with every entry off keeps the first on', () => {
    expect(readOptionLegend({ selectedMode: 'single', selected: { A: false, B: false } }, series)!.hidden).toEqual(['B'])
  })

  it('icons: legend.data[i].icon beats legend.icon, which beats the series icon, which beats roundRect', () => {
    const seriesIcons = { A: 'line:circle', B: 'line:triangle' }
    expect(readOptionLegend({}, series, seriesIcons)!.icons).toEqual(seriesIcons)
    expect(readOptionLegend({}, series)!.icons).toEqual({ A: 'roundRect', B: 'roundRect' })
    expect(readOptionLegend({ icon: 'diamond' }, series, seriesIcons)!.icons).toEqual({ A: 'diamond', B: 'diamond' })
    expect(readOptionLegend({ icon: 'diamond', data: [{ name: 'A', icon: 'pin' }, 'B', { name: 'B' }] }, series, seriesIcons)!.icons).toEqual({ A: 'pin', B: 'diamond' })
  })
})

describe('readLegendLayout — every key', () => {
  it('reads each key off the option legend', () => {
    const fmt = (n: string) => n
    expect(
      readLegendLayout({
        orient: 'vertical',
        left: 10,
        right: '5%',
        top: 'middle',
        bottom: Number.NaN,
        itemGap: 4,
        textStyle: { fontSize: 11, color: '#123' },
        formatter: fmt,
        itemWidth: 12,
        itemHeight: 8,
        padding: 2,
        align: 'right',
        inactiveColor: '#999',
        backgroundColor: '#eee',
        borderColor: '#000',
        borderWidth: 1,
      }),
    ).toEqual({
      orient: 'vertical',
      left: 10,
      right: '5%',
      top: 'middle',
      bottom: undefined,
      itemGap: 4,
      fontSize: 11,
      color: '#123',
      formatter: fmt,
      itemWidth: 12,
      itemHeight: 8,
      padding: [2, 2, 2, 2],
      align: 'right',
      inactiveColor: '#999',
      background: '#eee',
      borderColor: '#000',
      borderWidth: 1,
    })
  })

  it('defaults, and wrong types fall back to them', () => {
    const d = readLegendLayout({ itemGap: '4', formatter: 3, align: 'center', backgroundColor: 'transparent', textStyle: 'x' })
    expect(d).toMatchObject({ orient: 'horizontal', itemGap: undefined, formatter: undefined, fontSize: undefined, itemWidth: 25, itemHeight: 14, align: 'auto', inactiveColor: '#cfd2d7', background: undefined, borderWidth: 0 })
    expect(readLegendLayout({ align: 'left' }).align).toBe('left')
  })

  it('padding: [v, h], [t, r, b, l], and any other shape is 5 all round', () => {
    expect(readLegendLayout({ padding: [1, 2] }).padding).toEqual([1, 2, 1, 2])
    expect(readLegendLayout({ padding: [1, 2, 3, 4] }).padding).toEqual([1, 2, 3, 4])
    expect(readLegendLayout({ padding: [1, 2, 3] }).padding).toEqual([5, 5, 5, 5])
    expect(readLegendLayout({ padding: [1, 'x'] }).padding).toEqual([5, 5, 5, 5])
  })
})

describe('legendText', () => {
  it('no formatter is the name; a function returning nothing shows empty', () => {
    expect(legendText('A', undefined)).toBe('A')
    expect(legendText('A', () => null)).toBe('')
    expect(legendText('A', () => 42)).toBe('42')
    expect(legendText('A', '{name}-{name}')).toBe('A-A')
  })
})

describe('placeOptionLegend — icon shapes', () => {
  it('a line icon with a plain circle: a solid dot at 80% of the item height', () => {
    const p = one('line:circle', 2)
    expect(kinds(p.cmds)).toEqual(['line', 'circle', 'text'])
    expect(p.cmds[1]).toMatchObject({ radius: 14 * 0.8 * 0.5, fill: '#a00' })
    // Icon spans -1..26 (the stroke overhangs), text 30..36; the dot 1.4..12.6 is inside the text's 1..13.
    expect(p.boxes[0]!.w).toBe(37)
    expect(p.boxes[0]!.h).toBe(12)
  })

  it('a line icon with symbol "none" still draws the dot', () => {
    expect(kinds(one('line:none').cmds)).toEqual(['line', 'circle', 'text'])
  })

  it('a line icon with another symbol draws it as a polygon; roundRect is drawn as a rect', () => {
    const tri = one('line:triangle')
    expect(kinds(tri.cmds)).toEqual(['line', 'polygon', 'text'])
    expect((tri.cmds[1] as { points: unknown[] }).points).toHaveLength(3)
    const rr = one('line:roundRect')
    expect((rr.cmds[1] as { points: unknown[] }).points).toHaveLength(4)
  })

  it('an empty circle on a line widens the icon box by the 1px ring', () => {
    // Dot spans 1.4..12.6; the ring adds 1 each side: 0.4..13.6.
    expect(one('line:emptyCircle').boxes[0]!.h).toBeCloseTo(13.2, 9)
  })

  it('"rect" is a square-cornered rect; "roundRect" rounds its corners', () => {
    const r = one('rect').cmds[0]
    expect(r).toMatchObject({ kind: 'rect', rect: { w: 25, h: 14 } })
    expect((r as { corners?: unknown }).corners).toBeUndefined()
    expect(one('roundRect').cmds[0]).toMatchObject({ corners: [3.5, 3.5, 3.5, 3.5] })
  })

  it('a symbol keeps its aspect: a square of the smaller side, centred in the item box', () => {
    const d = one('diamond')
    expect(kinds(d.cmds)).toEqual(['polygon', 'text'])
    const pts = (d.cmds[0] as { points: { x: number; y: number }[] }).points
    const xs = pts.map((p) => p.x)
    // 14 wide, centred in 25: 5.5..19.5.
    expect(Math.max(...xs) - Math.min(...xs)).toBe(14)
    expect((Math.max(...xs) + Math.min(...xs)) / 2 - d.boxes[0]!.x).toBeCloseTo(12.5 - 5.5, 9)
  })

  it('a plain circle symbol is one disc; an empty one is a colour ring round white', () => {
    const c = one('circle')
    expect(kinds(c.cmds)).toEqual(['circle', 'text'])
    expect(c.cmds[0]).toMatchObject({ radius: 7, fill: '#a00' })
    const e = one('emptyCircle')
    expect(e.cmds.slice(0, 2)).toMatchObject([
      { kind: 'circle', radius: 8, fill: '#a00' },
      { kind: 'circle', radius: 6, fill: '#ffffff' },
    ])
    // The ring widens the icon box by 1 each side: 4.5..20.5 across, -1..15 down.
    expect(e.boxes[0]!.h).toBe(16)
  })

  it('align "right" puts the text before the icon, end-anchored', () => {
    const p = placeOptionLegend([{ label: 'A', color: '#a00' }], readLegendLayout({ align: 'right' }), box, theme, m)
    const icon = p.cmds[0] as { rect: { x: number } }
    const text = p.cmds[1] as { at: { x: number }; align: string }
    expect(text.align).toBe('end')
    expect(text.at.x).toBe(icon.rect.x - 5)
  })

  it('auto align: a vertical legend placed at the right puts the text first; horizontal does not', () => {
    const v = placeOptionLegend([{ label: 'A', color: '#a00' }], readLegendLayout({ orient: 'vertical', left: 'right' }), box, theme, m)
    expect((v.cmds[1] as { align: string }).align).toBe('end')
    expect(v.side).toBe('right')
    const h = placeOptionLegend([{ label: 'A', color: '#a00' }], readLegendLayout({ left: 'right' }), box, theme, m)
    expect((h.cmds[1] as { align: string }).align).toBe('start')
  })

  it('a missing layout reads as the defaults', () => {
    const entries: LegendEntry[] = [{ label: 'A', color: '#a00' }]
    expect(placeOptionLegend(entries, undefined, box, theme, m)).toEqual(placeOptionLegend(entries, readLegendLayout({}), box, theme, m))
  })
})

describe('placeOptionLegend — layout', () => {
  const two: LegendEntry[] = [{ label: 'A', color: '#a' }, { label: 'B', color: '#b' }]

  it('vertical: entries stack while they fit, then wrap into a new column', () => {
    // Each entry is 36 × 14. Room below: 60 - 15 (bottom) - 10 (padding) = 35, so the second entry wraps.
    const p = placeOptionLegend(two, readLegendLayout({ orient: 'vertical' }), { x: 0, y: 0, w: 400, h: 60 }, theme, m)
    expect(p.boxes[1]!.y).toBe(p.boxes[0]!.y)
    expect(p.boxes[1]!.x - p.boxes[0]!.x).toBe(36 + 8)
    const tall = placeOptionLegend(two, readLegendLayout({ orient: 'vertical' }), box, theme, m)
    expect(tall.boxes[1]!.x).toBe(tall.boxes[0]!.x)
    expect(tall.boxes[1]!.y - tall.boxes[0]!.y).toBe(14 + 8)
  })

  it('left and right both in pixels bound the row width, which wraps the second entry', () => {
    // Room: 100 - 10 - 20 - 10 (padding) = 60; two entries need 36 + 8 + 36.
    const p = placeOptionLegend(two, readLegendLayout({ left: 10, right: 20 }), { x: 0, y: 0, w: 100, h: 300 }, theme, m)
    expect(p.boxes[1]!.x).toBe(p.boxes[0]!.x)
    expect(p.boxes[1]!.y - p.boxes[0]!.y).toBe(14 + 8)
    expect(p.boxes[0]!.x).toBe(15)
  })

  it('a bare numeric string position is pixels; top "middle" centres a vertical legend', () => {
    expect(placeOptionLegend(two, readLegendLayout({ left: '30' }), box, theme, m).rect.x).toBe(35)
    const v = placeOptionLegend(two, readLegendLayout({ orient: 'vertical', top: 'middle' }), box, theme, m)
    expect(v.rect.y + v.rect.h / 2).toBeCloseTo(150, 9)
  })

  it('an empty legend is a zero-size block at its anchor with nothing drawn', () => {
    const p = placeOptionLegend([], readLegendLayout({}), box, theme, m)
    expect(p.cmds).toEqual([])
    expect(p.boxes).toEqual([])
    // Centred, 15 + 5 above the bottom.
    expect(p.rect).toEqual({ x: 200, y: 280, w: 0, h: 0 })
    expect(p.side).toBe('bottom')
  })

  it('a background fills the block plus its padding, under the entries', () => {
    const p = placeOptionLegend(two, readLegendLayout({ backgroundColor: '#eee' }), box, theme, m)
    expect(p.cmds[0]).toEqual({ kind: 'rect', rect: { x: p.rect.x - 5, y: p.rect.y - 5, w: p.rect.w + 10, h: p.rect.h + 10 }, fill: '#eee' })
    expect(p.cmds.some((c) => c.kind === 'polyline')).toBe(false)
  })

  it('a border outlines the padded block, in the default grey or its own colour', () => {
    const p = placeOptionLegend(two, readLegendLayout({ borderWidth: 2 }), box, theme, m)
    expect(p.cmds[0]!.kind).toBe('polyline')
    const outline = p.cmds[0] as { points: { x: number; y: number }[]; stroke: string; width: number }
    expect(outline).toMatchObject({ stroke: '#b7b9be', width: 2 })
    expect(outline.points[0]).toEqual({ x: p.rect.x - 5, y: p.rect.y - 5 })
    expect(outline.points[2]).toEqual({ x: p.rect.x + p.rect.w + 5, y: p.rect.y + p.rect.h + 5 })
    const both = placeOptionLegend(two, readLegendLayout({ backgroundColor: '#eee', borderWidth: 1, borderColor: '#f00' }), box, theme, m)
    expect(kinds(both.cmds).slice(0, 2)).toEqual(['rect', 'polyline'])
    expect(both.cmds[1]).toMatchObject({ stroke: '#f00' })
  })

  it('a muted entry draws its icon and its text in the inactive colour', () => {
    const p = placeOptionLegend([{ label: 'A', color: '#a00', muted: true }], readLegendLayout({ inactiveColor: '#ccc', textStyle: { color: '#123' } }), box, theme, m)
    expect(p.cmds.map((c) => (c as { fill?: string }).fill)).toEqual(['#ccc', '#ccc'])
    const on = placeOptionLegend([{ label: 'A', color: '#a00' }], readLegendLayout({ textStyle: { color: '#123' } }), box, theme, m)
    expect(on.cmds.map((c) => (c as { fill?: string }).fill)).toEqual(['#a00', '#123'])
  })
})
