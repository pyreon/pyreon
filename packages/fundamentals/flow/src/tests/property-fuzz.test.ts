/**
 * Seeded property tests over random graphs (V of the 2026-09 flow audit).
 *
 * The hand-written invariant suites use one 12-node fixture; these sweep a
 * seeded grammar of graphs — disconnected components, self-loops, parallel
 * edges, isolated nodes, zero-size and huge nodes, sub-flow children — and
 * assert the invariants a consumer relies on without reading the code:
 *
 *   layout     every algorithm returns one finite position per node, never
 *              overlaps boxes, is deterministic, and never drifts negative —
 *              on graphs the fixed fixture cannot produce.
 *   geometry   every path builder emits a parseable SVG path made of finite
 *              numbers that starts at the source anchor and ends at the
 *              target anchor; `computeEdgeGeometry` anchors on the node boxes.
 *   round-trip `toJSON` → `fromJSON` reproduces the graph exactly, and a
 *              random mutation script followed by full undo restores the
 *              initial graph (then redo replays it).
 *
 * `PYREON_FUZZ_SEEDS` raises the seed count for a sweep (default 60 in CI).
 */
import { describe, expect, it } from 'vitest'
import { computeEdgeGeometry } from '../edge-geometry'
import { getEdgePath, getWaypointPath } from '../edges'
import { createFlow } from '../flow'
import { runLayout } from '../layout-engine'
import { type FlowEdge, type FlowNode, type LayoutAlgorithm, Position } from '../types'

const SEEDS = Number(process.env.PYREON_FUZZ_SEEDS ?? 60)
const ALGOS: LayoutAlgorithm[] = ['layered', 'force', 'stress', 'tree', 'radial', 'box', 'rectpacking']
const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

/** Deterministic LCG so a failing seed is reproducible. */
function rng(seed: number) {
  let s = (seed * 2654435761 + 1) >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function genGraph(seed: number): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const r = rng(seed)
  const n = 1 + Math.floor(r() * 14)
  const nodes: FlowNode[] = []
  for (let i = 0; i < n; i++) {
    const size = r()
    nodes.push({
      id: `n${i}`,
      position: { x: Math.floor(r() * 800) - 100, y: Math.floor(r() * 600) - 100 },
      data: { i },
      // zero-size (measured later), tiny, default and huge boxes
      ...(size < 0.15
        ? { width: 0, height: 0 }
        : size < 0.35
          ? { width: 8, height: 8 }
          : size < 0.8
            ? {}
            : { width: 400 + Math.floor(r() * 400), height: 200 + Math.floor(r() * 300) }),
    })
  }
  const edges: FlowEdge[] = []
  const m = Math.floor(r() * n * 1.5)
  for (let i = 0; i < m; i++) {
    const a = Math.floor(r() * n)
    const b = r() < 0.08 ? a : Math.floor(r() * n) // self-loops
    const edge: FlowEdge = { id: `e${i}`, source: `n${a}`, target: `n${b}` }
    const t = r()
    if (t < 0.25) edge.type = 'straight'
    else if (t < 0.5) edge.type = 'smoothstep'
    else if (t < 0.6) edge.type = 'step'
    if (r() < 0.15) edge.id = `e${Math.max(0, i - 1)}` // duplicate ids (must dedupe)
    edges.push(edge)
  }
  return { nodes, edges }
}

const NUM = /-?\d+(\.\d+)?(e-?\d+)?/g
function pathNumbers(d: string): number[] {
  return (d.match(NUM) ?? []).map(Number)
}

