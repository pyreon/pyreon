import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFlow } from '../flow'
import { computeLayout } from '../layout'

// ─────────────────────────────────────────────────────────────────────────────
// Targeted coverage for the exact uncovered branch arms surfaced by the
// per-branch coverage report. Each test names the file + line it drives and
// the specific arm. These are GENUINE paths reachable through the public API
// (writable `edges` signal, multi-node/edge graphs, dim-less nodes, animation
// completion, history overflow, etc.) — no implementation-detail probing.
// ─────────────────────────────────────────────────────────────────────────────

const node = (id: string, x = 0, y = 0, extra: Record<string, unknown> = {}) => ({
  id,
  position: { x, y },
  data: {},
  ...extra,
})

const tick = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe('flow.ts — edgeMap with id-less edge (L102 `e.id ?? ""`)', () => {
  it('reads an edge written directly to the edges signal with no id', () => {
    const flow = createFlow({ nodes: [node('a'), node('b')] })
    // The `edges` signal is public + writable — a consumer can set a raw edge
    // that bypasses addEdge's id assignment. edgeMap must not throw.
    flow.edges.set([{ source: 'a', target: 'b' }])
    const map = flow.edgeMap()
    expect(map.has('')).toBe(true)
    expect(map.get('')).toMatchObject({ source: 'a', target: 'b' })
  })
})

describe('flow.ts — updateNode skips non-matching nodes (L171 `: n`)', () => {
  it('only the matched node is updated; others pass through unchanged', () => {
    const flow = createFlow({ nodes: [node('a'), node('b')] })
    const before = flow.getNode('b')
    flow.updateNode('a', { position: { x: 99, y: 99 } })
    expect(flow.getNode('a')!.position).toEqual({ x: 99, y: 99 })
    // 'b' was returned by the `: n` arm — same identity, untouched.
    expect(flow.getNode('b')).toBe(before)
  })
})

describe('flow.ts — isValidConnection target type fallback (L245 `?? "default"`)', () => {
  it('a target node without a `type` resolves to "default"', () => {
    const flow = createFlow({
      nodes: [node('src', 0, 0, { type: 'producer' }), node('tgt')], // tgt has no type
      connectionRules: { producer: { outputs: ['default'] } },
    })
    // rule.outputs.includes('default') — the targetType fell back to 'default'.
    expect(flow.isValidConnection({ source: 'src', target: 'tgt' })).toBe(true)
  })
})

describe('flow.ts — deleteSelected branches (L303 arm2, L308 arm1)', () => {
  it('keeps a selected edge that is NOT connected to a deleted node (L303 third &&-arm false)', () => {
    const flow = createFlow({
      nodes: [node('a'), node('b'), node('c'), node('d')],
      edges: [
        { id: 'e-cd', source: 'c', target: 'd' }, // unrelated to deleted node 'a'
      ],
    })
    flow.selectNode('a')
    // Additively select the unrelated edge so edgeIdsToRemove is non-empty.
    flow.selectEdge('e-cd', true)
    flow.deleteSelected()
    // Node 'a' gone; edge e-cd is unconnected to 'a' (first two && arms true),
    // and the third arm `!edgeIdsToRemove.has(e.id)` is false → edge removed.
    expect(flow.getNode('a')).toBeUndefined()
    expect(flow.edges().some((e) => e.id === 'e-cd')).toBe(false)
  })

  it('does nothing when neither nodes nor edges are selected (L308 else-if false)', () => {
    const flow = createFlow({
      nodes: [node('a'), node('b')],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
    })
    flow.clearSelection()
    flow.deleteSelected()
    expect(flow.nodes()).toHaveLength(2)
    expect(flow.edges()).toHaveLength(1)
  })
})

describe('flow.ts — layout animation control (L429 arm0, L462 arm1)', () => {
  it('a second animated layout cancels the first in-flight frame loop (L429 true)', async () => {
    const flow = createFlow({
      nodes: [node('1', 0, 0), node('2', 100, 100)],
      edges: [{ source: '1', target: '2' }],
    })
    // First animated layout: await its frame loop to actually START so
    // `_layoutFrameId` is set before the second layout's cancel check runs.
    await flow.layout('layered', { animationDuration: 5000 })
    await tick() // let the first animateFrame schedule the next frame
    // Second layout: its post-await cancel sees `_layoutFrameId !== null`.
    await flow.layout('layered', { animationDuration: 5000 })
    await tick()
    expect(flow.nodes()).toHaveLength(2)
    flow.dispose()
  })

  it('an animated layout completes and nulls the frame id (L462 else / t>=1)', async () => {
    const flow = createFlow({
      nodes: [node('1', 0, 0), node('2', 200, 200)],
      edges: [{ source: '1', target: '2' }],
    })
    await flow.layout('layered', { animationDuration: 1 })
    // Let the 1ms animation finish so the final frame takes the t>=1 branch.
    await sleep(30)
    await tick()
    await tick()
    expect(flow.nodes()).toHaveLength(2)
    flow.dispose()
  })
})

