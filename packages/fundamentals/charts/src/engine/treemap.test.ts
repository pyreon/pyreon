import { describe, expect, it } from 'vitest'
import { hitTreemap, layoutTreemap, nodeValue, renderTreemap, treemapToSvg } from './treemap'
import type { TreeNode } from './treemap'
import { compileFamily, familyToSvg } from './option-family'

const rect = { x: 0, y: 0, w: 400, h: 200 }
const flat: TreeNode[] = [{ name: 'a', value: 6 }, { name: 'b', value: 6 }, { name: 'c', value: 4 }, { name: 'd', value: 3 }, { name: 'e', value: 2 }, { name: 'f', value: 2 }, { name: 'g', value: 1 }]

describe('treemap layout (squarify)', () => {
  it('areas are proportional to values and tile the rect exactly', () => {
    const cells = layoutTreemap(flat, rect)
    const total = cells.reduce((s, c) => s + c.rect.w * c.rect.h, 0)
    expect(total).toBeCloseTo(400 * 200, 6)
    const a = cells.find((c) => c.name === 'a')!
    const g = cells.find((c) => c.name === 'g')!
    expect((a.rect.w * a.rect.h) / (g.rect.w * g.rect.h)).toBeCloseTo(6, 6)
  })
  it('keeps aspect ratios sane (the whole point of squarify)', () => {
    const cells = layoutTreemap(flat, rect)
    for (const c of cells) {
      const ar = Math.max(c.rect.w / c.rect.h, c.rect.h / c.rect.w)
      expect(ar).toBeLessThan(4)
    }
  })
  it('nests children inside a padded parent and sums parent values', () => {
    const tree: TreeNode[] = [{ name: 'p', children: [{ name: 'x', value: 3 }, { name: 'y', value: 1 }] }, { name: 'q', value: 4 }]
    expect(nodeValue(tree[0]!)).toBe(4)
    const cells = layoutTreemap(tree, rect, { padding: 4 })
    const p = cells.find((c) => c.name === 'p')!
    const x = cells.find((c) => c.name === 'x')!
    expect(p.leaf).toBe(false)
    expect(x.depth).toBe(1)
    expect(x.path).toEqual([0, 0])
    expect(x.rect.x).toBeGreaterThanOrEqual(p.rect.x + 4 - 1e-9)
    expect(x.rect.x + x.rect.w).toBeLessThanOrEqual(p.rect.x + p.rect.w - 4 + 1e-9)
    expect(x.color).toBe(p.color)
  })
  it('maxDepth stops the descent', () => {
    const tree: TreeNode[] = [{ name: 'p', children: [{ name: 'x', value: 1 }] }]
    expect(layoutTreemap(tree, rect, { maxDepth: 1 })).toHaveLength(1)
  })
  it('renders one rect per cell, labels only on leaves that fit, entrance scales', () => {
    const cells = layoutTreemap(flat, rect)
    const full = renderTreemap(cells)
    expect(full.filter((c) => c.kind === 'rect')).toHaveLength(cells.length)
    expect(full.filter((c) => c.kind === 'text').length).toBeGreaterThan(0)
    const half = renderTreemap(cells, { progress: 0.5 })
    expect(half.filter((c) => c.kind === 'text')).toHaveLength(0)
    const r = half[0]!
    if (r.kind !== 'rect') throw new Error('rect')
    expect(r.rect.w).toBeCloseTo(cells[0]!.rect.w / 2, 9)
  })
  it('hit-testing returns the DEEPEST cell', () => {
    const tree: TreeNode[] = [{ name: 'p', children: [{ name: 'x', value: 1 }] }]
    const cells = layoutTreemap(tree, rect, { padding: 10 })
    const x = cells.find((c) => c.name === 'x')!
    expect(hitTreemap(cells, x.rect.x + 1, x.rect.y + 1)!.name).toBe('x')
    expect(hitTreemap(cells, 1, 1)!.name).toBe('p')
    expect(hitTreemap(cells, -5, -5)).toBeNull()
  })
  it('degenerate inputs (zero values, empty) do not NaN', () => {
    const cells = layoutTreemap([{ name: 'z', value: 0 }], rect)
    expect(Number.isFinite(cells[0]!.rect.w)).toBe(true)
    expect(layoutTreemap([], rect)).toEqual([])
  })
  it('treemapToSvg renders and describes', () => {
    const svg = treemapToSvg({ data: flat, title: 'Disk' })
    expect(svg).toContain('<svg')
    expect(svg).toContain('7 leaves')
    expect(svg).not.toContain('NaN')
  })
})

describe('treemap option mapping', () => {
  it('nested ECharts data maps to TreeNodes; leafDepth maps to maxDepth', () => {
    const f = compileFamily({ series: [{ type: 'treemap', leafDepth: 1, data: [{ name: 'p', children: [{ name: 'x', value: 2 }] }, { name: 'q', value: 3 }] }] })!
    if (f.plan.kind !== 'treemap') throw new Error('kind')
    expect(f.plan.nodes[0]!.children![0]!.name).toBe('x')
    expect(f.plan.treemap.maxDepth).toBe(1)
    expect(f.warnings).toEqual([])
    expect(familyToSvg(f.plan)).toContain('<rect')
  })
})
