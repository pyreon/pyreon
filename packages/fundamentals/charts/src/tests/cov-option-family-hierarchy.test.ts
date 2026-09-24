import { paletteAt } from '../engine/palette'
import { describe, expect, it } from 'vitest'
import { compileFamily } from '../engine/option-family'
import type { FamilyPlan } from '../engine/option-family'
import type { EChartsOption } from '../engine/option'

/**
 * Branch coverage for the hierarchical / relational family arms of
 * `compileFamily`: funnel, tree, sunburst, treemap, sankey, chord and graph.
 * Each spec pairs the shape a branch acts on with the shape it must leave
 * alone, so a branch that fired unconditionally would fail here.
 */

/** The plan is a discriminated union; a spec knows which arm its option hits, so
 * the union is widened with an index signature to let each spec name the fields
 * it asserts on. The runtime assertions are the real check. */
type PlanFields = FamilyPlan & { [k: string]: unknown }
const plan = (o: EChartsOption): PlanFields => compileFamily(o)!.plan as PlanFields
const warns = (o: EChartsOption): string[] => compileFamily(o)!.warnings.map((w) => w.path)
const series = (s: Record<string, unknown>, top: Record<string, unknown> = {}): EChartsOption => ({ series: [s], ...top })

describe('funnel', () => {
  it('reads bare numbers and object values, skipping a datum with no number', () => {
    const c = compileFamily(series({ type: 'funnel', data: [10, { value: 5, name: 'Paid' }, { name: 'none' }, 'x'] }))!
    expect((c.plan as unknown as { rows: { value: number; name: string }[] }).rows).toEqual([
      { value: 10, name: 'Stage 1', color: undefined },
      { value: 5, name: 'Paid', color: undefined },
    ])
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[2]', 'series[0].data[3]'])
    expect(c.warnings[0]!.message).toContain('funnel datum')
  })
  it('a datum itemStyle.color beats the palette, which cycles by datum index', () => {
    const rows = (plan({ color: ['#p0', '#p1'], series: [{ type: 'funnel', data: [1, { value: 2, itemStyle: { color: '#own' } }, 3] }] }) as { rows: { color: string | undefined }[] }).rows
    expect(rows.map((r) => r.color)).toEqual(['#p0', '#own', '#p0'])
    // No palette → no per-row colour.
    expect((plan(series({ type: 'funnel', data: [1] })) as { rows: { color: string | undefined }[] }).rows[0]!.color).toBeUndefined()
  })
  it('sort accepts ascending / none and otherwise stays descending', () => {
    const sort = (v: unknown): string => (plan(series({ type: 'funnel', data: [], sort: v })) as { funnel: { sort: string } }).funnel.sort
    expect(sort('ascending')).toBe('ascending')
    expect(sort('none')).toBe('none')
    expect(sort('descending')).toBe('descending')
    expect(sort(undefined)).toBe('descending')
    expect(sort(7)).toBe('descending')
  })
  it('funnelAlign accepts left / right and otherwise centres', () => {
    const align = (v: unknown): string => (plan(series({ type: 'funnel', data: [], funnelAlign: v })) as { funnel: { align: string } }).funnel.align
    expect(align('left')).toBe('left')
    expect(align('right')).toBe('right')
    expect(align('center')).toBe('center')
    expect(align(undefined)).toBe('center')
  })
  it('gap defaults to 2, minSize is a percentage that defaults to 0, labels show unless turned off', () => {
    const f = (s: Record<string, unknown>): { gap: number; minWidthRatio: number; showLabels: boolean } => (plan(series({ type: 'funnel', data: [], ...s })) as { funnel: { gap: number; minWidthRatio: number; showLabels: boolean } }).funnel
    expect(f({})).toMatchObject({ gap: 2, minWidthRatio: 0, showLabels: true })
    expect(f({ gap: 8, minSize: '20%', label: { show: false } })).toMatchObject({ gap: 8, minWidthRatio: 0.2, showLabels: false })
    // A bare number minSize is read as a percentage too; junk falls back to 0.
    expect(f({ minSize: 50 }).minWidthRatio).toBeCloseTo(0.5, 9)
    expect(f({ gap: 'x', minSize: 'x' })).toMatchObject({ gap: 2, minWidthRatio: 0 })
    expect(f({ label: 'x' }).showLabels).toBe(true)
  })
})

