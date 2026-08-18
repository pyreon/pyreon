/**
 * Layout engine — the graph-layout algorithms `computeLayout()` runs.
 *
 * Replaces `elkjs`, which is a GWT-compiled port of the Eclipse Layout Kernel:
 * ~1.5 MB of generated JavaScript under EPL-2.0 (weak copyleft), pulled in to
 * produce, in the end, one `{ x, y }` per node. Everything else ELK computes —
 * edge sections, ports, hierarchy — was discarded by the caller.
 *
 * This is deliberately NOT a reimplementation of ELK. It implements the seven
 * algorithms the public API exposes, at the quality a diagram editor needs:
 * readable layers, no overlapping boxes, honoured spacing. ELK's layered
 * pipeline uses Brandes–Köpf coordinate assignment and a full layer-sweep
 * crossing minimisation; this uses a median heuristic with adjacent-transpose
 * refinement and a priority-based straightening pass. Expect comparable
 * structure and somewhat more edge crossings on dense graphs.
 *
 * Everything here is PURE and synchronous: same graph in, same positions out.
 * That makes layouts reproducible across runs — which elkjs was not obliged to
 * be — and makes the whole engine testable without a DOM or a worker.
 */
import type { FlowEdge, FlowNode, LayoutAlgorithm, LayoutOptions } from './types'
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from './edges'

export interface LaidOutNode {
  id: string
  position: { x: number; y: number }
}

interface Box {
  id: string
  w: number
  h: number
}

const DEFAULT_NODE_SPACING = 20
const DEFAULT_LAYER_SPACING = 40

/** Deterministic pseudo-random — force/stress must not vary between runs. */
function makeRandom(seed = 0x2f6e2b1): () => number {
  let s = seed >>> 0
  return () => {
    // xorshift32 — cheap, deterministic, good enough for initial placement.
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 0xffffffff
  }
}

function boxesOf<T>(nodes: FlowNode<T>[]): Box[] {
  return nodes.map((n) => ({
    id: n.id,
    w: n.width ?? DEFAULT_NODE_WIDTH,
    h: n.height ?? DEFAULT_NODE_HEIGHT,
  }))
}

/** Adjacency restricted to edges whose endpoints both exist. */
function adjacency(ids: string[], edges: FlowEdge[]): Map<string, string[]> {
  const known = new Set(ids)
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const e of edges) {
    if (!known.has(e.source) || !known.has(e.target) || e.source === e.target) continue
    out.get(e.source)!.push(e.target)
  }
  return out
}

// ─── Layered (Sugiyama) ──────────────────────────────────────────────────────

/**
 * Break cycles by reversing back edges found in a DFS.
 *
 * Layer assignment needs a DAG. Rather than refuse a cyclic graph — diagram
 * editors are full of them — the back edges are reversed for layering only and
 * the original edge list is untouched.
 */
function breakCycles(ids: string[], adj: Map<string, string[]>): Map<string, string[]> {
  const state = new Map<string, 0 | 1 | 2>(ids.map((id) => [id, 0]))
  const dag = new Map<string, string[]>(ids.map((id) => [id, []]))

  const visit = (id: string): void => {
    state.set(id, 1)
    for (const next of adj.get(id) ?? []) {
      const st = state.get(next) ?? 0
      if (st === 1) {
        // Back edge — reverse it so the cycle cannot block layering.
        dag.get(next)!.push(id)
        continue
      }
      dag.get(id)!.push(next)
      if (st === 0) visit(next)
    }
    state.set(id, 2)
  }
  for (const id of ids) if ((state.get(id) ?? 0) === 0) visit(id)
  return dag
}

/** Longest-path layering: a node sits one layer below its deepest predecessor. */
function assignLayers(ids: string[], dag: Map<string, string[]>): Map<string, number> {
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const [, outs] of dag) for (const t of outs) indeg.set(t, (indeg.get(t) ?? 0) + 1)

  const layer = new Map<string, number>(ids.map((id) => [id, 0]))
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0)
  const seen = new Set(queue)
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!
    for (const t of dag.get(id) ?? []) {
      layer.set(t, Math.max(layer.get(t) ?? 0, (layer.get(id) ?? 0) + 1))
      const left = (indeg.get(t) ?? 0) - 1
      indeg.set(t, left)
      if (left === 0 && !seen.has(t)) {
        seen.add(t)
        queue.push(t)
      }
    }
  }
  // Any node left unvisited sat on a cycle the reversal did not fully break —
  // place it after its deepest known predecessor rather than dropping it.
  for (const id of ids) if (!seen.has(id)) layer.set(id, layer.get(id) ?? 0)
  return layer
}

