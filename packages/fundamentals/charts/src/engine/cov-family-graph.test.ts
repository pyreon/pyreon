// Branch coverage for the network family. The force simulation's defensive
// arms (coincident nodes, a zero net force, a box smaller than a symbol) are
// reachable with real data — a zero-area box collapses the initial spread, so
// every node starts on the centre and the degenerate-distance guards fire.
import { describe, expect, it } from 'vitest'
import { graphNextSeed, hitGraphIndex, layoutGraph, renderGraph } from './graph'
import type { GraphLink, GraphNode } from './graph'

const box = { x: 0, y: 0, w: 400, h: 300 }
const tall = { x: 0, y: 0, w: 200, h: 400 }
const nodes: GraphNode[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const links: GraphLink[] = [{ source: 'a', target: 'b' }]
const finite = (l: ReturnType<typeof layoutGraph>) => l.nodes.every((n) => Number.isFinite(n.at.x) && Number.isFinite(n.at.y))

describe('graph — the seed', () => {
  it('a NEGATIVE seed is used by magnitude, so -7 and 7 arrange the same', () => {
    const neg = layoutGraph(nodes, links, box, { seed: -7 })
    const pos = layoutGraph(nodes, links, box, { seed: 7 })
    expect(neg.nodes.map((n) => n.at)).toEqual(pos.nodes.map((n) => n.at))
  })
  it('a fractional seed floors to the same state as its integer', () => {
    expect(layoutGraph(nodes, links, box, { seed: 7.9 }).nodes.map((n) => n.at)).toEqual(layoutGraph(nodes, links, box, { seed: 7 }).nodes.map((n) => n.at))
  })
  it('the LCG stays inside its modulus and never returns to zero', () => {
    let s = 1
    for (let i = 0; i < 50; i++) {
      s = graphNextSeed(s)
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThan(2147483647)
    }
  })
})

describe('graph — symbol radius', () => {
  it('a NEGATIVE value reads as NO value — half the base, never a NaN radius', () => {
    const l = layoutGraph([{ id: 'a', value: -5 }, { id: 'b', value: 10 }], [], box, { layout: 'none' })
    expect(Number.isFinite(l.nodes[0]!.radius)).toBe(true)
    expect(l.nodes[0]!.radius, 'the same radius a valueless node gets').toBe(5)
    expect(l.nodes[1]!.radius, 'while the valued neighbour scales up').toBeCloseTo(5 * 2, 9)
  })
  it('a value scales between 0.6x and 2x of half the base', () => {
    const l = layoutGraph([{ id: 'a', value: 0 }, { id: 'b', value: 25 }, { id: 'c', value: 100 }], [], box, { layout: 'none', symbolSize: 20 })
    expect(l.nodes[0]!.radius).toBeCloseTo(10 * 0.6, 9)
    expect(l.nodes[1]!.radius).toBeCloseTo(10 * (0.6 + 1.4 * 0.5), 9)
    expect(l.nodes[2]!.radius).toBeCloseTo(10 * 2, 9)
  })
  it('a valueless node gets half the base, regardless of what its neighbours are worth', () => {
    const l = layoutGraph([{ id: 'a' }, { id: 'b', value: 100 }], [], box, { layout: 'none', symbolSize: 20 })
    expect(l.nodes[0]!.radius).toBe(10)
  })
  it('when NO node has a value they all get half the base', () => {
    const l = layoutGraph(nodes, [], box, { layout: 'none' })
    for (const n of l.nodes) expect(n.radius).toBe(5)
  })
})

describe('graph — circular layout', () => {
  it('the ring is sized by the SHORTER side, whichever it is', () => {
    const wideR = layoutGraph(nodes, [], box, { layout: 'circular' })
    const tallR = layoutGraph(nodes, [], tall, { layout: 'circular' })
    const rOf = (l: ReturnType<typeof layoutGraph>, c: { x: number; y: number }) => Math.hypot(l.nodes[0]!.at.x - c.x, l.nodes[0]!.at.y - c.y)
    expect(rOf(wideR, { x: 200, y: 150 })).toBeCloseTo(150 - 10, 9)
    expect(rOf(tallR, { x: 100, y: 200 })).toBeCloseTo(100 - 10, 9)
  })
  it('a box smaller than a symbol collapses the ring onto the centre rather than inverting it', () => {
    const l = layoutGraph(nodes, [], { x: 0, y: 0, w: 8, h: 8 }, { layout: 'circular' })
    for (const n of l.nodes) expect(n.at).toEqual({ x: 4, y: 4 })
  })
  it('an EMPTY graph in FORCE mode divides the area by one, not by zero nodes', () => {
    const l = layoutGraph([], [], box)
    expect(l.nodes).toEqual([])
    expect(l.links).toEqual([])
  })
  it('an EMPTY graph lays out nothing and reports nothing dropped', () => {
    const l = layoutGraph([], [], box, { layout: 'circular' })
    expect(l.nodes).toEqual([])
    expect(l.dropped).toEqual([])
  })
})

describe("graph — 'none' layout reads the supplied coordinates", () => {
  it('coordinates are normalised into the box, keeping their relative order', () => {
    const l = layoutGraph([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 5 }], [], box, { layout: 'none' })
    expect(l.nodes[0]!.at.x).toBeLessThan(l.nodes[1]!.at.x)
    expect(l.nodes[0]!.at.y).toBeLessThan(l.nodes[1]!.at.y)
  })
  it('a node with NO coordinates is treated as the origin, not dropped', () => {
    const l = layoutGraph([{ id: 'a' }, { id: 'b', x: 10, y: 10 }], [], box, { layout: 'none' })
    expect(finite(l)).toBe(true)
    expect(l.nodes[0]!.at.x).toBeLessThan(l.nodes[1]!.at.x)
  })
  it('a column of nodes (no X span) centres horizontally instead of dividing by zero', () => {
    const l = layoutGraph([{ id: 'a', x: 5, y: 0 }, { id: 'b', x: 5, y: 40 }], [], box, { layout: 'none' })
    expect(l.nodes[0]!.at.x).toBe(l.nodes[1]!.at.x)
    expect(l.nodes[0]!.at.x).toBeCloseTo(200, 9)
    expect(l.nodes[0]!.at.y).not.toBeCloseTo(l.nodes[1]!.at.y, 6)
  })
  it('a row of nodes (no Y span) centres vertically', () => {
    const l = layoutGraph([{ id: 'a', x: 0, y: 5 }, { id: 'b', x: 40, y: 5 }], [], box, { layout: 'none' })
    expect(l.nodes[0]!.at.y).toBeCloseTo(150, 9)
    expect(l.nodes[0]!.at.y).toBe(l.nodes[1]!.at.y)
  })
})

