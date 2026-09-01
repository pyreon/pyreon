import { describe, expect, it } from 'vitest'
import { appendGraphicLayer, graphicCommands, readSource, resolveDataset, svgSize } from './option-layer'
import { compileOption, optionToSvg, planOption } from './option'
import { compileFamily } from './option-family'

describe('dataset pre-pass', () => {
  it('array source with an auto-detected header materialises xAxis categories and one series per dimension', () => {
    const { option, warnings } = resolveDataset({
      dataset: { source: [['product', '2023', '2024'], ['a', 1, 4], ['b', 2, 5]] },
      series: [{ type: 'bar' }, { type: 'line' }],
    })
    expect(warnings).toEqual([])
    const s = option['series'] as Record<string, unknown>[]
    expect(s[0]!['data']).toEqual([1, 2])
    expect(s[1]!['data']).toEqual([4, 5])
    expect((option['xAxis'] as Record<string, unknown>)['data']).toEqual(['a', 'b'])
    expect(s[0]!['type']).toBe('bar')
  })
  it('object source, explicit dimensions, encode by name, and seriesLayoutBy row', () => {
    const t = readSource({ source: [{ k: 'x', v: 1, w: 9 }, { k: 'y', v: 2 }], dimensions: ['k', 'v'] })!
    expect(t.dims).toEqual(['k', 'v'])
    expect(t.rows).toEqual([['x', 1], ['y', 2]])
    const { option } = resolveDataset({ dataset: { source: [{ k: 'x', v: 1, w: 9 }, { k: 'y', v: 2, w: 8 }] }, series: [{ type: 'bar', encode: { x: 'k', y: 'w' } }] })
    expect((option['series'] as Record<string, unknown>[])[0]!['data']).toEqual([9, 8])
    const byRow = resolveDataset({ dataset: { sourceHeader: false, source: [['2023', 1, 2], ['2024', 3, 4]] }, series: [{ type: 'bar', seriesLayoutBy: 'row' }] })
    expect((byRow.option['series'] as Record<string, unknown>[])[0]!['data']).toEqual([1, 2])
  })
  it('name-value families get {name, value} items; scatter gets pairs; existing data is untouched; missing dims warn', () => {
    const pie = resolveDataset({ dataset: { source: [['n', 'v'], ['a', 3], ['b', 7]] }, series: [{ type: 'pie' }] })
    expect((pie.option['series'] as Record<string, unknown>[])[0]!['data']).toEqual([{ name: 'a', value: 3 }, { name: 'b', value: 7 }])
    const sc = resolveDataset({ dataset: { source: [[1, 2], [3, 4]] }, series: [{ type: 'scatter' }] })
    expect((sc.option['series'] as Record<string, unknown>[])[0]!['data']).toEqual([[1, 2], [3, 4]])
    const keep = resolveDataset({ dataset: { source: [[1, 2]] }, series: [{ type: 'bar', data: [9] }] })
    expect((keep.option['series'] as Record<string, unknown>[])[0]!['data']).toEqual([9])
    const missing = resolveDataset({ dataset: { source: [['n', 'v'], ['a', 1]] }, series: [{ type: 'bar' }, { type: 'bar' }] })
    expect(missing.warnings.map((w) => w.code)).toEqual(['series-data-shape'])
    const transform = resolveDataset({ dataset: [{ source: [[1]] }, { transform: { type: 'filter' } }], series: [{ type: 'bar' }] })
    expect(transform.warnings.map((w) => w.code)).toContain('option-key-unsupported')
    expect(resolveDataset({ series: [{ type: 'bar', data: [1] }] }).option).toEqual({ series: [{ type: 'bar', data: [1] }] })
  })
  it('flows through both facade halves without the input being mutated', () => {
    const cartesian = { dataset: { source: [['p', 'q'], ['a', 1], ['b', 2]] }, series: [{ type: 'bar' }] }
    const c = compileOption(cartesian)
    expect(c.warnings).toEqual([])
    expect(c.spec.series[0]!.values).toEqual([1, 2])
    expect(c.spec.categories).toEqual(['a', 'b'])
    expect((cartesian.series[0] as Record<string, unknown>)['data']).toBeUndefined()
    const family = compileFamily({ dataset: { source: [['n', 'v'], ['a', 3], ['b', 7]] }, series: [{ type: 'pie' }] })!
    expect(family.warnings).toEqual([])
    if (family.plan.kind !== 'pie') throw new Error('kind')
    expect(family.plan.rows.map((r) => r.value)).toEqual([3, 7])
    expect(planOption(cartesian).kind).toBe('cartesian')
  })
})

