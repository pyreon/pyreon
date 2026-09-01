// Graph geometry — node/link networks laid out by force, on a circle, or from
// given coordinates. Deterministic: the force layout seeds its own PRNG so a
// render is reproducible (and testable) run to run.

import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const TAU = Math.PI * 2.0
const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed', '#0e7490', '#9333ea']

export interface GraphNode {
  id: string
  name?: string | undefined
  value?: Double | undefined
  /** Index into `GraphOptions.categories`; colours by category. */
  category?: number | undefined
  color?: string | undefined
  /** Data-space coordinates for `layout: 'none'`. */
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
}

export interface GraphLayout {
  nodes: GraphLayoutNode[]
  links: GraphLayoutLink[]
  /** Links whose endpoints are unknown, dropped by name. */
  dropped: string[]
}

export interface GraphOptions {
  layout?: 'force' | 'circular' | 'none' | undefined
  categories?: string[] | undefined
  /** Base symbol size; nodes with values scale between 0.6× and 2× of it. */
  symbolSize?: Double | undefined
  iterations?: Double | undefined
  /** Force tuning: how strongly nodes push apart (pixels²), the ideal link length, and the pull to the centre. */
  repulsion?: Double | undefined
  linkDistance?: Double | undefined
  gravity?: Double | undefined
  seed?: Double | undefined
  showLabels?: boolean | undefined
  labelColor?: string | undefined
  fontSize?: Double | undefined
  linkColor?: string | undefined
  /** Entrance progress 0..1; nodes converge from the centre. */
  progress?: Double | undefined
}

/** mulberry32 — a tiny deterministic PRNG. */
function prng(seed: number): () => Double {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Lay out the network into `box`. */
export function layoutGraph(nodes: GraphNode[], links: GraphLink[], box: Rect, options?: GraphOptions): GraphLayout {
  const mode = options?.layout ?? 'force'
  const base = options?.symbolSize ?? 10.0
  const index = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) index.set(nodes[i]!.id, i)
  const dropped: string[] = []
  const outLinks: GraphLayoutLink[] = []
  for (const l of links) {
    const s = index.get(l.source)
    const t = index.get(l.target)
    if (s === undefined || t === undefined) {
      dropped.push(`${l.source} -> ${l.target}`)
      continue
    }
    outLinks.push({ source: s, target: t, value: l.value })
  }
  let maxValue = 0.0
  for (const n of nodes) if (n.value !== undefined && n.value > maxValue) maxValue = n.value
  const radiusOf = (n: GraphNode): Double => {
    if (n.value === undefined || maxValue <= 0.0) return base / 2.0
    return (base / 2.0) * (0.6 + 1.4 * Math.sqrt(Math.max(0.0, n.value) / maxValue))
  }
  const cx = box.x + box.w / 2.0
  const cy = box.y + box.h / 2.0
  const pos: Pt[] = []
  if (mode === 'circular') {
    const R = Math.max(0.0, Math.min(box.w, box.h) / 2.0 - base)
    for (let i = 0; i < nodes.length; i++) {
      const ang = -Math.PI / 2.0 + (nodes.length <= 0 ? 0.0 : (i / nodes.length) * TAU)
      pos.push({ x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R })
    }
  } else if (mode === 'none') {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      const x = n.x ?? 0.0
      const y = n.y ?? 0.0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const spanX = maxX - minX
    const spanY = maxY - minY
    const pad = base
    for (const n of nodes) {
      const fx = spanX <= 0.0 ? 0.5 : ((n.x ?? 0.0) - minX) / spanX
      const fy = spanY <= 0.0 ? 0.5 : ((n.y ?? 0.0) - minY) / spanY
      pos.push({ x: box.x + pad + (box.w - pad * 2.0) * fx, y: box.y + pad + (box.h - pad * 2.0) * fy })
    }
  } else {
    const rnd = prng(Math.floor(options?.seed ?? 7))
    const iterations = Math.max(0, Math.floor(options?.iterations ?? 200))
    const area = Math.max(1.0, box.w * box.h)
    const k = Math.sqrt(area / Math.max(1, nodes.length))
    const repulsion = options?.repulsion ?? k * k
    const linkDistance = options?.linkDistance ?? k
    const gravity = options?.gravity ?? 0.05
    const spread = Math.min(box.w, box.h) / 3.0
    for (let i = 0; i < nodes.length; i++) pos.push({ x: cx + (rnd() - 0.5) * spread, y: cy + (rnd() - 0.5) * spread })
    let temp = Math.max(box.w, box.h) / 10.0
    const cool = iterations <= 0 ? 0.0 : temp / iterations
    const disp: Pt[] = nodes.map(() => ({ x: 0.0, y: 0.0 }))
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < nodes.length; i++) {
        disp[i]!.x = 0.0
        disp[i]!.y = 0.0
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = pos[i]!.x - pos[j]!.x
          let dy = pos[i]!.y - pos[j]!.y
          let d = Math.sqrt(dx * dx + dy * dy)
          if (d < 0.01) {
            dx = (rnd() - 0.5) * 0.1
            dy = (rnd() - 0.5) * 0.1
            d = 0.01
          }
          const f = repulsion / (d * d)
          const fx = (dx / d) * f
          const fy = (dy / d) * f
          disp[i]!.x = disp[i]!.x + fx
          disp[i]!.y = disp[i]!.y + fy
          disp[j]!.x = disp[j]!.x - fx
          disp[j]!.y = disp[j]!.y - fy
        }
      }
      for (const l of outLinks) {
        const dx = pos[l.source]!.x - pos[l.target]!.x
        const dy = pos[l.source]!.y - pos[l.target]!.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d <= 0.0) continue
        const f = (d * d) / linkDistance
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        disp[l.source]!.x = disp[l.source]!.x - fx
        disp[l.source]!.y = disp[l.source]!.y - fy
        disp[l.target]!.x = disp[l.target]!.x + fx
        disp[l.target]!.y = disp[l.target]!.y + fy
      }
      for (let i = 0; i < nodes.length; i++) {
        disp[i]!.x = disp[i]!.x + (cx - pos[i]!.x) * gravity * k * 0.1
        disp[i]!.y = disp[i]!.y + (cy - pos[i]!.y) * gravity * k * 0.1
        const d = Math.sqrt(disp[i]!.x * disp[i]!.x + disp[i]!.y * disp[i]!.y)
        if (d > 0.0) {
          const step = d < temp ? d : temp
          pos[i]!.x = pos[i]!.x + (disp[i]!.x / d) * step
          pos[i]!.y = pos[i]!.y + (disp[i]!.y / d) * step
        }
        const r = radiusOf(nodes[i]!)
        if (pos[i]!.x < box.x + r) pos[i]!.x = box.x + r
        if (pos[i]!.x > box.x + box.w - r) pos[i]!.x = box.x + box.w - r
        if (pos[i]!.y < box.y + r) pos[i]!.y = box.y + r
        if (pos[i]!.y > box.y + box.h - r) pos[i]!.y = box.y + box.h - r
      }
      temp = temp - cool
      if (temp < 0.5) temp = 0.5
    }
  }
  const outNodes: GraphLayoutNode[] = []
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    const cat = n.category
    const color = n.color ?? PALETTE[(cat ?? i) % PALETTE.length]!
    outNodes.push({ id: n.id, name: n.name ?? n.id, index: i, at: pos[i]!, radius: radiusOf(n), color, category: cat, value: n.value })
  }
  return { nodes: outNodes, links: outLinks, dropped }
}

