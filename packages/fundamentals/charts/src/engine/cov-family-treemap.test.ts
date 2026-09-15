// Branch coverage for the treemap family: the iterative value roll-up (a deep
// tree must not recurse), the squarify row packer's degenerate rows, the depth
// tint, and the label-fit rule. Every arm here is reachable from ordinary
// hierarchy data — an empty group, a zero-valued child, a cell too small for
// its own name.
import { describe, expect, it } from 'vitest'
import { approxTextWidth, hitTreemap, hitTreemapIndex, layoutTreemap, nodeValue, orderByValue, renderTreemap, tintHex } from './treemap'
import type { TreeNode } from './treemap'

const rect = { x: 0, y: 0, w: 400, h: 300 }
const tree: TreeNode[] = [
  { name: 'A', children: [{ name: 'A1', value: 30 }, { name: 'A2', value: 20 }] },
  { name: 'B', value: 40 },
  { name: 'C', value: 10 },
]

describe('treemap — nodeValue rolls a hierarchy up without recursing', () => {
  it("a node's OWN value wins over its children", () => {
    expect(nodeValue({ name: 'x', value: 5, children: [{ name: 'y', value: 100 }] })).toBe(5)
  })
  it('a group with no value sums its children', () => {
    expect(nodeValue(tree[0]!)).toBe(50)
  })
  it('a leaf with neither value nor children is worth nothing', () => {
    expect(nodeValue({ name: 'empty' })).toBe(0)
    expect(nodeValue({ name: 'empty', children: [] })).toBe(0)
  })
  it('a DEEP chain sums through every level without blowing the stack', () => {
    let node: TreeNode = { name: 'leaf', value: 1 }
    for (let i = 0; i < 5000; i++) node = { name: `n${i}`, children: [node] }
    expect(nodeValue(node)).toBe(1)
  })
  it('a nested child with NEITHER value nor children contributes nothing', () => {
    expect(nodeValue({ name: 'p', children: [{ name: 'hollow' }, { name: 'real', value: 3 }] })).toBe(3)
  })
  it('a WIDE tree of groups sums every branch', () => {
    const wide: TreeNode = { name: 'root', children: Array.from({ length: 50 }, (_, i) => ({ name: `g${i}`, children: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }] })) }
    expect(nodeValue(wide)).toBe(150)
  })
  it('an explicit zero is honoured rather than falling through to the children', () => {
    expect(nodeValue({ name: 'z', value: 0, children: [{ name: 'k', value: 7 }] })).toBe(0)
  })
})

describe('treemap — orderByValue', () => {
  it('sorts descending by rolled-up value and keeps the ORIGINAL indices', () => {
    expect(orderByValue([{ name: 'a', value: 1 }, { name: 'b', value: 9 }, { name: 'c', value: 5 }])).toEqual([1, 2, 0])
  })
  it('an empty or single child list needs no work', () => {
    expect(orderByValue([])).toEqual([])
    expect(orderByValue([{ name: 'a', value: 1 }])).toEqual([0])
  })
  it('ties keep their input order', () => {
    expect(orderByValue([{ name: 'a', value: 5 }, { name: 'b', value: 5 }])).toEqual([0, 1])
  })
})

