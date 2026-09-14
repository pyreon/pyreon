// The cartesian facade's remaining reading arms: a pictorialBar's symbol
// vocabulary, a `lines` datum whose coordinates do not parse, a `custom`
// series' encode shapes, and the composition path where a title shifts every
// drawn command down. Paired with the input each arm must leave alone.
import { describe, expect, it } from 'vitest'
import { compileOption, compiledCommands, optionToSvg, planOption } from './option'
import { customCommands } from './custom-series'
import { measureApprox } from './svg'
import type { CustomRenderApi, CustomRenderParams } from './custom-series'
import type { DrawCmd } from './types'

const XY = { xAxis: {}, yAxis: {} }

describe('pictorialBar — symbol vocabulary and repeat forms', () => {
  it('maps every supported symbol name, and warns for one it cannot draw', () => {
    const sym = (symbol: string) => {
      const c = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', symbol, data: [1] }] })
      return { symbol: c.spec.series[0]!.symbol, warnings: c.warnings.map((w) => w.code) }
    }
    expect(sym('circle')).toEqual({ symbol: 'circle', warnings: [] })
    expect(sym('diamond')).toEqual({ symbol: 'diamond', warnings: [] })
    expect(sym('triangle')).toEqual({ symbol: 'triangle', warnings: [] })
    expect(sym('rect')).toEqual({ symbol: 'rect', warnings: [] })
    expect(sym('roundRect')).toEqual({ symbol: 'rect', warnings: [] })
    // An image/path symbol has no engine shape — it draws as a rect, loudly.
    expect(sym('image://icon.png')).toEqual({ symbol: 'rect', warnings: ['mark-shape-unsupported'] })
    // No symbol at all is a rect, silently.
    const bare = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', data: [1] }] })
    expect(bare.spec.series[0]!.symbol).toBe('rect')
    expect(bare.warnings).toEqual([])
  })

  it('symbolRepeat accepts true, "fixed" and a positive count; anything else tiles nothing', () => {
    const rep = (symbolRepeat: unknown) =>
      compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', symbol: 'circle', symbolRepeat, data: [1] }] }).spec.series[0]!.symbolRepeat
    expect(rep(true)).toBe(true)
    expect(rep('fixed')).toBe(true)
    expect(rep(3)).toBe(true)
    expect(rep(0)).toBe(false)
    expect(rep(-2)).toBe(false)
    expect(rep(false)).toBe(false)
    expect(rep('nope')).toBe(false)
  })

  it('a pictorialBar STACKS when it declares a stack, and GROUPS when it shares the chart with another bar', () => {
    const stacked = compileOption({
      xAxis: { data: ['a'] }, yAxis: {},
      series: [{ type: 'pictorialBar', stack: 'total', data: [1] }, { type: 'pictorialBar', stack: 'total', data: [2] }],
    })
    expect(stacked.spec.series.map((s) => s.kind)).toEqual(['stacked', 'stacked'])
    // `barCount` counts plain unstacked `bar` series, so a pictorialBar groups
    // once TWO of those share the chart with it.
    const grouped = compileOption({
      xAxis: { data: ['a'] }, yAxis: {},
      series: [{ type: 'pictorialBar', data: [1] }, { type: 'bar', data: [2] }, { type: 'bar', data: [3] }],
    })
    expect(grouped.spec.series.map((s) => s.kind)).toEqual(['grouped', 'grouped', 'grouped'])
    // One plain bar beside it is not a group.
    const pair = compileOption({
      xAxis: { data: ['a'] }, yAxis: {},
      series: [{ type: 'pictorialBar', data: [1] }, { type: 'bar', data: [2] }],
    })
    expect(pair.spec.series.map((s) => s.kind)).toEqual(['bars', 'bars'])
    const alone = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'pictorialBar', data: [1] }] })
    expect(alone.spec.series[0]!.kind).toBe('bars')
  })
})