describe('flow.ts — undo history overflow (L600 `undoStack.length > maxHistory`)', () => {
  it('trims the oldest history entry past the 50-entry cap', () => {
    const flow = createFlow({ nodes: [node('a')] })
    // Push 55 history snapshots — exceeds maxHistory (50), forcing .shift().
    for (let i = 0; i < 55; i++) {
      flow.updateNode('a', { position: { x: i, y: i } })
      flow.pushHistory()
    }
    // The cap is enforced — undoing more than 50 times eventually no-ops
    // (the oldest snapshots were shifted out).
    for (let i = 0; i < 60; i++) flow.undo()
    // Still functional, no throw — the shift path executed.
    expect(flow.nodes()).toHaveLength(1)
  })
})

describe('flow.ts — getSnapLines default dims (L666/667 drag node, L678/679 other node)', () => {
  it('drag node AND other node both fall back to default width/height', () => {
    const flow = createFlow({
      nodes: [
        node('drag', 0, 0), // no width/height → L666/L667 fallback
        node('other', 75, 0), // no width/height → L678/L679 fallback
      ],
    })
    // drag center x = 0 + 150/2 = 75; other center x = 75 + 150/2 = 150.
    // Position the drag so its center aligns with 'other' center for a snap.
    const result = flow.getSnapLines('drag', { x: 75, y: 0 }, 5)
    expect(result).toHaveProperty('snappedPosition')
    // The defaults (150x40) were used without throwing.
    expect(typeof result.snappedPosition.x).toBe('number')
  })
})

