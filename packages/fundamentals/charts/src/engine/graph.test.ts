import { describe, expect, it } from 'vitest'
import { layoutGraph, renderGraph } from './graph'
import { hitGraph } from './graph-hit'
import { graphToSvg } from './family-svg'
import { compileFamily, familyToSvg } from './option-family'

const box = { x: 0, y: 0, w: 400, h: 300 }
const nodes = [{ id: 'a', value: 10 }, { id: 'b', value: 5 }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }]
const links = [
  { source: 'a', target: 'b', value: 2 },
  { source: 'a', target: 'c' },
  { source: 'b', target: 'c' },
  { source: 'd', target: 'e' },
]
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y)

describe('graph layout', () => {
  it('force: deterministic, inside the box, no two symbols overlap, linked closer than unlinked', () => {
    const a = layoutGraph(nodes, links, box)
    const b = layoutGraph(nodes, links, box)
    expect(a.nodes.map((n) => n.at)).toEqual(b.nodes.map((n) => n.at))
    for (const n of a.nodes) {
      expect(n.at.x).toBeGreaterThanOrEqual(n.radius - 1e-9)
      expect(n.at.x).toBeLessThanOrEqual(400 - n.radius + 1e-9)
      expect(n.at.y).toBeGreaterThanOrEqual(n.radius - 1e-9)
      expect(n.at.y).toBeLessThanOrEqual(300 - n.radius + 1e-9)
    }
    for (let i = 0; i < a.nodes.length; i++)
      for (let j = i + 1; j < a.nodes.length; j++)
        expect(dist(a.nodes[i]!.at, a.nodes[j]!.at)).toBeGreaterThan(a.nodes[i]!.radius + a.nodes[j]!.radius)
    const by = (id: string) => a.nodes.find((n) => n.id === id)!
    expect(dist(by('a').at, by('b').at)).toBeLessThan(dist(by('a').at, by('f').at))
    expect(a.dropped).toEqual([])
  })
  it('a different seed gives a different arrangement', () => {
    const a = layoutGraph(nodes, links, box, { seed: 1 })
    const b = layoutGraph(nodes, links, box, { seed: 2 })
    expect(a.nodes.map((n) => n.at)).not.toEqual(b.nodes.map((n) => n.at))
  })
  it('symbol radius scales with value between 0.6x and 2x of half the base', () => {
    const l = layoutGraph(nodes, links, box, { symbolSize: 20 })
    const by = (id: string) => l.nodes.find((n) => n.id === id)!
    expect(by('a').radius).toBeCloseTo(20, 9)
    expect(by('c').radius).toBeCloseTo(10, 9)
    expect(by('b').radius).toBeGreaterThan(by('c').radius)
    expect(by('b').radius).toBeLessThan(by('a').radius)
  })
  it('circular: evenly spaced on a circle in input order, starting at 12 o clock', () => {
    const l = layoutGraph(nodes, links, box, { layout: 'circular' })
    const c = { x: 200, y: 150 }
    const r = dist(l.nodes[0]!.at, c)
    for (const n of l.nodes) expect(dist(n.at, c)).toBeCloseTo(r, 6)
    expect(l.nodes[0]!.at.x).toBeCloseTo(200, 6)
    expect(l.nodes[0]!.at.y).toBeLessThan(150)
    expect(dist(l.nodes[0]!.at, l.nodes[1]!.at)).toBeCloseTo(dist(l.nodes[1]!.at, l.nodes[2]!.at), 6)
  })
  it('none: data coordinates are scaled into the box with a symbol pad', () => {
    const l = layoutGraph([{ id: 'p', x: 0, y: 0 }, { id: 'q', x: 10, y: 5 }, { id: 'r', x: 5, y: 2.5 }], [], box, { layout: 'none', symbolSize: 10 })
    expect(l.nodes[0]!.at).toEqual({ x: 10, y: 10 })
    expect(l.nodes[1]!.at).toEqual({ x: 390, y: 290 })
    expect(l.nodes[2]!.at).toEqual({ x: 200, y: 150 })
  })
  it('drops links with unknown endpoints by name; categories colour nodes', () => {
    const l = layoutGraph([{ id: 'a', category: 1 }, { id: 'b', category: 1 }, { id: 'c', category: 0 }], [{ source: 'a', target: 'zzz' }], box, { categories: ['x', 'y'] })
    expect(l.links).toEqual([])
    expect(l.dropped).toEqual(['a -> zzz'])
    expect(l.nodes[0]!.color).toBe(l.nodes[1]!.color)
    expect(l.nodes[0]!.color).not.toBe(l.nodes[2]!.color)
  })
  it('renders links (width by value) under symbols, labels opt-in, entrance converges from the centre', () => {
    const l = layoutGraph(nodes, links, box)
    const cmds = renderGraph(l, box)
    const lines = cmds.filter((c) => c.kind === 'line')
    expect(lines).toHaveLength(4)
    const widths = lines.map((c) => (c.kind === 'line' ? c.width : 0))
    expect(Math.max(...widths)).toBeCloseTo(4, 9)
    expect(Math.min(...widths)).toBeCloseTo(1, 9)
    expect(cmds.filter((c) => c.kind === 'circle')).toHaveLength(6)
    expect(cmds.filter((c) => c.kind === 'text')).toHaveLength(0)
    expect(renderGraph(l, box, { showLabels: true }).filter((c) => c.kind === 'text')).toHaveLength(6)
    const start = renderGraph(l, box, { progress: 0 }).filter((c) => c.kind === 'circle')
    for (const c of start) if (c.kind === 'circle') expect(c.center).toEqual({ x: 200, y: 150 })
  })
  it('hit-testing finds the symbol under the point', () => {
    const l = layoutGraph(nodes, links, box)
    const a = l.nodes[0]!
    expect(hitGraph(l, a.at.x + 1, a.at.y - 1)!.id).toBe('a')
    expect(hitGraph(l, -50, -50)).toBeNull()
  })
  it('graphToSvg renders and describes; empty input is fine', () => {
    const svg = graphToSvg({ nodes, links, title: 'Net' })
    expect(svg).toContain('<circle')
    expect(svg).toContain('6 nodes, 4 links')
    expect(svg).not.toContain('NaN')
    expect(graphToSvg({ nodes: [], links: [] })).toContain('<svg')
  })
})