/** Render links, then symbols, then labels. */
export function renderGraph(layout: GraphLayout, box: Rect, options?: GraphOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const cx = box.x + box.w / 2.0
  const cy = box.y + box.h / 2.0
  const at = (n: GraphLayoutNode): Pt => ({ x: cx + (n.at.x - cx) * progress, y: cy + (n.at.y - cy) * progress })
  const linkColor = options?.linkColor ?? '#94a3b8'
  const showLabels = options?.showLabels ?? false
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#334155'
  void (measure ?? measureApprox())
  let maxLink = 0.0
  for (const l of layout.links) if (l.value !== undefined && l.value > maxLink) maxLink = l.value
  for (const l of layout.links) {
    const width = l.value === undefined || maxLink <= 0.0 ? 1.0 : 1.0 + 3.0 * (Math.max(0.0, l.value) / maxLink)
    out.push({ kind: 'line', from: at(layout.nodes[l.source]!), to: at(layout.nodes[l.target]!), stroke: linkColor, width })
  }
  for (const n of layout.nodes) {
    out.push({ kind: 'circle', center: at(n), radius: n.radius, fill: n.color })
    if (!showLabels || progress < 1.0) continue
    out.push({ kind: 'text', text: n.name, at: { x: n.at.x + n.radius + 3.0, y: n.at.y }, fill: labelColor, size: fontSize, align: 'start', baseline: 'middle' })
  }
  return out
}

/** The nearest node whose symbol (plus a small halo) contains the point, or null. */
export function hitGraph(layout: GraphLayout, px: Double, py: Double): GraphLayoutNode | null {
  let best: GraphLayoutNode | null = null
  let bestD = Infinity
  for (const n of layout.nodes) {
    const dx = px - n.at.x
    const dy = py - n.at.y
    const d = dx * dx + dy * dy
    const r = n.radius + 3.0
    if (d <= r * r && d < bestD) {
      best = n
      bestD = d
    }
  }
  return best
}

export interface GraphToSvgOptions {
  nodes: GraphNode[]
  links: GraphLink[]
  width?: Double
  height?: Double
  graph?: GraphOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Graph → `<svg>` string, server-safe. */
export function graphToSvg(options: GraphToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const box: Rect = { x: 0.0, y: 0.0, w: width, h: height }
  const layout = layoutGraph(options.nodes, options.links, box, options.graph)
  const cmds = renderGraph(layout, box, options.graph, options.measure ?? measureApprox())
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${layout.nodes.length} nodes, ${layout.links.length} links.` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