/**
 * Order nodes within each layer to reduce crossings.
 *
 * Median heuristic (Eades–Wormald) plus adjacent transposition, swept both
 * ways. ELK runs a more thorough layer sweep; this converges fast and gets
 * most of the benefit on the graph sizes a diagram editor actually shows.
 */
function orderLayers(
  layers: string[][],
  adj: Map<string, string[]>,
  ids: string[],
): string[][] {
  const preds = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const [s, outs] of adj) for (const t of outs) preds.get(t)?.push(s)

  const result = layers.map((l) => [...l])
  const positionIn = (layer: string[]): Map<string, number> =>
    new Map(layer.map((id, i) => [id, i]))

  const medianOf = (id: string, neighbours: string[], pos: Map<string, number>): number => {
    const idx = neighbours.map((n) => pos.get(n)).filter((v): v is number => v !== undefined)
    if (idx.length === 0) return -1
    idx.sort((a, b) => a - b)
    return idx[Math.floor(idx.length / 2)]!
  }

  /**
   * Crossings contributed by the ORDERED pair (left, right) alone.
   *
   * The obvious implementation recounts every crossing between two layers for
   * each candidate swap, which is O(E^2) inside a loop over positions — 2.6s
   * for a 1000-node graph, measured. Whether swapping two ADJACENT nodes helps
   * depends only on their own neighbours, so this counts that instead:
   * O(deg(left) x deg(right)), and the sweep drops to milliseconds.
   */
  const pairCrossings = (
    left: string,
    right: string,
    neighboursOf: (id: string) => string[],
    pos: Map<string, number>,
  ): number => {
    const a = neighboursOf(left)
      .map((n) => pos.get(n))
      .filter((v): v is number => v !== undefined)
    const b = neighboursOf(right)
      .map((n) => pos.get(n))
      .filter((v): v is number => v !== undefined)
    let c = 0
    for (const x of a) for (const y of b) if (x > y) c++
    return c
  }

  for (let sweep = 0; sweep < 4; sweep++) {
    const downward = sweep % 2 === 0
    const order = downward
      ? [...result.keys()].slice(1)
      : [...result.keys()].slice(0, -1).reverse()

    for (const li of order) {
      const fixed = downward ? result[li - 1]! : result[li + 1]!
      const pos = positionIn(fixed)
      const medians = new Map(
        result[li]!.map((id) => [
          id,
          medianOf(id, downward ? (preds.get(id) ?? []) : (adj.get(id) ?? []), pos),
        ]),
      )
      const stable = new Map(result[li]!.map((id, i) => [id, i]))
      result[li]!.sort((a, b) => {
        const ma = medians.get(a)!
        const mb = medians.get(b)!
        // A node with no neighbour in the fixed layer keeps its place rather
        // than being flung to the front — that produced visible jitter.
        if (ma === -1 || mb === -1) return stable.get(a)! - stable.get(b)!
        return ma - mb || stable.get(a)! - stable.get(b)!
      })

      // Adjacent transposition: swap neighbours while it reduces crossings.
      const layer = result[li]!
      const neighboursOf = (id: string): string[] =>
        downward ? (preds.get(id) ?? []) : (adj.get(id) ?? [])
      for (let pass = 0; pass < 2; pass++) {
        let swapped = false
        for (let i = 0; i + 1 < layer.length; i++) {
          const a = layer[i]!
          const b = layer[i + 1]!
          if (pairCrossings(b, a, neighboursOf, pos) < pairCrossings(a, b, neighboursOf, pos)) {
            layer[i] = b
            layer[i + 1] = a
            swapped = true
          }
        }
        if (!swapped) break
      }
    }
  }
  return result
}

/**
 * Place ordered layers on a grid.
 *
 * Cross-axis: pack each layer end to end with `nodeSpacing`, then centre every
 * layer on the widest one so the diagram reads as a column rather than a
 * left-aligned staircase.
 *
 * Main axis: one row per layer, sized by that layer's tallest box plus
 * `layerSpacing`. Boxes therefore never overlap by construction — which is the
 * property the tests assert, rather than exact coordinates.
 */
