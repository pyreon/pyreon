// Sankey geometry — flow diagram over a node/link graph.
//
// Columns come from the longest path from a source; node heights from flow
// totals; vertical order from a few relaxation sweeps (weighted-centre
// toward neighbours, then collision resolution). Links are ribbons whose
// width is their value at the same scale as the node bands. Written in the
// native subset and BUNDLED into the generated Swift/Kotlin engine: name
// lookups are scans, the stack/resolve helpers are inlined (a helper cannot
// mutate a caller's array natively), comparator sorts are insertion sorts,
// the hit test answers INDICES (the union lives in sankey-hit.ts) and the
// svg half in family-svg.ts.

import type { Double, DrawCmd, Pt, Rect } from './types'

const SANKEY_PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed', '#0e7490', '#9333ea']

export interface SankeyNode {
  name: string
  color?: string | undefined
}

export interface SankeyLink {
  source: string
  target: string
  value: Double
}

export interface SankeyLayoutNode {
  name: string
  index: number
  depth: number
  value: Double
  rect: Rect
  color: string
}

export interface SankeyLayoutLink {
  source: number
  target: number
  value: Double
  /** Ribbon width at the shared scale. */
  width: Double
  /** Top edge of the ribbon where it leaves the source / enters the target. */
  y0: Double
  y1: Double
}

export interface SankeyLayout {
  nodes: SankeyLayoutNode[]
  links: SankeyLayoutLink[]
  /** Links that were dropped: unknown endpoints, self-loops, or cycle back-edges. */
  dropped: string[]
}

export interface SankeyOptions {
  nodeWidth?: Double | undefined
  nodePadding?: Double | undefined
  /** Relaxation sweeps; 0 keeps input order. */
  iterations?: Double | undefined
  /** Where sink nodes sit: 'justify' pushes them to the last column. */
  align?: 'left' | 'justify' | undefined
  showLabels?: boolean | undefined
  labelColor?: string | undefined
  fontSize?: Double | undefined
  /** Ribbon opacity 0..1. */
  linkOpacity?: Double | undefined
  /** Entrance progress 0..1; ribbons grow from their source. */
  progress?: Double | undefined
}

/** One hex digit's value from its char code (0 for anything else). */
function sankeyHexDigit(c: Double): Double {
  if (c >= 48.0 && c <= 57.0) return c - 48.0
  if (c >= 97.0 && c <= 102.0) return c - 87.0
  if (c >= 65.0 && c <= 70.0) return c - 55.0
  return 0.0
}

/** `#rrggbb` + alpha → `rgba(r, g, b, a)`; a malformed colour passes through. */
export function sankeyRgba(hex: string, alpha: Double): string {
  if (hex.length < 7) return hex
  const r = sankeyHexDigit(hex.charCodeAt(1)) * 16.0 + sankeyHexDigit(hex.charCodeAt(2))
  const g = sankeyHexDigit(hex.charCodeAt(3)) * 16.0 + sankeyHexDigit(hex.charCodeAt(4))
  const b = sankeyHexDigit(hex.charCodeAt(5)) * 16.0 + sankeyHexDigit(hex.charCodeAt(6))
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}

/** Node index by name, or -1. */
function sankeyIndexOf(nodes: SankeyNode[], name: string): number {
  let found = -1
  for (let i = 0; i < nodes.length; i++) if (found < 0 && nodes[i]!.name === name) found = i
  return found
}

