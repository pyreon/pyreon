import { describe, expect, it } from 'vitest'
import { customCommands } from './custom-series'
import { compileOption, optionToSvg } from './option'
import { measureApprox } from './svg'

const option = {
  xAxis: {}, yAxis: {},
  series: [{ type: 'lines', coordinateSystem: 'cartesian2d', lineStyle: { width: 3, color: '#123456' }, data: [
    { coords: [[0, 0], [10, 10]] },
    { coords: [[0, 10], [5, 5], [10, 0]], lineStyle: { color: '#abcdef' } },
  ] }],
}

describe('lines series', () => {
  it('compiles to an internal custom plan with flattened coords and seeds the axes from every vertex', () => {
    const c = compileOption(option, { width: 400, height: 300 })
    expect(c.warnings).toEqual([])
    expect(c.spec.series).toHaveLength(0)
    expect(c.custom).toHaveLength(1)
    expect(c.custom[0]!.data[1]).toEqual([0, 10, 5, 5, 10, 0])
    expect(c.spec.yDomain).toEqual({ min: 0, max: 10 })
    expect(c.spec.xValues).toEqual([0, 10])
  })
  it('renders one polyline per datum through the pixel api, with the series or per-datum colour and width', () => {
    const c = compileOption(option, { width: 400, height: 300 })
    const out = customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(out.warnings).toEqual([])
    const lines = out.cmds.filter((k) => k.kind === 'polyline')
    expect(lines).toHaveLength(2)
    const a = lines[0]!
    const b = lines[1]!
    if (a.kind !== 'polyline' || b.kind !== 'polyline') throw new Error('polyline')
    expect(a.points).toHaveLength(2)
    expect(b.points).toHaveLength(3)
    expect(a.stroke).toBe('#123456')
    expect(a.width).toBe(3)
    expect(b.stroke).toBe('#abcdef')
    // (0,0) is bottom-left of the plot; (10,10) top-right.
    expect(a.points[0]!.x).toBeLessThan(a.points[1]!.x)
    expect(a.points[0]!.y).toBeGreaterThan(a.points[1]!.y)
  })
  it('a datum without coords warns and is skipped; polyline:false-style effects are ignored by name; optionToSvg draws it', () => {
    const c = compileOption({ xAxis: {}, yAxis: {}, series: [{ type: 'lines', effect: { show: true }, data: [{ coords: [[0, 0], [1, 1]] }, { nope: 1 }, [[2, 2], [3, 3]]] }] })
    expect(c.warnings.map((w) => w.code).sort()).toEqual(['series-data-shape', 'series-option-unsupported'])
    expect(c.custom[0]!.data).toHaveLength(2)
    const svg = optionToSvg(option, { width: 400, height: 300 })
    expect(svg).toContain('<polyline')
  })
})
