/**
 * Single-node-drag fan-out (P1) + per-edge geometry memoization (P3).
 *
 * A drag frame writes the WHOLE `nodes()` array once per pointermove
 * (flow-component.tsx onPointerMove → `nodes.update(nds => nds.map(...))`),
 * and `nodeMap` — a DEFAULT computed — notifies UNCONDITIONALLY. Before the
 * per-id computeds (`instance._nodeById` / `_edgeById` / `_edgeGeometry`,
 * flow.ts), every node's class/style/data thunk and every edge's geometry
 * closure therefore re-ran on EVERY frame, even for nodes/edges the drag
 * never touched: O(N + E) thunk re-runs + E full `computeEdgeGeometry`
 * calls per pointermove.
 *
 * The per-id computeds are the equality gate (`{ equals: Object.is }`): the
 * drag's `nds.map` preserves the object identity of unmoved nodes, so only
 * the MOVED node's computed propagates → the moved node's thunks plus the
 * geometry of its touching edges re-run — O(1 + deg) per frame.
 *
 * These specs count consumer-visible thunk runs during a drag and assert the
 * ZERO-fan-out contract for unmoved nodes/edges. Bisect: revert the row
 * accessors to `instance.nodeMap().get(id)` / per-row geometry closures →
 * the unmoved counters jump from 0 to ~FRAMES and the zero specs fail.
 */
import { h } from '@pyreon/core'
import { batch } from '@pyreon/reactivity'
import { accessInternal, mountReactive } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import type { EdgeComponentProps } from '../components/flow-component'
import { createFlow } from '../flow'
import type { NodeComponentProps } from '../types'

const FRAMES = 30

function buildFlow() {
  // n0..n5 in a line; e-move touches the dragged node (n0), e-still-1 /
  // e-still-2 connect only unmoved nodes.
  return createFlow<{ label: string }>({
    nodes: Array.from({ length: 6 }, (_, i) => ({
      id: `n${i}`,
      type: 'counted',
      position: { x: i * 200, y: 0 },
      data: { label: `N${i}` },
    })),
    edges: [
      { id: 'e-move', source: 'n0', target: 'n1', type: 'counted' },
      { id: 'e-still-1', source: 'n2', target: 'n3', type: 'counted' },
      { id: 'e-still-2', source: 'n4', target: 'n5', type: 'counted' },
    ],
  })
}

// Exactly the write the real onPointerMove drag handler performs once per
// frame: a fresh array whose UNMOVED entries keep their object identity.
function dragFrame(flow: ReturnType<typeof buildFlow>, id = 'n0') {
  flow.nodes.update((nds) =>
    nds.map((n) =>
      n.id === id ? { ...n, position: { x: n.position.x + 1, y: n.position.y } } : n,
    ),
  )
}

