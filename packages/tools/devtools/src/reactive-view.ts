// Pure presentation logic for the reactive surfaces (Graph layout +
// Profiler fire-bucketing). Lives in its own module — not panel.ts — so
// it is unit-tested + coverage-counted (panel.ts is browser-only and
// coverage-excluded). No DOM, no chrome APIs.

import type {
  ReactiveEdge,
  ReactiveFire,
  ReactiveGraph,
  ReactiveNode,
  ReactiveNodeKind,
} from './types'

export type { ReactiveEdge, ReactiveFire, ReactiveGraph, ReactiveNode } from './types'

export interface PositionedNode extends ReactiveNode {
  x: number
  y: number
}

export interface LaidOutGraph {
  nodes: PositionedNode[]
  edges: ReactiveEdge[]
  width: number
  height: number
}

const COL_X: Record<ReactiveNodeKind, number> = {
  signal: 90,
  derived: 320,
  effect: 560,
}
const COL_W = 130
const ROW_H = 46
const PAD_Y = 40

/**
 * Deterministic layered layout: signals in the left column, deriveds in
 * the middle, effects on the right; each column stacked top-down in
 * stable id order. Dependency arrows therefore read left → right, which
 * matches the design's PxArtDevGraph (sources → subscribers). Pure +
 * deterministic so it's snapshot-testable.
 */
export function layoutGraph(graph: ReactiveGraph): LaidOutGraph {
  const cols: Record<ReactiveNodeKind, ReactiveNode[]> = {
    signal: [],
    derived: [],
    effect: [],
  }
  for (const n of graph.nodes) cols[n.kind].push(n)
  for (const k of Object.keys(cols) as ReactiveNodeKind[]) {
    cols[k].sort((a, b) => a.id - b.id)
  }

  const positioned: PositionedNode[] = []
  let maxRows = 0
  for (const k of Object.keys(cols) as ReactiveNodeKind[]) {
    const list = cols[k]
    maxRows = Math.max(maxRows, list.length)
    list.forEach((n, i) => {
      positioned.push({ ...n, x: COL_X[k], y: PAD_Y + i * ROW_H })
    })
  }

  // Only keep edges whose endpoints are present (defensive: a node may
  // have been GC'd between graph build and now).
  const ids = new Set(positioned.map((n) => n.id))
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to))

  return {
    nodes: positioned,
    edges,
    width: COL_X.effect + COL_W + 40,
    height: Math.max(PAD_Y * 2, PAD_Y + maxRows * ROW_H + PAD_Y),
  }
}

export interface FireBuckets {
  /** Fire count per frame window, oldest → newest. */
  frames: number[]
  /** Tallest bucket (≥ 1, so callers can divide safely). */
  max: number
  /** Total fires counted. */
  total: number
  /** Window size used, in ms. */
  frameMs: number
}

/**
 * Bucket fire timestamps into fixed `frameMs` windows spanning the
 * observed range (Profiler tab). The design uses 100&thinsp;ms frames.
 * Empty input → a single empty frame so the chart renders a baseline.
 */
export function bucketFires(fires: ReactiveFire[], frameMs = 100, maxFrames = 60): FireBuckets {
  if (fires.length === 0) {
    return { frames: [0], max: 1, total: 0, frameMs }
  }
  let lo = Infinity
  let hi = -Infinity
  for (const f of fires) {
    if (f.ts < lo) lo = f.ts
    if (f.ts > hi) hi = f.ts
  }
  const span = Math.max(0, hi - lo)
  const count = Math.min(maxFrames, Math.max(1, Math.ceil(span / frameMs) + 1))
  const frames = Array.from({ length: count }, () => 0)
  for (const f of fires) {
    // `lo` is the min ts, so `f.ts - lo` ≥ 0 → idx ≥ 0 always; only the
    // upper clamp is reachable (the last fire at `hi`). idx is therefore
    // provably in [0, count-1], so the indexed read is never undefined
    // — `!` avoids an uncoverable nullish branch (testing.md rule).
    const idx = Math.min(count - 1, Math.floor((f.ts - lo) / frameMs))
    // oxlint-disable-next-line typescript/no-non-null-assertion -- idx ∈ [0,count-1] (see comment above); avoids an uncoverable nullish branch
    frames[idx] = frames[idx]! + 1
  }
  let max = 1
  for (const c of frames) if (c > max) max = c
  return { frames, max, total: fires.length, frameMs }
}