/** Lay out the flow graph into `box`. */
export function layoutSankey(nodes: SankeyNode[], links: SankeyLink[], box: Rect, options?: SankeyOptions): SankeyLayout {
  const nodeWidth = options?.nodeWidth ?? 16.0
  const padding = options?.nodePadding ?? 8.0
  const iterations = options?.iterations ?? 6.0
  const align = options?.align ?? 'justify'
  const dropped: string[] = []
  // Keep only well-formed links; a self-loop has no column to flow to.
  const keptS: number[] = []
  const keptT: number[] = []
  const keptV: Double[] = []
  for (const l of links) {
    const s = sankeyIndexOf(nodes, l.source)
    const t = sankeyIndexOf(nodes, l.target)
    if (s < 0 || t < 0 || s === t || !(l.value > 0.0)) {
      dropped.push(`${l.source} -> ${l.target}`)
      continue
    }
    keptS.push(s)
    keptT.push(t)
    keptV.push(l.value)
  }
  const n = nodes.length
  // Depth by longest path; a back-edge that would keep increasing depth past n is a cycle.
  const depth: number[] = []
  for (let i = 0; i < n; i++) depth.push(0)
  const live: boolean[] = []
  for (let k = 0; k < keptS.length; k++) live.push(true)
  let round = 0
  let settled = false
  while (!settled && round <= n) {
    let changed = false
    for (let k = 0; k < keptS.length; k++) {
      if (!live[k]!) continue
      const s = keptS[k]!
      const t = keptT[k]!
      if (depth[t]! < depth[s]! + 1) {
        if (round === n) {
          live[k] = false
          dropped.push(`${nodes[s]!.name} -> ${nodes[t]!.name} (cycle)`)
        } else {
          depth[t] = depth[s]! + 1
          changed = true
        }
      }
    }
    if (!changed) settled = true
    round = round + 1
  }
  // The surviving flows, compacted.
  const flowS: number[] = []
  const flowT: number[] = []
  const flowV: Double[] = []
  for (let k = 0; k < keptS.length; k++) {
    if (!live[k]!) continue
    flowS.push(keptS[k]!)
    flowT.push(keptT[k]!)
    flowV.push(keptV[k]!)
  }
  let maxDepth = 0
  for (let i = 0; i < n; i++) if (depth[i]! > maxDepth) maxDepth = depth[i]!
  if (align === 'justify') {
    const hasOut: boolean[] = []
    for (let i = 0; i < n; i++) hasOut.push(false)
    for (const s of flowS) hasOut[s] = true
    for (let i = 0; i < n; i++) if (!hasOut[i]!) depth[i] = maxDepth
  }
  // Node value = max(in, out) so a node's band holds whichever side is larger.
  const inSum: Double[] = []
  const outSum: Double[] = []
  for (let i = 0; i < n; i++) {
    inSum.push(0.0)
    outSum.push(0.0)
  }
  for (let k = 0; k < flowS.length; k++) {
    outSum[flowS[k]!] = outSum[flowS[k]!]! + flowV[k]!
    inSum[flowT[k]!] = inSum[flowT[k]!]! + flowV[k]!
  }
  const value: Double[] = []
  for (let i = 0; i < n; i++) value.push(inSum[i]! > outSum[i]! ? inSum[i]! : outSum[i]!)
  // Scale: the tallest column fills the box height. Column membership is a
  // per-node depth scan (the column lists are rebuilt where needed).
  let ky = 0.0
  let kySeen = false
  for (let d = 0; d <= maxDepth; d++) {
    let total = 0.0
    let members = 0.0
    for (let i = 0; i < n; i++) {
      if (depth[i]! !== d) continue
      total = total + value[i]!
      members = members + 1.0
    }
    const avail = box.h - padding * (members > 1.0 ? members - 1.0 : 0.0)
    if (total > 0.0 && avail > 0.0) {
      const cand = avail / total
      if (!kySeen || cand < ky) ky = cand
      kySeen = true
    }
  }
  // maxDepthF mirrors the column count as a Double for the x placement.
  let maxDepthF = 0.0
  for (let d = 0; d < maxDepth; d++) maxDepthF = maxDepthF + 1.0
  const y0: Double[] = []
  const hgt: Double[] = []
  for (let i = 0; i < n; i++) {
    y0.push(0.0)
    hgt.push(value[i]! * ky)
  }
  // Initial stacking per column, in node order.
  for (let d = 0; d <= maxDepth; d++) {
    let y = box.y
    for (let i = 0; i < n; i++) {
      if (depth[i]! !== d) continue
      y0[i] = y
      y = y + hgt[i]! + padding
    }
  }
  // Relaxation: pull each node toward the weighted centre of its neighbours,
  // then resolve collisions within the column (sorted by centre, pushed down,
  // then pushed back up from the bottom).
  let itF = 0.0
  for (let it = 0; it < iterations; it++) {
    const alpha = 0.99 - itF * (0.99 / (iterations > 1.0 ? iterations : 1.0))
    // Two passes per sweep: forward (targets toward sources) then backward.
    for (let pass = 0; pass < 2; pass++) {
      const forward = pass === 0
      let dStart = forward ? 1 : maxDepth - 1
      const dEnd = forward ? maxDepth : 0
      const dStep = forward ? 1 : -1
      let d = dStart
      let more = forward ? d <= dEnd : d >= dEnd
      while (more) {
        for (let i = 0; i < n; i++) {
          if (depth[i]! !== d) continue
          let w = 0.0
          let acc = 0.0
          for (let k = 0; k < flowS.length; k++) {
            const other = forward ? flowS[k]! : flowT[k]!
            const mine = forward ? flowT[k]! : flowS[k]!
            if (mine !== i) continue
            acc = acc + (y0[other]! + hgt[other]! / 2.0) * flowV[k]!
            w = w + flowV[k]!
          }
          if (w > 0.0) y0[i] = y0[i]! + (acc / w - (y0[i]! + hgt[i]! / 2.0)) * alpha
        }
        // Resolve the column: members sorted by centre (insertion sort on indices).
        const col: number[] = []
        for (let i = 0; i < n; i++) if (depth[i]! === d) col.push(i)
        for (let a = 1; a < col.length; a++) {
          const cur = col[a]!
          const cc = y0[cur]! + hgt[cur]! / 2.0
          let b = a - 1
          while (b >= 0) {
            const prev = col[b]!
            if (y0[prev]! + hgt[prev]! / 2.0 <= cc) break
            col[b + 1] = prev
            b = b - 1
          }
          col[b + 1] = cur
        }
        let y = box.y
        for (const i of col) {
          if (y0[i]! < y) y0[i] = y
          y = y0[i]! + hgt[i]! + padding
        }
        let bottom = box.y + box.h
        for (let k = col.length - 1; k >= 0; k--) {
          const i = col[k]!
          if (y0[i]! + hgt[i]! > bottom) y0[i] = bottom - hgt[i]!
          bottom = y0[i]! - padding
        }
        d = d + dStep
        more = forward ? d <= dEnd : d >= dEnd
      }
      dStart = d
    }
    itF = itF + 1.0
  }
  const outNodes: SankeyLayoutNode[] = []
  for (let i = 0; i < n; i++) {
    let depthF = 0.0
    for (let d = 0; d < depth[i]!; d++) depthF = depthF + 1.0
    const x = maxDepthF <= 0.0 ? box.x : box.x + ((box.w - nodeWidth) * depthF) / maxDepthF
    outNodes.push({
      name: nodes[i]!.name,
      index: i,
      depth: depth[i]!,
      value: value[i]!,
      rect: { x, y: y0[i]!, w: nodeWidth, h: hgt[i]! },
      color: nodes[i]!.color ?? SANKEY_PALETTE[i % SANKEY_PALETTE.length]!,
    })
  }
  // Ribbon offsets: outgoing sorted by target centre, incoming by source centre,
  // so ribbons leave and arrive without crossing each other at the node.
  const outCursor: Double[] = []
  const inCursor: Double[] = []
  for (let i = 0; i < n; i++) {
    outCursor.push(y0[i]!)
    inCursor.push(y0[i]!)
  }
  const linkY0: Double[] = []
  const linkY1: Double[] = []
  for (let k = 0; k < flowS.length; k++) {
    linkY0.push(0.0)
    linkY1.push(0.0)
  }
  // Order by target centre (ties by source index) — insertion sort.
  const orderOut: number[] = []
  for (let k = 0; k < flowS.length; k++) orderOut.push(k)
  for (let a = 1; a < orderOut.length; a++) {
    const cur = orderOut[a]!
    const ct = y0[flowT[cur]!]! + hgt[flowT[cur]!]! / 2.0
    let b = a - 1
    while (b >= 0) {
      const prev = orderOut[b]!
      const pt = y0[flowT[prev]!]! + hgt[flowT[prev]!]! / 2.0
      if (pt < ct || (pt === ct && flowS[prev]! <= flowS[cur]!)) break
      orderOut[b + 1] = prev
      b = b - 1
    }
    orderOut[b + 1] = cur
  }
  for (const k of orderOut) {
    linkY0[k] = outCursor[flowS[k]!]!
    outCursor[flowS[k]!] = outCursor[flowS[k]!]! + flowV[k]! * ky
  }
  // Order by source centre (ties by target index).
  const orderIn: number[] = []
  for (let k = 0; k < flowS.length; k++) orderIn.push(k)
  for (let a = 1; a < orderIn.length; a++) {
    const cur = orderIn[a]!
    const cs = y0[flowS[cur]!]! + hgt[flowS[cur]!]! / 2.0
    let b = a - 1
    while (b >= 0) {
      const prev = orderIn[b]!
      const ps = y0[flowS[prev]!]! + hgt[flowS[prev]!]! / 2.0
      if (ps < cs || (ps === cs && flowT[prev]! <= flowT[cur]!)) break
      orderIn[b + 1] = prev
      b = b - 1
    }
    orderIn[b + 1] = cur
  }
  for (const k of orderIn) {
    linkY1[k] = inCursor[flowT[k]!]!
    inCursor[flowT[k]!] = inCursor[flowT[k]!]! + flowV[k]! * ky
  }
  const outLinks: SankeyLayoutLink[] = []
  for (let k = 0; k < flowS.length; k++) outLinks.push({ source: flowS[k]!, target: flowT[k]!, value: flowV[k]!, width: flowV[k]! * ky, y0: linkY0[k]!, y1: linkY1[k]! })
  return { nodes: outNodes, links: outLinks, dropped }
}