describe('tree / sunburst / treemap share one node parser', () => {
  for (const type of ['tree', 'sunburst', 'treemap'] as const) {
    it(`${type}: parses names, values, colours and nested children`, () => {
      const p = plan(series({ type, data: [{ name: 'root', value: 3, itemStyle: { color: '#r' }, children: [{ name: 'kid' }, { value: 2 }] }] })) as { nodes: unknown[] }
      expect(p.nodes).toEqual([
        { name: 'root', value: 3, children: [{ name: 'kid' }, { name: 'Node 2', value: 2 }], color: '#r' },
      ])
    })
    it(`${type}: skips a non-object datum by name, and an empty/absent children list adds no key`, () => {
      const c = compileFamily(series({ type, data: ['x', { name: 'ok', children: [] }, { name: 'nest', children: 'no' }, null] }))!
      expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[0]', 'series[0].data[3]'])
      expect((c.plan as unknown as { nodes: unknown[] }).nodes).toEqual([{ name: 'ok' }, { name: 'nest' }])
    })
    it(`${type}: a non-object child is dropped without dropping its parent, and a non-string colour is ignored`, () => {
      const p = plan(series({ type, data: [{ name: 'p', children: ['junk', { name: 'kept' }], itemStyle: { color: 9 } }] })) as { nodes: { name: string; children: unknown[]; color?: string }[] }
      expect(p.nodes[0]).toEqual({ name: 'p', children: [{ name: 'kept' }] })
    })
    it(`${type}: labels show unless label.show is exactly false`, () => {
      const show = (label: unknown): boolean => {
        const pl = plan(series({ type, data: [], label })) as { tree?: { showLabels: boolean }; sunburst?: { showLabels: boolean }; treemap?: { showLabels: boolean } }
        return (pl.tree ?? pl.sunburst ?? pl.treemap)!.showLabels
      }
      expect(show(undefined)).toBe(true)
      expect(show({ show: false })).toBe(false)
      expect(show({ show: true })).toBe(true)
      expect(show(0)).toBe(true)
    })
  }
})

describe('tree', () => {
  const t = (s: Record<string, unknown>): { orient: string; symbolSize?: number; maxDepth?: number; edgeShape?: string } => (plan(series({ type: 'tree', data: [], ...s })) as { tree: { orient: string; symbolSize?: number; maxDepth?: number; edgeShape?: string } }).tree
  it('maps every orient alias and defaults to LR', () => {
    for (const [k, v] of [['LR', 'LR'], ['RL', 'RL'], ['TB', 'TB'], ['BT', 'BT'], ['horizontal', 'LR'], ['vertical', 'TB']] as const) {
      expect(t({ orient: k }).orient).toBe(v)
    }
    expect(t({}).orient).toBe('LR')
    expect(t({ orient: 'sideways' }).orient).toBe('LR')
    expect(t({ orient: 5 }).orient).toBe('LR')
  })
  it('layout: radial overrides the orient entirely', () => {
    expect(t({ layout: 'radial', orient: 'TB' }).orient).toBe('radial')
    expect(t({ layout: 'orthogonal', orient: 'TB' }).orient).toBe('TB')
  })
  it('initialTreeDepth becomes maxDepth + 1 and a negative one is ignored', () => {
    expect(t({ initialTreeDepth: 2 }).maxDepth).toBe(3)
    expect(t({ initialTreeDepth: 0 }).maxDepth).toBe(1)
    expect(t({ initialTreeDepth: -1 }).maxDepth).toBeUndefined()
    expect(t({}).maxDepth).toBeUndefined()
    expect(t({ initialTreeDepth: 'x' }).maxDepth).toBeUndefined()
  })
  it('symbolSize and a polyline edgeShape pass through; every other edgeShape keeps the default', () => {
    expect(t({ symbolSize: 12 }).symbolSize).toBe(12)
    expect(t({}).symbolSize).toBeUndefined()
    expect(t({ edgeShape: 'polyline' }).edgeShape).toBe('elbow')
    expect(t({ edgeShape: 'curve' }).edgeShape).toBeUndefined()
    expect(t({}).edgeShape).toBeUndefined()
  })
})

