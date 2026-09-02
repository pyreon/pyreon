// Sankey geometry — flow diagram over a node/link graph.
//
// Columns come from the longest path from a source; node heights from flow
// totals; vertical order from a few relaxation sweeps (weighted-centre
// toward neighbours, then collision resolution). Links are ribbons whose
// width is their value at the same scale as the node bands.

import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed', '#0e7490', '#9333ea']

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

function rgba(hex: string, alpha: Double): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  if (h.length < 6) return hex
  const ch = (at: number): number => parseInt(h.slice(at, at + 2), 16)
  return `rgba(${ch(0)}, ${ch(2)}, ${ch(4)}, ${alpha})`
}

/** Lay out the flow graph into `box`. */
export function layoutSankey(nodes: SankeyNode[], links: SankeyLink[], box: Rect, options?: SankeyOptions): SankeyLayout {
  const nodeWidth = options?.nodeWidth ?? 16.0
  const padding = options?.nodePadding ?? 8.0
  const iterations = options?.iterations ?? 6
  const align = options?.align ?? 'justify'
  const index = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) index.set(nodes[i]!.name, i)
  const dropped: string[] = []
  // Keep only well-formed links; a self-loop has no column to flow to.
  const kept: { s: number; t: number; v: Double }[] = []
  for (const l of links) {
    const s = index.get(l.source)
    const t = index.get(l.target)
    if (s === undefined || t === undefined || s === t || !(l.value > 0.0)) {
      dropped.push(`${l.source} -> ${l.target}`)
      continue
    }
    kept.push({ s, t, v: l.value })
  }
  const n = nodes.length
  // Depth by longest path; a back-edge that would keep increasing depth past n is a cycle.
  const depth: number[] = []
  for (let i = 0; i < n; i++) depth.push(0)
  const live: boolean[] = kept.map(() => true)
  for (let round = 0; round <= n; round++) {
    let changed = false
    for (let k = 0; k < kept.length; k++) {
      const l = kept[k]!
      if (!live[k]) continue
      if (depth[l.t]! < depth[l.s]! + 1) {
        if (round === n) {
          live[k] = false
          dropped.push(`${nodes[l.s]!.name} -> ${nodes[l.t]!.name} (cycle)`)
          continue
        }
        depth[l.t] = depth[l.s]! + 1
        changed = true
      }
    }
    if (!changed) break
  }
  const flows = kept.filter((_, k) => live[k])
  let maxDepth = 0
  for (let i = 0; i < n; i++) if (depth[i]! > maxDepth) maxDepth = depth[i]!
  if (align === 'justify') {
    const hasOut: boolean[] = []
    for (let i = 0; i < n; i++) hasOut.push(false)
    for (const l of flows) hasOut[l.s] = true
    for (let i = 0; i < n; i++) if (!hasOut[i]) depth[i] = maxDepth
  }
  // Node value = max(in, out) so a node's band holds whichever side is larger.
  const inSum: Double[] = []
  const outSum: Double[] = []
  for (let i = 0; i < n; i++) {
    inSum.push(0.0)
    outSum.push(0.0)
  }
  for (const l of flows) {
    outSum[l.s] = outSum[l.s]! + l.v
    inSum[l.t] = inSum[l.t]! + l.v
  }
  const value: Double[] = []
  for (let i = 0; i < n; i++) value.push(Math.max(inSum[i]!, outSum[i]!))
  // Scale: the tallest column fills the box height.
  const columns: number[][] = []
  for (let d = 0; d <= maxDepth; d++) columns.push([])
  for (let i = 0; i < n; i++) columns[depth[i]!]!.push(i)
  let ky = Infinity
  for (const col of columns) {
    let total = 0.0
    for (const i of col) total = total + value[i]!
    const avail = box.h - padding * Math.max(0, col.length - 1)
    if (total > 0.0 && avail > 0.0) ky = Math.min(ky, avail / total)
  }
  if (!Number.isFinite(ky)) ky = 0.0
  const colX = (d: number): Double => (maxDepth <= 0 ? box.x : box.x + ((box.w - nodeWidth) * d) / maxDepth)
  const y0: Double[] = []
  const hgt: Double[] = []
  for (let i = 0; i < n; i++) {
    y0.push(0.0)
    hgt.push(value[i]! * ky)
  }
  const stack = (col: number[]): void => {
    let y = box.y
    for (const i of col) {
      y0[i] = y
      y = y + hgt[i]! + padding
    }
  }
  for (const col of columns) stack(col)
  const centre = (i: number): Double => y0[i]! + hgt[i]! / 2.0
  const resolve = (col: number[]): void => {
    col.sort((a, b) => centre(a) - centre(b))
    let y = box.y
    for (const i of col) {
      if (y0[i]! < y) y0[i] = y
      y = y0[i]! + hgt[i]! + padding
    }
    // Push back up if the column overflowed the bottom.
    let bottom = box.y + box.h
    for (let k = col.length - 1; k >= 0; k--) {
      const i = col[k]!
      if (y0[i]! + hgt[i]! > bottom) y0[i] = bottom - hgt[i]!
      bottom = y0[i]! - padding
    }
  }
  for (let it = 0; it < iterations; it++) {
    const alpha = 0.99 - it * (0.99 / Math.max(1, iterations))
    for (let d = 1; d <= maxDepth; d++) {
      for (const i of columns[d]!) {
        let w = 0.0
        let acc = 0.0
        for (const l of flows) {
          if (l.t !== i) continue
          acc = acc + centre(l.s) * l.v
          w = w + l.v
        }
        if (w > 0.0) y0[i] = y0[i]! + (acc / w - centre(i)) * alpha
      }
      resolve(columns[d]!)
    }
    for (let d = maxDepth - 1; d >= 0; d--) {
      for (const i of columns[d]!) {
        let w = 0.0
        let acc = 0.0
        for (const l of flows) {
          if (l.s !== i) continue
          acc = acc + centre(l.t) * l.v
          w = w + l.v
        }
        if (w > 0.0) y0[i] = y0[i]! + (acc / w - centre(i)) * alpha
      }
      resolve(columns[d]!)
    }
  }
  const outNodes: SankeyLayoutNode[] = []
  for (let i = 0; i < n; i++) {
    outNodes.push({
      name: nodes[i]!.name,
      index: i,
      depth: depth[i]!,
      value: value[i]!,
      rect: { x: colX(depth[i]!), y: y0[i]!, w: nodeWidth, h: hgt[i]! },
      color: nodes[i]!.color ?? PALETTE[i % PALETTE.length]!,
    })
  }
  // Ribbon offsets: outgoing sorted by target centre, incoming by source centre,
  // so ribbons leave and arrive without crossing each other at the node.
  const outCursor: Double[] = y0.slice()
  const inCursor: Double[] = y0.slice()
  const order = flows.map((_, k) => k)
  const outLinks: SankeyLayoutLink[] = flows.map((l) => ({ source: l.s, target: l.t, value: l.v, width: l.v * ky, y0: 0.0, y1: 0.0 }))
  order.sort((a, b) => centre(flows[a]!.t) - centre(flows[b]!.t) || flows[a]!.s - flows[b]!.s)
  for (const k of order) {
    const l = outLinks[k]!
    l.y0 = outCursor[l.source]!
    outCursor[l.source] = outCursor[l.source]! + l.width
  }
  order.sort((a, b) => centre(flows[a]!.s) - centre(flows[b]!.s) || flows[a]!.t - flows[b]!.t)
  for (const k of order) {
    const l = outLinks[k]!
    l.y1 = inCursor[l.target]!
    inCursor[l.target] = inCursor[l.target]! + l.width
  }
  return { nodes: outNodes, links: outLinks, dropped }
}