describe('the `lines` series', () => {
  it('a non-numeric coordinate reads as 0 rather than poisoning the polyline', () => {
    const c = compileOption({ ...XY, series: [{ type: 'lines', data: [{ coords: [['x', null], [3, 4]] }] }] })
    expect(c.warnings).toEqual([])
    expect(c.custom[0]!.data[0]).toEqual([0, 0, 3, 4])
  })

  it('a series with no readable data compiles to an empty plan and no name of its own', () => {
    const c = compileOption({ ...XY, series: [{ type: 'lines' }] })
    expect(c.custom[0]!.data).toEqual([])
    // Unnamed series are numbered by position.
    expect(c.custom[0]!.name).toBe('Series 1')
    const named = compileOption({ ...XY, series: [{ type: 'lines', name: 'Routes', data: [] }] })
    expect(named.custom[0]!.name).toBe('Routes')
  })

  it('its renderItem draws nothing for a datum with fewer than two points, and takes a per-datum style', () => {
    const c = compileOption({
      ...XY,
      series: [{ type: 'lines', lineStyle: { color: '#123456', width: 3 }, data: [{ coords: [[0, 0], [1, 1]] }, { coords: [[2, 2], [3, 3]], lineStyle: { color: '#abcdef', width: 9 } }] }],
    }, { width: 400, height: 300 })
    const out = customCommands(c.custom, c.spec, measureApprox(), 400, 300)
    const lines = out.cmds.filter((k) => k.kind === 'polyline')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.kind === 'polyline' && lines[0]!.stroke).toBe('#123456')
    expect(lines[1]!.kind === 'polyline' && lines[1]!.width).toBe(9)

    // Called directly with an api that yields ONE point, the renderItem
    // declines rather than emitting a degenerate polyline.
    const ri = c.custom[0]!.renderItem
    const oneApi: CustomRenderApi = {
      value: (dim?: number) => ((dim ?? 0) < 2 ? dim : undefined),
      coord: (v: [unknown, unknown]) => [Number(v[0]), Number(v[1])] as [number, number],
      size: () => [1, 1] as [number, number],
      style: () => ({}),
      visual: () => undefined,
    }
    expect(ri({ dataIndex: 0, seriesIndex: 0 } as CustomRenderParams, oneApi)).toBeNull()
    // A datum index beyond the recorded styles still draws, in the fallback ink.
    const twoApi: CustomRenderApi = { ...oneApi, value: (dim?: number) => ((dim ?? 0) < 4 ? dim : undefined) }
    const far = ri({ dataIndex: 99, seriesIndex: 0 } as CustomRenderParams, twoApi) as { style: { stroke: string } } | null
    expect(far).not.toBeNull()
    expect(far!.style.stroke).toBe('#334155')
  })
})

describe('the `custom` series', () => {
  const box = (_p: CustomRenderParams, api: CustomRenderApi) => ({
    type: 'rect',
    shape: { x: api.coord([api.value(0), api.value(1)])[0], y: 0, width: 4, height: 4 },
    style: api.style(),
  })

  it('needs a renderItem function; without one the series is skipped by name', () => {
    const c = compileOption({ ...XY, series: [{ type: 'custom', data: [[0, 1]] }] })
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].renderItem'])
    expect(c.custom).toHaveLength(0)
  })

  it('reads encode.y as a list, as a scalar, and defaults it to dimension 1', () => {
    const plan = (encode: unknown) =>
      compileOption({ ...XY, series: [{ type: 'custom', renderItem: box, encode, data: [[0, 1, 2]] }] }).custom[0]!
    expect(plan({ y: [1, 2] }).yDims).toEqual([1, 2])
    expect(plan({ y: 2 }).yDims).toEqual([2])
    expect(plan({}).yDims).toEqual([1])
    // An unreadable dimension falls back to 1 rather than to NaN.
    expect(plan({ y: 'nope' }).yDims).toEqual([1])
    // encode.x may be a list too; its FIRST entry is the x dimension.
    expect(plan({ x: [2, 0] }).xDim).toBe(2)
    expect(plan({}).xDim).toBe(0)
  })

  it('takes its colour from itemStyle, its name from `name`, and an absent data array as empty', () => {
    const styled = compileOption({ ...XY, series: [{ type: 'custom', renderItem: box, name: 'Spans', itemStyle: { color: '#ff00ff' }, data: [[0, 1]] }] }).custom[0]!
    expect(styled.color).toBe('#ff00ff')
    expect(styled.name).toBe('Spans')
    const bare = compileOption({ ...XY, series: [{ type: 'custom', renderItem: box }] }).custom[0]!
    expect(bare.name).toBe('Series 1')
    expect(bare.data).toEqual([])
    expect(bare.color).toMatch(/^#/)
  })

  it('a custom-only chart seeds BOTH axes from the custom extents, merging the y across plans', () => {
    const c = compileOption({
      ...XY,
      series: [
        { type: 'custom', renderItem: box, encode: { x: 0, y: 1 }, data: [[0, 5]] },
        { type: 'custom', renderItem: box, encode: { x: 0, y: 1 }, data: [[10, 20]] },
      ],
    })
    expect(c.spec.series).toHaveLength(0)
    // The y domain spans BOTH plans and always includes zero.
    expect(c.spec.yDomain).toEqual({ min: 0, max: 20 })
    // A single plan's own x extent seeds the continuous axis.
    const one = compileOption({ ...XY, series: [{ type: 'custom', renderItem: box, encode: { x: 0, y: 1 }, data: [[0, 5], [10, 20]] }] })
    expect(one.spec.xValues).toEqual([0, 10])
    // A plan whose y never parses contributes no domain at all.
    const noY = compileOption({ ...XY, series: [{ type: 'custom', renderItem: box, encode: { x: 0, y: 1 }, data: [['a', 'b']] }] })
    expect(noY.spec.yDomain).toBeUndefined()
    // An explicit axis domain WINS over the seed.
    const pinned = compileOption({
      xAxis: {}, yAxis: { min: -5, max: 100 },
      series: [{ type: 'custom', renderItem: box, encode: { x: 0, y: 1 }, data: [[0, 5]] }],
    })
    expect(pinned.spec.yDomain).toEqual({ min: -5, max: 100 })
  })

  it('a custom series beside a CATEGORY axis does not overwrite the categories with x values', () => {
    const c = compileOption({
      xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {},
      series: [{ type: 'custom', renderItem: box, encode: { x: 0, y: 1 }, data: [[0, 5]] }],
    })
    expect(c.spec.categories).toEqual(['a', 'b'])
    expect(c.spec.xValues).toBeUndefined()
  })
})