describe('graphic layer', () => {
  it('lowers text/rect/circle/line/polygon/polyline/group with left/top/right/bottom/percent placement', () => {
    const { cmds, warnings } = graphicCommands({
      graphic: [
        { type: 'text', left: 'center', top: 10, style: { text: 'hello', fontSize: 14, fill: '#123456', textAlign: 'center' } },
        { type: 'rect', right: 10, bottom: 10, shape: { width: 20, height: 10 }, style: { fill: '#ff0000' } },
        { type: 'circle', left: '50%', top: '50%', shape: { r: 5 } },
        { type: 'line', shape: { x1: 0, y1: 0, x2: 10, y2: 10 }, style: { stroke: '#00ff00', lineWidth: 2 } },
        { type: 'group', left: 100, top: 100, children: [{ type: 'polygon', shape: { points: [[0, 0], [10, 0], [5, 5]] } }, { type: 'polyline', shape: { points: [[0, 0], [1, 1]] } }] },
        { type: 'image', style: { image: 'x.png' } },
      ],
    }, 400, 300)
    expect(cmds.map((c) => c.kind)).toEqual(['text', 'rect', 'circle', 'line', 'polygon', 'polyline'])
    const t = cmds[0]!
    if (t.kind !== 'text') throw new Error('text')
    expect(t.at).toEqual({ x: 200, y: 10 })
    expect(t.align).toBe('middle')
    const r = cmds[1]!
    if (r.kind !== 'rect') throw new Error('rect')
    expect(r.rect).toEqual({ x: 370, y: 280, w: 20, h: 10 })
    const c = cmds[2]!
    if (c.kind !== 'circle') throw new Error('circle')
    expect(c.center).toEqual({ x: 200, y: 150 })
    const pg = cmds[4]!
    if (pg.kind !== 'polygon') throw new Error('polygon')
    expect(pg.points[0]).toEqual({ x: 100, y: 100 })
    expect(warnings.map((w) => w.code)).toEqual(['mark-shape-unsupported'])
  })
  it('splices into an existing svg above the chart, at the svg\'s own size', () => {
    const base = optionToSvg({ xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }, { width: 300, height: 200 })
    expect(svgSize(base)).toEqual({ width: 300, height: 200 })
    const out = appendGraphicLayer(base, [{ kind: 'circle', center: { x: 1, y: 1 }, radius: 3, fill: '#abcdef' }], 300, 200)
    expect(out.endsWith('</svg>')).toBe(true)
    expect(out.indexOf('#abcdef')).toBeGreaterThan(out.indexOf('<rect'))
    expect(out.split('<svg').length).toBe(2)
    expect(appendGraphicLayer(base, [], 300, 200)).toBe(base)
  })
  it('optionToSvg renders the graphic layer for both facade halves', () => {
    const g = [{ type: 'text', left: 'center', top: 4, style: { text: 'WATERMARK', fill: '#abc123' } }]
    const cartesian = optionToSvg({ graphic: g, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] })
    expect(cartesian).toContain('WATERMARK')
    expect(cartesian.split('<svg').length).toBe(2)
    const pie = optionToSvg({ graphic: g, series: [{ type: 'pie', data: [{ name: 'a', value: 1 }] }] })
    expect(pie).toContain('WATERMARK')
    expect(compileOption({ graphic: g, xAxis: {}, yAxis: {}, series: [{ type: 'bar', data: [1] }] }).warnings).toEqual([])
  })
})
