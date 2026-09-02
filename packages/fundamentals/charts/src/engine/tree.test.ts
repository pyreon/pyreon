import { describe, expect, it } from 'vitest'
import { hitTree, layoutTree, linkPoints, renderTree, treeToSvg } from './tree'
import type { TreeNode } from './treemap'
import { compileFamily, familyToSvg } from './option-family'

const box = { x: 0, y: 0, w: 400, h: 300 }
const root: TreeNode[] = [
  { name: 'root', children: [{ name: 'a', children: [{ name: 'a1' }, { name: 'a2' }] }, { name: 'b' }] },
]

describe('tree layout (tidy)', () => {
  it('leaves take distinct slots and a parent sits at the centre of its leaves', () => {
    const { nodes, links } = layoutTree(root, box)
    expect(nodes.map((n) => n.name)).toEqual(['root', 'a', 'a1', 'a2', 'b'])
    const a = nodes.find((n) => n.name === 'a')!
    const a1 = nodes.find((n) => n.name === 'a1')!
    const a2 = nodes.find((n) => n.name === 'a2')!
    const b = nodes.find((n) => n.name === 'b')!
    expect(a.at.y).toBeCloseTo((a1.at.y + a2.at.y) / 2, 9)
    expect(new Set([a1.at.y, a2.at.y, b.at.y]).size).toBe(3)
    // LR: depth grows along x; the root is leftmost, the leaves rightmost.
    expect(nodes[0]!.at.x).toBeLessThan(a.at.x)
    expect(a.at.x).toBeLessThan(a1.at.x)
    // b is a depth-1 leaf: it shares a column with a, not with the depth-2 leaves.
    expect(b.at.x).toBeCloseTo(a.at.x, 9)
    expect(b.at.x).toBeLessThan(a1.at.x)
    expect(links).toHaveLength(4)
    expect(links.find((l) => l.path.join('.') === '0.0.1')!.from).toEqual(a.at)
    expect(a1.path).toEqual([0, 0, 0])
    expect(a1.leaf).toBe(true)
    expect(a.leaf).toBe(false)
  })
  it('orients: RL mirrors x, TB/BT grow along y, radial rings by depth', () => {
    const lr = layoutTree(root, box, { orient: 'LR' }).nodes
    const rl = layoutTree(root, box, { orient: 'RL' }).nodes
    expect(rl[0]!.at.x).toBeGreaterThan(rl[2]!.at.x)
    expect(lr[0]!.at.x + rl[0]!.at.x).toBeCloseTo(box.w, 6)
    const tb = layoutTree(root, box, { orient: 'TB' }).nodes
    expect(tb[0]!.at.y).toBeLessThan(tb[2]!.at.y)
    const bt = layoutTree(root, box, { orient: 'BT' }).nodes
    expect(bt[0]!.at.y).toBeGreaterThan(bt[2]!.at.y)
    const radial = layoutTree(root, box, { orient: 'radial' }).nodes
    const c = { x: 200, y: 150 }
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - c.x, p.y - c.y)
    expect(dist(radial[0]!.at)).toBeCloseTo(0, 9)
    expect(dist(radial[1]!.at)).toBeGreaterThan(0)
    expect(dist(radial[2]!.at)).toBeGreaterThan(dist(radial[1]!.at))
    expect(dist(radial[2]!.at)).toBeCloseTo(dist(radial[3]!.at), 9)
    expect(dist(radial[4]!.at)).toBeCloseTo(dist(radial[1]!.at), 9)
  })
  it('maxDepth truncates: a cut-off parent becomes a leaf and children vanish', () => {
    const { nodes } = layoutTree(root, box, { maxDepth: 2 })
    expect(nodes.map((n) => n.name)).toEqual(['root', 'a', 'b'])
    expect(nodes[1]!.leaf).toBe(true)
  })
  it('link points: curves start and end on the nodes; elbows are 4-point steps; radial spokes are straight', () => {
    const link = { from: { x: 0, y: 0 }, to: { x: 100, y: 50 }, path: [0, 0] }
    const curve = linkPoints(link, 'LR', 'curve')
    expect(curve[0]).toEqual(link.from)
    expect(curve[curve.length - 1]).toEqual(link.to)
    expect(curve.length).toBeGreaterThan(4)
    const elbow = linkPoints(link, 'TB', 'elbow')
    expect(elbow).toHaveLength(4)
    expect(elbow[1]!.x).toBe(0)
    expect(elbow[2]!.x).toBe(100)
    expect(linkPoints(link, 'radial', 'curve')).toHaveLength(2)
  })
  it('renders links then symbols then labels; entrance reveals root-first', () => {
    const layout = layoutTree(root, box)
    const full = renderTree(layout)
    expect(full.filter((c) => c.kind === 'polyline')).toHaveLength(4)
    expect(full.filter((c) => c.kind === 'circle')).toHaveLength(5)
    expect(full.filter((c) => c.kind === 'text')).toHaveLength(5)
    const leafLabel = full.filter((c) => c.kind === 'text').find((c) => c.kind === 'text' && c.text === 'a1')!
    if (leafLabel.kind !== 'text') throw new Error('text')
    expect(leafLabel.align).toBe('start')
    const rootLabel = full.filter((c) => c.kind === 'text').find((c) => c.kind === 'text' && c.text === 'root')!
    if (rootLabel.kind !== 'text') throw new Error('text')
    expect(rootLabel.align).toBe('end')
    const third = renderTree(layout, { progress: 0.4 })
    expect(third.filter((c) => c.kind === 'circle')).toHaveLength(1)
    expect(third.filter((c) => c.kind === 'polyline')).toHaveLength(0)
    expect(third.filter((c) => c.kind === 'text')).toHaveLength(0)
  })
  it('hit-testing returns the nearest node within its symbol halo', () => {
    const layout = layoutTree(root, box)
    const b = layout.nodes.find((n) => n.name === 'b')!
    expect(hitTree(layout, b.at.x + 3, b.at.y - 3)!.name).toBe('b')
    expect(hitTree(layout, b.at.x + 40, b.at.y)).toBeNull()
  })
  it('degenerate inputs do not NaN', () => {
    expect(layoutTree([], box)).toEqual({ nodes: [], links: [] })
    const one = layoutTree([{ name: 'only' }], box)
    expect(Number.isFinite(one.nodes[0]!.at.x)).toBe(true)
    expect(Number.isFinite(layoutTree([{ name: 'only' }], box, { orient: 'radial' }).nodes[0]!.at.x)).toBe(true)
  })
  it('treeToSvg renders and describes', () => {
    const svg = treeToSvg({ data: root, title: 'Org' })
    expect(svg).toContain('<circle')
    expect(svg).toContain('5 nodes, 3 leaves')
    expect(svg).not.toContain('NaN')
  })
})

describe('tree option mapping', () => {
  it('ECharts tree series lowers orient/layout/symbolSize/initialTreeDepth/edgeShape', () => {
    const f = compileFamily({
      series: [{ type: 'tree', orient: 'TB', symbolSize: 12, initialTreeDepth: 2, edgeShape: 'polyline', data: [{ name: 'r', children: [{ name: 'x', children: [{ name: 'y' }] }] }] }],
    })!
    if (f.plan.kind !== 'tree') throw new Error('kind')
    expect(f.plan.tree.orient).toBe('TB')
    expect(f.plan.tree.symbolSize).toBe(12)
    expect(f.plan.tree.maxDepth).toBe(3)
    expect(f.plan.tree.edgeShape).toBe('elbow')
    expect(f.warnings).toEqual([])
    expect(familyToSvg(f.plan)).toContain('<circle')
    const radial = compileFamily({ series: [{ type: 'tree', layout: 'radial', data: [{ name: 'r' }] }] })!
    if (radial.plan.kind !== 'tree') throw new Error('kind')
    expect(radial.plan.tree.orient).toBe('radial')
  })
})