describe('single-node drag fan-out (per-id computeds)', () => {
  let cleanups: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanups) c()
    cleanups = []
  })

  function mountCounted(flow: ReturnType<typeof buildFlow>) {
    const nodeRuns: Record<string, number> = {}
    const edgeRuns: Record<string, number> = {}

    function CountedNode(props: NodeComponentProps<{ label: string }>) {
      return h('div', { 'data-counted': props.id }, () => {
        nodeRuns[props.id] = (nodeRuns[props.id] ?? 0) + 1
        return props.data().label
      })
    }

    function CountedEdge(props: EdgeComponentProps) {
      return h('text', {
        'data-counted-edge': props.edge.id,
        // Reads sourceX/sourceY → subscribes to the shared per-edge geometry
        // computed. A run of this thunk == a geometry notification for THIS
        // edge (the geometry computed has no equals gate, so recompute ⇒
        // notify ⇒ this thunk runs).
        x: () => {
          const id = props.edge.id ?? ''
          edgeRuns[id] = (edgeRuns[id] ?? 0) + 1
          return String(props.sourceX())
        },
        y: () => String(props.sourceY()),
      })
    }

    const mounted = mountReactive(
      h(Flow as never, {
        instance: flow,
        nodeTypes: { counted: CountedNode },
        edgeTypes: { counted: CountedEdge },
      }),
    )
    cleanups.push(mounted.cleanup)
    return { ...mounted, nodeRuns, edgeRuns }
  }

  it("an UNMOVED node's thunks fire 0× and an UNMOVED edge's geometry recomputes 0× during another node's drag", () => {
    const flow = buildFlow()
    const { nodeRuns, edgeRuns } = mountCounted(flow)

    // Post-MOUNT baseline (mount itself runs each thunk a constant number of
    // times — initial read + effect start; the contract under test is the
    // DELTA during the drag).
    const nodeBase = { ...nodeRuns }
    const edgeBase = { ...edgeRuns }

    for (let i = 0; i < FRAMES; i++) dragFrame(flow, 'n0')

    // Unmoved nodes: ZERO additional thunk runs (pre-fix: +FRAMES each).
    for (const id of ['n1', 'n2', 'n3', 'n4', 'n5']) {
      expect(nodeRuns[id]! - nodeBase[id]!, `node ${id}`).toBe(0)
    }
    // Unmoved edges: ZERO geometry notifications (pre-fix: +FRAMES each).
    expect(edgeRuns['e-still-1']! - edgeBase['e-still-1']!).toBe(0)
    expect(edgeRuns['e-still-2']! - edgeBase['e-still-2']!).toBe(0)

    // The moved node and its touching edge DID update — once per frame.
    expect(nodeRuns.n0! - nodeBase.n0!).toBe(FRAMES)
    expect(edgeRuns['e-move']! - edgeBase['e-move']!).toBe(FRAMES)
  })

  it('the moved node and its touching edge reflect the new position in the DOM', () => {
    const flow = buildFlow()
    const { container } = mountCounted(flow)

    const beforeX = container.querySelector('[data-counted-edge="e-move"]')!.getAttribute('x')
    for (let i = 0; i < FRAMES; i++) dragFrame(flow, 'n0')

    const wrapper = container.querySelector('[data-nodeid="n0"]') as HTMLElement
    expect(wrapper.getAttribute('style')).toContain(`translate(${FRAMES}px, 0px)`)
    const afterX = container.querySelector('[data-counted-edge="e-move"]')!.getAttribute('x')
    expect(afterX).not.toBe(beforeX)
    expect(Number(afterX)).toBeGreaterThan(Number(beforeX))
  })

  it('a data update fans out to only that node (updateNode preserves sibling identity)', () => {
    const flow = buildFlow()
    const { nodeRuns } = mountCounted(flow)

    const base = { ...nodeRuns }
    flow.updateNode('n2', { data: { label: 'CHANGED' } })

    expect(nodeRuns.n2! - base.n2!).toBe(1)
    expect(nodeRuns.n0! - base.n0!).toBe(0)
    expect(nodeRuns.n1! - base.n1!).toBe(0)
    expect(nodeRuns.n3! - base.n3!).toBe(0)
  })

  it('removing a node sweeps its cached computeds and the id can be re-added (fresh computed)', () => {
    const flow = buildFlow()
    const { container, nodeRuns } = mountCounted(flow)

    // removeNode cascades: n1 leaves nodeMap (sweeps `_nodeById('n1')`) and
    // e-move leaves edgeMap (sweeps `_edgeById`/`_edgeGeometry`).
    flow.removeNode('n1')
    expect(container.querySelector('[data-counted="n1"]')).toBeNull()
    expect(container.querySelector('[data-counted-edge="e-move"]')).toBeNull()

    // Re-adding the SAME id must get a FRESH per-id computed (a swept-but-
    // stale one would serve the old cached value / never notify).
    flow.addNode({ id: 'n1', type: 'counted', position: { x: 999, y: 0 }, data: { label: 'BACK' } })
    const wrapper = container.querySelector('[data-nodeid="n1"]') as HTMLElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.getAttribute('style')).toContain('translate(999px, 0px)')
    expect(container.querySelector('[data-counted="n1"]')!.textContent).toBe('BACK')

    // ...and the re-added node is live: dragging it updates the DOM.
    const runsBefore = nodeRuns.n1!
    for (let i = 0; i < 5; i++) dragFrame(flow, 'n1')
    expect(wrapper.getAttribute('style')).toContain('translate(1004px, 0px)')
    expect(nodeRuns.n1! - runsBefore).toBe(5)
  })

  it('removing an edge drops its geometry computed from the measurements subscriber set (sweep, no zombie)', () => {
    const flow = buildFlow()
    mountCounted(flow)

    const subs = () =>
      (() => {
        // Two-tier tracking storage — count the inline slot too.
        const h = accessInternal<{ _s1: unknown; _s: Set<unknown> | null }>(flow.measurements)
        return (h._s1 != null ? 1 : 0) + (h._s?.size ?? 0)
      })()
    const before = subs()
    expect(before).toBeGreaterThanOrEqual(3) // one geometry computed per edge

    // A consumer-batched move + removal in ONE batch is the ordering that
    // dirty-marks e-move's geometry in the same drain that sweeps it — the
    // shape `disposeCached`'s dirty-clear defends against.
    batch(() => {
      dragFrame(flow, 'n0')
      flow.removeEdge('e-move')
    })

    expect(subs()).toBe(before - 1)
  })

  it('the same instance survives <Flow> unmount + remount (per-id computeds are scope-DETACHED)', () => {
    const flow = buildFlow()
    const first = mountCounted(flow)
    first.cleanup()
    cleanups = cleanups.filter((c) => c !== first.cleanup)

    // If the per-id computeds had registered on the first mount's component
    // scope, that cleanup disposed them — recompute() early-returns on
    // `_disposed`, so the SECOND mount would render but never update again.
    const second = mountCounted(flow)
    const base = second.nodeRuns.n0!
    for (let i = 0; i < 5; i++) dragFrame(flow, 'n0')

    const wrapper = second.container.querySelector('[data-nodeid="n0"]') as HTMLElement
    expect(wrapper.getAttribute('style')).toContain('translate(5px, 0px)')
    expect(second.nodeRuns.n0! - base).toBe(5)
  })

  it('geometry is null for a missing edge or a dangling endpoint (mid-removal window contract)', () => {
    const flow = buildFlow()
    // Never-existing edge id → the `!e` branch.
    expect(flow._edgeGeometry('ghost')()).toBeNull()
    // Dangling endpoints (only reachable via a direct consumer edges write —
    // removeNode cascades edge removal) → the missing-node branches.
    flow.edges.update((eds) => [
      ...eds,
      { id: 'dangling-src', source: 'nope', target: 'n0' },
      { id: 'dangling-tgt', source: 'n0', target: 'nope' },
    ])
    expect(flow._edgeGeometry('dangling-src')()).toBeNull()
    expect(flow._edgeGeometry('dangling-tgt')()).toBeNull()
    // A real edge yields a packet.
    expect(flow._edgeGeometry('e-still-1')()).not.toBeNull()
  })

  it('instance.dispose() clears the per-id caches; later writes are inert but safe', () => {
    const flow = buildFlow()
    const mounted = mountCounted(flow)
    mounted.cleanup()
    cleanups = cleanups.filter((c) => c !== mounted.cleanup)

    flow.dispose()
    expect(() => dragFrame(flow, 'n0')).not.toThrow()
  })
})
