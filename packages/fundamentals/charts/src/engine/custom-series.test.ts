import { describe, expect, it } from 'vitest'
import { customCommands, customExtents } from './custom-series'
import type { CustomRenderApi, CustomRenderParams } from './custom-series'
import { compileOption, optionToSvg } from './option'
import { measureApprox } from './svg'

const gantt = (params: CustomRenderParams, api: CustomRenderApi) => {
  const start = api.coord([api.value(1), api.value(0)])
  const end = api.coord([api.value(2), api.value(0)])
  const h = api.size([0, 1])[1] * 0.6
  return { type: 'rect', shape: { x: start[0], y: start[1] - h / 2, width: end[0] - start[0], height: h }, style: api.style() }
}

describe('custom series', () => {
  it('compiles: the series is kept OUT of the spec and contributes its axis extents', () => {
    const c = compileOption({ xAxis: {}, yAxis: {}, series: [{ type: 'custom', renderItem: gantt, encode: { x: [1, 2], y: 0 }, data: [[0, 1, 4], [1, 2, 6]] }] })
    expect(c.warnings).toEqual([])
    expect(c.spec.series).toHaveLength(0)
    expect(c.custom).toHaveLength(1)
    expect(c.custom[0]!.yDims).toEqual([0])
    expect(c.custom[0]!.xDim).toBe(1)
    expect(customExtents(c.custom[0]!)).toEqual({ x: [1, 2], y: [0, 1] })
    expect(c.spec.yDomain).toEqual({ min: 0, max: 1 })
  })
  it('renderItem gets a pixel api: coord/size/value/style; results lower through the graphic vocabulary', () => {
    const c = compileOption({ xAxis: {}, yAxis: {}, series: [{ type: 'custom', renderItem: gantt, encode: { x: [1, 2], y: 0 }, data: [[0, 1, 4], [1, 2, 6]] }] }, { width: 400, height: 300 })
    const out = customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(out.warnings).toEqual([])
    const rects = out.cmds.filter((k) => k.kind === 'rect')
    expect(rects).toHaveLength(2)
    const a = rects[0]!
    const b = rects[1]!
    if (a.kind !== 'rect' || b.kind !== 'rect') throw new Error('rect')
    expect(a.rect.w).toBeGreaterThan(0)
    expect(b.rect.x).toBeGreaterThan(a.rect.x)
    expect(b.rect.y).toBeLessThan(a.rect.y)
    expect(a.fill).toBe(c.custom[0]!.color)
    expect(a.rect.w / b.rect.w).toBeCloseTo(3 / 4, 9)
  })
  it('null items are skipped, a throwing renderItem warns per datum, groups and text lower too', () => {
    const c = compileOption({ xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'custom', renderItem: (p: CustomRenderParams, api: CustomRenderApi) => {
      if (p.dataIndex === 0) return null
      if (p.dataIndex === 1) throw new Error('boom')
      const [x, y] = api.coord(['b', api.value(0)])
      return { type: 'group', x, y, children: [{ type: 'circle', shape: { r: 4 }, style: api.style({ fill: '#abc' }) }, { type: 'text', style: { text: 'v' } }] }
    }, data: [1, 2, 3] }] }, { width: 400, height: 300 })
    const out = customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0]!.path).toBe('series[0].renderItem')
    expect(out.cmds.map((k) => k.kind)).toEqual(['circle', 'text'])
    const circle = out.cmds[0]!
    if (circle.kind !== 'circle') throw new Error('circle')
    expect(circle.fill).toBe('#abc')
    expect(circle.center.x).toBeGreaterThan(c.spec.width / 2)
  })
  it('optionToSvg draws the custom items above the chart; a non-function renderItem warns', () => {
    const svg = optionToSvg({ xAxis: {}, yAxis: {}, series: [{ type: 'custom', renderItem: gantt, encode: { x: [1, 2], y: 0 }, data: [[0, 1, 4]] }] }, { width: 400, height: 300 })
    expect(svg).toContain('<rect')
    const bad = compileOption({ xAxis: {}, yAxis: {}, series: [{ type: 'custom', renderItem: 'nope', data: [1] }] })
    expect(bad.warnings.map((w) => w.code)).toEqual(['series-data-shape'])
    expect(bad.custom).toHaveLength(0)
  })
})