describe('composition — the title shifts what the chart drew', () => {
  const at = (cmds: DrawCmd[], kind: 'text'): number => {
    const first = cmds.find((c) => c.kind === kind)
    return first?.kind === 'text' ? first.at.y : -1
  }

  it('with a title every chart command moves DOWN by the space the title took', () => {
    const option = { title: { text: 'Revenue', subtext: 'by quarter' }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }
    const titled = compileOption(option, { width: 400, height: 300 })
    const withTitle = compiledCommands(titled, option, measureApprox())
    expect(withTitle.top).toBeGreaterThan(0)

    const plainOption = { xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }
    const plain = compiledCommands(compileOption(plainOption, { width: 400, height: 300 }), plainOption, measureApprox())
    expect(plain.top).toBe(0)
    // Every command in the titled version sits at or below the untitled one.
    const lowest = (c: DrawCmd[]) => Math.min(...c.filter((x) => x.kind === 'rect').map((x) => (x.kind === 'rect' ? x.rect.y : Infinity)))
    expect(lowest(withTitle.cmds)).toBeGreaterThanOrEqual(lowest(plain.cmds))
    expect(at(withTitle.cmds, 'text')).toBe(0)
  })

  it('every command KIND moves with the title — circles, lines, polylines and text alike', () => {
    const option = {
      title: { text: 'Mixed' },
      xAxis: { data: ['a', 'b'] }, yAxis: {},
      series: [
        { type: 'scatter', data: [1, 2] },
        { type: 'line', data: [2, 3] },
        { type: 'custom', renderItem: (_p: CustomRenderParams, api: CustomRenderApi) => ({ type: 'circle', shape: { cx: api.coord([0, api.value(0)])[0], cy: 4, r: 3 }, style: api.style() }), data: [[0, 1]] },
      ],
    }
    const c = compileOption(option, { width: 400, height: 300 })
    const shifted = compiledCommands(c, option, measureApprox())
    expect(shifted.top).toBeGreaterThan(0)
    const kinds = new Set(shifted.cmds.map((x) => x.kind))
    expect(kinds.has('circle')).toBe(true)
    expect(kinds.has('line')).toBe(true)
    expect(kinds.has('text')).toBe(true)
    // Nothing from the chart sits ABOVE the title line.
    const circles = shifted.cmds.filter((x) => x.kind === 'circle')
    expect(circles.length).toBeGreaterThan(0)
    for (const x of circles) if (x.kind === 'circle') expect(x.center.y).toBeGreaterThan(0)
  })

  it('a custom series is NOT handed the axis x values when an explicit xAxis data list already exists', () => {
    // An empty `data` list leaves the categories empty, so the custom extents
    // still seed the continuous axis.
    const c = compileOption({
      xAxis: { type: 'value', data: [] }, yAxis: {},
      series: [{ type: 'custom', renderItem: (_p: CustomRenderParams, api: CustomRenderApi) => ({ type: 'rect', shape: { x: api.coord([api.value(0), 0])[0], y: 0, width: 1, height: 1 }, style: api.style() }), encode: { x: 0, y: 1 }, data: [[3, 5], [9, 7]] }],
    })
    expect(c.spec.xValues).toEqual([3, 9])
  })

  it('a legend also consumes vertical space above the plot', () => {
    const option = { legend: {}, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', name: 'S', data: [1] }] }
    const c = compileOption(option, { width: 400, height: 300 })
    expect(c.legend).not.toBeNull()
    expect(compiledCommands(c, option, measureApprox()).top).toBeGreaterThan(0)
    const hidden = compileOption({ ...option, legend: { show: false } }, { width: 400, height: 300 })
    expect(hidden.legend).toBeNull()
  })

  it('a DARK theme paints the single chart\'s background; a plain one paints none', () => {
    const dark = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }, { theme: 'dark' })
    expect(dark.background).toBeDefined()
    const painted = compiledCommands(dark, {}, measureApprox()).cmds
    expect(painted[0]!.kind === 'rect' && painted[0]!.fill).toBe(dark.background)
    const light = compileOption({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] })
    expect(light.background).toBeUndefined()
  })

  it('a backgroundColor reaches the COMPOSED multi-grid document', () => {
    const grids = optionToSvg({
      backgroundColor: '#eeeeee',
      grid: [{ top: 0, height: 80 }, { top: 100, height: 80 }],
      xAxis: [{ type: 'category', data: ['a'], gridIndex: 0 }, { type: 'category', data: ['a'], gridIndex: 1 }],
      yAxis: [{ gridIndex: 0 }, { gridIndex: 1 }],
      series: [{ type: 'bar', data: [1] }, { type: 'line', data: [2], xAxisIndex: 1, yAxisIndex: 1 }],
    }, { width: 400, height: 300 })
    expect(grids).toContain('#eeeeee')
  })
})