describe('graph option mapping', () => {
  it('ECharts graph series lowers layout/categories/symbolSize/force/label', () => {
    const f = compileFamily({
      series: [{
        type: 'graph', layout: 'force', symbolSize: 14, categories: [{ name: 'x' }, { name: 'y' }],
        force: { repulsion: 500, edgeLength: 40, gravity: 0.2 }, label: { show: true },
        data: [{ id: '1', name: 'one', value: 3, category: 1, itemStyle: { color: '#123456' } }, { name: 'two' }],
        links: [{ source: '1', target: 'two', value: 2 }],
      }],
    })!
    if (f.plan.kind !== 'graph') throw new Error('kind')
    expect(f.plan.nodes[0]).toMatchObject({ id: '1', name: 'one', value: 3, category: 1, color: '#123456' })
    expect(f.plan.nodes[1]!.id).toBe('two')
    expect(f.plan.links[0]).toEqual({ source: '1', target: 'two', value: 2 })
    expect(f.plan.graph).toMatchObject({ layout: 'force', symbolSize: 14, categories: ['x', 'y'], repulsion: 500, linkDistance: 40, gravity: 0.2, showLabels: true })
    expect(f.warnings).toEqual([])
    expect(familyToSvg(f.plan)).toContain('<circle')
    const fn = compileFamily({ series: [{ type: 'graph', symbolSize: () => 3, data: [{ name: 'a' }], links: [] }] })!
    expect(fn.warnings.map((w) => w.code)).toContain('series-option-unsupported')
  })
})
