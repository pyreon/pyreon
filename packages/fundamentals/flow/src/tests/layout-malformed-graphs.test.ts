/**
 * The layout engine against graphs that are not well-formed.
 *
 * Every algorithm walks the edge list through adjacency, indegree and layer
 * maps, and each lookup carries a `?? 0` / `?? []` fallback for an id the map
 * does not hold. Those fallbacks exist because an edge can reference a node
 * that is not in the list — after a node is deleted and its edges are not, or
 * while a subscription delivers nodes and edges in separate ticks, or when a
 * server payload is simply inconsistent. None of them was covered: every
 * existing layout test passes a graph whose edges all resolve.
 *
 * A missing fallback is a `TypeError` inside a layout pass, which surfaces as
 * a blank canvas rather than as "your data has a dangling edge" — the user
 * sees the diagram vanish and nothing says why.
 *
 * Cycles are the other shape. `tree` and layered algorithms use a visit-state
 * map (0/1/2) to terminate, and a graph with a cycle is ordinary in a flow
 * editor — anyone can connect a node back to its own ancestor.
 */
import { runLayout } from '../layout-engine'
import type { FlowEdge, FlowNode, LayoutAlgorithm } from '../types'

// Every algorithm the type admits. The first draft ran five of seven, so
// `layered` (the default branch) and `rectpacking` were never exercised
// against a malformed graph at all.
const ALGORITHMS: LayoutAlgorithm[] = [
  'layered',
  'tree',
  'force',
  'stress',
  'radial',
  'box',
  'rectpacking',
]

const node = (id: string): FlowNode<unknown> => ({
  id,
  position: { x: 0, y: 0 },
  data: {},
  width: 100,
  height: 40,
})

const edge = (id: string, source: string, target: string): FlowEdge => ({ id, source, target })

describe('a graph with DANGLING edges lays out instead of throwing', () => {
  // Every id in the edge list that is absent from the node list hits a
  // fallback in whichever map the algorithm consults.
  const nodes = [node('a'), node('b')]
  const edges = [
    edge('e1', 'a', 'b'), // resolves
    edge('e2', 'a', 'ghost'), // target missing
    edge('e3', 'ghost', 'b'), // source missing
    edge('e4', 'ghost1', 'ghost2'), // both missing
  ]

  for (const algorithm of ALGORITHMS) {
    test(`${algorithm}: positions the real nodes and ignores the dangling edges`, () => {
      let out: ReturnType<typeof runLayout> = []
      expect(() => {
        out = runLayout(nodes, edges, algorithm)
      }, `${algorithm} threw on a dangling edge`).not.toThrow()

      // The real nodes must still come back — silently dropping them would
      // blank the canvas just as surely as throwing.
      expect(out.map((n) => n.id).sort(), `${algorithm} lost a node`).toEqual(['a', 'b'])
      for (const laid of out) {
        expect(Number.isFinite(laid.position.x), `${algorithm} produced a non-finite x`).toBe(true)
        expect(Number.isFinite(laid.position.y), `${algorithm} produced a non-finite y`).toBe(true)
      }
    })
  }
})

describe('a graph with a CYCLE terminates', () => {
  // a -> b -> c -> a. Ordinary in a flow editor, and a layered algorithm that
  // does not track visit state walks it forever.
  const nodes = [node('a'), node('b'), node('c')]
  const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'a')]

  for (const algorithm of ALGORITHMS) {
    test(`${algorithm}: lays out a cyclic graph`, () => {
      let out: ReturnType<typeof runLayout> = []
      expect(() => {
        out = runLayout(nodes, edges, algorithm)
      }, `${algorithm} did not terminate cleanly on a cycle`).not.toThrow()
      expect(out.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    })
  }

  test('a SELF-loop is handled too', () => {
    // The degenerate cycle, and the one a user creates by accident.
    const out = runLayout([node('a'), node('b')], [edge('self', 'a', 'a')], 'tree')
    expect(out.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })
})

describe('degenerate inputs', () => {
  test('no nodes returns an empty layout for every algorithm', () => {
    // The early return. Running the algorithms over an empty box list would
    // divide by zero in the packing and centring maths.
    for (const algorithm of ALGORITHMS) {
      expect(runLayout([], [], algorithm), algorithm).toEqual([])
    }
  })

  test('nodes with NO edges are still positioned', () => {
    // A disconnected graph — every node its own root. A tree layout that
    // assumes a single root would return only one of them.
    const nodes = [node('a'), node('b'), node('c')]
    for (const algorithm of ALGORITHMS) {
      const out = runLayout(nodes, [], algorithm)
      expect(out.map((n) => n.id).sort(), algorithm).toEqual(['a', 'b', 'c'])
    }
  })

  test('a single node lays out at a finite position', () => {
    for (const algorithm of ALGORITHMS) {
      const out = runLayout([node('only')], [], algorithm)
      expect(out).toHaveLength(1)
      expect(Number.isFinite(out[0]!.position.x), algorithm).toBe(true)
    }
  })

  test('a FOREST — several disconnected components — keeps every component', () => {
    // Two trees plus an isolate. A layout that walks from one root only would
    // drop the rest.
    const nodes = ['a1', 'a2', 'b1', 'b2', 'lone'].map(node)
    const edges = [edge('e1', 'a1', 'a2'), edge('e2', 'b1', 'b2')]
    for (const algorithm of ALGORITHMS) {
      const out = runLayout(nodes, edges, algorithm)
      expect(out.map((n) => n.id).sort(), algorithm).toEqual(['a1', 'a2', 'b1', 'b2', 'lone'])
    }
  })
})