describe('graph — force layout degenerate inputs', () => {
  it('ZERO iterations leaves the seeded positions alone and never divides by the count', () => {
    const l = layoutGraph(nodes, links, box, { iterations: 0 })
    expect(finite(l)).toBe(true)
  })
  it('a NEGATIVE iteration count is treated as zero rather than looping forever', () => {
    const none = layoutGraph(nodes, links, box, { iterations: 0 })
    const negative = layoutGraph(nodes, links, box, { iterations: -50 })
    expect(negative.nodes.map((n) => n.at)).toEqual(none.nodes.map((n) => n.at))
  })
  it('a ZERO-AREA box still produces finite positions: coincident nodes are nudged apart', () => {
    const l = layoutGraph(nodes, links, { x: 0, y: 0, w: 0, h: 0 }, { iterations: 2 })
    expect(finite(l)).toBe(true)
  })
  it('a single node in a zero-area box feels NO force, so only the box clamps move it', () => {
    // Nothing repels it, nothing links it, and gravity toward the centre it
    // already sits on is zero — so the position it ends at is purely the
    // left-then-right clamp of a box narrower than the symbol.
    const l = layoutGraph([{ id: 'only' }], [], { x: 0, y: 0, w: 0, h: 0 }, { iterations: 2 })
    expect(l.nodes[0]!.at).toEqual({ x: -l.nodes[0]!.radius, y: -l.nodes[0]!.radius })
  })
  it('a link between two COINCIDENT nodes is skipped rather than producing an infinite force', () => {
    const l = layoutGraph([{ id: 'a' }, { id: 'b' }], [{ source: 'a', target: 'b' }], { x: 0, y: 0, w: 0, h: 0 }, { iterations: 1, repulsion: 0, gravity: 0 })
    expect(finite(l)).toBe(true)
  })
  it('a tall box seeds the spread and the temperature from its own sides', () => {
    const l = layoutGraph(nodes, links, tall, { iterations: 5 })
    expect(finite(l)).toBe(true)
    for (const n of l.nodes) {
      expect(n.at.x).toBeGreaterThanOrEqual(n.radius - 1e-9)
      expect(n.at.x).toBeLessThanOrEqual(200 - n.radius + 1e-9)
    }
  })
  it('every node is clamped inside the box on all four sides', () => {
    const l = layoutGraph(nodes, links, { x: 20, y: 30, w: 60, h: 50 }, { iterations: 40, repulsion: 1e9 })
    for (const n of l.nodes) {
      expect(n.at.x).toBeGreaterThanOrEqual(20 + n.radius - 1e-9)
      expect(n.at.x).toBeLessThanOrEqual(80 - n.radius + 1e-9)
      expect(n.at.y).toBeGreaterThanOrEqual(30 + n.radius - 1e-9)
      expect(n.at.y).toBeLessThanOrEqual(80 - n.radius + 1e-9)
    }
  })
})

