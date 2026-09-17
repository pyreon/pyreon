import { describe, expect, it } from 'vitest'
import { linesCommands, pathLength, pointAlong } from './lines'
import { compileOption, optionToSvg } from './option'
import { layoutChart, renderChart } from './render'
import { measureApprox } from './svg'
import type { DrawCmd } from './types'

const option = {
  xAxis: {}, yAxis: {},
  series: [{ type: 'lines', coordinateSystem: 'cartesian2d', lineStyle: { width: 3, color: '#123456' }, data: [
    { coords: [[0, 0], [10, 10]] },
    { coords: [[0, 10], [5, 5], [10, 0]], lineStyle: { color: '#abcdef' } },
  ] }],
}

const polylines = (cmds: DrawCmd[]) => cmds.filter((k): k is Extract<DrawCmd, { kind: 'polyline' }> => k.kind === 'polyline')
const circles = (cmds: DrawCmd[]) => cmds.filter((k): k is Extract<DrawCmd, { kind: 'circle' }> => k.kind === 'circle')

describe('lines series', () => {
  it('compiles to engine lines with flattened coords, and seeds the axes from every vertex', () => {
    const c = compileOption(option, { width: 400, height: 300 })
    expect(c.warnings).toEqual([])
    expect(c.spec.series).toHaveLength(0)
    expect(c.custom).toHaveLength(0)
    expect(c.spec.lines![0]!.coords[1]).toEqual([0, 10, 5, 5, 10, 0])
    expect(c.spec.lines![0]!.effect).toBe(false)
    expect(c.spec.yDomain).toEqual({ min: 0, max: 10 })
    expect(c.spec.xValues).toEqual([0, 10])
  })

  it('renders one polyline per datum, with the series or per-datum colour and width', () => {
    const c = compileOption(option, { width: 400, height: 300 })
    const lines = polylines(renderChart(c.spec, measureApprox())).filter((k) => k.width === 3)
    expect(lines).toHaveLength(2)
    const [a, b] = lines as [Extract<DrawCmd, { kind: 'polyline' }>, Extract<DrawCmd, { kind: 'polyline' }>]
    expect(a.points).toHaveLength(2)
    expect(b.points).toHaveLength(3)
    expect(a.stroke).toBe('#123456')
    expect(b.stroke).toBe('#abcdef')
    // (0,0) is bottom-left of the plot; (10,10) top-right.
    expect(a.points[0]!.x).toBeLessThan(a.points[1]!.x)
    expect(a.points[0]!.y).toBeGreaterThan(a.points[1]!.y)
  })

  it('a datum without coords warns and is skipped; optionToSvg draws the lines', () => {
    const c = compileOption({ xAxis: {}, yAxis: {}, series: [{ type: 'lines', data: [{ coords: [[0, 0], [1, 1]] }, { nope: 1 }, [[2, 2], [3, 3]]] }] })
    expect(c.warnings.map((w) => w.code)).toEqual(['series-data-shape'])
    expect(c.spec.lines![0]!.coords).toHaveLength(2)
    expect(optionToSvg(option, { width: 400, height: 300 })).toContain('<polyline')
  })

  it('effect: the head travels the line with time, looping every period, trailing a segment of trailLength', () => {
    const effect = { show: true, period: 2, trailLength: 0.25, color: '#ff0000', symbolSize: 8 }
    const c = compileOption({ xAxis: {}, yAxis: {}, series: [{ type: 'lines', effect, data: [{ coords: [[0, 0], [10, 0]] }] }] }, { width: 400, height: 300 })
    expect(c.warnings).toEqual([])
    const ls = c.spec.lines![0]!
    expect(ls).toMatchObject({ effect: true, period: 2, trailLength: 0.25, effectColor: '#ff0000', symbolSize: 8 })
    const plot = layoutChart(c.spec, measureApprox()).plot
    const at = (time: number) => renderChart({ ...c.spec, effectTime: time }, measureApprox())
    const heads = (time: number) => circles(at(time)).filter((k) => k.fill === '#ff0000')
    // Half a period in, the head is half way along; a whole period later it is back.
    expect(heads(1)[0]!.center.x).toBeCloseTo(plot.x + plot.w / 2, 5)
    expect(heads(3)[0]!.center.x).toBeCloseTo(heads(1)[0]!.center.x, 5)
    expect(heads(1.5)[0]!.center.x).toBeCloseTo(plot.x + plot.w * 0.75, 5)
    expect(heads(1)[0]!.radius).toBe(4)
    // The trail is the quarter of the line behind the head.
    const trail = polylines(at(1)).find((k) => k.width === 2.5)!
    expect(trail.points[0]!.x).toBeCloseTo(plot.x + plot.w * 0.25, 5)
    expect(trail.points[trail.points.length - 1]!.x).toBeCloseTo(plot.x + plot.w / 2, 5)
    // Without the effect nothing moves.
    const still = compileOption({ xAxis: {}, yAxis: {}, series: [{ type: 'lines', data: [{ coords: [[0, 0], [10, 0]] }] }] }, { width: 400, height: 300 })
    expect(circles(renderChart({ ...still.spec, effectTime: 1 }, measureApprox()))).toHaveLength(0)
  })

  it('names effect keys it does not map, and a non-circle head', () => {
    const c = compileOption({ xAxis: {}, yAxis: {}, series: [{ type: 'lines', effect: { show: true, symbol: 'arrow', delay: 1 }, data: [[[0, 0], [1, 1]]] }] })
    expect(c.warnings.map((w) => w.path).sort()).toEqual(['series[0].effect.delay', 'series[0].effect.symbol'])
  })

  it('walks a multi-segment path by length', () => {
    const pts = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]
    expect(pathLength(pts)).toBe(11)
    expect(pointAlong(pts, 8)).toEqual({ x: 3, y: 7 })
    const cmds = linesCommands({ coords: [[0, 0, 1, 0]], colors: ['#000'], widths: [1], effect: true, period: 1, trailLength: 0, effectColor: '', symbolSize: 2 }, { x: 0, y: 0, w: 100, h: 10 }, { min: 0, max: 1 }, { min: 0, max: 1 }, 0.5)
    expect(circles(cmds)[0]!.center.x).toBeCloseTo(50, 5)
    expect(polylines(cmds)).toHaveLength(1)
  })
})