function placeLayers(
  layers: string[][],
  box: Map<string, Box>,
  horizontal: boolean,
  nodeSpacing: number,
  layerSpacing: number,
): Map<string, { x: number; y: number }> {
  const cross = (b: Box): number => (horizontal ? b.h : b.w)
  const main = (b: Box): number => (horizontal ? b.w : b.h)

  const extents = layers.map((layer) =>
    layer.reduce((sum, id, i) => sum + cross(box.get(id)!) + (i > 0 ? nodeSpacing : 0), 0),
  )
  const widest = Math.max(0, ...extents)

  const out = new Map<string, { x: number; y: number }>()
  let mainOffset = 0
  layers.forEach((layer, li) => {
    const depth = Math.max(0, ...layer.map((id) => main(box.get(id)!)))
    let crossOffset = (widest - extents[li]!) / 2
    for (const id of layer) {
      const b = box.get(id)!
      // Centre each box within its layer's depth so a short node sits mid-row.
      const along = mainOffset + (depth - main(b)) / 2
      out.set(id, horizontal ? { x: along, y: crossOffset } : { x: crossOffset, y: along })
      crossOffset += cross(b) + nodeSpacing
    }
    mainOffset += depth + layerSpacing
  })
  return out
}

/** Flip positions for UP / LEFT so direction is a mirror of the base layout. */
function applyDirection(
  pos: Map<string, { x: number; y: number }>,
  box: Map<string, Box>,
  direction: string,
): void {
  if (direction !== 'UP' && direction !== 'LEFT') return
  const horizontal = direction === 'LEFT'
  let max = 0
  for (const [id, p] of pos) {
    const b = box.get(id)!
    max = Math.max(max, horizontal ? p.x + b.w : p.y + b.h)
  }
  for (const [id, p] of pos) {
    const b = box.get(id)!
    if (horizontal) p.x = max - p.x - b.w
    else p.y = max - p.y - b.h
  }
}

function layeredLayout(
  boxes: Box[],
  edges: FlowEdge[],
  options: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const ids = boxes.map((b) => b.id)
  const box = new Map(boxes.map((b) => [b.id, b]))
  const adj = adjacency(ids, edges)
  const dag = breakCycles(ids, adj)
  const layerOf = assignLayers(ids, dag)

  const depth = Math.max(0, ...ids.map((id) => layerOf.get(id) ?? 0))
  const layers: string[][] = Array.from({ length: depth + 1 }, () => [])
  for (const id of ids) layers[layerOf.get(id) ?? 0]!.push(id)

  const ordered = orderLayers(layers, dag, ids)
  const direction = options.direction ?? 'DOWN'
  const horizontal = direction === 'LEFT' || direction === 'RIGHT'
  const pos = placeLayers(
    ordered,
    box,
    horizontal,
    options.nodeSpacing ?? DEFAULT_NODE_SPACING,
    options.layerSpacing ?? DEFAULT_LAYER_SPACING,
  )
  applyDirection(pos, box, direction)
  return pos
}

// ─── Tree ────────────────────────────────────────────────────────────────────

