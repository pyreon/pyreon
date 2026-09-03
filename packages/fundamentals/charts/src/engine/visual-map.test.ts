import { describe, expect, it } from 'vitest'
import { domainFromSeries, renderVisualMap, visualMapCommands, visualMapSpec } from './visual-map'
import { optionToSvg } from './option'

const heat = { visualMap: { min: 0, max: 10, inRange: { color: ['#000000', '#ffffff'] } }, xAxis: { data: ['a', 'b'] }, yAxis: { data: ['r'] }, series: [{ type: 'heatmap', data: [[0, 0, 2], [1, 0, 9]] }] }

describe('visualMap spec', () => {
  it('reads stops, min/max, orient, text, type; hides on show:false; domain falls back to the data extent', () => {
    const r = visualMapSpec(heat)!
    expect(r.spec.type).toBe('continuous')
    expect(r.spec.orient).toBe('vertical')
    expect(r.spec.domain).toEqual([0, 10])
    expect(r.spec.stops).toEqual(['#000000', '#ffffff'])
    expect(visualMapSpec({ ...heat, visualMap: { show: false } })).toBeNull()
    expect(visualMapSpec({ series: [] })).toBeNull()
    const auto = visualMapSpec({ visualMap: {}, series: heat.series })!
    expect(auto.spec.domain).toEqual([2, 9])
    expect(auto.spec.stops.length).toBeGreaterThanOrEqual(2)
    expect(domainFromSeries({ series: [{ data: [3, { value: 7 }, [1, 5]] }] })).toEqual([3, 7])
    const txt = visualMapSpec({ visualMap: { text: ['Hot', 'Cold'], orient: 'horizontal', calculable: true }, series: heat.series })!
    expect(txt.spec.text).toEqual(['Hot', 'Cold'])
    expect(txt.spec.orient).toBe('horizontal')
    expect(txt.warnings.map((w) => w.code)).toEqual(['series-option-unsupported'])
  })
  it('piecewise: explicit pieces, categories, or splitNumber over the domain (high first)', () => {
    const explicit = visualMapSpec({ visualMap: { type: 'piecewise', pieces: [{ min: 5, max: 10, label: 'high', color: '#ff0000' }, { max: 5 }] }, series: heat.series })!
    expect(explicit.spec.pieces.map((p) => p.label)).toEqual(['high', '≤ 5'])
    expect(explicit.spec.pieces[0]!.color).toBe('#ff0000')
    const cats = visualMapSpec({ visualMap: { type: 'piecewise', categories: ['x', 'y'] }, series: heat.series })!
    expect(cats.spec.pieces.map((p) => p.label)).toEqual(['x', 'y'])
    const split = visualMapSpec({ visualMap: { type: 'piecewise', splitNumber: 2, min: 0, max: 10 }, series: heat.series })!
    expect(split.spec.pieces.map((p) => p.label)).toEqual(['5 – 10', '0 – 5'])
    expect(split.spec.pieces[0]!.min).toBe(5)
  })
})

describe('visualMap render', () => {
  it('continuous vertical: stripes top-high, end labels, reported size; horizontal mirrors', () => {
    const spec = visualMapSpec(heat)!.spec
    const v = renderVisualMap(spec, { x: 0, y: 0 })
    const rects = v.cmds.filter((c) => c.kind === 'rect')
    expect(rects).toHaveLength(24)
    const first = rects[0]!
    const last = rects[23]!
    if (first.kind !== 'rect' || last.kind !== 'rect') throw new Error('rect')
    expect(first.fill).not.toBe(last.fill)
    expect(first.rect.y).toBeLessThan(last.rect.y)
    const labels = v.cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))
    expect(labels).toEqual(['10', '0'])
    expect(v.height).toBeGreaterThan(spec.itemLength)
    const h = renderVisualMap({ ...spec, orient: 'horizontal' }, { x: 0, y: 0 })
    const hr = h.cmds.filter((c) => c.kind === 'rect')
    if (hr[0]!.kind !== 'rect' || hr[23]!.kind !== 'rect') throw new Error('rect')
    expect(hr[0]!.rect.x).toBeLessThan(hr[23]!.rect.x)
    expect(h.height).toBe(spec.itemSize)
  })
  it('piecewise: one swatch + label per piece, stacked vertically or in a row', () => {
    const spec = visualMapSpec({ visualMap: { type: 'piecewise', categories: ['x', 'y', 'z'] }, series: heat.series })!.spec
    const v = renderVisualMap(spec, { x: 0, y: 0 })
    expect(v.cmds.filter((c) => c.kind === 'rect')).toHaveLength(3)
    expect(v.cmds.filter((c) => c.kind === 'text')).toHaveLength(3)
    const row = renderVisualMap({ ...spec, orient: 'horizontal' }, { x: 0, y: 0 })
    expect(row.height).toBe(spec.itemSize)
    expect(row.width).toBeGreaterThan(v.width)
  })
  it('visualMapCommands anchors bottom-left by default and honours left/right/top/bottom', () => {
    const d = visualMapCommands(heat, 400, 300)
    expect(d.box).not.toBeNull()
    expect(d.box!.x).toBe(8)
    expect(d.box!.y + d.box!.h).toBeCloseTo(292, 9)
    const tr = visualMapCommands({ ...heat, visualMap: { ...heat.visualMap, right: 10, top: 'center' } }, 400, 300)
    expect(tr.box!.x + tr.box!.w).toBeCloseTo(390, 9)
    expect(tr.box!.y).toBeCloseTo((300 - tr.box!.h) / 2, 9)
    expect(visualMapCommands({ series: [] }, 400, 300).cmds).toEqual([])
  })
  it('optionToSvg appends the strip to a heatmap and to a calendar option', () => {
    const svg = optionToSvg(heat, { width: 400, height: 300 })
    expect(svg.split('<rect').length - 1).toBeGreaterThanOrEqual(24 + 2)
    expect(svg).toContain('>10<')
    const cal = optionToSvg({ calendar: { range: '2024-01' }, visualMap: { min: 0, max: 5, orient: 'horizontal' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2024-01-02', 3]] }] }, { width: 400, height: 200 })
    expect(cal).toContain('>5<')
    const none = optionToSvg({ ...heat, visualMap: { ...heat.visualMap, show: false } }, { width: 400, height: 300 })
    expect(none.split('<rect').length - 1).toBeLessThan(24)
  })
})
