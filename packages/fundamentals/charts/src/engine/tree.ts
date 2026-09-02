// Tree geometry — node-link layout of a hierarchy (orthogonal or radial).
//
// A tidy layout: every leaf takes one slot in depth-first order and each
// parent sits at the centre of its leaves' slots, so siblings never overlap
// and subtrees stay compact. Output is flat (nodes + links) so the renderer,
// the hit test and a native executor consume the same thing.

import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { TreeNode } from './treemap'
import type { Double, DrawCmd, MeasureText, Pt, Rect } from './types'

const TAU = Math.PI * 2.0
const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

export type TreeOrient = 'LR' | 'RL' | 'TB' | 'BT' | 'radial'

export interface TreeLayoutNode {
  name: string
  value: Double | undefined
  at: Pt
  depth: number
  /** Path of child indices from the root — stable identity for selection. */
  path: number[]
  color: string
  leaf: boolean
  /** Outward direction for labels (unit vector); radial layouts point away from the centre. */
  dir: Pt
}

export interface TreeLink {
  from: Pt
  to: Pt
  /** The child's path — a link is owned by the node it enters. */
  path: number[]
}

export interface TreeLayout {
  nodes: TreeLayoutNode[]
  links: TreeLink[]
}

export interface TreeOptions {
  orient?: TreeOrient | undefined
  /** Only lay out this many levels (1 = roots only). */
  maxDepth?: Double | undefined
  /** 'curve' (default) draws smooth links; 'elbow' draws orthogonal steps. */
  edgeShape?: 'curve' | 'elbow' | undefined
  symbolSize?: Double | undefined
  showLabels?: boolean | undefined
  labelColor?: string | undefined
  fontSize?: Double | undefined
  linkColor?: string | undefined
  /** Entrance progress 0..1; levels appear root-first. */
  progress?: Double | undefined
  /** Room kept for labels at the leaf edge, in pixels. */
  labelGutter?: Double | undefined
}

interface Slotted {
  node: TreeNode
  depth: number
  path: number[]
  color: string
  t: Double
  leaf: boolean
  parent: number
}

function countLeaves(node: TreeNode, depth: number, maxDepth: number): number {
  const kids = node.children ?? []
  if (kids.length === 0 || depth + 1 >= maxDepth) return 1
  let n = 0
  for (const k of kids) n = n + countLeaves(k, depth + 1, maxDepth)
  return n
}

/** Lay out the hierarchy into `box`. */
export function layoutTree(roots: TreeNode[], box: Rect, options?: TreeOptions): TreeLayout {
  const orient = options?.orient ?? 'LR'
  const maxDepth = options?.maxDepth ?? 64
  const gutter = options?.labelGutter ?? 60.0
  const slotted: Slotted[] = []
  let levels = 0
  let nextSlot = 0.0
  const walk = (node: TreeNode, depth: number, path: number[], color: string, parent: number): void => {
    if (depth + 1 > levels) levels = depth + 1
    const kids = depth + 1 < maxDepth ? node.children ?? [] : []
    const leaf = kids.length === 0
    const index = slotted.length
    const first = nextSlot
    const leaves = countLeaves(node, depth, maxDepth)
    const t = first + (leaves - 1) / 2.0
    slotted.push({ node, depth, path, color, t, leaf, parent })
    if (leaf) {
      nextSlot = nextSlot + 1.0
      return
    }
    for (let i = 0; i < kids.length; i++) walk(kids[i]!, depth + 1, [...path, i], kids[i]!.color ?? color, index)
  }
  for (let i = 0; i < roots.length; i++) walk(roots[i]!, 0, [i], roots[i]!.color ?? PALETTE[i % PALETTE.length]!, -1)
  const slots = nextSlot
  const nodes: TreeLayoutNode[] = []
  const links: TreeLink[] = []
  const place = (s: Slotted): { at: Pt; dir: Pt } => {
    const depthFrac = levels <= 1 ? 0.0 : s.depth / (levels - 1)
    const slotFrac = slots <= 1 ? 0.5 : s.t / (slots - 1)
    if (orient === 'radial') {
      const cx = box.x + box.w / 2.0
      const cy = box.y + box.h / 2.0
      const R = Math.max(0.0, Math.min(box.w, box.h) / 2.0 - gutter)
      // Roots at the centre; one extra slot so the last leaf does not sit on the first.
      const ang = -Math.PI / 2.0 + (slots <= 0 ? 0.0 : (s.t / slots) * TAU)
      const r = R * depthFrac
      const dir: Pt = s.depth === 0 ? { x: 1.0, y: 0.0 } : { x: Math.cos(ang), y: Math.sin(ang) }
      return { at: { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r }, dir }
    }
    const x0 = box.x + gutter / 2.0
    const y0 = box.y + gutter / 4.0
    const w = Math.max(0.0, box.w - gutter)
    const hgt = Math.max(0.0, box.h - gutter / 2.0)
    if (orient === 'LR') return { at: { x: x0 + w * depthFrac, y: y0 + hgt * slotFrac }, dir: { x: 1.0, y: 0.0 } }
    if (orient === 'RL') return { at: { x: x0 + w * (1.0 - depthFrac), y: y0 + hgt * slotFrac }, dir: { x: -1.0, y: 0.0 } }
    if (orient === 'TB') return { at: { x: x0 + w * slotFrac, y: y0 + hgt * depthFrac }, dir: { x: 0.0, y: 1.0 } }
    return { at: { x: x0 + w * slotFrac, y: y0 + hgt * (1.0 - depthFrac) }, dir: { x: 0.0, y: -1.0 } }
  }
  for (const s of slotted) {
    const p = place(s)
    nodes.push({ name: s.node.name, value: s.node.value, at: p.at, depth: s.depth, path: s.path, color: s.color, leaf: s.leaf, dir: p.dir })
  }
  for (let i = 0; i < slotted.length; i++) {
    const s = slotted[i]!
    if (s.parent < 0) continue
    links.push({ from: nodes[s.parent]!.at, to: nodes[i]!.at, path: s.path })
  }
  return { nodes, links }
}