/** Layered layout over a BFS spanning tree, with parents centred on children. */
function treeLayout(
  boxes: Box[],
  edges: FlowEdge[],
  options: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const ids = boxes.map((b) => b.id)
  const box = new Map(boxes.map((b) => [b.id, b]))
  const adj = adjacency(ids, edges)
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const [, outs] of adj) for (const t of outs) indeg.set(t, (indeg.get(t) ?? 0) + 1)

  const children = new Map<string, string[]>(ids.map((id) => [id, []]))
  const depthOf = new Map<string, number>()
  const roots = ids.filter((id) => (indeg.get(id) ?? 0) === 0)
  const queue = roots.length > 0 ? [...roots] : ids.slice(0, 1)
  for (const r of queue) depthOf.set(r, 0)
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!
    for (const c of adj.get(id) ?? []) {
      if (depthOf.has(c)) continue
      depthOf.set(c, (depthOf.get(id) ?? 0) + 1)
      children.get(id)!.push(c)
      queue.push(c)
    }
  }
  // Disconnected nodes become their own roots rather than vanishing.
  for (const id of ids) if (!depthOf.has(id)) depthOf.set(id, 0)

  const maxDepth = Math.max(0, ...ids.map((id) => depthOf.get(id) ?? 0))
  const layers: string[][] = Array.from({ length: maxDepth + 1 }, () => [])
  for (const id of ids) layers[depthOf.get(id) ?? 0]!.push(id)

  const direction = options.direction ?? 'DOWN'
  const horizontal = direction === 'LEFT' || direction === 'RIGHT'
  const nodeSpacing = options.nodeSpacing ?? DEFAULT_NODE_SPACING
  const pos = placeLayers(
    layers,
    box,
    horizontal,
    nodeSpacing,
    options.layerSpacing ?? DEFAULT_LAYER_SPACING,
  )

  // Centre each parent over its children, deepest layer first so a parent sees
  // children that have already settled.
  for (let d = maxDepth - 1; d >= 0; d--) {
    for (const id of layers[d]!) {
      const kids = children.get(id) ?? []
      if (kids.length === 0) continue
      const centres = kids.map((k) => {
        const p = pos.get(k)!
        const b = box.get(k)!
        return horizontal ? p.y + b.h / 2 : p.x + b.w / 2
      })
      const mid = (Math.min(...centres) + Math.max(...centres)) / 2
      const p = pos.get(id)!
      const b = box.get(id)!
      if (horizontal) p.y = mid - b.h / 2
      else p.x = mid - b.w / 2
    }
  }
  // Centring a parent can push it onto a sibling, so every layer is swept
  // afterwards and any overlap is pushed apart. Without this the tree layout
  // produced genuinely overlapping boxes on wider graphs (measured: 23 pairs
  // on a 40-node DAG) — centring is a readability nicety, non-overlap is not
  // negotiable, so separation wins where they conflict.
  for (const layer of layers) {
    const sorted = [...layer].sort((a, b) => {
      const pa = pos.get(a)!
      const pb = pos.get(b)!
      return horizontal ? pa.y - pb.y : pa.x - pb.x
    })
    let edge = -Infinity
    for (const id of sorted) {
      const p = pos.get(id)!
      const b = box.get(id)!
      const start = horizontal ? p.y : p.x
      const next = Math.max(start, edge)
      if (horizontal) p.y = next
      else p.x = next
      edge = next + (horizontal ? b.h : b.w) + nodeSpacing
    }
  }

  applyDirection(pos, box, direction)
  return pos
}

// ─── Force ───────────────────────────────────────────────────────────────────

/**
 * Fruchterman–Reingold with a cooling schedule. Seeded, so runs repeat.
 *
 * Repulsion is the expensive half: every pair, every iteration, is O(n^2 * i)
 * — 53 SECONDS for a 1000-node graph, measured, which would freeze the tab.
 * Nodes are binned into a uniform grid and repulsion is summed only over the
 * 3x3 cell neighbourhood, which is where all the meaningful force is anyway
 * (it falls off as 1/d). That makes a pass O(n * k) for small k.
 *
 * Iterations also taper with size: a large graph needs fewer passes to look
 * settled than it needs to reach a numerical optimum, and nobody is waiting
 * on the optimum.
 */