describe('sunburst', () => {
  const inner = (radius: unknown): number => (plan(series({ type: 'sunburst', data: [], radius })) as { innerRatio: number }).innerRatio
  it('radius [inner, outer] is a ratio; a single value means NO hole; absent keeps the default', () => {
    expect(inner(['25%', '100%'])).toBeCloseTo(0.25, 9)
    expect(inner([50, 100])).toBeCloseTo(0.5, 9)
    expect(inner(undefined)).toBeCloseTo(0.2, 9)
    // Any other *defined* radius (a single value, a wrong-length array) means a full disc.
    expect(inner('90%')).toBe(0)
    expect(inner(['90%'])).toBe(0)
    // A pair that cannot be parsed keeps the default rather than becoming NaN.
    expect(inner(['x', '100%'])).toBeCloseTo(0.2, 9)
    expect(inner(['10%', '0%'])).toBeCloseTo(0.2, 9)
  })
  it('sort: null or "none" pins the order; anything else leaves the default sort in place', () => {
    const sort = (v: unknown): string | undefined => (plan(series({ type: 'sunburst', data: [], sort: v })) as { sunburst: { sort?: string } }).sunburst.sort
    expect(sort(null)).toBe('none')
    expect(sort('none')).toBe('none')
    expect(sort('desc')).toBeUndefined()
    expect(sort(undefined)).toBeUndefined()
  })
  it('startAngle is degrees counter-clockwise, converted to our clockwise radians', () => {
    const angle = (v: unknown): number | undefined => (plan(series({ type: 'sunburst', data: [], startAngle: v })) as { sunburst: { startAngle?: number } }).sunburst.startAngle
    expect(angle(90)).toBeCloseTo(-Math.PI / 2, 9)
    expect(angle(0)).toBe(-0)
    expect(angle(undefined)).toBeUndefined()
    expect(angle('x')).toBeUndefined()
  })
})

describe('treemap', () => {
  it('leafDepth becomes maxDepth only when numeric', () => {
    const depth = (v: unknown): number | undefined => (plan(series({ type: 'treemap', data: [], leafDepth: v })) as { treemap: { maxDepth?: number } }).treemap.maxDepth
    expect(depth(2)).toBe(2)
    expect(depth('3')).toBe(3)
    expect(depth(undefined)).toBeUndefined()
    expect(depth(null)).toBeUndefined()
  })
})