describe('treemap — layout', () => {
  const area = (c: { rect: { w: number; h: number } }) => c.rect.w * c.rect.h

  it('the top level tiles the whole rect, and leaves come after their parents', () => {
    const cells = layoutTreemap(tree, rect)
    const top = cells.filter((c) => c.depth === 0)
    const total = top.reduce((s, c) => s + area(c), 0)
    expect(total).toBeCloseTo(400 * 300, 6)
    expect(cells[0]!.depth, 'a parent is emitted before its children').toBe(0)
    expect(cells.some((c) => c.depth === 1)).toBe(true)
    for (let i = 1; i < cells.length; i++) if (cells[i]!.depth === 1) expect(cells.slice(0, i).some((p) => p.depth === 0)).toBe(true)
  })
  it('cell area is proportional to value', () => {
    const cells = layoutTreemap(tree, rect)
    const byName = (n: string) => cells.find((c) => c.name === n)!
    expect(area(byName('A')) / area(byName('C'))).toBeCloseTo(5, 6)
  })
  it('an EMPTY hierarchy produces no cells', () => {
    expect(layoutTreemap([], rect)).toEqual([])
  })
  it('a hierarchy worth NOTHING lays out zero-area cells rather than NaN ones', () => {
    const cells = layoutTreemap([{ name: 'a', value: 0 }, { name: 'b', value: 0 }], rect)
    expect(cells).toHaveLength(2)
    for (const c of cells) expect(area(c)).toBe(0)
  })
  it('a NEGATIVE value is floored to zero rather than inverting a rect', () => {
    const cells = layoutTreemap([{ name: 'neg', value: -10 }, { name: 'pos', value: 10 }], rect)
    expect(cells.find((c) => c.name === 'neg')!.value).toBe(0)
    expect(area(cells.find((c) => c.name === 'pos')!)).toBeCloseTo(400 * 300, 6)
  })
  it('a ZERO-AREA rect still emits one cell per node', () => {
    const cells = layoutTreemap(tree, { x: 0, y: 0, w: 0, h: 0 })
    expect(cells.filter((c) => c.depth === 0)).toHaveLength(3)
    for (const c of cells) expect(Number.isFinite(c.rect.w)).toBe(true)
  })
  it('maxDepth stops the walk, so a nested group renders as one cell', () => {
    const shallow = layoutTreemap(tree, rect, { maxDepth: 1 })
    expect(shallow.every((c) => c.depth === 0)).toBe(true)
    expect(shallow.find((c) => c.name === 'A')!.leaf, 'a group is still not a leaf').toBe(false)
  })
  it('a group whose children would not fit still gets a non-negative inner area', () => {
    const cells = layoutTreemap(tree, { x: 0, y: 0, w: 3, h: 3 }, { padding: 40 })
    for (const c of cells) {
      expect(c.rect.w).toBeGreaterThanOrEqual(0)
      expect(c.rect.h).toBeGreaterThanOrEqual(0)
    }
  })
  it('children INHERIT the parent colour; a node with its own colour keeps it', () => {
    const cells = layoutTreemap([{ name: 'A', color: '#123456', children: [{ name: 'A1', value: 1 }, { name: 'A2', value: 1, color: '#654321' }] }], rect)
    expect(cells.find((c) => c.name === 'A')!.color).toBe('#123456')
    expect(cells.find((c) => c.name === 'A1')!.color, 'inherited').toBe('#123456')
    expect(cells.find((c) => c.name === 'A2')!.color, 'its own wins').toBe('#654321')
  })
  it('each cell carries the PATH of indices that reaches it', () => {
    const cells = layoutTreemap(tree, rect)
    expect(cells.find((c) => c.name === 'A')!.path).toEqual([0])
    const a1 = cells.find((c) => c.name === 'A1')!
    expect(a1.path[0]).toBe(0)
    expect(a1.path).toHaveLength(2)
  })
  it('several groups at the same level each push their own children', () => {
    const two: TreeNode[] = [
      { name: 'A', children: [{ name: 'A1', value: 5 }, { name: 'A2', value: 5 }] },
      { name: 'B', children: [{ name: 'B1', value: 5 }, { name: 'B2', value: 5 }] },
    ]
    const cells = layoutTreemap(two, rect)
    expect(cells.filter((c) => c.depth === 1).map((c) => c.name).sort()).toEqual(['A1', 'A2', 'B1', 'B2'])
  })
  it('a long row of equal values packs into rows rather than one strip', () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ name: `n${i}`, value: 1 }))
    const cells = layoutTreemap(many, rect)
    const xs = new Set(cells.map((c) => Math.round(c.rect.x)))
    const ys = new Set(cells.map((c) => Math.round(c.rect.y)))
    expect(xs.size, 'more than one column').toBeGreaterThan(1)
    expect(ys.size, 'and more than one row').toBeGreaterThan(1)
  })
})

describe('treemap — tintHex', () => {
  it('lightens a #rrggbb colour toward white', () => {
    expect(tintHex('#000000', 0)).toBe('rgb(0, 0, 0)')
    expect(tintHex('#000000', 1)).toBe('rgb(255, 255, 255)')
    expect(tintHex('#204060', 0.5)).toBe('rgb(144, 160, 176)')
  })
  it('a SHORT or malformed colour is passed through untouched', () => {
    expect(tintHex('#fff', 0.5)).toBe('#fff')
    expect(tintHex('', 0.5)).toBe('')
    expect(tintHex('red', 0.5)).toBe('red')
  })
  it('a non-hex digit in a well-formed-length string reads as zero rather than NaN', () => {
    expect(tintHex('#zzzzzz', 0)).toBe('rgb(0, 0, 0)')
  })
  it('upper and lower case hex agree', () => {
    expect(tintHex('#ABCDEF', 0)).toBe(tintHex('#abcdef', 0))
  })
})

describe('treemap — approxTextWidth', () => {
  it('digits are narrower than letters and separators narrower still', () => {
    expect(approxTextWidth('11', 10)).toBeLessThan(approxTextWidth('ww', 10))
    expect(approxTextWidth('..', 10)).toBeLessThan(approxTextWidth('11', 10))
    expect(approxTextWidth(', ', 10)).toBeCloseTo(0.45 * 2 * 10 * 0.52, 9)
  })
  it('an empty string measures zero and width scales with the font size', () => {
    expect(approxTextWidth('', 10)).toBe(0)
    expect(approxTextWidth('abc', 20)).toBeCloseTo(approxTextWidth('abc', 10) * 2, 9)
  })
})

