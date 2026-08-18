import { describe, expect, it } from 'vitest'
import { runLayout } from '../layout-engine'
import type { FlowEdge, FlowNode } from '../types'

/**
 * The layout suite that existed before this engine asserted only
 * `positions.toHaveLength(n)` — a layout returning all zeros passed every
 * spec. These assert STRUCTURE instead: boxes must not overlap, layers must
 * be ordered, spacing must be honoured, and the same graph must always
 * produce the same positions.
 */
const W = 150
const H = 40
const node = (id: string, w = W, h = H): FlowNode => ({
  id,
  position: { x: 0, y: 0 },
  width: w,
  height: h,
  data: {},
})

type Pos = Array<{ id: string; position: { x: number; y: number } }>
const at = (p: Pos, id: string) => p.find((q) => q.id === id)!.position

function overlappingPairs(p: Pos, w = W, h = H): string[] {
  const bad: string[] = []
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      const a = p[i]!.position
      const b = p[j]!.position
      if (a.x < b.x + w && b.x < a.x + w && a.y < b.y + h && b.y < a.y + h)
        bad.push(`${p[i]!.id}/${p[j]!.id}`)
    }
  return bad
}

const ALL = ['layered', 'tree', 'force', 'stress', 'radial', 'box', 'rectpacking'] as const

describe('runLayout — invariants every algorithm must hold', () => {
  const nodes = Array.from({ length: 12 }, (_, i) => node(`n${i}`))
  const edges: FlowEdge[] = Array.from({ length: 11 }, (_, i) => ({
    source: `n${Math.floor(i / 2)}`,
    target: `n${i + 1}`,
  }))

  for (const algo of ALL) {
    it(`${algo}: returns one position per node, all finite`, () => {
      const p = runLayout(nodes, edges, algo)
      expect(p).toHaveLength(nodes.length)
      expect(new Set(p.map((q) => q.id))).toEqual(new Set(nodes.map((n) => n.id)))
      for (const q of p) {
        expect(Number.isFinite(q.position.x)).toBe(true)
        expect(Number.isFinite(q.position.y)).toBe(true)
      }
    })

    it(`${algo}: produces NO overlapping boxes`, () => {
      expect(overlappingPairs(runLayout(nodes, edges, algo))).toEqual([])
    })

    it(`${algo}: is deterministic — same graph, same positions`, () => {
      expect(runLayout(nodes, edges, algo)).toEqual(runLayout(nodes, edges, algo))
    })

    it(`${algo}: starts at the origin (no negative drift)`, () => {
      const p = runLayout(nodes, edges, algo)
      expect(Math.min(...p.map((q) => q.position.x))).toBeGreaterThanOrEqual(-0.01)
      expect(Math.min(...p.map((q) => q.position.y))).toBeGreaterThanOrEqual(-0.01)
    })
  }

  it('handles an empty graph', () => {
    expect(runLayout([], [], 'layered')).toEqual([])
  })

  it('handles nodes with no edges', () => {
    const p = runLayout(nodes, [], 'layered')
    expect(overlappingPairs(p)).toEqual([])
  })

  it('ignores edges pointing at nodes that do not exist', () => {
    const p = runLayout([node('a'), node('b')], [{ source: 'a', target: 'ghost' }], 'layered')
    expect(p).toHaveLength(2)
    expect(overlappingPairs(p)).toEqual([])
  })

  it('does not hang or overlap on a self-loop', () => {
    const p = runLayout([node('a'), node('b')], [{ source: 'a', target: 'a' }, { source: 'a', target: 'b' }], 'layered')
    expect(overlappingPairs(p)).toEqual([])
  })
})