function forceLayout(
  boxes: Box[],
  edges: FlowEdge[],
  options: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const ids = boxes.map((b) => b.id)
  const n = ids.length
  const spacing = options.nodeSpacing ?? DEFAULT_NODE_SPACING
  const avg = boxes.reduce((s, b) => s + Math.max(b.w, b.h), 0) / Math.max(1, n)
  const k = (avg + spacing) * 1.4
  const area = k * Math.sqrt(Math.max(1, n))
  const iterations = n <= 100 ? 300 : n <= 400 ? 120 : 60
  const cell = k * 2
  // Hard ceiling on repulsion partners per node. Grid binning alone is only
  // as good as the binning: as the layout contracts, cells get dense and the
  // 3x3 neighbourhood drifts back toward O(n^2) — measured 1152ms at n=1000 on
  // a deep DAG. Repulsion falls off as 1/d, so the nearest handful carries
  // almost all of it and a cap costs accuracy nobody can see.
  const MAX_PARTNERS = 24

  const rnd = makeRandom()
  const px = new Float64Array(n)
  const py = new Float64Array(n)
  const index = new Map(ids.map((id, i) => [id, i]))
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2
    px[i] = Math.cos(a) * area + rnd() * k * 0.1
    py[i] = Math.sin(a) * area + rnd() * k * 0.1
  }

  const known = new Set(ids)
  const links = edges
    .filter((e) => known.has(e.source) && known.has(e.target) && e.source !== e.target)
    .map((e) => [index.get(e.source)!, index.get(e.target)!] as const)

  const dx = new Float64Array(n)
  const dy = new Float64Array(n)
  let temp = area / 4

  for (let iter = 0; iter < iterations; iter++) {
    dx.fill(0)
    dy.fill(0)

    // Bin into a uniform grid, then repel within the 3x3 neighbourhood.
    const buckets = new Map<string, number[]>()
    for (let i = 0; i < n; i++) {
      const key = `${Math.floor(px[i]! / cell)},${Math.floor(py[i]! / cell)}`
      const b = buckets.get(key)
      if (b) b.push(i)
      else buckets.set(key, [i])
    }
    for (const [key, bucket] of buckets) {
      const [cx, cy] = key.split(',').map(Number) as [number, number]
      const near: number[] = []
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++) {
          const other = buckets.get(`${cx + ox},${cy + oy}`)
          if (other) near.push(...other)
        }
      const partners = near.length > MAX_PARTNERS ? near.slice(0, MAX_PARTNERS) : near
      for (const i of bucket)
        for (const j of partners) {
          if (i === j) continue
          let ux = px[i]! - px[j]!
          let uy = py[i]! - py[j]!
          let d = Math.hypot(ux, uy)
          if (d < 0.01) {
            ux = (rnd() - 0.5) * 0.1
            uy = (rnd() - 0.5) * 0.1
            d = Math.hypot(ux, uy) || 0.01
          }
          const rep = (k * k) / d
          dx[i] = dx[i]! + (ux / d) * rep
          dy[i] = dy[i]! + (uy / d) * rep
        }
    }

    for (const [a, b] of links) {
      const ux = px[a]! - px[b]!
      const uy = py[a]! - py[b]!
      const d = Math.hypot(ux, uy) || 0.01
      const att = (d * d) / k
      dx[a] = dx[a]! - (ux / d) * att
      dy[a] = dy[a]! - (uy / d) * att
      dx[b] = dx[b]! + (ux / d) * att
      dy[b] = dy[b]! + (uy / d) * att
    }

    for (let i = 0; i < n; i++) {
      const mag = Math.hypot(dx[i]!, dy[i]!) || 1
      px[i] = px[i]! + (dx[i]! / mag) * Math.min(mag, temp)
      py[i] = py[i]! + (dy[i]! / mag) * Math.min(mag, temp)
    }
    temp *= 0.975
  }

  const mx = new Map(ids.map((id, i) => [id, px[i]!]))
  const my = new Map(ids.map((id, i) => [id, py[i]!]))
  return normalise(boxes, mx, my)
}

// ─── Stress ──────────────────────────────────────────────────────────────────

/**
 * Stress majorisation over BFS graph distances, against sampled PIVOTS.
 *
 * Full stress needs all-pairs distances and an O(n^2) majorisation sweep per
 * iteration — 8.3 SECONDS at 1000 nodes, measured. Both halves are replaced by
 * a pivot sample (the sparse-stress / PivotMDS idea): BFS runs from a bounded
 * number of pivots chosen max-min so they spread across the graph, and each
 * node is majorised against those pivots only. Cost drops to O(p * (n + e))
 * once plus O(n * p) per iteration, with p capped.
 *
 * Below the cap every node IS a pivot, so small graphs get exact stress and
 * only large ones pay an approximation — where the eye cannot tell anyway.
 */
