import { describe, expect, it } from 'vitest'
import {
  applyBrushSelection,
  brushAreaFromDrag,
  brushAreaUsable,
  brushDatumPoints,
  brushOnlySeries,
  brushSelection,
  pointInBrushArea,
  renderBrushAreas,
} from './brush-area'
import { defaultTheme, layoutChart } from './render'
import type { ChartSpec, Series } from './render'
import type { Double, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const series = (kind: Series['kind'], values: Double[], over: Partial<Series> = {}): Series => ({
  kind, values, color: '#0f766e', width: 1.0, radius: 2.0, label: 'S', ...over,
})
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400.0, height: 200.0, series: [series('bars', [10, 20, 30, 40])], categories: [],
  theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, ...over,
})

describe('brushAreaUsable / pointInBrushArea — degenerate areas', () => {
  it('a non-polygon area with fewer than two points is neither usable nor hit', () => {
    const one = { type: 'rect', points: [{ x: 10, y: 10 }] }
    expect(brushAreaUsable(one)).toBe(false)
    expect(pointInBrushArea(one, 10, 10)).toBe(false)
  })
  it('measures width/height whichever corner comes first', () => {
    // b.x < a.x and b.y < a.y — the reversed drag.
    const r = { type: 'rect', points: [{ x: 100, y: 90 }, { x: 60, y: 20 }] }
    expect(brushAreaUsable(r)).toBe(true)
    const thin = { type: 'lineX', points: [{ x: 100, y: 90 }, { x: 99, y: 20 }] }
    expect(brushAreaUsable(thin)).toBe(false)
  })
})

describe('brushDatumPoints — each series kind', () => {
  it('an out-of-range series index yields no points', () => {
    const s = spec()
    expect(brushDatumPoints(s, layoutChart(s, measure), 5)).toEqual([])
  })
  it('a waterfall gap parks its datum far off-plot so no brush can select it', () => {
    const s = spec({ series: [series('waterfall', [10, 0 / 0, 5])] })
    const l = layoutChart(s, measure)
    const pts = brushDatumPoints(s, l, 0)
    expect(pts[1]!.y).toBe(-1000000)
    expect(pts[0]!.y).toBeGreaterThan(-1000000)
    const all = brushAreaFromDrag('rect', l.plot, l.plot.x, l.plot.y, l.plot.x + l.plot.w, l.plot.y + l.plot.h)
    expect(brushSelection(s, l, [all])[0]!.dataIndex).toEqual([0, 2])
  })
  it('a stacked datum with no segment (a gap) is parked off-plot', () => {
    const s = spec({ series: [series('stacked', [10, 0 / 0, 5]), series('stacked', [10, 10, 10])] })
    const l = layoutChart(s, measure)
    const pts = brushDatumPoints(s, l, 0)
    expect(pts[1]).toEqual({ x: -1000000, y: -1000000 })
    expect(pts[0]!.x).toBeGreaterThan(l.plot.x)
  })
  it('a horizontal line series places points along the value axis horizontally', () => {
    const s = spec({ horizontal: true, categories: ['a', 'b'], series: [series('line', [10, 40])] })
    const l = layoutChart(s, measure)
    const pts = brushDatumPoints(s, l, 0)
    expect(pts.length).toBe(2)
    // The larger value sits further right on a horizontal chart.
    expect(pts[1]!.x).toBeGreaterThan(pts[0]!.x)
  })
  it('a continuous-x line series places points by xValues', () => {
    const s = spec({ xValues: [0, 10, 100], series: [series('line', [5, 5, 5])] })
    const l = layoutChart(s, measure)
    const pts = brushDatumPoints(s, l, 0)
    // 0 → 10 is a tenth of the span of 0 → 100.
    const d1 = pts[1]!.x - pts[0]!.x
    const d2 = pts[2]!.x - pts[0]!.x
    expect(d1 / d2).toBeCloseTo(0.1, 5)
  })
})

describe('brushOnlySeries', () => {
  const sel = [{ seriesIndex: 0, dataIndex: [1] }, { seriesIndex: 1, dataIndex: [2] }]
  it('an empty list keeps every series; a listed index keeps only it', () => {
    expect(brushOnlySeries(sel, [])).toBe(sel)
    expect(brushOnlySeries(sel, [1])).toEqual([{ seriesIndex: 0, dataIndex: [] }, { seriesIndex: 1, dataIndex: [2] }])
  })
})

describe('applyBrushSelection — fewer selections than series', () => {
  it('a series without a selection entry gets an empty inBrush', () => {
    const s = spec({ series: [series('bars', [1, 2]), series('bars', [3, 4])] })
    const out = applyBrushSelection(s, [{ seriesIndex: 0, dataIndex: [1] }], true, 0.3)
    expect(out.series[0]!.inBrush).toEqual([1])
    expect(out.series[1]!.inBrush).toEqual([])
    expect(out.series[1]!.brushOpacity).toBe(0.3)
  })
})

describe('renderBrushAreas — polygons and degenerate areas', () => {
  it('a polygon draws its own ring, closed', () => {
    const tri = { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }] }
    const cmds = renderBrushAreas([tri], 'f', 's')
    expect(cmds.map((c) => c.kind)).toEqual(['polygon', 'polyline'])
    const edge = cmds[1] as { points: { x: number; y: number }[] }
    expect(edge.points.length).toBe(4)
    expect(edge.points[3]).toEqual({ x: 0, y: 0 })
  })
  it('a two-vertex polygon draws only an edge (no fill); fewer draws nothing', () => {
    const two = { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }
    expect(renderBrushAreas([two], 'f', 's').map((c) => c.kind)).toEqual(['polyline'])
    const one = { type: 'polygon', points: [{ x: 0, y: 0 }] }
    expect(renderBrushAreas([one], 'f', 's')).toEqual([])
    const shortRect = { type: 'rect', points: [{ x: 0, y: 0 }] }
    expect(renderBrushAreas([shortRect], 'f', 's')).toEqual([])
  })
})