describe('sankey and chord share one node/link parser', () => {
  for (const type of ['sankey', 'chord'] as const) {
    it(`${type}: nodes come from series.nodes, else from data`, () => {
      const viaNodes = plan(series({ type, nodes: [{ name: 'a' }], links: [] })) as { nodes: unknown[] }
      const viaData = plan(series({ type, data: [{ name: 'a' }], links: [] })) as { nodes: unknown[] }
      expect(viaNodes.nodes).toEqual([{ name: 'a' }])
      expect(viaData.nodes).toEqual([{ name: 'a' }])
      // `nodes` wins when both are present.
      expect((plan(series({ type, nodes: [{ name: 'fromNodes' }], data: [{ name: 'fromData' }] })) as { nodes: { name: string }[] }).nodes.map((n) => n.name)).toEqual(['fromNodes'])
    })
    it(`${type}: a node needs an object with a string name; itemStyle.color rides along`, () => {
      const c = compileFamily(series({ type, data: [], nodes: [{ name: 'a', itemStyle: { color: '#a' } }, { name: 7 }, 'b', { itemStyle: { color: '#x' } }, { name: 'c', itemStyle: 'x' }] }))!
      expect((c.plan as unknown as { nodes: unknown[] }).nodes).toEqual([{ name: 'a', color: '#a' }, { name: 'c' }])
      expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[1]', 'series[0].data[2]', 'series[0].data[3]'])
    })
    it(`${type}: links come from series.links, else series.edges, else nothing`, () => {
      const l = (s: Record<string, unknown>): unknown[] => (plan(series({ type, nodes: [{ name: 'a' }, { name: 'b' }], ...s })) as { links: unknown[] }).links
      expect(l({ links: [{ source: 'a', target: 'b', value: 1 }] })).toEqual([{ source: 'a', target: 'b', value: 1 }])
      expect(l({ edges: [{ source: 'a', target: 'b', value: 2 }] })).toEqual([{ source: 'a', target: 'b', value: 2 }])
      expect(l({})).toEqual([])
      expect(l({ links: 'x', edges: 'x' })).toEqual([])
      // `links` wins over `edges`.
      expect(l({ links: [{ source: 'a', target: 'b', value: 1 }], edges: [{ source: 'b', target: 'a', value: 9 }] })).toEqual([{ source: 'a', target: 'b', value: 1 }])
    })
    it(`${type}: a link needs string endpoints AND a numeric value`, () => {
      const c = compileFamily(series({ type, data: [], nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }, { source: 0, target: 'b', value: 1 }, { source: 'a', target: 1, value: 1 }, { source: 'a', target: 'b' }, 'x'] }))!
      expect((c.plan as unknown as { links: unknown[] }).links).toEqual([{ source: 'a', target: 'b', value: 1 }])
      expect(c.warnings.map((w) => w.path)).toEqual(['series[0].links[1]', 'series[0].links[2]', 'series[0].links[3]', 'series[0].links[4]'])
      expect(c.warnings[0]!.message).toContain('numeric value')
    })
    it(`${type}: labels show unless label.show is exactly false`, () => {
      const show = (label: unknown): boolean => {
        const p = plan(series({ type, nodes: [], label })) as { sankey?: { showLabels: boolean }; chord?: { showLabels: boolean } }
        return (p.sankey ?? p.chord)!.showLabels
      }
      expect(show(undefined)).toBe(true)
      expect(show({ show: false })).toBe(false)
      expect(show([])).toBe(true)
    })
  }
  it('sankey: layout numbers pass through only when numeric, and nodeAlign only when "left"', () => {
    const sk = (s: Record<string, unknown>): Record<string, unknown> => (plan(series({ type: 'sankey', nodes: [], ...s })) as unknown as { sankey: Record<string, unknown> }).sankey
    expect(sk({ nodeWidth: 14, nodeGap: 6, layoutIterations: 3, nodeAlign: 'left' })).toEqual({ showLabels: true, nodeWidth: 14, nodePadding: 6, iterations: 3, align: 'left' })
    expect(sk({ nodeWidth: 'x', nodeGap: null, layoutIterations: undefined, nodeAlign: 'right' })).toEqual({ showLabels: true })
    expect(sk({})).toEqual({ showLabels: true })
  })
  it('sankey: a vertical orient carries into the plan (the host lays out transposed) and never warns', () => {
    expect(warns(series({ type: 'sankey', data: [], nodes: [], orient: 'vertical' }))).toEqual([])
    expect(plan(series({ type: 'sankey', data: [], nodes: [], orient: 'vertical' }))).toMatchObject({ orient: 'vertical' })
    expect(warns(series({ type: 'sankey', data: [], nodes: [], orient: 'horizontal' }))).toEqual([])
    expect(plan(series({ type: 'sankey', data: [], nodes: [] }))).not.toHaveProperty('orient')
  })
  it('chord: padAngle and ringSize pass through only when numeric', () => {
    const ch = (s: Record<string, unknown>): Record<string, unknown> => (plan(series({ type: 'chord', nodes: [], ...s })) as unknown as { chord: Record<string, unknown> }).chord
    expect(ch({ padAngle: 0.05, ringSize: 0.3 })).toEqual({ showLabels: true, padAngle: 0.05, ringRatio: 0.3 })
    expect(ch({ padAngle: 'x' })).toEqual({ showLabels: true })
    expect(ch({})).toEqual({ showLabels: true })
    // A sankey-only key on a chord is the deliberate "written for a sankey" warning.
    expect(warns(series({ type: 'chord', data: [], nodes: [], nodeAlign: 'left' }))).toEqual(['series[0].nodeAlign'])
    // A nodes-only series still trips the header's data-must-be-an-array warning,
    // because `data` is the generic slot every family shares.
    expect(warns(series({ type: 'chord', nodes: [] }))).toEqual(['series[0].data'])
  })
})