/** Points along a link — a smooth S-curve, an elbow, or a straight radial spoke. */
export function linkPoints(link: TreeLink, orient: TreeOrient, shape: 'curve' | 'elbow'): Pt[] {
  const a = link.from
  const b = link.to
  if (orient === 'radial') return [a, b]
  const horizontal = orient === 'LR' || orient === 'RL'
  if (shape === 'elbow') {
    return horizontal
      ? [a, { x: (a.x + b.x) / 2.0, y: a.y }, { x: (a.x + b.x) / 2.0, y: b.y }, b]
      : [a, { x: a.x, y: (a.y + b.y) / 2.0 }, { x: b.x, y: (a.y + b.y) / 2.0 }, b]
  }
  const pts: Pt[] = []
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const e = t * t * (3.0 - 2.0 * t)
    pts.push(horizontal ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * e } : { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * t })
  }
  return pts
}

/** Render links, symbols and labels; levels appear root-first under `progress`. */
export function renderTree(layout: TreeLayout, options?: TreeOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const orient = options?.orient ?? 'LR'
  const shape = options?.edgeShape ?? 'curve'
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  let levels = 0
  for (const n of layout.nodes) if (n.depth + 1 > levels) levels = n.depth + 1
  const shown = progress >= 1.0 ? levels : Math.floor(levels * progress)
  const size = options?.symbolSize ?? 8.0
  const linkColor = options?.linkColor ?? '#94a3b8'
  const showLabels = options?.showLabels ?? true
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#334155'
  void (measure ?? measureApprox())
  const depthOf = new Map<string, number>()
  for (const n of layout.nodes) depthOf.set(n.path.join('.'), n.depth)
  for (const l of layout.links) {
    const d = depthOf.get(l.path.join('.')) ?? 0
    if (d >= shown) continue
    out.push({ kind: 'polyline', points: linkPoints(l, orient, shape), stroke: linkColor, width: 1.0 })
  }
  for (const n of layout.nodes) {
    if (n.depth >= shown) continue
    out.push({ kind: 'circle', center: n.at, radius: size / 2.0, fill: n.color })
    if (!showLabels || progress < 1.0) continue
    // Leaves label outward; inner nodes label backward so labels never sit on a child link.
    const sx = n.leaf ? n.dir.x : -n.dir.x
    const sy = n.leaf ? n.dir.y : -n.dir.y
    const off = size / 2.0 + 4.0
    const at: Pt = { x: n.at.x + sx * off, y: n.at.y + sy * off }
    const align = sx > 0.3 ? 'start' : sx < -0.3 ? 'end' : 'middle'
    const baseline = sy > 0.3 ? 'top' : sy < -0.3 ? 'bottom' : 'middle'
    out.push({ kind: 'text', text: n.name, at, fill: labelColor, size: fontSize, align, baseline })
  }
  return out
}

/** The nearest node within its symbol (plus a small halo), or null. */
export function hitTree(layout: TreeLayout, px: Double, py: Double, symbolSize?: Double): TreeLayoutNode | null {
  const r = (symbolSize ?? 8.0) / 2.0 + 4.0
  let best: TreeLayoutNode | null = null
  let bestD = r * r
  for (const n of layout.nodes) {
    const dx = px - n.at.x
    const dy = py - n.at.y
    const d = dx * dx + dy * dy
    if (d <= bestD) {
      best = n
      bestD = d
    }
  }
  return best
}

export interface TreeToSvgOptions {
  data: TreeNode[]
  width?: Double
  height?: Double
  tree?: TreeOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Tree → `<svg>` string, server-safe. */
export function treeToSvg(options: TreeToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const layout = layoutTree(options.data, { x: 0.0, y: 0.0, w: width, h: height }, options.tree)
  const cmds = renderTree(layout, options.tree, options.measure ?? measureApprox())
  const leaves = layout.nodes.filter((n) => n.leaf).length
  const description =
    options.description ??
    (options.title !== undefined ? `${options.title}: ${layout.nodes.length} nodes, ${leaves} leaves.` : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
