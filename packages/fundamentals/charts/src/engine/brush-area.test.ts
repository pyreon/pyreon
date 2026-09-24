import { describe, expect, it } from 'vitest'
import {
  applyBrushSelection,
  brushAreaFromDrag,
  brushAreaUsable,
  brushDatumPoints,
  brushPolygonAdd,
  brushSelection,
  pointInBrushArea,
  renderBrushAreas,
} from './brush-area'
import { defaultTheme, layoutChart, renderChart, stateFill } from './render'
import type { ChartSpec, Series } from './render'
import type { Double, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const series = (kind: Series['kind'], values: Double[], label = 'S'): Series => ({ kind, values, color: '#0f766e', width: 1.0, radius: 2.0, label })
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400.0, height: 200.0, series: [series('bars', [10, 20, 30, 40])], categories: [],
  theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, ...over,
})
const plot = { x: 40.0, y: 10.0, w: 300.0, h: 150.0 }

describe('brush areas — built from a drag, clamped to the plot', () => {
  it('a rect keeps both corners; lineX spans the height, lineY the width', () => {
    expect(brushAreaFromDrag('rect', plot, 60, 20, 100, 90).points).toEqual([{ x: 60, y: 20 }, { x: 100, y: 90 }])
    expect(brushAreaFromDrag('lineX', plot, 60, 20, 100, 90).points).toEqual([{ x: 60, y: 10 }, { x: 100, y: 160 }])
    expect(brushAreaFromDrag('lineY', plot, 60, 20, 100, 90).points).toEqual([{ x: 40, y: 20 }, { x: 340, y: 90 }])
    expect(brushAreaFromDrag('rect', plot, 0, 0, 1000, 1000).points).toEqual([{ x: 40, y: 10 }, { x: 340, y: 160 }])
  })
  it('an unknown type draws a rect', () => {
    expect(brushAreaFromDrag('circle', plot, 60, 20, 100, 90).type).toBe('rect')
  })
  it('a polygon grows by vertex and skips a jitter within 2px', () => {
    let p = brushAreaFromDrag('polygon', plot, 60, 20, 60, 20)
    p = brushPolygonAdd(p, plot, 61, 20)
    expect(p.points.length).toBe(1)
    p = brushPolygonAdd(brushPolygonAdd(p, plot, 120, 20), plot, 90, 120)
    expect(p.points).toEqual([{ x: 60, y: 20 }, { x: 120, y: 20 }, { x: 90, y: 120 }])
  })
  it('a click is not a brush; a line brush needs its own axis span only', () => {
    expect(brushAreaUsable(brushAreaFromDrag('rect', plot, 60, 20, 61, 90))).toBe(false)
    expect(brushAreaUsable(brushAreaFromDrag('rect', plot, 60, 20, 90, 90))).toBe(true)
    expect(brushAreaUsable(brushAreaFromDrag('lineX', plot, 60, 20, 90, 20))).toBe(true)
    expect(brushAreaUsable(brushAreaFromDrag('lineY', plot, 60, 20, 90, 20))).toBe(false)
    expect(brushAreaUsable(brushAreaFromDrag('polygon', plot, 60, 20, 90, 20))).toBe(false)
  })
})

describe('pointInBrushArea', () => {
  it('tests a rect inclusively, whichever corner the drag started from', () => {
    const r = brushAreaFromDrag('rect', plot, 100, 90, 60, 20)
    expect(pointInBrushArea(r, 60, 20)).toBe(true)
    expect(pointInBrushArea(r, 80, 50)).toBe(true)
    expect(pointInBrushArea(r, 101, 50)).toBe(false)
  })
  it('tests a polygon by even-odd, so a concave notch is outside', () => {
    const notch = { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 50, y: 40 }, { x: 0, y: 100 }] }
    expect(pointInBrushArea(notch, 50, 20)).toBe(true)
    expect(pointInBrushArea(notch, 50, 80)).toBe(false)
    expect(pointInBrushArea(notch, 10, 80)).toBe(true)
  })
})

describe('brushSelection — the datums inside, per series', () => {
  it('a lineX over the middle two bars selects them', () => {
    const s = spec()
    const l = layoutChart(s, measure)
    const pts = brushDatumPoints(s, l, 0)
    const area = brushAreaFromDrag('lineX', l.plot, pts[1]!.x - 2, 0, pts[2]!.x + 2, 0)
    expect(brushSelection(s, l, [area])).toEqual([{ seriesIndex: 0, dataIndex: [1, 2] }])
  })
  it('a rect selects by position on both axes, per series', () => {
    const s = spec({ series: [series('line', [10, 10, 10, 10], 'low'), series('line', [40, 40, 40, 40], 'high')] })
    const l = layoutChart(s, measure)
    const hi = brushDatumPoints(s, l, 1)
    const area = brushAreaFromDrag('rect', l.plot, l.plot.x, hi[0]!.y - 3, l.plot.x + l.plot.w, hi[0]!.y + 3)
    expect(brushSelection(s, l, [area])).toEqual([{ seriesIndex: 0, dataIndex: [] }, { seriesIndex: 1, dataIndex: [0, 1, 2, 3] }])
  })
  it('multiple areas union; a gap never selects', () => {
    const s = spec({ series: [series('line', [10, 0 / 0, 30, 40])] })
    const l = layoutChart(s, measure)
    const p = brushDatumPoints(s, l, 0)
    const a = brushAreaFromDrag('lineX', l.plot, p[0]!.x - 2, 0, p[1]!.x + 2, 0)
    const b = brushAreaFromDrag('lineX', l.plot, p[3]!.x - 2, 0, p[3]!.x + 2, 0)
    expect(brushSelection(s, l, [a, b])[0]!.dataIndex).toEqual([0, 3])
  })
  it('stacked segments place at their own segment, not the raw value', () => {
    const s = spec({ series: [series('stacked', [10, 10]), series('stacked', [10, 10])] })
    const l = layoutChart(s, measure)
    const lower = brushDatumPoints(s, l, 0)
    const upper = brushDatumPoints(s, l, 1)
    expect(upper[0]!.y).toBeLessThan(lower[0]!.y)
  })
  it('no areas selects nothing and leaves the spec alone', () => {
    const s = spec()
    const sel = brushSelection(s, layoutChart(s, measure), [])
    expect(sel[0]!.dataIndex).toEqual([])
    expect(applyBrushSelection(s, sel, false, 0.1)).toBe(s)
  })
})

describe('the selection paints — outside datums fade', () => {
  it('stateFill dims a datum outside the brush and keeps one inside', () => {
    const s = applyBrushSelection(spec(), [{ seriesIndex: 0, dataIndex: [1] }], true, 0.2)
    const sr = s.series[0]!
    expect(stateFill(sr, 1, '#0f766e')).toBe('#0f766e')
    expect(stateFill(sr, 0, '#0f766e')).not.toBe('#0f766e')
    const before = JSON.stringify(renderChart(spec(), measure))
    expect(JSON.stringify(renderChart(s, measure))).not.toBe(before)
  })
  it('covers draw a fill and a closed edge per area', () => {
    const cmds = renderBrushAreas([brushAreaFromDrag('rect', plot, 60, 20, 100, 90)], 'rgba(0,0,0,0.1)', '#333')
    expect(cmds.map((c) => c.kind)).toEqual(['polygon', 'polyline'])
    const edge = cmds[1] as { points: { x: number; y: number }[] }
    expect(edge.points[0]).toEqual(edge.points[edge.points.length - 1])
  })
})