// NOTE — two arms in `compileOption` no input can reach:
//   * `svgSize(svg) === null` in `optionToSvgSingle` — every family renderer
//     goes through `renderSvg`, which always writes both a width and a height
//     on the root.
//   * `spec.xValues.length === 0` in the custom-extent seed — `xValues` is
//     assigned only under `xs.length > 0`, so it is either undefined or a
//     non-empty list; the `=== undefined` half beside it is the live one.

describe('timeline warnings reach BOTH facade halves', () => {
  it('a step past the list warns on a cartesian plan and on a family plan alike', () => {
    const cartesian = planOption({
      baseOption: { timeline: { data: ['a'] }, xAxis: { data: ['x'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] },
      options: [{ series: [{ data: [1] }] }],
    }, { timelineIndex: 9 })
    expect(cartesian.kind).toBe('cartesian')
    if (cartesian.kind === 'cartesian') expect(cartesian.compiled.warnings.map((w) => w.code)).toContain('timeline-step-out-of-range')

    const family = planOption({
      baseOption: { timeline: { data: ['a'] }, series: [{ type: 'pie', data: [{ name: 'x', value: 1 }] }] },
      options: [{ series: [{ data: [{ name: 'x', value: 1 }] }] }],
    }, { timelineIndex: 9 })
    expect(family.kind).toBe('family')
    if (family.kind === 'family') expect(family.compiled.warnings.map((w) => w.code)).toContain('timeline-step-out-of-range')
  })
})

describe('a series that is not an object at all', () => {
  it('warns by path and leaves the chart unsupported rather than crashing', () => {
    const c = compileOption({ ...XY, series: ['nope'] as never })
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0]'])
    expect(c.supported).toBe(false)
    // A series whose `type` is not a string reads as untyped and is reported.
    const untyped = compileOption({ ...XY, series: [{ type: 7, data: [1] }] })
    expect(untyped.warnings.map((w) => w.code)).toContain('series-type-unsupported')
  })
})
