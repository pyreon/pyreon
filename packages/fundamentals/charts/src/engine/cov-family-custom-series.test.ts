// Branch coverage for the custom-series bridge: the datum-shape reader that
// has to serve arrays, `{ value }` objects and bare scalars; the numeric
// coercion that must reject a non-finite number and a non-numeric string
// alike; and the pixel api's degenerate-axis fallbacks.
import { describe, expect, it } from 'vitest'
import { customCommands, customExtents } from './custom-series'
import type { CustomRenderApi, CustomRenderParams, CustomSeriesPlan } from './custom-series'
import { compileOption } from './option'
import { measureApprox } from './svg'

const dot = (_p: CustomRenderParams, api: CustomRenderApi) => {
  const at = api.coord([api.value(0), api.value(1)])
  return { type: 'circle', shape: { cx: at[0], cy: at[1], r: 3 }, style: api.style() }
}
const plan = (data: unknown[], extra: Partial<CustomSeriesPlan> = {}): CustomSeriesPlan => ({
  name: 'c',
  color: '#123456',
  data,
  renderItem: dot,
  yDims: [1],
  xDim: 0,
  ...extra,
})

describe('custom series — the datum-shape reader', () => {
  it('an ARRAY datum is indexed by dimension', () => {
    expect(customExtents(plan([[1, 10], [3, 30]]))).toEqual({ x: [1, 3], y: [10, 30] })
  })
  it("an OBJECT datum with an array `value` is indexed the same way", () => {
    expect(customExtents(plan([{ value: [1, 10] }, { value: [3, 30] }]))).toEqual({ x: [1, 3], y: [10, 30] })
  })
  it('an OBJECT datum with a SCALAR value answers dimension 0 and nothing else', () => {
    expect(customExtents(plan([{ value: 5 }, { value: 9 }], { yDims: [0], xDim: 0 }))).toEqual({ x: [5, 9], y: [5, 9] })
    expect(customExtents(plan([{ value: 5 }], { yDims: [1] })), 'dimension 1 of a scalar is nothing').toEqual({ x: [5, 5], y: null })
  })
  it('a BARE scalar datum is dimension 0', () => {
    expect(customExtents(plan([4, 8], { yDims: [0] }))).toEqual({ x: [4, 8], y: [4, 8] })
    expect(customExtents(plan([4, 8], { yDims: [1] })).y).toBeNull()
  })
  it('null is neither an array nor a readable object', () => {
    expect(customExtents(plan([null, 4], { yDims: [0] }))).toEqual({ x: [4, 4], y: [4, 4] })
  })
})

describe('custom series — numeric coercion', () => {
  it('a NUMERIC STRING counts; a non-numeric one does not', () => {
    expect(customExtents(plan([['2', '20'], ['4', '40']]))).toEqual({ x: [2, 4], y: [20, 40] })
    expect(customExtents(plan([['nope', 'nope'], [1, 1]]))).toEqual({ x: [1, 1], y: [1, 1] })
  })
  it('an EMPTY or blank string is not a number', () => {
    expect(customExtents(plan([['', ''], [1, 1]]))).toEqual({ x: [1, 1], y: [1, 1] })
    expect(customExtents(plan([['   ', '   '], [1, 1]]))).toEqual({ x: [1, 1], y: [1, 1] })
  })
  it('NaN and Infinity are rejected even though they are numbers', () => {
    expect(customExtents(plan([[Number.NaN, Number.NaN], [1, 1]]))).toEqual({ x: [1, 1], y: [1, 1] })
    expect(customExtents(plan([[Number.POSITIVE_INFINITY, 1], [1, 1]])).x).toEqual([1, 1])
  })
  it('a boolean, an object and undefined are all non-numeric', () => {
    expect(customExtents(plan([[true, {}], [1, 1]]))).toEqual({ x: [1, 1], y: [1, 1] })
  })
})

describe('custom series — extents', () => {
  it('NO usable numbers gives null on both axes rather than an infinite extent', () => {
    expect(customExtents(plan([]))).toEqual({ x: null, y: null })
    expect(customExtents(plan([['a', 'b']]))).toEqual({ x: null, y: null })
  })
  it('one axis can be null while the other is not', () => {
    expect(customExtents(plan([[1, 'nope']]))).toEqual({ x: [1, 1], y: null })
    expect(customExtents(plan([['nope', 5]]))).toEqual({ x: null, y: [5, 5] })
  })
  it('a FLATTENED lines datum treats every even dimension as an x', () => {
    const lines = plan([[0, 1, 10, 4]], { yDims: [1, 3], xDim: 0 })
    expect(customExtents(lines), 'dims 0 and 2 are both x; dims 1 and 3 are both y').toEqual({ x: [0, 10], y: [1, 4] })
  })
  it('a lines datum that is NOT an array falls back to the single x dimension', () => {
    expect(customExtents(plan([{ value: [0, 1, 10, 4] }], { yDims: [1, 3], xDim: 0 }))).toEqual({ x: [0, 0], y: [1, 4] })
  })
})

