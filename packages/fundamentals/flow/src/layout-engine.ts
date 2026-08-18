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

  const crossings = (upper: string[], lower: string[]): number => {
    const pos = positionIn(lower)
    const pairs: number[] = []
    for (const u of upper)
      for (const v of adj.get(u) ?? []) {
        const p = pos.get(v)
        if (p !== undefined) pairs.push(p)
      }
    let c = 0
    for (let i = 0; i < pairs.length; i++)
      for (let j = i + 1; j < pairs.length; j++) if (pairs[i]! > pairs[j]!) c++
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
      const other = downward ? result[li - 1]! : result[li + 1]!
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i + 1 < layer.length; i++) {
          const before = downward ? crossings(other, layer) : crossings(layer, other)
          ;[layer[i], layer[i + 1]] = [layer[i + 1]!, layer[i]!]
          const after = downward ? crossings(other, layer) : crossings(layer, other)
          if (after >= before) [layer[i], layer[i + 1]] = [layer[i + 1]!, layer[i]!]
        }
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

/** Fruchterman–Reingold with a cooling schedule. Seeded, so runs repeat. */
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

  const rnd = makeRandom()
  const px = new Map<string, number>()
  const py = new Map<string, number>()
  ids.forEach((id, i) => {
    // Seed on a circle rather than uniformly at random: a ring converges to a
    // readable layout in far fewer iterations than a random cloud.
    const a = (i / Math.max(1, n)) * Math.PI * 2
    px.set(id, Math.cos(a) * area + rnd() * k * 0.1)
    py.set(id, Math.sin(a) * area + rnd() * k * 0.1)
  })

  const known = new Set(ids)
  const links = edges.filter((e) => known.has(e.source) && known.has(e.target))
  let temp = area / 4

  for (let iter = 0; iter < 300; iter++) {
    const dx = new Map<string, number>(ids.map((id) => [id, 0]))
    const dy = new Map<string, number>(ids.map((id) => [id, 0]))

    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = ids[i]!
        const b = ids[j]!
        let ux = px.get(a)! - px.get(b)!
        let uy = py.get(a)! - py.get(b)!
        let d = Math.hypot(ux, uy)
        if (d < 0.01) {
          ux = (rnd() - 0.5) * 0.1
          uy = (rnd() - 0.5) * 0.1
          d = Math.hypot(ux, uy) || 0.01
        }
        const rep = (k * k) / d
        dx.set(a, dx.get(a)! + (ux / d) * rep)
        dy.set(a, dy.get(a)! + (uy / d) * rep)
        dx.set(b, dx.get(b)! - (ux / d) * rep)
        dy.set(b, dy.get(b)! - (uy / d) * rep)
      }

    for (const e of links) {
      const ux = px.get(e.source)! - px.get(e.target)!
      const uy = py.get(e.source)! - py.get(e.target)!
      const d = Math.hypot(ux, uy) || 0.01
      const att = (d * d) / k
      dx.set(e.source, dx.get(e.source)! - (ux / d) * att)
      dy.set(e.source, dy.get(e.source)! - (uy / d) * att)
      dx.set(e.target, dx.get(e.target)! + (ux / d) * att)
      dy.set(e.target, dy.get(e.target)! + (uy / d) * att)
    }

    for (const id of ids) {
      const mag = Math.hypot(dx.get(id)!, dy.get(id)!) || 1
      px.set(id, px.get(id)! + (dx.get(id)! / mag) * Math.min(mag, temp))
      py.set(id, py.get(id)! + (dy.get(id)! / mag) * Math.min(mag, temp))
    }
    temp *= 0.975
  }
  return normalise(boxes, px, py)
}

// ─── Stress ──────────────────────────────────────────────────────────────────

/** Stress majorisation over BFS graph distances. */
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

  const undirected: number[][] = Array.from({ length: n }, () => [])
  const known = new Set(ids)
  for (const e of edges) {
    if (!known.has(e.source) || !known.has(e.target) || e.source === e.target) continue
    undirected[index.get(e.source)!]!.push(index.get(e.target)!)
    undirected[index.get(e.target)!]!.push(index.get(e.source)!)
  }

  // All-pairs BFS. Disconnected pairs get a distance one step beyond the
  // graph's diameter so components separate instead of stacking.
  const dist: number[][] = []
  for (let s = 0; s < n; s++) {
    const row = new Array<number>(n).fill(Infinity)
    row[s] = 0
    const q = [s]
    for (let i = 0; i < q.length; i++) {
      const u = q[i]!
      for (const v of undirected[u]!)
        if (row[v] === Infinity) {
          row[v] = row[u]! + 1
          q.push(v)
        }
    }
    dist.push(row)
  }
  let diameter = 1
  for (const row of dist) for (const d of row) if (d !== Infinity) diameter = Math.max(diameter, d)
  for (const row of dist) for (let i = 0; i < n; i++) if (row[i] === Infinity) row[i] = diameter + 1

  // Seed on a circle. A tiny deterministic jitter breaks the perfect symmetry
  // that would otherwise leave majorisation with zero gradient on a regular
  // graph (every node equidistant, nothing moves).
  const rnd = makeRandom(0x51f3a7)
  const radius = unit * Math.sqrt(n)
  const xs = ids.map((_, i) => Math.cos((i / Math.max(1, n)) * Math.PI * 2) * radius + rnd() * 0.01)
  const ys = ids.map((_, i) => Math.sin((i / Math.max(1, n)) * Math.PI * 2) * radius + rnd() * 0.01)

  for (let iter = 0; iter < 150; iter++) {
    for (let i = 0; i < n; i++) {
      let nx = 0
      let ny = 0
      let wsum = 0
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const target = dist[i]![j]! * unit
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
  for (const [d, layer] of byDepth) {
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
    )
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
      break
    case 'stress':
      pos = stressLayout(boxes, edges, options)
      break
    case 'radial':
      pos = radialLayout(boxes, edges, options)
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
