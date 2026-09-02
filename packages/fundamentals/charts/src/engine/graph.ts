// Graph geometry — node/link networks laid out by force, on a circle, or from
// given coordinates. Deterministic: the force layout runs its own PRNG so a
// render is reproducible (and testable) run to run. Written in the native
// subset and BUNDLED into the generated Swift/Kotlin engine: the PRNG is a
// Park–Miller LCG in exact Double arithmetic (no bit ops), positions and
// displacements are parallel arrays (no struct-field mutation through an
// element), the hit test answers an INDEX (the nullable node lives in
// graph-hit.ts) and the svg half in family-svg.ts.

import type { Double, DrawCmd, Pt, Rect } from './types'

const GRAPH_TAU = Math.PI * 2.0
const GRAPH_PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed', '#0e7490', '#9333ea']
/** Park–Miller modulus (2^31 − 1); state × 16807 stays exact in a Double. */
const GRAPH_LCG_M = 2147483647.0

export interface GraphNode {
  id: string
  name?: string | undefined
  value?: Double | undefined
  /** Index into `GraphOptions.categories` (colour group). */
  category?: number | undefined
  color?: string | undefined
  /** Fixed position (data units) for `layout: 'none'`. */
  x?: Double | undefined
  y?: Double | undefined
}

export interface GraphLink {
  source: string
  target: string
  value?: Double | undefined
}

export interface GraphLayoutNode {
  id: string
  name: string
  index: number
  at: Pt
  radius: Double
  color: string
  category: number | undefined
  value: Double | undefined
}

export interface GraphLayoutLink {
  source: number
  target: number
  value: Double | undefined
  /** Position among the kept links (the order `links` was given in, minus dropped ones). */
  index: number
}

export interface GraphLayout {
  /** The layout that ran (`force` when unset). */
  mode: 'force' | 'circular' | 'none'
  nodes: GraphLayoutNode[]
  links: GraphLayoutLink[]
  /** Links whose endpoints are unknown, as `source -> target`. */
  dropped: string[]
}

export interface GraphOptions {
  layout?: 'force' | 'circular' | 'none' | undefined
  categories?: string[] | undefined
  /** Symbol diameter for a node without a value (values scale it up to 2×). */
  symbolSize?: Double | undefined
  iterations?: Double | undefined
  /** Force layout tuning (defaults derive from the box area). */
  repulsion?: Double | undefined
  linkDistance?: Double | undefined
  gravity?: Double | undefined
  seed?: Double | undefined
  showLabels?: boolean | undefined
  labelColor?: string | undefined
  fontSize?: Double | undefined
  linkColor?: string | undefined
  /** Entrance progress 0..1; nodes fly in from the centre. */
  progress?: Double | undefined
}

/** Next LCG state; exact because state < 2^31 and 16807 × 2^31 < 2^53. */
export function graphNextSeed(state: Double): Double {
  const raw = state * 16807.0
  return raw - Math.floor(raw / GRAPH_LCG_M) * GRAPH_LCG_M
}

/** A seed the LCG can run from: floored, wrapped, never 0. */
function graphSeedState(seed: Double): Double {
  const f = Math.floor(seed < 0.0 ? -seed : seed)
  const wrapped = f - Math.floor(f / (GRAPH_LCG_M - 1.0)) * (GRAPH_LCG_M - 1.0)
  return wrapped + 1.0
}

/** Node index by id, or -1. */
function graphIndexOf(nodes: GraphNode[], id: string): number {
  let found = -1
  for (let i = 0; i < nodes.length; i++) if (found < 0 && nodes[i]!.id === id) found = i
  return found
}

/** Symbol radius: base/2 for a valueless node, up to 2× for the largest value. */
function graphRadius(value: Double, hasValue: boolean, maxValue: Double, base: Double): Double {
  if (!hasValue || maxValue <= 0.0) return base / 2.0
  const v = value < 0.0 ? 0.0 : value
  return (base / 2.0) * (0.6 + 1.4 * Math.sqrt(v / maxValue))
}