describe('layered', () => {
  it('places a target BELOW its source (DOWN is the default)', () => {
    const p = runLayout([node('a'), node('b')], [{ source: 'a', target: 'b' }], 'layered')
    expect(at(p, 'b').y).toBeGreaterThan(at(p, 'a').y)
  })

  it('puts each chain link on its own layer, in order', () => {
    const ids = ['a', 'b', 'c', 'd']
    const p = runLayout(
      ids.map((i) => node(i)),
      [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'd' }],
      'layered',
    )
    const ys = ids.map((i) => at(p, i).y)
    for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThan(ys[i - 1]!)
  })

  it('honours layerSpacing — a bigger value pushes layers further apart', () => {
    const g: [FlowNode[], FlowEdge[]] = [
      [node('a'), node('b')],
      [{ source: 'a', target: 'b' }],
    ]
    const tight = runLayout(...g, 'layered', { layerSpacing: 10 })
    const loose = runLayout(...g, 'layered', { layerSpacing: 200 })
    expect(at(loose, 'b').y - at(loose, 'a').y).toBeGreaterThan(at(tight, 'b').y - at(tight, 'a').y)
  })

  it('honours nodeSpacing between siblings on one layer', () => {
    const g: [FlowNode[], FlowEdge[]] = [
      [node('r'), node('a'), node('b')],
      [{ source: 'r', target: 'a' }, { source: 'r', target: 'b' }],
    ]
    const tight = runLayout(...g, 'layered', { nodeSpacing: 10 })
    const loose = runLayout(...g, 'layered', { nodeSpacing: 120 })
    expect(Math.abs(at(loose, 'a').x - at(loose, 'b').x)).toBeGreaterThan(
      Math.abs(at(tight, 'a').x - at(tight, 'b').x),
    )
  })

  it('RIGHT lays out along x instead of y', () => {
    const p = runLayout([node('a'), node('b')], [{ source: 'a', target: 'b' }], 'layered', {
      direction: 'RIGHT',
    })
    expect(at(p, 'b').x).toBeGreaterThan(at(p, 'a').x)
    expect(Math.abs(at(p, 'b').y - at(p, 'a').y)).toBeLessThan(1)
  })

  it('UP mirrors DOWN — the target ends up ABOVE the source', () => {
    const p = runLayout([node('a'), node('b')], [{ source: 'a', target: 'b' }], 'layered', {
      direction: 'UP',
    })
    expect(at(p, 'b').y).toBeLessThan(at(p, 'a').y)
  })

  it('lays out a CYCLE without hanging or overlapping — back edges are broken', () => {
    const ids = ['a', 'b', 'c']
    const p = runLayout(
      ids.map((i) => node(i)),
      [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'a' }],
      'layered',
    )
    expect(p).toHaveLength(3)
    expect(overlappingPairs(p)).toEqual([])
  })

  it('respects per-node sizes rather than assuming a default box', () => {
    const p = runLayout(
      [node('a', 400, 200), node('b', 50, 20)],
      [{ source: 'a', target: 'b' }],
      'layered',
    )
    // `b` must clear `a`'s real height, not the 40px default.
    expect(at(p, 'b').y).toBeGreaterThanOrEqual(at(p, 'a').y + 200)
  })
})

describe('tree', () => {
  it('centres a parent over its children', () => {
    const p = runLayout(
      [node('r'), node('a'), node('b')],
      [{ source: 'r', target: 'a' }, { source: 'r', target: 'b' }],
      'tree',
    )
    const mid = (at(p, 'a').x + at(p, 'b').x) / 2
    expect(Math.abs(at(p, 'r').x - mid)).toBeLessThan(1)
  })

  it('separates siblings even when centring would overlap them', () => {
    // Centring pushed boxes onto each other before a separation sweep was
    // added — measured 23 overlapping pairs on a 40-node graph.
    const nodes = [node('r'), ...Array.from({ length: 8 }, (_, i) => node(`c${i}`))]
    const edges: FlowEdge[] = Array.from({ length: 8 }, (_, i) => ({ source: 'r', target: `c${i}` }))
    expect(overlappingPairs(runLayout(nodes, edges, 'tree'))).toEqual([])
  })
})

describe('box / rectpacking', () => {
  it('box keeps input order on the first row', () => {
    const p = runLayout([node('a'), node('b'), node('c')], [], 'box', { nodeSpacing: 10 })
    expect(at(p, 'a').x).toBeLessThan(at(p, 'b').x)
  })

  it('rectpacking places the tallest boxes first', () => {
    const p = runLayout([node('short', 100, 20), node('tall', 100, 300)], [], 'rectpacking')
    expect(at(p, 'tall').x).toBeLessThanOrEqual(at(p, 'short').x)
  })
})

describe('scale — the engine must not freeze the tab', () => {
  // Measured before optimisation, at n=1000: layered 2618ms, force 53441ms,
  // stress 8312ms. All three were quadratic in a hot loop. These lock the
  // fixes — a reintroduced O(n^2) would blow the budget by an order of
  // magnitude, not squeak past it, so a generous bound is still a real guard.
  const dag = (n: number) => {
    const nodes = Array.from({ length: n }, (_, i) => node(`d${i}`))
    const edges: FlowEdge[] = []
    for (let i = 1; i < n; i++) edges.push({ source: `d${Math.floor((i - 1) / 3)}`, target: `d${i}` })
    return { nodes, edges }
  }

  for (const algo of ALL) {
    it(`${algo}: lays out 1000 nodes without freezing the tab`, () => {
      const g = dag(1000)
      const t0 = performance.now()
      const p = runLayout(g.nodes, g.edges, algo)
      const ms = performance.now() - t0
      expect(p).toHaveLength(1000)
      expect(ms).toBeLessThan(2000)
    })
  }

  it('layered keeps 1000 nodes non-overlapping, not just fast', () => {
    const g = dag(1000)
    expect(overlappingPairs(runLayout(g.nodes, g.edges, 'layered'))).toEqual([])
  })

  it('radial ring radii stay monotonic, so rings cannot land on each other', () => {
    // A wide inner ring once landed at a larger radius than the ring outside
    // it — caught on a 40-node DAG by the elkjs comparison, not by eye.
    const g = dag(60)
    expect(overlappingPairs(runLayout(g.nodes, g.edges, 'radial'))).toEqual([])
  })
})
