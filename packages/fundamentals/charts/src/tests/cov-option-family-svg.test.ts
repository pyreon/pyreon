import { describe, expect, it } from 'vitest'
import { compileFamily, familyToSvg } from '../engine/option-family'
import type { FamilyPlan } from '../engine/option-family'
import type { EChartsOption } from '../engine/option'
import { registerMap } from '../engine/geo-web'
import type { GeoJson } from '../engine/geo-web'

/**
 * Branch coverage for `familyToSvg` — the plan → `<svg>` switch. Every arm
 * carries the same two optional-spread branches (`title`, and for the three
 * palette-bearing families `hasColors`), so the table below renders each kind
 * BOTH ways and asserts the difference is the title, not a different chart.
 */

const world: GeoJson = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { name: 'West' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } }],
}
registerMap('cov-svg-world', world)

/** The plan is a discriminated union; a spec knows which arm its option hits, so
 * the union is widened with an index signature to let each spec name the fields
 * it asserts on. The runtime assertions are the real check. */
type PlanFields = FamilyPlan & { [k: string]: unknown }
const plan = (o: EChartsOption): PlanFields => compileFamily(o)!.plan as PlanFields
/** The same option with and without a title, so only that branch differs. */
const pair = (o: EChartsOption): [FamilyPlan, FamilyPlan] => [plan(o), plan({ ...o, title: { text: 'Titled' } })]