/** Points of a ribbon: the top S-curve out, the bottom S-curve back. */
export function ribbonPoints(layout: SankeyLayout, link: SankeyLayoutLink, progress?: Double): Pt[] {
  const s = layout.nodes[link.source]!.rect
  const t = layout.nodes[link.target]!.rect
  const x0 = s.x + s.w
  const x1raw = t.x
  const rawP = progress ?? 1.0
  const p = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const x1 = x0 + (x1raw - x0) * p
  const top: Pt[] = []
  const bottom: Pt[] = []
  let iF = 0.0
  for (let i = 0; i <= 16; i++) {
    const u = iF / 16.0
    const e = u * u * (3.0 - 2.0 * u)
    const x = x0 + (x1 - x0) * u
    top.push({ x, y: link.y0 + (link.y1 - link.y0) * e })
    bottom.push({ x, y: link.y0 + link.width + (link.y1 + link.width - (link.y0 + link.width)) * e })
    iF = iF + 1.0
  }
  const out: Pt[] = []
  for (const p2 of top) out.push(p2)
  let bi = bottom.length - 1
  while (bi >= 0) {
    out.push(bottom[bi]!)
    bi = bi - 1
  }
  return out
}

/** Render ribbons then node bands then labels. */
export function renderSankey(layout: SankeyLayout, options?: SankeyOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const opacity = options?.linkOpacity ?? 0.35
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const showLabels = options?.showLabels ?? true
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#334155'
  let maxDepth = 0
  for (const nd of layout.nodes) if (nd.depth > maxDepth) maxDepth = nd.depth
  for (const l of layout.links) {
    if (l.width <= 0.0) continue
    out.push({ kind: 'polygon', points: ribbonPoints(layout, l, progress), fill: sankeyRgba(layout.nodes[l.source]!.color, opacity) })
  }
  for (const nd of layout.nodes) {
    if (nd.rect.h <= 0.0) continue
    out.push({ kind: 'rect', rect: nd.rect, fill: nd.color })
    if (!showLabels || progress < 1.0) continue
    const last = nd.depth === maxDepth
    out.push({
      kind: 'text',
      text: nd.name,
      at: { x: last ? nd.rect.x - 4.0 : nd.rect.x + nd.rect.w + 4.0, y: nd.rect.y + nd.rect.h / 2.0 },
      fill: labelColor,
      size: fontSize,
      align: last ? 'end' : 'start',
      baseline: 'middle',
    })
  }
  return out
}