/** Lay out the network into `box`. */
export function layoutGraph(nodes: GraphNode[], links: GraphLink[], box: Rect, options?: GraphOptions): GraphLayout {
  const mode = options?.layout ?? 'force'
  const base = options?.symbolSize ?? 10.0
  const dropped: string[] = []
  const outLinks: GraphLayoutLink[] = []
  for (const l of links) {
    const s = graphIndexOf(nodes, l.source)
    const t = graphIndexOf(nodes, l.target)
    if (s < 0 || t < 0) {
      dropped.push(`${l.source} -> ${l.target}`)
      continue
    }
    outLinks.push({ source: s, target: t, value: l.value, index: outLinks.length })
  }
  const n = nodes.length
  let nF = 0.0
  for (let i = 0; i < n; i++) nF = nF + 1.0
  let maxValue = 0.0
  for (const nd of nodes) {
    const v = nd.value ?? -1.0
    if (v > maxValue) maxValue = v
  }
  const cx = box.x + box.w / 2.0
  const cy = box.y + box.h / 2.0
  const px: Double[] = []
  const py: Double[] = []
  const radius: Double[] = []
  for (let i = 0; i < n; i++) {
    px.push(cx)
    py.push(cy)
    const v = nodes[i]!.value ?? -1.0
    radius.push(graphRadius(v, v >= 0.0, maxValue, base))
  }
  if (mode === 'circular') {
    const half = (box.w < box.h ? box.w : box.h) / 2.0 - base
    const R = half < 0.0 ? 0.0 : half
    let iF = 0.0
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2.0 + (nF <= 0.0 ? 0.0 : (iF / nF) * GRAPH_TAU)
      px[i] = cx + Math.cos(ang) * R
      py[i] = cy + Math.sin(ang) * R
      iF = iF + 1.0
    }
  } else if (mode === 'none') {
    let minX = 0.0
    let maxX = 0.0
    let minY = 0.0
    let maxY = 0.0
    let seen = false
    for (const nd of nodes) {
      const x = nd.x ?? 0.0
      const y = nd.y ?? 0.0
      if (!seen || x < minX) minX = x
      if (!seen || x > maxX) maxX = x
      if (!seen || y < minY) minY = y
      if (!seen || y > maxY) maxY = y
      seen = true
    }
    const spanX = maxX - minX
    const spanY = maxY - minY
    const pad = base
    for (let i = 0; i < n; i++) {
      const fx = spanX <= 0.0 ? 0.5 : ((nodes[i]!.x ?? 0.0) - minX) / spanX
      const fy = spanY <= 0.0 ? 0.5 : ((nodes[i]!.y ?? 0.0) - minY) / spanY
      px[i] = box.x + pad + (box.w - pad * 2.0) * fx
      py[i] = box.y + pad + (box.h - pad * 2.0) * fy
    }
  } else {
    let seed = graphSeedState(options?.seed ?? 7.0)
    const rawIt = Math.floor(options?.iterations ?? 200.0)
    const iterations = rawIt < 0.0 ? 0.0 : rawIt
    const rawArea = box.w * box.h
    const area = rawArea < 1.0 ? 1.0 : rawArea
    const k = Math.sqrt(area / (nF < 1.0 ? 1.0 : nF))
    const repulsion = options?.repulsion ?? k * k
    const linkDistance = options?.linkDistance ?? k
    const gravity = options?.gravity ?? 0.05
    const spread = (box.w < box.h ? box.w : box.h) / 3.0
    for (let i = 0; i < n; i++) {
      seed = graphNextSeed(seed)
      px[i] = cx + (seed / GRAPH_LCG_M - 0.5) * spread
      seed = graphNextSeed(seed)
      py[i] = cy + (seed / GRAPH_LCG_M - 0.5) * spread
    }
    let temp = (box.w > box.h ? box.w : box.h) / 10.0
    const cool = iterations <= 0.0 ? 0.0 : temp / iterations
    const dx: Double[] = []
    const dy: Double[] = []
    for (let i = 0; i < n; i++) {
      dx.push(0.0)
      dy.push(0.0)
    }
    let it = 0.0
    while (it < iterations) {
      for (let i = 0; i < n; i++) {
        dx[i] = 0.0
        dy[i] = 0.0
      }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let ddx = px[i]! - px[j]!
          let ddy = py[i]! - py[j]!
          let d = Math.sqrt(ddx * ddx + ddy * ddy)
          if (d < 0.01) {
            seed = graphNextSeed(seed)
            ddx = (seed / GRAPH_LCG_M - 0.5) * 0.1
            seed = graphNextSeed(seed)
            ddy = (seed / GRAPH_LCG_M - 0.5) * 0.1
            d = 0.01
          }
          const f = repulsion / (d * d)
          const fx = (ddx / d) * f
          const fy = (ddy / d) * f
          dx[i] = dx[i]! + fx
          dy[i] = dy[i]! + fy
          dx[j] = dx[j]! - fx
          dy[j] = dy[j]! - fy
        }
      }
      for (const l of outLinks) {
        const ddx = px[l.source]! - px[l.target]!
        const ddy = py[l.source]! - py[l.target]!
        const d = Math.sqrt(ddx * ddx + ddy * ddy)
        if (d <= 0.0) continue
        const f = (d * d) / linkDistance
        const fx = (ddx / d) * f
        const fy = (ddy / d) * f
        dx[l.source] = dx[l.source]! - fx
        dy[l.source] = dy[l.source]! - fy
        dx[l.target] = dx[l.target]! + fx
        dy[l.target] = dy[l.target]! + fy
      }
      for (let i = 0; i < n; i++) {
        dx[i] = dx[i]! + (cx - px[i]!) * gravity * k * 0.1
        dy[i] = dy[i]! + (cy - py[i]!) * gravity * k * 0.1
        const d = Math.sqrt(dx[i]! * dx[i]! + dy[i]! * dy[i]!)
        if (d > 0.0) {
          const step = d < temp ? d : temp
          px[i] = px[i]! + (dx[i]! / d) * step
          py[i] = py[i]! + (dy[i]! / d) * step
        }
        const r = radius[i]!
        if (px[i]! < box.x + r) px[i] = box.x + r
        if (px[i]! > box.x + box.w - r) px[i] = box.x + box.w - r
        if (py[i]! < box.y + r) py[i] = box.y + r
        if (py[i]! > box.y + box.h - r) py[i] = box.y + box.h - r
      }
      temp = temp - cool
      if (temp < 0.5) temp = 0.5
      it = it + 1.0
    }
  }
  const outNodes: GraphLayoutNode[] = []
  for (let i = 0; i < n; i++) {
    const nd = nodes[i]!
    const cat = nd.category
    const color = nd.color ?? GRAPH_PALETTE[(cat ?? i) % GRAPH_PALETTE.length]!
    outNodes.push({ id: nd.id, name: nd.name ?? nd.id, index: i, at: { x: px[i]!, y: py[i]! }, radius: radius[i]!, color, category: cat, value: nd.value })
  }
  return { mode, nodes: outNodes, links: outLinks, dropped }
}