describe('layout — random graphs', () => {
  for (const algo of ALGOS) {
    it(`${algo}: finite, non-overlapping, deterministic, origin-anchored over ${SEEDS} seeds`, () => {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const { nodes, edges } = genGraph(seed)
        const laid = runLayout(nodes, edges, algo)
        const ctx = `seed ${seed} algo ${algo}`
        expect(laid, ctx).toHaveLength(nodes.length)
        expect(new Set(laid.map((q) => q.id)), ctx).toEqual(new Set(nodes.map((q) => q.id)))
        for (const q of laid) {
          expect(Number.isFinite(q.position.x), `${ctx} ${q.id}.x`).toBe(true)
          expect(Number.isFinite(q.position.y), `${ctx} ${q.id}.y`).toBe(true)
        }
        // No two POSITIVE-area boxes overlap (zero-size boxes may sit anywhere).
        const boxes = laid.map((q) => {
          const nd = nodes.find((x) => x.id === q.id)!
          return { id: q.id, x: q.position.x, y: q.position.y, w: nd.width ?? 150, h: nd.height ?? 40 }
        })
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!
            const b = boxes[j]!
            if (a.w === 0 || a.h === 0 || b.w === 0 || b.h === 0) continue
            const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
            expect(overlap, `${ctx}: ${a.id} overlaps ${b.id}`).toBe(false)
          }
        }
        expect(runLayout(nodes, edges, algo), `${ctx} determinism`).toEqual(laid)
        expect(Math.min(...laid.map((q) => q.position.x)), `${ctx} min x`).toBeGreaterThanOrEqual(-0.01)
        expect(Math.min(...laid.map((q) => q.position.y)), `${ctx} min y`).toBeGreaterThanOrEqual(-0.01)
      }
    })
  }
})

describe('edge geometry — random endpoints', () => {
  it(`every path type starts at the source and ends at the target with finite numbers (${SEEDS * 8} cases)`, () => {
    for (let seed = 1; seed <= SEEDS * 8; seed++) {
      const r = rng(seed)
      const sx = Math.floor(r() * 2000 - 1000)
      const sy = Math.floor(r() * 2000 - 1000)
      const tx = r() < 0.1 ? sx : Math.floor(r() * 2000 - 1000) // vertical / coincident cases
      const ty = r() < 0.1 ? sy : Math.floor(r() * 2000 - 1000)
      const sp = SIDES[Math.floor(r() * 4)]!
      const tp = SIDES[Math.floor(r() * 4)]!
      for (const type of ['bezier', 'smoothstep', 'straight', 'step']) {
        const res = getEdgePath(type, sx, sy, sp, tx, ty, tp)
        const ctx = `seed ${seed} ${type} (${sx},${sy})→(${tx},${ty}) ${sp}/${tp}`
        const nums = pathNumbers(res.path)
        expect(nums.length, ctx).toBeGreaterThanOrEqual(4)
        for (const v of nums) expect(Number.isFinite(v), `${ctx}: ${res.path}`).toBe(true)
        expect(res.path.startsWith(`M${sx},${sy}`), `${ctx}: ${res.path}`).toBe(true)
        expect(nums[nums.length - 2], `${ctx} end x: ${res.path}`).toBeCloseTo(tx, 6)
        expect(nums[nums.length - 1], `${ctx} end y: ${res.path}`).toBeCloseTo(ty, 6)
        expect(Number.isFinite(res.labelX) && Number.isFinite(res.labelY), `${ctx} label`).toBe(true)
      }
      const wps = Array.from({ length: Math.floor(r() * 4) }, () => ({
        x: Math.floor(r() * 2000 - 1000),
        y: Math.floor(r() * 2000 - 1000),
      }))
      const wp = getWaypointPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, waypoints: wps })
      const wn = pathNumbers(wp.path)
      expect(wp.path.startsWith(`M${sx},${sy}`), `seed ${seed} waypoint: ${wp.path}`).toBe(true)
      expect(wn[wn.length - 2]).toBe(tx)
      expect(wn[wn.length - 1]).toBe(ty)
    }
  })

  it(`computeEdgeGeometry anchors on the node boxes for every random pair (${SEEDS * 4} cases)`, () => {
    for (let seed = 1; seed <= SEEDS * 4; seed++) {
      const { nodes, edges } = genGraph(seed)
      if (edges.length === 0) continue
      const measured = new Map<string, { width: number; height: number }>()
      const r = rng(seed + 9999)
      for (const n of nodes) {
        if (r() < 0.5) measured.set(n.id, { width: 20 + Math.floor(r() * 300), height: 10 + Math.floor(r() * 100) })
      }
      for (const e of edges) {
        const s = nodes.find((n) => n.id === e.source)!
        const t = nodes.find((n) => n.id === e.target)!
        const g = computeEdgeGeometry(e, s, t, measured)
        const ctx = `seed ${seed} edge ${e.id} ${e.source}→${e.target}`
        for (const v of [g.sourceX, g.sourceY, g.targetX, g.targetY, g.labelX, g.labelY]) {
          expect(Number.isFinite(v), ctx).toBe(true)
        }
        const box = (n: FlowNode) => {
          const m = measured.get(n.id)
          const w = n.width && n.width > 0 ? n.width : (m?.width ?? 150)
          const h = n.height && n.height > 0 ? n.height : (m?.height ?? 40)
          return { x1: n.position.x, y1: n.position.y, x2: n.position.x + w, y2: n.position.y + h }
        }
        const sb = box(s)
        const tb = box(t)
        const on = (x: number, y: number, b: { x1: number; y1: number; x2: number; y2: number }) =>
          x >= b.x1 - 1e-6 && x <= b.x2 + 1e-6 && y >= b.y1 - 1e-6 && y <= b.y2 + 1e-6
        expect(on(g.sourceX, g.sourceY, sb), `${ctx}: source anchor (${g.sourceX},${g.sourceY}) off box ${JSON.stringify(sb)}`).toBe(true)
        expect(on(g.targetX, g.targetY, tb), `${ctx}: target anchor (${g.targetX},${g.targetY}) off box ${JSON.stringify(tb)}`).toBe(true)
        expect(g.path.startsWith(`M${g.sourceX},${g.sourceY}`), `${ctx}: ${g.path}`).toBe(true)
        expect(g.segments.length, ctx).toBeGreaterThan(0)
      }
    }
  })
})

