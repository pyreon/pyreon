import { describe, expect, it } from 'vitest'
import { hitSunburst, layoutSunburst, renderSunburst, treeDepth } from './sunburst'
import { sunburstToSvg } from './family-svg'
import type { TreeNode } from './treemap'
import { compileFamily, familyToSvg } from './option-family'

const TAU = Math.PI * 2
const tree: TreeNode[] = [
  { name: 'a', children: [{ name: 'a1', value: 3 }, { name: 'a2', value: 1 }] },
  { name: 'b', value: 4 },
  { name: 'c', value: 2 },
]
const center = { x: 0, y: 0 }

describe('sunburst layout', () => {
  it('top-level spans are proportional to value and fill the full turn', () => {
    const arcs = layoutSunburst(tree, 20, 100)
    const top = arcs.filter((a) => a.depth === 0)
    expect(top).toHaveLength(3)
    const sum = top.reduce((s, a) => s + (a.end - a.start), 0)
    expect(sum).toBeCloseTo(TAU, 9)
    const a = top.find((x) => x.name === 'a')!
    const c = top.find((x) => x.name === 'c')!
    expect((a.end - a.start) / (c.end - c.start)).toBeCloseTo(2, 9)
  })
  it('children sit inside the parent span, on the next ring, inheriting colour', () => {
    const arcs = layoutSunburst(tree, 20, 100)
    const a = arcs.find((x) => x.name === 'a')!
    const a1 = arcs.find((x) => x.name === 'a1')!
    expect(a1.depth).toBe(1)
    expect(a1.path).toEqual([0, 0])
    expect(a1.start).toBeGreaterThanOrEqual(a.start - 1e-9)
    expect(a1.end).toBeLessThanOrEqual(a.end + 1e-9)
    expect(a1.innerR).toBeCloseTo(a.outerR, 9)
    expect(a.innerR).toBe(20)
    expect(a1.outerR).toBeCloseTo(100, 9)
    expect(a1.color).toBe(a.color)
    expect(treeDepth(tree)).toBe(2)
  })
  it('sorts siblings by value by default and keeps data order with sort:none', () => {
    const sorted = layoutSunburst(tree, 0, 100).filter((a) => a.depth === 0)
    expect(sorted[0]!.name).toBe('a')
    expect(sorted[1]!.name).toBe('b')
    const kept = layoutSunburst(tree, 0, 100, { sort: 'none' }).filter((a) => a.depth === 0)
    expect(kept.map((a) => a.name)).toEqual(['a', 'b', 'c'])
    expect(kept[0]!.start).toBeCloseTo(-Math.PI / 2, 9)
  })
  it('padAngle carves gaps and maxDepth limits rings', () => {
    const arcs = layoutSunburst(tree, 0, 100, { padAngle: 0.1, sort: 'none' }).filter((a) => a.depth === 0)
    expect(arcs[1]!.start - arcs[0]!.end).toBeCloseTo(0.1, 9)
    const shallow = layoutSunburst(tree, 0, 100, { maxDepth: 1 })
    expect(shallow.every((a) => a.depth === 0)).toBe(true)
    expect(shallow[0]!.outerR).toBe(100)
  })
  it('renders a polygon per arc, labels only where the chord fits, entrance sweeps clockwise', () => {
    const arcs = layoutSunburst(tree, 20, 100)
    const full = renderSunburst(arcs, center)
    expect(full.filter((c) => c.kind === 'polygon')).toHaveLength(arcs.length)
    expect(full.filter((c) => c.kind === 'text').length).toBeGreaterThan(0)
    const half = renderSunburst(arcs, center, { progress: 0.5 })
    expect(half.filter((c) => c.kind === 'text')).toHaveLength(0)
    expect(half.filter((c) => c.kind === 'polygon').length).toBeLessThan(arcs.length)
  })
  it('hit-testing returns the deepest arc, respects the hole, and wraps past 12 o clock', () => {
    const arcs = layoutSunburst(tree, 20, 100, { sort: 'none' })
    const a1 = arcs.find((x) => x.name === 'a1')!
    const mid = (a1.start + a1.end) / 2
    const r = (a1.innerR + a1.outerR) / 2
    expect(hitSunburst(arcs, center, Math.cos(mid) * r, Math.sin(mid) * r)!.name).toBe('a1')
    const a = arcs.find((x) => x.name === 'a')!
    const rA = (a.innerR + a.outerR) / 2
    expect(hitSunburst(arcs, center, Math.cos(mid) * rA, Math.sin(mid) * rA)!.name).toBe('a')
    expect(hitSunburst(arcs, center, 1, 1)).toBeNull()
    // The last arc ends at 12 o'clock exactly; a point just before it must hit c.
    const c = arcs.find((x) => x.name === 'c')!
    const late = c.end - 0.01
    expect(hitSunburst(arcs, center, Math.cos(late) * rA, Math.sin(late) * rA)!.name).toBe('c')
  })
  it('degenerate inputs do not NaN', () => {
    expect(layoutSunburst([], 0, 100)).toEqual([])
    const zero = layoutSunburst([{ name: 'z', value: 0 }], 0, 100)
    expect(zero[0]!.end - zero[0]!.start).toBe(0)
    expect(renderSunburst(zero, center)).toHaveLength(0)
  })
  it('sunburstToSvg renders and describes', () => {
    const svg = sunburstToSvg({ data: tree, title: 'Budget' })
    expect(svg).toContain('<polygon')
    expect(svg).toContain('2 levels, 4 leaves')
    expect(svg).not.toContain('NaN')
  })
})

describe('sunburst option mapping', () => {
  it('nested ECharts data maps to TreeNodes; radius + sort + startAngle lower', () => {
    const f = compileFamily({
      series: [{ type: 'sunburst', radius: ['25%', '90%'], sort: null, startAngle: 90, data: [{ name: 'p', children: [{ name: 'x', value: 2 }] }, { name: 'q', value: 3 }] }],
    })!
    if (f.plan.kind !== 'sunburst') throw new Error('kind')
    expect(f.plan.nodes[0]!.children![0]!.name).toBe('x')
    expect(f.plan.innerRatio).toBeCloseTo(25 / 90, 9)
    expect(f.plan.sunburst.sort).toBe('none')
    expect(f.plan.sunburst.startAngle).toBeCloseTo(-Math.PI / 2, 9)
    expect(f.warnings).toEqual([])
    expect(familyToSvg(f.plan)).toContain('<polygon')
  })
})
