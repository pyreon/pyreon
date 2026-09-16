// Degenerate inputs the layout modules each guard for but nothing drives: a
// histogram over values with no spread, and a force graph with one node or a
// negative weight. Each guard exists because the alternative is a NaN reaching
// the draw list, where it renders as an invisible or infinite shape rather
// than surfacing as an error.
import { describe, expect, it } from 'vitest'
import { binValues } from './bin'
import { layoutGraph } from './graph'

describe('binValues — histograms with nothing to divide', () => {
  it('no finite values means no bins at all', () => {
    expect(binValues([], 5)).toEqual([])
    expect(binValues([Number.NaN, Number.POSITIVE_INFINITY], 5)).toEqual([])
  })

  it('every value identical collapses to ONE unit-wide bin holding them all', () => {
    // There is no extent to divide, so a nice domain would be degenerate; a
    // single unit-wide bin is what keeps the axis drawable.
    const bins = binValues([5, 5, 5], 4)
    expect(bins).toHaveLength(1)
    expect(bins[0]).toEqual({ x0: 5, x1: 6, count: 3 })
  })

  it('a zero or negative bin count is floored at one bin', () => {
    for (const n of [0, -3]) {
      const bins = binValues([1, 2, 3], n)
      expect(bins.length).toBeGreaterThanOrEqual(1)
      for (const b of bins) expect(Number.isFinite(b.x1 - b.x0)).toBe(true)
    }
  })

  it('non-finite values are dropped before the extent is taken', () => {
    const bins = binValues([1, Number.NaN, 3], 2)
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(2)
  })
})

describe('layoutGraph — degenerate node sets', () => {
  const box = { x: 0, y: 0, w: 200, h: 100 }

  it('an empty graph lays out no nodes rather than dividing by a zero count', () => {
    expect(layoutGraph([], [], box).nodes).toEqual([])
  })

  it('a NEGATIVE node value is clamped rather than producing a negative radius', () => {
    const l = layoutGraph([{ id: 'a', value: -10 }, { id: 'b', value: 4 }], [], box)
    for (const n of l.nodes) {
      expect(n.radius).toBeGreaterThan(0)
      expect(Number.isFinite(n.radius)).toBe(true)
    }
  })

  it('a valueless node takes the base radius rather than scaling off nothing', () => {
    const l = layoutGraph([{ id: 'a' }, { id: 'b' }], [], box, { symbolSize: 20 })
    for (const n of l.nodes) expect(n.radius).toBe(10)
  })

  it('a single node is placed at a finite position, not at an undefined angle', () => {
    const l = layoutGraph([{ id: 'only' }], [], box)
    expect(l.nodes).toHaveLength(1)
    expect(Number.isFinite(l.nodes[0]!.at.x)).toBe(true)
    expect(Number.isFinite(l.nodes[0]!.at.y)).toBe(true)
  })

  it('a link naming a node that does not exist is DROPPED and reported', () => {
    const l = layoutGraph([{ id: 'a' }], [{ source: 'a', target: 'ghost', value: 1 }], box)
    expect(l.links).toEqual([])
    expect(l.dropped.length).toBeGreaterThan(0)
  })
})