describe('instance round-trips — random graphs + mutation scripts', () => {
  it(`toJSON → fromJSON reproduces nodes, edges and viewport (${SEEDS} seeds)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { nodes, edges } = genGraph(seed)
      const a = createFlow({ nodes, edges })
      a.viewport.set({ x: seed, y: -seed, zoom: 0.5 + (seed % 7) * 0.25 })
      const json = a.toJSON()
      const b = createFlow()
      b.fromJSON(JSON.parse(JSON.stringify(json)))
      expect(b.toJSON(), `seed ${seed}`).toEqual(json)
      a.dispose()
      b.dispose()
    }
  })

  it(`a random mutation script fully undoes back to the initial graph and redoes forward (${SEEDS} seeds)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { nodes, edges } = genGraph(seed)
      const flow = createFlow({ nodes, edges })
      const initial = flow.toJSON()
      const r = rng(seed * 31)
      const steps = 1 + Math.floor(r() * 12)
      const snapshots: string[] = []
      for (let s = 0; s < steps; s++) {
        const live = flow.nodes.peek()
        const pick = () => live[Math.floor(r() * live.length)]
        const op = r()
        flow.pushHistory()
        if (op < 0.3) {
          flow.addNode({ id: `x${seed}-${s}`, position: { x: r() * 500, y: r() * 500 }, data: {} })
        } else if (op < 0.5 && live.length > 0) {
          flow.removeNode(pick()!.id)
        } else if (op < 0.7 && live.length > 1) {
          flow.addEdge({ source: pick()!.id, target: pick()!.id })
        } else if (op < 0.85 && live.length > 0) {
          flow.updateNode(pick()!.id, { position: { x: r() * 900, y: r() * 900 } })
        } else if (live.length > 0) {
          flow.selectNode(pick()!.id)
          flow.deleteSelected()
        } else {
          flow.addNode({ id: `y${seed}-${s}`, position: { x: 0, y: 0 }, data: {} })
        }
        snapshots.push(JSON.stringify({ nodes: flow.nodes.peek(), edges: flow.edges.peek() }))
      }
      const after = JSON.stringify({ nodes: flow.nodes.peek(), edges: flow.edges.peek() })
      for (let s = 0; s < steps; s++) flow.undo()
      const restored = flow.toJSON()
      expect({ nodes: restored.nodes, edges: restored.edges }, `seed ${seed} undo`).toEqual({
        nodes: initial.nodes,
        edges: initial.edges,
      })
      for (let s = 0; s < steps; s++) flow.redo()
      expect(JSON.stringify({ nodes: flow.nodes.peek(), edges: flow.edges.peek() }), `seed ${seed} redo`).toBe(after)
      flow.dispose()
    }
  })
})