describe('graph', () => {
  const g = (s: Record<string, unknown>): Record<string, unknown> => (plan(series({ type: 'graph', ...s })) as unknown as { graph: Record<string, unknown> }).graph
  it('a node id falls back name → index label, and x/y/value/category ride along only when numeric', () => {
    const p = plan(series({ type: 'graph', data: [{ id: 'n1', value: 3, category: 1, x: 10, y: 20, itemStyle: { color: '#c' } }, { id: 7 }, { name: 'byName' }, {}, { id: 'n5', value: 'x', category: 'x', x: 'x', y: null }] })) as unknown as { nodes: Record<string, unknown>[] }
    // An uncategorised node without its own colour takes the series colour
    // (ECharts' graph default, `colorBy: 'series'`); `c` is that colour here.
    const c = paletteAt([], 0)
    expect(p.nodes).toEqual([
      { id: 'n1', value: 3, category: 1, color: '#c', x: 10, y: 20 },
      { id: '7', color: c },
      { id: 'byName', name: 'byName', color: c },
      { id: 'Node 4', color: c },
      { id: 'n5', color: c },
    ])
  })
  it('a non-object node is skipped by name', () => {
    const c = compileFamily(series({ type: 'graph', data: [{ name: 'a' }, 'b', null] }))!
    expect((c.plan as unknown as { nodes: unknown[] }).nodes).toHaveLength(1)
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[1]', 'series[0].data[2]'])
  })
  it('a link endpoint may be a node NAME or an INDEX into the node list', () => {
    const base = { type: 'graph', data: [{ name: 'a' }, { name: 'b' }] }
    expect((plan(series({ ...base, links: [{ source: 0, target: 1, value: 4 }] })) as { links: unknown[] }).links).toEqual([{ source: 'a', target: 'b', value: 4 }])
    expect((plan(series({ ...base, edges: [{ source: 'a', target: 'b' }] })) as { links: unknown[] }).links).toEqual([{ source: 'a', target: 'b' }])
    // An out-of-range index, a non-object link, and a missing endpoint are all skipped.
    const c = compileFamily(series({ ...base, links: [{ source: 9, target: 0 }, { source: 'a' }, 'x'] }))!
    expect((c.plan as unknown as { links: unknown[] }).links).toEqual([])
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].links[0]', 'series[0].links[1]', 'series[0].links[2]'])
    expect(c.warnings[0]!.message).toContain('name or index')
  })
  it('categories come from objects, strings, or a positional fallback; absent means no key', () => {
    expect(g({ categories: [{ name: 'A' }, 'B', 7] })['categories']).toEqual(['A', 'B', 'Category 3'])
    expect(g({})['categories']).toBeUndefined()
    expect(g({ categories: 'x' })['categories']).toBeUndefined()
  })
  it('layout maps circular / none and otherwise falls back to force', () => {
    expect(g({ layout: 'circular' })['layout']).toBe('circular')
    expect(g({ layout: 'none' })['layout']).toBe('none')
    expect(g({ layout: 'force' })['layout']).toBe('force')
    expect(g({})['layout']).toBe('force')
  })
  it('force numbers accept the [min, max] array form and the scalar form', () => {
    expect(g({ force: { repulsion: [50, 100], edgeLength: [10, 20], gravity: 0.2 } })).toMatchObject({ repulsion: 50, linkDistance: 10, gravity: 0.2 })
    expect(g({ force: { repulsion: 80, edgeLength: 30 } })).toMatchObject({ repulsion: 80, linkDistance: 30 })
    const bare = g({ force: { repulsion: 'x', edgeLength: [], gravity: null } })
    expect(bare['repulsion']).toBeUndefined()
    expect(bare['linkDistance']).toBeUndefined()
    expect(bare['gravity']).toBeUndefined()
    expect(g({ force: 'x' })['repulsion']).toBeUndefined()
    expect(g({})['repulsion']).toBeUndefined()
  })
  it('a symbolSize FUNCTION warns by name; a number passes through', () => {
    expect(warns(series({ type: 'graph', data: [], symbolSize: () => 5 }))).toEqual(['series[0].symbolSize'])
    expect(g({ symbolSize: 18 })['symbolSize']).toBe(18)
    expect(warns(series({ type: 'graph', data: [], symbolSize: 18 }))).toEqual([])
    expect(g({})['symbolSize']).toBeUndefined()
  })
  it('labels are OFF unless label.show is exactly true', () => {
    expect(g({ label: { show: true } })['showLabels']).toBe(true)
    expect(g({ label: {} })['showLabels']).toBe(false)
    expect(g({ label: 'x' })['showLabels']).toBe(false)
    expect(g({})['showLabels']).toBe(false)
  })
})
