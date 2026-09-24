/**
 * The `direction` option, and the documented claim about which algorithms
 * honour it.
 *
 * `LayoutOptions.direction` carries an unusually specific docstring: it
 * says `layered` and `tree` respect the option, that the five geometric
 * algorithms "silently ignore" it, and that this was "verified by running
 * each algorithm twice with 'DOWN' vs 'RIGHT' and checking whether the
 * resulting positions differ". That is a claim a test can hold, and until
 * now nothing did — the whole option, including the `UP`/`LEFT` axis flip,
 * had no coverage.
 *
 * Both halves matter. A directed algorithm that ignored the option would
 * render every diagram top-down whatever the user asked for. A geometric
 * one that started honouring it would silently change every existing
 * diagram's layout on upgrade — and the docstring, being the only place
 * the distinction is written down, would quietly become false.
 *
 * `UP` and `LEFT` go through a separate axis flip applied after placement,
 * which is the part most likely to be wrong in an off-by-one way: it
 * mirrors around the extent, so a box's own width/height has to come out
 * of the mirrored coordinate or every node ends up shifted by its own size.
 */
import { runLayout } from '../layout-engine'
import type { FlowEdge, FlowNode, LayoutAlgorithm } from '../types'

const node = (id: string): FlowNode<unknown> => ({
  id,
  position: { x: 0, y: 0 },
  data: {},
  width: 100,
  height: 40,
})

const edge = (id: string, source: string, target: string): FlowEdge => ({ id, source, target })

/** A three-deep chain — the shape whose direction is unambiguous. */
const CHAIN_NODES = [node('a'), node('b'), node('c')]
const CHAIN_EDGES = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')]

const at = (algorithm: LayoutAlgorithm, direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
  const out = runLayout(CHAIN_NODES, CHAIN_EDGES, algorithm, direction ? { direction } : {})
  return Object.fromEntries(out.map((n) => [n.id, n.position]))
}

/** One parent, three siblings — the shape where a within-layer gap shows. */
const FAN_NODES = [node('root'), node('s1'), node('s2'), node('s3')]
const FAN_EDGES = [
  edge('f1', 'root', 's1'),
  edge('f2', 'root', 's2'),
  edge('f3', 'root', 's3'),
]

const DIRECTED: LayoutAlgorithm[] = ['layered', 'tree']
const GEOMETRIC: LayoutAlgorithm[] = ['force', 'stress', 'radial', 'box', 'rectpacking']
const ALL: LayoutAlgorithm[] = [...DIRECTED, ...GEOMETRIC]

describe('the directed algorithms lay out along the requested axis', () => {
  for (const algorithm of DIRECTED) {
    test(`${algorithm}: DOWN puts a successor BELOW its predecessor`, () => {
      const p = at(algorithm, 'DOWN')
      expect(p.b!.y, 'b follows a').toBeGreaterThan(p.a!.y)
      expect(p.c!.y, 'and c follows b').toBeGreaterThan(p.b!.y)
    })

    test(`${algorithm}: RIGHT puts a successor to the RIGHT`, () => {
      const p = at(algorithm, 'RIGHT')
      expect(p.b!.x).toBeGreaterThan(p.a!.x)
      expect(p.c!.x).toBeGreaterThan(p.b!.x)
    })

    test(`${algorithm}: UP is the vertical mirror — a successor sits ABOVE`, () => {
      // The axis flip. Mirroring around the extent has to subtract the
      // box's own height, or every node lands one box-height off and the
      // top row hangs above the origin.
      const p = at(algorithm, 'UP')
      expect(p.b!.y, 'b sits above a').toBeLessThan(p.a!.y)
      expect(p.c!.y).toBeLessThan(p.b!.y)
    })

    test(`${algorithm}: LEFT is the horizontal mirror`, () => {
      const p = at(algorithm, 'LEFT')
      expect(p.b!.x).toBeLessThan(p.a!.x)
      expect(p.c!.x).toBeLessThan(p.b!.x)
    })

    test(`${algorithm}: UP mirrors DOWN rather than merely reversing order`, () => {
      // A flip that reversed the ORDER but not the coordinates would pass
      // the "above" assertion while placing nodes wrongly. The mirrored
      // run must span the same extent as the original.
      const down = at(algorithm, 'DOWN')
      const up = at(algorithm, 'UP')
      const span = (p: Record<string, { x: number; y: number }>) =>
        Math.max(...Object.values(p).map((v) => v.y)) -
        Math.min(...Object.values(p).map((v) => v.y))
      expect(span(up), 'the flip must preserve the extent').toBeCloseTo(span(down), 5)
    })
  }
})

describe('the geometric algorithms ignore direction, as documented', () => {
  for (const algorithm of GEOMETRIC) {
    test(`${algorithm}: DOWN and RIGHT produce identical positions`, () => {
      // Pins the docstring's claim. If one of these starts honouring
      // direction, every existing diagram using it silently re-lays-out on
      // upgrade — so the change should be deliberate and this should fail.
      expect(at(algorithm, 'RIGHT')).toEqual(at(algorithm, 'DOWN'))
    })
  }
})

describe('contracts that hold for every algorithm and direction', () => {
  const DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const

  for (const algorithm of ALL) {
    for (const direction of DIRECTIONS) {
      test(`${algorithm}/${direction}: nothing lands at a negative coordinate`, () => {
        // Origin anchoring is a documented `runLayout` contract, applied
        // AFTER the algorithm and after the axis flip. A node at a negative
        // coordinate renders outside the canvas and is unreachable by
        // scrolling — invisible, with no error.
        for (const n of runLayout(CHAIN_NODES, CHAIN_EDGES, algorithm, { direction })) {
          expect(n.position.x, `${algorithm}/${direction} x`).toBeGreaterThanOrEqual(0)
          expect(n.position.y, `${algorithm}/${direction} y`).toBeGreaterThanOrEqual(0)
        }
      })
    }

    test(`${algorithm}: a larger nodeSpacing spreads the graph out`, () => {
      // `nodeSpacing` is documented as respected by EVERY algorithm — the
      // one option with no per-algorithm carve-out.
      //
      // The fixture is a FAN-OUT, not the chain used above, and that is
      // load-bearing rather than incidental: for `layered`/`tree` this
      // option is the gap between NEIGHBOURS, i.e. nodes sharing a layer
      // (the gap between layers is `layerSpacing`). A chain puts one node
      // per layer, so it has no neighbours and is correctly insensitive to
      // the option — a version of this test written on the chain fails on
      // exactly those two algorithms and reads as a bug in them.
      const extent = (spacing: number): number => {
        const out = runLayout(FAN_NODES, FAN_EDGES, algorithm, { nodeSpacing: spacing })
        const xs = out.map((n) => n.position.x)
        const ys = out.map((n) => n.position.y)
        return Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys))
      }
      expect(extent(200), `${algorithm} ignored nodeSpacing`).toBeGreaterThan(extent(20))
    })
  }
})