/** Ray-cast point-in-polygon (even-odd). */
function sankeyPointInPolygon(pts: Pt[], px: Double, py: Double): boolean {
  let inside = false
  let j = pts.length - 1
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[j]!
    const aAbove = a.y > py
    const bAbove = b.y > py
    if (aAbove !== bAbove && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
    j = i
  }
  return inside
}

export interface SankeyHitIndex {
  /** Index into `layout.nodes`, or -1. */
  node: number
  /** Index into `layout.links`, or -1. */
  link: number
}

/** A node band under the point, else a ribbon, else both -1. */
export function hitSankeyIndex(layout: SankeyLayout, px: Double, py: Double): SankeyHitIndex {
  let nodeIdx = -1
  for (let i = 0; i < layout.nodes.length; i++) {
    if (nodeIdx >= 0) continue
    const r = layout.nodes[i]!.rect
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) nodeIdx = i
  }
  if (nodeIdx >= 0) return { node: nodeIdx, link: -1 }
  let linkIdx = -1
  for (let k = 0; k < layout.links.length; k++) {
    if (linkIdx >= 0) continue
    const l = layout.links[k]!
    if (l.width > 0.0 && sankeyPointInPolygon(ribbonPoints(layout, l, 1.0), px, py)) linkIdx = k
  }
  return { node: -1, link: linkIdx }
}