describe('custom series — the pixel api', () => {
  const spec = (opt: Record<string, unknown>) => compileOption(opt as never, { width: 400, height: 300 })

  it('a CATEGORY x maps through the category list; an unknown name falls back to the first slot', () => {
    const seen: [number, number][] = []
    const c = spec({
      xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
      yAxis: {},
      series: [{
        type: 'custom',
        data: ['Tue', 'Nowhere'],
        renderItem: (_p: CustomRenderParams, api: CustomRenderApi) => {
          seen.push(api.coord([api.value(0), 1]))
          return null
        },
      }],
    })
    customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(seen).toHaveLength(2)
    expect(seen[0]![0], 'Tue is the middle slot').toBeGreaterThan(seen[1]![0])
  })
  it('a NON-numeric, non-string x is treated as zero rather than NaN pixels', () => {
    const seen: [number, number][] = []
    const c = spec({
      xAxis: {},
      yAxis: {},
      series: [{ type: 'custom', data: [[0, 1]], renderItem: (_p: CustomRenderParams, api: CustomRenderApi) => { seen.push(api.coord([{}, undefined])); return null } }],
    })
    customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(Number.isFinite(seen[0]![0])).toBe(true)
    expect(Number.isFinite(seen[0]![1])).toBe(true)
  })
  it('a COLLAPSED axis span centres the point instead of dividing by zero', () => {
    const seen: [number, number][] = []
    const sizes: [number, number][] = []
    const c = spec({
      xAxis: { min: 5, max: 5 },
      yAxis: { min: 2, max: 2 },
      series: [{ type: 'custom', data: [[5, 2]], renderItem: (p: CustomRenderParams, api: CustomRenderApi) => { seen.push(api.coord([5, 2])); sizes.push(api.size([1, 1])); void p; return null } }],
    })
    customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(Number.isFinite(seen[0]![0])).toBe(true)
    expect(Number.isFinite(seen[0]![1])).toBe(true)
    expect(sizes[0], 'a zero span has no pixel extent').toEqual([0, 0])
  })
  it('`value` defaults to dimension 0 of the CURRENT datum', () => {
    const seen: unknown[] = []
    const c = spec({
      xAxis: {},
      yAxis: {},
      series: [{ type: 'custom', data: [[7, 1], [9, 2]], renderItem: (_p: CustomRenderParams, api: CustomRenderApi) => { seen.push(api.value()); return null } }],
    })
    customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(seen).toEqual([7, 9])
  })
  it('`visual` answers only for the colour key', () => {
    const seen: unknown[] = []
    const c = spec({
      xAxis: {},
      yAxis: {},
      series: [{ type: 'custom', data: [[1, 1]], renderItem: (_p: CustomRenderParams, api: CustomRenderApi) => { seen.push(api.visual('color'), api.visual('opacity')); return null } }],
    })
    customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(typeof seen[0]).toBe('string')
    expect(seen[1]).toBeUndefined()
  })
  it('`style` merges an override over the series colour', () => {
    const seen: Record<string, unknown>[] = []
    const c = spec({
      xAxis: {},
      yAxis: {},
      series: [{ type: 'custom', data: [[1, 1]], renderItem: (_p: CustomRenderParams, api: CustomRenderApi) => { seen.push(api.style(), api.style({ fill: '#ff0000', stroke: '#00ff00' })); return null } }],
    })
    customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(seen[0]!.fill).toBe(c.custom[0]!.color)
    expect(seen[1]!.fill).toBe('#ff0000')
    expect(seen[1]!.stroke).toBe('#00ff00')
  })
})

describe('custom series — commands and failures', () => {
  it('no plans produces nothing and never lays the chart out', () => {
    const c = compileOption({ xAxis: {}, yAxis: {}, series: [] } as never, { width: 400, height: 300 })
    expect(customCommands([], c.spec, measureApprox(), 400, 300)).toEqual({ cmds: [], warnings: [] })
  })
  it('a renderItem that THROWS an Error warns per datum and skips only that datum', () => {
    const c = compileOption({
      xAxis: {},
      yAxis: {},
      series: [{ type: 'custom', data: [[1, 1], [2, 2]], renderItem: (p: CustomRenderParams, api: CustomRenderApi) => {
        if (p.dataIndex === 0) throw new Error('boom')
        return dot(p, api)
      } }],
    } as never, { width: 400, height: 300 })
    const out = customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0]!.message).toContain('boom')
    expect(out.cmds.length, 'the second datum still renders').toBeGreaterThan(0)
  })
  it('a renderItem that throws a NON-Error still produces a readable message', () => {
    const c = compileOption({
      xAxis: {},
      yAxis: {},
      series: [{ type: 'custom', data: [[1, 1]], renderItem: () => { throw 'a bare string' } }],
    } as never, { width: 400, height: 300 })
    const out = customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(out.warnings[0]!.message).toContain('a bare string')
    expect(out.cmds).toEqual([])
  })
  it('a renderItem returning null or undefined contributes nothing, without warning', () => {
    const c = compileOption({
      xAxis: {},
      yAxis: {},
      series: [{ type: 'custom', data: [[1, 1], [2, 2]], renderItem: (p: CustomRenderParams) => (p.dataIndex === 0 ? null : undefined) }],
    } as never, { width: 400, height: 300 })
    const out = customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(out).toEqual({ cmds: [], warnings: [] })
  })
  it('params carry the plot rectangle and the data length', () => {
    const seen: CustomRenderParams[] = []
    const c = compileOption({
      xAxis: {},
      yAxis: {},
      series: [{ type: 'custom', data: [[1, 1], [2, 2]], renderItem: (p: CustomRenderParams) => { seen.push(p); return null } }],
    } as never, { width: 400, height: 300 })
    customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    expect(seen.map((p) => p.dataIndex)).toEqual([0, 1])
    expect(seen[0]!.dataInsideLength).toBe(2)
    expect(seen[0]!.coordSys.type).toBe('cartesian2d')
    expect(seen[0]!.coordSys.width).toBeGreaterThan(0)
  })
})