/** A node's position at entrance `progress` (flies in from the box centre). */
function graphAt(n: GraphLayoutNode, cx: Double, cy: Double, progress: Double): Pt {
  return { x: cx + (n.at.x - cx) * progress, y: cy + (n.at.y - cy) * progress }
}

/** Render links, then symbols, then labels. */
export function renderGraph(layout: GraphLayout, box: Rect, options?: GraphOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const cx = box.x + box.w / 2.0
  const cy = box.y + box.h / 2.0
  const linkColor = options?.linkColor ?? '#94a3b8'
  const showLabels = options?.showLabels ?? false
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#334155'
  let maxLink = 0.0
  for (const l of layout.links) {
    const v = l.value ?? -1.0
    if (v > maxLink) maxLink = v
  }
  for (const l of layout.links) {
    const v = l.value ?? -1.0
    const width = v < 0.0 || maxLink <= 0.0 ? 1.0 : 1.0 + 3.0 * (v / maxLink)
    out.push({ kind: 'line', from: graphAt(layout.nodes[l.source]!, cx, cy, progress), to: graphAt(layout.nodes[l.target]!, cx, cy, progress), stroke: linkColor, width })
  }
  for (const nd of layout.nodes) {
    out.push({ kind: 'circle', center: graphAt(nd, cx, cy, progress), radius: nd.radius, fill: nd.color })
    if (!showLabels || progress < 1.0) continue
    out.push({ kind: 'text', text: nd.name, at: { x: nd.at.x + nd.radius + 3.0, y: nd.at.y }, fill: labelColor, size: fontSize, align: 'start', baseline: 'middle' })
  }
  return out
}

/** Index of the nearest node whose symbol (plus a small halo) contains the point, or -1. */
export function hitGraphIndex(layout: GraphLayout, px: Double, py: Double): number {
  let best = -1
  let bestD = 0.0
  for (let i = 0; i < layout.nodes.length; i++) {
    const nd = layout.nodes[i]!
    const dx = px - nd.at.x
    const dy = py - nd.at.y
    const d = dx * dx + dy * dy
    const r = nd.radius + 3.0
    if (d <= r * r && (best < 0 || d < bestD)) {
      best = i
      bestD = d
    }
  }
  return best
}
