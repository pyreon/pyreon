import { flowEdgeZ, flowNodeZ, orderEdges } from '../z-order'

// Stacking order. The native views call pyreonFlowNodeZ / pyreonFlowEdgeZ with
// the same arithmetic; these pin the web half (the native fixtures pin theirs).

describe('flowNodeZ', () => {
  it('adds 1000 while dragging and 100 while selected, on top of zIndex', () => {
    expect(flowNodeZ(undefined, false, false, true)).toBe(0)
    expect(flowNodeZ(5, false, false, true)).toBe(5)
    expect(flowNodeZ(5, true, false, true)).toBe(105)
    expect(flowNodeZ(5, true, true, true)).toBe(1005)
  })

  it('elevateNodesOnSelect: false leaves a selected node at its own zIndex', () => {
    expect(flowNodeZ(5, true, false, false)).toBe(5)
    // Dragging still raises it: that is not selection elevation.
    expect(flowNodeZ(5, true, true, false)).toBe(1005)
  })
})

describe('orderEdges', () => {
  const edges = [{ id: 'a' }, { id: 'b', zIndex: 2 }, { id: 'c' }, { id: 'd', zIndex: -1 }]

  it('sorts by zIndex, stably, lowest first', () => {
    expect(orderEdges(edges, new Set(), false).map((e) => e.id)).toEqual(['d', 'a', 'c', 'b'])
  })

  it('elevateEdgesOnSelect draws a selected edge on top', () => {
    expect(orderEdges(edges, new Set(['a']), true).map((e) => e.id)).toEqual(['d', 'c', 'b', 'a'])
    expect(flowEdgeZ(undefined, true, true)).toBe(1000)
  })

  it('without elevation a selection does not reorder', () => {
    expect(orderEdges(edges, new Set(['a']), false).map((e) => e.id)).toEqual(['d', 'a', 'c', 'b'])
  })

  it('returns the SAME array when nothing would move', () => {
    const plain = [{ id: 'a' }, { id: 'b' }]
    expect(orderEdges(plain, new Set(), true)).toBe(plain)
  })
})