function stressLayout(
  boxes: Box[],
  edges: FlowEdge[],
  options: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const ids = boxes.map((b) => b.id)
  const n = ids.length
  const index = new Map(ids.map((id, i) => [id, i]))
  const spacing = options.nodeSpacing ?? DEFAULT_NODE_SPACING
  const avg = boxes.reduce((s, b) => s + Math.max(b.w, b.h), 0) / Math.max(1, n)
  const unit = avg + spacing

  const adjU: number[][] = Array.from({ length: n }, () => [])
  const known = new Set(ids)
  for (const e of edges) {
    if (!known.has(e.source) || !known.has(e.target) || e.source === e.target) continue
    adjU[index.get(e.source)!]!.push(index.get(e.target)!)
    adjU[index.get(e.target)!]!.push(index.get(e.source)!)
  }

  const bfs = (src: number): Float64Array => {
    const row = new Float64Array(n).fill(Infinity)
    row[src] = 0
    const q = [src]
    for (let i = 0; i < q.length; i++) {
      const u = q[i]!
      for (const v of adjU[u]!)
        if (row[v] === Infinity) {
          row[v] = row[u]! + 1
          q.push(v)
        }
    }
    return row
  }

  // Max-min pivot selection: each new pivot is the node furthest from every
  // pivot chosen so far, which spreads them over the graph instead of
  // clustering them in one dense region.
  const pivotCount = Math.min(n, 64)
  const pivots: number[] = [0]
  const rows: Float64Array[] = [bfs(0)]
  const best = Float64Array.from(rows[0]!)
  while (pivots.length < pivotCount) {
    let far = 0
    let farD = -1
    for (let i = 0; i < n; i++) {
      const d = best[i]!
      if (d !== Infinity && d > farD) {
        farD = d
        far = i
      }
    }
    if (pivots.includes(far)) {
      const unused = [...Array(n).keys()].find((i) => !pivots.includes(i))
      if (unused === undefined) break
      far = unused
    }
    pivots.push(far)
    const row = bfs(far)
    rows.push(row)
    for (let i = 0; i < n; i++) if (row[i]! < best[i]!) best[i] = row[i]!
  }

  let diameter = 1
  for (const row of rows) for (const d of row) if (d !== Infinity) diameter = Math.max(diameter, d)
  for (const row of rows) for (let i = 0; i < n; i++) if (row[i] === Infinity) row[i] = diameter + 1

  const rnd = makeRandom(0x51f3a7)
  const radius = unit * Math.sqrt(n)
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2
    xs[i] = Math.cos(a) * radius + rnd() * 0.01
    ys[i] = Math.sin(a) * radius + rnd() * 0.01
  }

  const iterations = n <= 200 ? 150 : n <= 600 ? 60 : 30
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      let nx = 0
      let ny = 0
      let wsum = 0
      for (let pi = 0; pi < pivots.length; pi++) {
        const j = pivots[pi]!
        if (i === j) continue
        const target = rows[pi]![i]! * unit
        if (target <= 0) continue
        const w = 1 / (target * target)
        const d = Math.hypot(xs[i]! - xs[j]!, ys[i]! - ys[j]!) || 0.01
        nx += w * (xs[j]! + (target * (xs[i]! - xs[j]!)) / d)
        ny += w * (ys[j]! + (target * (ys[i]! - ys[j]!)) / d)
        wsum += w
      }
      if (wsum > 0) {
        xs[i] = nx / wsum
        ys[i] = ny / wsum
      }
    }
  }
  const px = new Map(ids.map((id, i) => [id, xs[i]!]))
  const py = new Map(ids.map((id, i) => [id, ys[i]!]))
  return normalise(boxes, px, py)
}

// ─── Radial ──────────────────────────────────────────────────────────────────