describe('graph — render', () => {
  const layout = layoutGraph(nodes, [{ source: 'a', target: 'b', value: 2 }], box, { iterations: 5 })
  it('progress is clamped at both ends', () => {
    const settled = renderGraph(layout, box)
    expect(renderGraph(layout, box, { progress: 9 })).toEqual(settled)
    const zero = renderGraph(layout, box, { progress: -3 })
    const centres = zero.filter((c) => c.kind === 'circle') as { center: { x: number; y: number } }[]
    for (const c of centres) expect(c.center, 'at zero progress every node sits on the box centre').toEqual({ x: 200, y: 150 })
  })
  it('labels are off by default and appear only on the settled frame', () => {
    expect(renderGraph(layout, box).some((c) => c.kind === 'text')).toBe(false)
    expect(renderGraph(layout, box, { showLabels: true }).some((c) => c.kind === 'text')).toBe(true)
    expect(renderGraph(layout, box, { showLabels: true, progress: 0.5 }).some((c) => c.kind === 'text')).toBe(false)
  })
  it('link width scales with value; a valueless link keeps the hairline width', () => {
    const valued = renderGraph(layoutGraph(nodes, [{ source: 'a', target: 'b', value: 4 }, { source: 'a', target: 'c', value: 1 }], box, { iterations: 1 }), box)
    const widths = valued.filter((c) => c.kind === 'line').map((c) => (c as { width: number }).width)
    expect(widths[0]).toBeCloseTo(4, 9)
    expect(widths[1]).toBeCloseTo(1.75, 9)
    const bare = renderGraph(layoutGraph(nodes, links, box, { iterations: 1 }), box)
    expect((bare.find((c) => c.kind === 'line') as { width: number }).width).toBe(1)
  })
})

describe('graph — hit test', () => {
  it('picks the NEAREST symbol when two halos overlap the same point', () => {
    const l = layoutGraph([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }], [], { x: 0, y: 0, w: 60, h: 60 }, { layout: 'none', symbolSize: 40 })
    const [a, b] = [l.nodes[0]!, l.nodes[1]!]
    expect(Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y), 'the fixture must actually overlap').toBeLessThan(a.radius + b.radius)
    expect(hitGraphIndex(l, a.at.x, a.at.y)).toBe(0)
    expect(hitGraphIndex(l, b.at.x, b.at.y)).toBe(1)
  })
  it('a point outside every halo is a miss', () => {
    const l = layoutGraph(nodes, links, box, { iterations: 5 })
    expect(hitGraphIndex(l, -500, -500)).toBe(-1)
  })
})

describe('graph — links that name a node that is not there', () => {
  it('the link is dropped and REPORTED, and the rest of the graph is unaffected', () => {
    const l = layoutGraph(nodes, [{ source: 'a', target: 'ghost' }, { source: 'a', target: 'b' }], box, { iterations: 1 })
    expect(l.links).toHaveLength(1)
    expect(l.dropped.length).toBeGreaterThan(0)
    expect(l.nodes).toHaveLength(3)
  })
})