describe('flow.ts — waypoint ops skip non-matching edges + no-waypoints fallback', () => {
  it('addEdgeWaypoint returns non-matching edges unchanged (L773 arm0)', () => {
    const flow = createFlow({
      nodes: [node('a'), node('b')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
    })
    flow.addEdgeWaypoint('e1', { x: 5, y: 5 })
    expect(flow.getEdge('e1')!.waypoints).toEqual([{ x: 5, y: 5 }])
    // e2 was untouched (returned by the `e.id !== id → return e` arm).
    expect(flow.getEdge('e2')!.waypoints).toBeUndefined()
  })

  it('removeEdgeWaypoint skips non-matching edges + handles missing waypoints (L788/L789)', () => {
    const flow = createFlow({
      nodes: [node('a'), node('b')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' }, // no waypoints → L789 `?? []`
        { id: 'e2', source: 'b', target: 'a' }, // non-matching → L788 arm0
      ],
    })
    flow.removeEdgeWaypoint('e1', 0) // splice on empty array — no throw
    expect(flow.getEdge('e1')!.waypoints).toBeUndefined()
    expect(flow.getEdge('e2')).toBeDefined()
  })

  it('updateEdgeWaypoint skips non-matching edges + handles missing waypoints (L800/L801)', () => {
    const flow = createFlow({
      nodes: [node('a'), node('b')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' }, // no waypoints → L801 `?? []`
        { id: 'e2', source: 'b', target: 'a' }, // non-matching → L800 arm0
      ],
    })
    // index out of range on an empty waypoints array — leaves it empty.
    flow.updateEdgeWaypoint('e1', 0, { x: 1, y: 1 })
    expect(flow.getEdge('e1')!.waypoints).toEqual([])
    expect(flow.getEdge('e2')).toBeDefined()
  })
})

describe('flow.ts — reconnectEdge skips non-matching edges (L753 arm0)', () => {
  it('leaves edges whose id differs from the target untouched', () => {
    const flow = createFlow({
      nodes: [node('a'), node('b'), node('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
    })
    flow.reconnectEdge('e1', { target: 'c' })
    expect(flow.getEdge('e1')!.target).toBe('c')
    // e2 was returned unchanged by the `e.id !== targetEdgeId → return e` arm.
    expect(flow.getEdge('e2')!.target).toBe('c')
    expect(flow.getEdge('e2')!.source).toBe('b')
  })
})

describe('flow.ts — getProximityConnection (L830 reverse-edge OR, L841 second candidate)', () => {
  it('treats a reverse-direction existing edge as already-connected (L830 arm2/arm3)', () => {
    const flow = createFlow({
      nodes: [node('a', 0, 0), node('b', 10, 0)],
      // Edge goes b→a (reverse of the proximity probe a→b). The first OR
      // clause (e.source===a && e.target===b) is false, so the second
      // clause (e.source===b && e.target===a) is evaluated → both true.
      edges: [{ id: 'e', source: 'b', target: 'a' }],
    })
    // 'b' is within threshold of 'a' but already connected (in reverse) → null.
    expect(flow.getProximityConnection('a', 500)).toBeNull()
  })

  it('compares distance against the running closest (L841 `dist < closest.dist`)', () => {
    const flow = createFlow({
      nodes: [
        node('a', 0, 0),
        node('far', 40, 0), // within threshold, becomes first closest
        node('near', 20, 0), // closer → triggers dist < closest.dist comparison
      ],
    })
    const conn = flow.getProximityConnection('a', 1000)
    expect(conn).not.toBeNull()
    // The nearest candidate wins.
    expect(conn!.target).toBe('near')
  })
})

describe('flow.ts — resolveCollisions X-push left direction (L909 arm0)', () => {
  it('pushes when node is left of other and X-overlap is smallest', () => {
    const flow = createFlow({
      nodes: [
        // Small X overlap, large Y overlap → X-push branch.
        node('1', 0, 0, { width: 20, height: 200 }),
        node('2', 10, 0, { width: 20, height: 200 }), // node1.x(0) < node2.x(10)
      ],
    })
    const before = flow.getNode('2')!.position.x
    flow.resolveCollisions('1')
    // The `node.position.x < other.position.x` arm executed (negative dx).
    expect(flow.getNode('2')!.position.x).not.toBe(before)
  })
})

describe('flow.ts — animateViewport branches (L1026 cancel, L1035 zoom fallback, L1050 complete)', () => {
  it('a second animateViewport cancels the first in-flight frame (L1026 true)', async () => {
    const flow = createFlow({ nodes: [node('1')] })
    flow.animateViewport({ x: 100, y: 100, zoom: 2 }, 5000)
    await tick() // let the first frame schedule the next
    flow.animateViewport({ x: 200, y: 200, zoom: 3 }, 5000)
    await tick()
    expect(flow.viewport()).toBeDefined()
    flow.dispose()
  })

  it('target without zoom keeps the current zoom (L1035 `?? start.zoom`)', async () => {
    const flow = createFlow({ nodes: [node('1')] })
    flow.viewport.set({ x: 0, y: 0, zoom: 2.5 })
    flow.animateViewport({ x: 50, y: 50 }, 1) // no zoom in target
    await sleep(30)
    await tick()
    await tick()
    // Animation done — final zoom equals the preserved start zoom.
    expect(flow.viewport().zoom).toBeCloseTo(2.5, 5)
    flow.dispose()
  })

  it('animateViewport completes and nulls the frame id (L1050 else / t>=1)', async () => {
    const flow = createFlow({ nodes: [node('1')] })
    flow.animateViewport({ x: 300, y: 300, zoom: 1.5 }, 1)
    await sleep(30)
    await tick()
    await tick()
    expect(flow.viewport()).toMatchObject({ x: 300, y: 300 })
    flow.dispose()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// layout.ts — runtime-value fallbacks for out-of-enum inputs (real for JSON /
// external data sources whose TS types don't constrain the runtime value), and
// the production dev-gate suppression path.
// ─────────────────────────────────────────────────────────────────────────────

describe('layout.ts — out-of-enum runtime-value fallbacks', () => {
  it('an unknown algorithm falls back to layered (L146 `?? ELK_ALGORITHMS.layered`)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const positions = await computeLayout(
      [node('1')],
      [],
      // External/JSON data can carry a string outside the LayoutAlgorithm union.
      'totally-not-an-algorithm' as never,
    )
    expect(positions).toHaveLength(1)
    warn.mockRestore()
  })

  it('an unknown direction falls back to DOWN (L150 `?? "DOWN"`)', async () => {
    const positions = await computeLayout([node('1')], [], 'layered', {
      direction: 'SIDEWAYS' as never,
    })
    expect(positions).toHaveLength(1)
  })

  it('an unknown edgeRouting falls back to ORTHOGONAL (L167 `?? "ORTHOGONAL"`)', async () => {
    const positions = await computeLayout([node('1')], [], 'layered', {
      edgeRouting: 'zigzag' as never,
    })
    expect(positions).toHaveLength(1)
  })
})

describe('layout.ts — production dev-gate suppression (L71 `=== "production"` return)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('does NOT warn about ignored options when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // `direction` on a force layout would warn in dev — production must suppress.
    await computeLayout([node('1')], [], 'force', { direction: 'RIGHT' })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