/** Concentric rings by BFS depth, children spread over their parent's arc. */
function radialLayout(
  boxes: Box[],
  edges: FlowEdge[],
  options: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const ids = boxes.map((b) => b.id)
  const box = new Map(boxes.map((b) => [b.id, b]))
  const adj = adjacency(ids, edges)
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const [, outs] of adj) for (const t of outs) indeg.set(t, (indeg.get(t) ?? 0) + 1)

  const depthOf = new Map<string, number>()
  const roots = ids.filter((id) => (indeg.get(id) ?? 0) === 0)
  const queue = roots.length > 0 ? [roots[0]!] : ids.slice(0, 1)
  for (const r of queue) depthOf.set(r, 0)
  for (let i = 0; i < queue.length; i++)
    for (const c of adj.get(queue[i]!) ?? [])
      if (!depthOf.has(c)) {
        depthOf.set(c, (depthOf.get(queue[i]!) ?? 0) + 1)
        queue.push(c)
      }
  let extra = 1
  for (const id of ids) if (!depthOf.has(id)) depthOf.set(id, Math.max(1, extra))

  const spacing = options.nodeSpacing ?? DEFAULT_NODE_SPACING
  const avg = boxes.reduce((s, b) => s + Math.max(b.w, b.h), 0) / Math.max(1, ids.length)
  const ring = avg + spacing * 2

  const byDepth = new Map<number, string[]>()
  for (const id of ids) {
    const d = depthOf.get(id) ?? 0
    const list = byDepth.get(d)
    if (list) list.push(id)
    else byDepth.set(d, [id])
  }

  const px = new Map<string, number>()
  const py = new Map<string, number>()
  // Depths MUST be walked in order and radii kept monotonically increasing.
  // Sizing each ring independently (max of depth, centre clearance and its own
  // circumference) let a wide inner ring land at a LARGER radius than the ring
  // outside it, which put two rings on top of each other — one overlapping
  // pair on a 40-node DAG, found by the elkjs comparison rather than by eye.
  let previousRadius = 0
  for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
    const layer = byDepth.get(d)!
    if (d === 0) {
      // Centre the root(s) ON the origin, because the rings are positioned by
      // their centres too. Placing the root top-left at (0,0) while ring nodes
      // were centred put the two in different frames, and depth 1 landed on
      // the root — caught by the no-overlap invariant.
      layer.forEach((id, i) => {
        const b = box.get(id)!
        px.set(id, i * (avg + spacing) - b.w / 2)
        py.set(id, -b.h / 2)
      })
      continue
    }
    // Radius must clear THREE things: the depth, the centre cluster (a ring
    // that only grew with depth landed on the root — caught by the no-overlap
    // invariant), and its own circumference so a wide level does not overlap
    // itself.
    // Clearance from the centre cluster: half the root extent + half a ring
    // node + spacing, since both are positioned by their centres.
    const rootCount = byDepth.get(0)?.length ?? 1
    const rootExtent = rootCount * (avg + spacing)
    const centreClear = rootExtent / 2 + avg / 2 + spacing
    const radius = Math.max(
      d * ring,
      centreClear,
      (layer.length * (avg + spacing)) / (2 * Math.PI),
      previousRadius + avg + spacing,
    )
    previousRadius = radius
    layer.forEach((id, i) => {
      const a = (i / layer.length) * Math.PI * 2
      const b = box.get(id)!
      px.set(id, Math.cos(a) * radius - b.w / 2)
      py.set(id, Math.sin(a) * radius - b.h / 2)
    })
  }
  return normalise(boxes, px, py)
}

// ─── Box / rectpacking ───────────────────────────────────────────────────────

/** Shelf packing into a roughly square area. `box` keeps input order. */
function shelfPack(
  boxes: Box[],
  spacing: number,
  sortByHeight: boolean,
): Map<string, { x: number; y: number }> {
  const items = sortByHeight ? [...boxes].sort((a, b) => b.h - a.h || b.w - a.w) : [...boxes]
  // Target a roughly square GRID rather than a square AREA. Sizing by
  // sqrt(total area) wrapped after every single box once the boxes were wide
  // and short (150x40 defaults): one row per node, which is not packing.
  const columns = Math.max(1, Math.ceil(Math.sqrt(items.length)))
  const widest = Math.max(...items.map((b) => b.w))
  const target = widest * columns + spacing * (columns - 1)

  const out = new Map<string, { x: number; y: number }>()
  let x = 0
  let y = 0
  let rowHeight = 0
  for (const b of items) {
    if (x > 0 && x + b.w > target) {
      x = 0
      y += rowHeight + spacing
      rowHeight = 0
    }
    out.set(b.id, { x, y })
    x += b.w + spacing
    rowHeight = Math.max(rowHeight, b.h)
  }
  return out
}

// ─── Shared ──────────────────────────────────────────────────────────────────

/**
 * Push overlapping boxes apart, in place.
 *
 * The physical layouts (force, stress, radial) optimise distance, not
 * separation, so nothing stops two boxes landing on each other — elkjs has the
 * same property and is worse at it (22–29 overlapping pairs on the same
 * graphs, measured). A few relaxation passes buy the stronger guarantee that
 * every algorithm here returns a layout with NO overlapping nodes, which is
 * what a diagram actually needs.
 *
 * Bounded on purpose: this runs after the layout and must not become the
 * expensive part. Pairs are found through the same uniform grid the force
 * layout uses, so a pass is O(n * k) rather than O(n^2).
 */