/** Points of a ribbon: the top S-curve out, the bottom S-curve back. */
export function ribbonPoints(layout: SankeyLayout, link: SankeyLayoutLink, progress?: Double): Pt[] {
  const s = layout.nodes[link.source]!.rect
  const t = layout.nodes[link.target]!.rect
  const x0 = s.x + s.w
  const x1raw = t.x
  const p = progress === undefined ? 1.0 : progress < 0.0 ? 0.0 : progress > 1.0 ? 1.0 : progress
  const x1 = x0 + (x1raw - x0) * p
  const steps = 16
  const top: Pt[] = []
  const bottom: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    const e = u * u * (3.0 - 2.0 * u)
    const x = x0 + (x1 - x0) * u
    top.push({ x, y: link.y0 + (link.y1 - link.y0) * e })
    bottom.push({ x, y: link.y0 + link.width + (link.y1 + link.width - (link.y0 + link.width)) * e })
  }
  bottom.reverse()
  return [...top, ...bottom]
}

/** Render ribbons then node bands then labels. */
export function renderSankey(layout: SankeyLayout, options?: SankeyOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const opacity = options?.linkOpacity ?? 0.35
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const showLabels = options?.showLabels ?? true
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#334155'
  void (measure ?? measureApprox())
  let maxDepth = 0
  for (const nd of layout.nodes) if (nd.depth > maxDepth) maxDepth = nd.depth
  for (const l of layout.links) {
    if (l.width <= 0.0) continue
    out.push({ kind: 'polygon', points: ribbonPoints(layout, l, progress), fill: rgba(layout.nodes[l.source]!.color, opacity) })
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

function pointInPolygon(pts: Pt[], px: Double, py: Double): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!
    const b = pts[j]!
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export type SankeyHit = { kind: 'node'; node: SankeyLayoutNode } | { kind: 'link'; link: SankeyLayoutLink } | null

/** A node band under the point, else a ribbon, else null. */
export function hitSankey(layout: SankeyLayout, px: Double, py: Double): SankeyHit {
  for (const nd of layout.nodes) {
    const r = nd.rect
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return { kind: 'node', node: nd }
  }
  for (const l of layout.links) {
    if (l.width > 0.0 && pointInPolygon(ribbonPoints(layout, l), px, py)) return { kind: 'link', link: l }
  }
  return null
}

export interface SankeyToSvgOptions {
  nodes: SankeyNode[]
  links: SankeyLink[]
  width?: Double
  height?: Double
  sankey?: SankeyOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Sankey → `<svg>` string, server-safe. Leaves a label gutter on both sides. */
export function sankeyToSvg(options: SankeyToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const gutter = 80.0
  const layout = layoutSankey(options.nodes, options.links, { x: gutter, y: 8.0, w: Math.max(0.0, width - gutter * 2.0), h: Math.max(0.0, height - 16.0) }, options.sankey)
  const cmds = renderSankey(layout, options.sankey, options.measure ?? measureApprox())
  let total = 0.0
  for (const l of layout.links) total = total + l.value
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${layout.nodes.length} nodes, ${layout.links.length} flows totalling ${total}.` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