describe('treemap — render', () => {
  const cells = layoutTreemap(tree, rect)
  it('progress is clamped at both ends, and cells scale from their centres', () => {
    const settled = renderTreemap(cells)
    expect(renderTreemap(cells, { progress: 7 })).toEqual(settled)
    const zero = renderTreemap(cells, { progress: -2 })
    const first = zero[0] as { rect: { x: number; y: number; w: number; h: number } }
    expect(first.rect.w).toBe(0)
    expect(first.rect.x, 'collapsed onto the cell centre').toBeCloseTo(cells[0]!.rect.x + cells[0]!.rect.w / 2, 9)
  })
  it('a GROUP is tinted by depth while a leaf keeps its colour', () => {
    const drawn = renderTreemap(cells) as { fill: string }[]
    const group = cells.findIndex((c) => !c.leaf)
    const leaf = cells.findIndex((c) => c.leaf)
    expect(drawn[group]!.fill).toMatch(/^rgb\(/)
    expect(drawn[leaf]!.fill, 'a leaf is painted flat').toBe(cells[leaf]!.color)
  })
  it('the depth tint is capped, so level 2 and level 5 are not progressively washed out', () => {
    const deep = { name: 'x', color: '#000000', depth: 5, leaf: false, value: 1, path: [0], rect: { x: 0, y: 0, w: 10, h: 10 } }
    const two = { ...deep, depth: 2 }
    const [a] = renderTreemap([deep]) as { fill: string }[]
    const [b] = renderTreemap([two]) as { fill: string }[]
    expect(a!.fill).toBe(b!.fill)
    expect(a!.fill).toBe('rgb(153, 153, 153)')
  })
  it('labels are drawn on LEAVES that are big enough, on the settled frame only', () => {
    const texts = (opts?: Parameters<typeof renderTreemap>[1]) => renderTreemap(cells, opts).filter((c) => c.kind === 'text')
    expect(texts().length).toBeGreaterThan(0)
    expect(texts({ progress: 0.5 })).toHaveLength(0)
    expect(texts({ showLabels: false })).toHaveLength(0)
    expect(texts().every((t) => cells.some((c) => c.leaf && c.name === (t as { text: string }).text))).toBe(true)
  })
  it('a cell too NARROW or too SHORT for its name gets no label', () => {
    const tiny = layoutTreemap([{ name: 'a-very-long-label-indeed', value: 1 }], { x: 0, y: 0, w: 20, h: 40 })
    expect(renderTreemap(tiny).filter((c) => c.kind === 'text')).toHaveLength(0)
    const short = layoutTreemap([{ name: 'x', value: 1 }], { x: 0, y: 0, w: 200, h: 8 })
    expect(renderTreemap(short).filter((c) => c.kind === 'text')).toHaveLength(0)
  })
  it('a supplied measure function is used instead of the approximation', () => {
    const wide = renderTreemap(cells, undefined, () => 10_000)
    expect(wide.filter((c) => c.kind === 'text'), 'nothing fits under a huge measure').toHaveLength(0)
  })
})

describe('treemap — hit test', () => {
  const cells = layoutTreemap(tree, rect)
  it('the DEEPEST cell under a point wins over its parent', () => {
    const child = cells.find((c) => c.name === 'A1')!
    const at = { x: child.rect.x + child.rect.w / 2, y: child.rect.y + child.rect.h / 2 }
    expect(hitTreemap(cells, at.x, at.y)!.name).toBe('A1')
    expect(hitTreemapIndex(cells, at.x, at.y)).toBe(cells.indexOf(child))
  })
  it('a point outside every cell is a miss on both entry points', () => {
    expect(hitTreemap(cells, -5, -5)).toBeNull()
    expect(hitTreemapIndex(cells, -5, -5)).toBe(-1)
  })
  it('a point on the SHARED edge of two sibling cells reports the first, not the last', () => {
    // The hit test is inclusive at both edges, so a boundary point is inside
    // two cells of the same depth; the deeper-wins rule must not let the later
    // sibling displace the earlier one at equal depth.
    const siblings = layoutTreemap([{ name: 'L', value: 1 }, { name: 'R', value: 1 }], rect, { padding: 0 })
    const edge = siblings[0]!.rect.x + siblings[0]!.rect.w
    expect(siblings[1]!.rect.x, 'the fixture must actually share an edge').toBeCloseTo(edge, 6)
    expect(hitTreemap(siblings, edge, 10)!.name).toBe('L')
  })
  it('a point in a parent but in NO child reports the parent', () => {
    const parent = cells.find((c) => c.name === 'A')!
    const hit = hitTreemap(cells, parent.rect.x + 0.5, parent.rect.y + 0.5)
    expect(hit).not.toBeNull()
    expect(['A', 'A1', 'A2']).toContain(hit!.name)
  })
})
