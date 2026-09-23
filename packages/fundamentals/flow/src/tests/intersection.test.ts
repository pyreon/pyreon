import { createFlow } from '../flow'

// React Flow's getIntersectingNodes / isNodeIntersecting / getNodesBounds. The
// web engine is the ORACLE the native parity fixture replays, so its semantics
// are pinned here independently, with hand-computed boxes (default node size
// is 150 x 40).

function make() {
  return createFlow({
    nodes: [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 100, y: 20 }, data: {} },
      { id: 'c', position: { x: 400, y: 0 }, data: {}, width: 50, height: 20 },
      { id: 'h', position: { x: 50, y: 10 }, data: {}, hidden: true },
      { id: 'g', position: { x: 1000, y: 1000 }, data: {} },
      { id: 'k', position: { x: 20, y: 20 }, data: {}, parentId: 'g' },
    ],
    edges: [],
  })
}

describe('getIntersectingNodes', () => {
  it('returns nodes overlapping a node, excluding itself and hidden nodes', () => {
    expect(make().getIntersectingNodes('a').map((n) => n.id)).toEqual(['b'])
  })

  it('uses a child node’s ABSOLUTE box', () => {
    // k sits at 1020,1020 in flow coordinates, inside g's 1000..1150 box.
    expect(make().getIntersectingNodes('k').map((n) => n.id)).toEqual(['g'])
  })

  it('accepts a rect, and partially:false requires full containment', () => {
    const flow = make()
    expect(flow.getIntersectingNodes({ x: 0, y: 0, width: 600, height: 100 }).map((n) => n.id)).toEqual(['a', 'b', 'c'])
    // b spans x 100..250, so only a (0..150) fits inside 0..200.
    expect(flow.getIntersectingNodes({ x: 0, y: 0, width: 200, height: 50 }, false).map((n) => n.id)).toEqual(['a'])
  })

  it('an edge-touching box is not an intersection', () => {
    // a ends exactly at x 150; a rect starting there shares only an edge with
    // it, and b starts at y 20, below the rect.
    expect(make().getIntersectingNodes({ x: 150, y: 0, width: 10, height: 10 })).toEqual([])
  })

  it('an unknown id returns nothing', () => {
    expect(make().getIntersectingNodes('missing')).toEqual([])
  })
})

describe('isNodeIntersecting', () => {
  it('is true on any overlap by default, and requires containment with partially:false', () => {
    const flow = make()
    expect(flow.isNodeIntersecting('a', { x: 140, y: 30, width: 100, height: 100 })).toBe(true)
    expect(flow.isNodeIntersecting('a', { x: 140, y: 30, width: 100, height: 100 }, false)).toBe(false)
    expect(flow.isNodeIntersecting('a', { x: -1, y: -1, width: 200, height: 200 }, false)).toBe(true)
  })

  it('takes a rect target, and an unknown id is false', () => {
    const flow = make()
    expect(flow.isNodeIntersecting({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 100, height: 100 }, false)).toBe(true)
    expect(flow.isNodeIntersecting('missing', { x: 0, y: 0, width: 100, height: 100 })).toBe(false)
  })
})

describe('getNodesBounds', () => {
  it('encloses every visible node by default, children at their absolute boxes', () => {
    // a..c span x 0..450; g and k reach x 1170 (k at 1020 + 150) and y 1060.
    expect(make().getNodesBounds()).toEqual({ x: 0, y: 0, width: 1170, height: 1060 })
  })

  it('encloses only the named nodes, and is empty for none', () => {
    const flow = make()
    expect(flow.getNodesBounds(['a', 'c'])).toEqual({ x: 0, y: 0, width: 450, height: 40 })
    expect(flow.getNodesBounds(['k'])).toEqual({ x: 1020, y: 1020, width: 150, height: 40 })
    expect(flow.getNodesBounds(['missing'])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('uses a measured size over the default', () => {
    const flow = make()
    flow._setNodeMeasurement('a', 300, 90)
    expect(flow.getNodesBounds(['a'])).toEqual({ x: 0, y: 0, width: 300, height: 90 })
  })
})