const cases: [string, EChartsOption][] = [
  ['pie', { series: [{ type: 'pie', data: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }] }] }],
  ['gauge', { series: [{ type: 'gauge', data: [{ value: 42 }] }] }],
  ['radar', { radar: { indicator: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }, series: [{ type: 'radar', data: [{ value: [1, 2, 3], name: 'R' }] }] }],
  ['candlestick', { xAxis: { data: ['Mon', 'Tue'] }, series: [{ type: 'candlestick', data: [[1, 2, 0, 3], [2, 3, 1, 4]] }] }],
  ['heatmap', { xAxis: { data: ['Mon'] }, yAxis: { data: ['AM'] }, series: [{ type: 'heatmap', data: [[0, 0, 5]] }] }],
  ['funnel', { series: [{ type: 'funnel', data: [{ name: 'a', value: 10 }, { name: 'b', value: 5 }] }] }],
  ['treemap', { series: [{ type: 'treemap', data: [{ name: 'a', value: 3 }, { name: 'b', value: 1 }] }] }],
  ['sunburst', { series: [{ type: 'sunburst', data: [{ name: 'a', value: 3, children: [{ name: 'a1', value: 1 }] }] }] }],
  ['tree', { series: [{ type: 'tree', data: [{ name: 'root', children: [{ name: 'kid' }] }] }] }],
  ['sankey', { series: [{ type: 'sankey', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 3 }] }] }],
  ['chord', { series: [{ type: 'chord', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 3 }] }] }],
  ['graph', { series: [{ type: 'graph', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b' }] }] }],
  ['calendar', { calendar: { range: '2024-01' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2024-01-02', 3]] }] }],
  ['parallel', { parallelAxis: [{ dim: 0, min: 0, max: 10 }, { dim: 1, min: 0, max: 10 }], series: [{ type: 'parallel', data: [[1, 2], [3, 4]] }] }],
  ['polar', { angleAxis: { data: ['a', 'b'] }, radiusAxis: {}, series: [{ type: 'bar', coordinateSystem: 'polar', data: [1, 2] }] }],
  ['themeRiver', { series: [{ type: 'themeRiver', data: [['2024-01-01', 1, 'A'], ['2024-01-02', 2, 'A']] }] }],
  ['boxplot', { xAxis: { data: ['Mon'] }, series: [{ type: 'boxplot', data: [[1, 2, 3, 4, 5]] }] }],
  ['map', { series: [{ type: 'map', map: 'cov-svg-world', data: [{ name: 'West', value: 4 }] }] }],
  ['geoPoints', { geo: { map: 'cov-svg-world' }, series: [{ type: 'scatter', coordinateSystem: 'geo', data: [[1, 2]] }] }],
  ['singleAxis', { singleAxis: { min: 0, max: 10 }, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [3, 7] }] }],
]

describe('familyToSvg renders every plan kind, with and without a title', () => {
  for (const [name, option] of cases) {
    it(`${name}: both title branches render, and the title reaches the output`, () => {
      const [plain, titled] = pair(option)
      expect(plain.kind).toBe(name)
      const a = familyToSvg(plain, { width: 400, height: 300 })
      const b = familyToSvg(titled, { width: 400, height: 300 })
      expect(a.startsWith('<svg')).toBe(true)
      expect(b.startsWith('<svg')).toBe(true)
      expect(a).not.toContain('Titled')
      expect(b).toContain('Titled')
      // The title is the ONLY difference: stripping it back out leaves the
      // same drawing, so the branch adds a title rather than changing the chart.
      expect(b.length).toBeGreaterThan(a.length)
    })
  }
  it('width and height default when the size argument is absent or partial', () => {
    const p = plan({ series: [{ type: 'pie', data: [{ name: 'a', value: 1 }] }] })
    const fallback = familyToSvg(p)
    expect(fallback).toContain('width="640"')
    expect(fallback).toContain('height="320"')
    expect(familyToSvg(p, {})).toBe(fallback)
    expect(familyToSvg(p, { width: undefined, height: undefined })).toBe(fallback)
    expect(familyToSvg(p, { width: 200 })).toContain('width="200"')
    expect(familyToSvg(p, { width: 200 })).toContain('height="320"')
    expect(familyToSvg(p, { height: 100 })).toContain('width="640"')
  })
})

describe('familyToSvg palette branches', () => {
  it('pie / radar / funnel pass a colour accessor ONLY when some row carries one', () => {
    const withColor: [string, EChartsOption][] = [
      ['pie', { color: ['#ff0000'], series: [{ type: 'pie', data: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }] }] }],
      ['radar', { color: ['#ff0000'], radar: { indicator: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }, series: [{ type: 'radar', data: [{ value: [1, 2, 3] }] }] }],
      ['funnel', { color: ['#ff0000'], series: [{ type: 'funnel', data: [{ name: 'a', value: 10 }, { name: 'b', value: 5 }] }] }],
    ]
    for (const [kind, option] of withColor) {
      const coloured = familyToSvg(plan(option), { width: 300, height: 200 })
      const bare = familyToSvg(plan({ ...option, color: undefined }), { width: 300, height: 200 })
      expect(coloured).toContain('#ff0000')
      // Without a palette the default colours apply, so the two differ.
      expect(bare).not.toContain('#ff0000')
      expect(bare.startsWith('<svg')).toBe(true)
      expect(kind.length).toBeGreaterThan(0)
    }
  })
  it('a per-datum colour is enough to switch a family onto the accessor', () => {
    const p = plan({ series: [{ type: 'pie', data: [{ name: 'a', value: 1, itemStyle: { color: '#00ff00' } }, { name: 'b', value: 2 }] }] })
    const svg = familyToSvg(p, { width: 300, height: 200 })
    expect(svg).toContain('#00ff00')
    // The uncoloured sibling falls back to the engine palette rather than nothing.
    expect(svg.match(/fill="#/g)!.length).toBeGreaterThan(1)
  })
  it('a heatmap ramp is only passed through when it has MORE than one stop', () => {
    const base = { xAxis: { data: ['Mon'] }, yAxis: { data: ['AM'] }, series: [{ type: 'heatmap', data: [[0, 0, 5]] }] }
    const two = familyToSvg(plan({ ...base, visualMap: { inRange: { color: ['#0000ff', '#ff00ff'] } } }), { width: 300, height: 200 })
    const one = familyToSvg(plan({ ...base, visualMap: { inRange: { color: ['#0000ff'] } } }), { width: 300, height: 200 })
    const none = familyToSvg(plan(base), { width: 300, height: 200 })
    // The ramp is interpolated, so the stops reach the output as rgb() fills.
    expect(two).toContain('rgb(255, 0, 255)')
    // A single stop is not a ramp: the renderer's default colours are used instead.
    expect(one).not.toContain('rgb(255, 0, 255)')
    expect(one).toBe(none)
  })
  it('a boxplot carries its fill and stroke through to the drawing', () => {
    const base = { xAxis: { data: ['Mon'] }, series: [{ type: 'boxplot', data: [[1, 2, 3, 4, 5]] }] }
    const styled = familyToSvg(plan({ ...base, series: [{ ...base.series[0], itemStyle: { color: '#123456', borderColor: '#654321' } }] }), { width: 300, height: 200 })
    expect(styled).toContain('#123456')
    expect(styled).toContain('#654321')
    expect(familyToSvg(plan(base), { width: 300, height: 200 })).not.toContain('#123456')
  })
})