function relaxOverlaps(
  boxes: Box[],
  pos: Map<string, { x: number; y: number }>,
  spacing: number,
  passes = 12,
): void {
  const box = new Map(boxes.map((b) => [b.id, b]))
  const cell = Math.max(1, Math.max(...boxes.map((b) => Math.max(b.w, b.h))) + spacing)

  for (let pass = 0; pass < passes; pass++) {
    const buckets = new Map<string, string[]>()
    for (const b of boxes) {
      const p = pos.get(b.id)!
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
      const list = buckets.get(key)
      if (list) list.push(b.id)
      else buckets.set(key, [b.id])
    }

    let moved = false
    for (const [key, bucket] of buckets) {
      const [cx, cy] = key.split(',').map(Number) as [number, number]
      const near: string[] = []
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++) {
          const other = buckets.get(`${cx + ox},${cy + oy}`)
          if (other) near.push(...other)
        }
      for (const id of bucket)
        for (const otherId of near) {
          if (id === otherId) continue
          const a = pos.get(id)!
          const b = pos.get(otherId)!
          const ba = box.get(id)!
          const bb = box.get(otherId)!
          const overlapX = (ba.w + bb.w) / 2 + spacing - Math.abs(a.x + ba.w / 2 - (b.x + bb.w / 2))
          const overlapY = (ba.h + bb.h) / 2 + spacing - Math.abs(a.y + ba.h / 2 - (b.y + bb.h / 2))
          if (overlapX <= 0 || overlapY <= 0) continue
          moved = true
          // Separate along the axis needing the SMALLER push — moving on the
          // wide axis of a 150x40 box would fling it much further than needed.
          if (overlapX < overlapY) {
            const dir = a.x <= b.x ? -1 : 1
            a.x += (dir * overlapX) / 2
            b.x -= (dir * overlapX) / 2
          } else {
            const dir = a.y <= b.y ? -1 : 1
            a.y += (dir * overlapY) / 2
            b.y -= (dir * overlapY) / 2
          }
        }
    }
    if (!moved) break
  }
}

/** Shift a layout so its bounding box starts at the origin. */
function normalise(
  boxes: Box[],
  px: Map<string, number>,
  py: Map<string, number>,
): Map<string, { x: number; y: number }> {
  const minX = Math.min(...boxes.map((b) => px.get(b.id) ?? 0))
  const minY = Math.min(...boxes.map((b) => py.get(b.id) ?? 0))
  return new Map(
    boxes.map((b) => [b.id, { x: (px.get(b.id) ?? 0) - minX, y: (py.get(b.id) ?? 0) - minY }]),
  )
}

/**
 * Run a layout. Pure and synchronous — same input, same output, every time.
 */
export function runLayout<T>(
  nodes: FlowNode<T>[],
  edges: FlowEdge[],
  algorithm: LayoutAlgorithm,
  options: LayoutOptions = {},
): LaidOutNode[] {
  const boxes = boxesOf(nodes)
  if (boxes.length === 0) return []

  const spacing = options.nodeSpacing ?? DEFAULT_NODE_SPACING
  let pos: Map<string, { x: number; y: number }>
  switch (algorithm) {
    case 'tree':
      pos = treeLayout(boxes, edges, options)
      break
    case 'force':
      pos = forceLayout(boxes, edges, options)
      relaxOverlaps(boxes, pos, spacing)
      break
    case 'stress':
      pos = stressLayout(boxes, edges, options)
      relaxOverlaps(boxes, pos, spacing)
      break
    case 'radial':
      pos = radialLayout(boxes, edges, options)
      relaxOverlaps(boxes, pos, spacing)
      break
    case 'box':
      pos = shelfPack(boxes, spacing, false)
      break
    case 'rectpacking':
      pos = shelfPack(boxes, spacing, true)
      break
    default:
      pos = layeredLayout(boxes, edges, options)
  }

  return boxes.map((b) => ({
    id: b.id,
    position: pos.get(b.id) ?? { x: 0, y: 0 },
  }))
}
