import { describe, expect, it } from 'vitest'
import { compileFamily, familyToSvg } from '../engine/option-family'
import type { FamilyPlan } from '../engine/option-family'
import type { EChartsOption } from '../engine/option'

/**
 * The last residual branches of `option-family.ts`: the dataset-layer warning
 * hand-off, the per-field numeric fallbacks inside the candlestick / boxplot
 * tuple readers, the graph's `nodes` slot, and the two `familyToSvg` spreads
 * that only a partly-coloured plan or a fully-configured gauge reaches.
 */

/** The plan is a discriminated union; a spec knows which arm its option hits, so
 * the union is widened with an index signature to let each spec name the fields
 * it asserts on. The runtime assertions are the real check. */
type PlanFields = FamilyPlan & { [k: string]: unknown }
const plan = (o: EChartsOption): PlanFields => compileFamily(o)!.plan as PlanFields

describe('the dataset layer\'s warnings are forwarded verbatim', () => {
  it('a series pointing at a dataset index that does not exist warns through compileFamily', () => {
    const c = compileFamily({
      dataset: [{ source: [['name', 'value'], ['a', 1]] }],
      series: [{ type: 'pie', datasetIndex: 4 }],
    })!
    expect(c.warnings.map((w) => w.path)).toContain('series[0].datasetIndex')
    expect(c.warnings.find((w) => w.path === 'series[0].datasetIndex')!.code).toBe('series-data-shape')
    // A well-formed dataset forwards no warning of its own, and its rows reach the plan.
    const ok = compileFamily({ dataset: { source: [['name', 'value'], ['a', 1], ['b', 2]] }, series: [{ type: 'pie' }] })!
    expect(ok.warnings.filter((w) => w.path.startsWith('series[0].datasetIndex'))).toEqual([])
    expect((ok.plan as { rows: { name: string; value: number }[] }).rows.map((r) => [r.name, r.value])).toEqual([['a', 1], ['b', 2]])
  })
})

describe('per-field numeric fallbacks', () => {
  it('candlestick: EACH of the four members falls back to 0 independently', () => {
    const rows = (plan({ series: [{ type: 'candlestick', data: [[1, 2, 3, 'x'], ['x', 2, 3, 4], [1, 'x', 3, 4], [1, 2, 'x', 4]] }] }) as unknown as { rows: Record<string, number>[] }).rows
    expect(rows).toEqual([
      { x: '1', open: 1, close: 2, low: 3, high: 0 },
      { x: '2', open: 0, close: 2, low: 3, high: 4 },
      { x: '3', open: 1, close: 0, low: 3, high: 4 },
      { x: '4', open: 1, close: 2, low: 0, high: 4 },
    ])
  })
  it('boxplot: EACH of the five members falls back to 0 independently', () => {
    const rows = (plan({ series: [{ type: 'boxplot', data: [['x', 2, 3, 4, 5], [1, 'x', 3, 4, 5], [1, 2, 'x', 4, 5], [1, 2, 3, 'x', 5], [1, 2, 3, 4, 'x']] }] }) as { rows: Record<string, unknown>[] }).rows
    expect(rows.map((r) => [r['min'], r['q1'], r['median'], r['q3'], r['max']])).toEqual([
      [0, 2, 3, 4, 5],
      [1, 0, 3, 4, 5],
      [1, 2, 0, 4, 5],
      [1, 2, 3, 0, 5],
      [1, 2, 3, 4, 0],
    ])
  })
})

describe('slots read from a named series key rather than from data', () => {
  it('graph: `nodes` is read when present and `data` when it is not', () => {
    const viaNodes = plan({ series: [{ type: 'graph', nodes: [{ name: 'fromNodes' }], data: [{ name: 'fromData' }] }] }) as { nodes: { id: string }[] }
    expect(viaNodes.nodes.map((n) => n.id)).toEqual(['fromNodes'])
    const viaData = plan({ series: [{ type: 'graph', data: [{ name: 'fromData' }] }] }) as { nodes: { id: string }[] }
    expect(viaData.nodes.map((n) => n.id)).toEqual(['fromData'])
    // A non-array `nodes` falls back to `data` rather than emptying the graph.
    expect((plan({ series: [{ type: 'graph', nodes: 'x', data: [{ name: 'fromData' }] }] }) as { nodes: { id: string }[] }).nodes.map((n) => n.id)).toEqual(['fromData'])
  })
  it('radar: a series whose data is not an array contributes no rows but does not break its siblings', () => {
    const indicator = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
    const p = plan({ radar: { indicator }, series: [{ type: 'radar', data: [[1, 2, 3]] }, { type: 'radar', data: 'nope' }, { type: 'radar', data: [[4, 5, 6]] }] }) as { rows: { values: number[] }[] }
    expect(p.rows.map((r) => r.values)).toEqual([[1, 2, 3], [4, 5, 6]])
  })
})

describe('familyToSvg spreads that need a fully-populated plan', () => {
  it('a gauge passes thickness and valueColor through only when the option supplied them', () => {
    const configured = plan({ series: [{ type: 'gauge', data: [{ value: 40 }], axisLine: { lineStyle: { width: 30 } }, progress: { itemStyle: { color: '#abcdef' } } }] })
    expect(configured).toMatchObject({ thickness: 30, valueColor: '#abcdef' })
    const svg = familyToSvg(configured, { width: 300, height: 200 })
    expect(svg).toContain('#abcdef')
    // The bare gauge renders with the engine's own thickness and colour.
    const bare = familyToSvg(plan({ series: [{ type: 'gauge', data: [{ value: 40 }] }] }), { width: 300, height: 200 })
    expect(bare).not.toContain('#abcdef')
    // The band is drawn as filled polygons, so thickness shows as different
    // geometry rather than a stroke width — a thinner band draws a different arc.
    const thin = familyToSvg(plan({ series: [{ type: 'gauge', data: [{ value: 40 }], axisLine: { lineStyle: { width: 8 } } }] }), { width: 300, height: 200 })
    expect(thin).not.toBe(svg)
    expect(bare).not.toBe(svg)
  })
  it('radar and funnel fall back to the engine palette for a row with no colour of its own', () => {
    const indicator = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
    // One row carries a colour and one does not, so the accessor is installed
    // AND its `?? paletteAt(...)` fallback runs for the second row.
    const radar = plan({ radar: { indicator }, series: [{ type: 'radar', data: [{ value: [1, 2, 3], itemStyle: { color: '#00ff00' } }, { value: [3, 2, 1] }] }] })
    const radarSvg = familyToSvg(radar, { width: 300, height: 200 })
    expect(radarSvg).toContain('#00ff00')
    expect((radar as { rows: { color: string | undefined }[] }).rows.map((r) => r.color)).toEqual(['#00ff00', undefined])

    const funnel = plan({ series: [{ type: 'funnel', data: [{ name: 'a', value: 10, itemStyle: { color: '#00ff00' } }, { name: 'b', value: 5 }] }] })
    const funnelSvg = familyToSvg(funnel, { width: 300, height: 200 })
    expect(funnelSvg).toContain('#00ff00')
    expect((funnel as { rows: { color: string | undefined }[] }).rows.map((r) => r.color)).toEqual(['#00ff00', undefined])
    // The uncoloured row still gets a fill, from the engine palette.
    expect(funnelSvg.match(/fill="#/g)!.length).toBeGreaterThan(1)
  })
})
