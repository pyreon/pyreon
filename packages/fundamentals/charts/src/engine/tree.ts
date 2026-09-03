// Tree geometry — node-link layout of a hierarchy (orthogonal or radial).
//
// A tidy layout: every leaf takes one slot in depth-first order and each
// parent sits at the centre of its leaves' slots, so siblings never overlap
// and subtrees stay compact. Output is flat (nodes + links) so the renderer,
// the hit test and a native executor consume the same thing. Written in the
// native subset and BUNDLED into the generated Swift/Kotlin engine: a
// pre-order walk over an index-cursor stack, leaf spans propagated in one
// reverse pass (children always index after their parent), parallel arrays
// instead of struct-field mutation; the svg half lives in family-svg.ts.

import type { TreeNode } from './treemap'
import type { Double, DrawCmd, Pt, Rect } from './types'

const TREE_TAU = Math.PI * 2.0
const TREE_PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

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
  /** Depth of the node the link enters (levels appear root-first under `progress`). */
  depth: number
}

export interface TreeLayout {
  nodes: TreeLayoutNode[]
  links: TreeLink[]
}

export interface TreeOptions {
  /** Inline union rather than the TreeOrient alias: the native emitter turns a NAMED string union into an enum, and the comparisons below are string comparisons. */
  orient?: 'LR' | 'RL' | 'TB' | 'BT' | 'radial' | undefined
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

interface TreeFrame {
  node: TreeNode
  depth: number
  path: number[]
  color: string
  parent: number
}

interface Placed {
  at: Pt
  dir: Pt
}

/** Pixel position + label direction for a node at (depthF, t) in slot space. */
function placeTreeNode(orient: string, box: Rect, gutter: Double, levelsF: Double, slotsF: Double, depthF: Double, t: Double): Placed {
  const depthFrac = levelsF <= 1.0 ? 0.0 : depthF / (levelsF - 1.0)
  const slotFrac = slotsF <= 1.0 ? 0.5 : t / (slotsF - 1.0)
  if (orient === 'radial') {
    const cx = box.x + box.w / 2.0
    const cy = box.y + box.h / 2.0
    const side = box.w < box.h ? box.w : box.h
    const rawR = side / 2.0 - gutter
    const bigR = rawR < 0.0 ? 0.0 : rawR
    // Roots at the centre; one extra slot so the last leaf does not sit on the first.
    const ang = -Math.PI / 2.0 + (slotsF <= 0.0 ? 0.0 : (t / slotsF) * TREE_TAU)
    const r = bigR * depthFrac
    const dir: Pt = depthF === 0.0 ? { x: 1.0, y: 0.0 } : { x: Math.cos(ang), y: Math.sin(ang) }
    return { at: { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r }, dir }
  }
  const x0 = box.x + gutter / 2.0
  const y0 = box.y + gutter / 4.0
  const rawW = box.w - gutter
  const w = rawW < 0.0 ? 0.0 : rawW
  const rawH = box.h - gutter / 2.0
  const hgt = rawH < 0.0 ? 0.0 : rawH
  if (orient === 'LR') return { at: { x: x0 + w * depthFrac, y: y0 + hgt * slotFrac }, dir: { x: 1.0, y: 0.0 } }
  if (orient === 'RL') return { at: { x: x0 + w * (1.0 - depthFrac), y: y0 + hgt * slotFrac }, dir: { x: -1.0, y: 0.0 } }
  if (orient === 'TB') return { at: { x: x0 + w * slotFrac, y: y0 + hgt * depthFrac }, dir: { x: 0.0, y: 1.0 } }
  return { at: { x: x0 + w * slotFrac, y: y0 + hgt * (1.0 - depthFrac) }, dir: { x: 0.0, y: -1.0 } }
}

/** Lay out the hierarchy into `box`. */
export function layoutTree(roots: TreeNode[], box: Rect, options?: TreeOptions): TreeLayout {
  const orient = options?.orient ?? 'LR'
  const maxDepth = options?.maxDepth ?? 64.0
  const gutter = options?.labelGutter ?? 60.0
  // Pre-order walk. Frames come off an index-cursor stack (the array only
  // grows); children are pushed in reverse so they come off in data order.
  const stack: TreeFrame[] = []
  let sp = 0
  let ri = roots.length - 1
  while (ri >= 0) {
    const root = roots[ri]!
    stack.push({ node: root, depth: 0, path: [ri], color: root.color ?? TREE_PALETTE[ri % TREE_PALETTE.length]!, parent: -1 })
    sp = sp + 1
    ri = ri - 1
  }
  const frames: TreeFrame[] = []
  const leafFlags: boolean[] = []
  let levelsF = 0.0
  while (sp > 0) {
    sp = sp - 1
    const frame = stack[sp]!
    let depthF = 0.0
    for (let d = 0; d < frame.depth; d++) depthF = depthF + 1.0
    if (depthF + 1.0 > levelsF) levelsF = depthF + 1.0
    const kids: TreeNode[] = []
    if (depthF + 1.0 < maxDepth) for (const k of frame.node.children ?? []) kids.push(k)
    const index = frames.length
    frames.push(frame)
    leafFlags.push(kids.length === 0)
    let ki = kids.length - 1
    while (ki >= 0) {
      const kid = kids[ki]!
      const childPath: number[] = []
      for (const p of frame.path) childPath.push(p)
      childPath.push(ki)
      const next: TreeFrame = { node: kid, depth: frame.depth + 1, path: childPath, color: kid.color ?? frame.color, parent: index }
      if (sp < stack.length) stack[sp] = next
      else stack.push(next)
      sp = sp + 1
      ki = ki - 1
    }
  }
  // Leaf slots in pre-order, then each node's span is the span of its leaves;
  // one reverse pass suffices because a child always indexes after its parent.
  const lo: Double[] = []
  const hi: Double[] = []
  let nextSlot = 0.0
  for (let i = 0; i < frames.length; i++) {
    if (leafFlags[i]!) {
      lo.push(nextSlot)
      hi.push(nextSlot)
      nextSlot = nextSlot + 1.0
    } else {
      lo.push(-1.0)
      hi.push(-1.0)
    }
  }
  let bi = frames.length - 1
  while (bi >= 0) {
    const parent = frames[bi]!.parent
    if (parent >= 0) {
      if (lo[parent]! < 0.0 || lo[bi]! < lo[parent]!) lo[parent] = lo[bi]!
      if (hi[parent]! < 0.0 || hi[bi]! > hi[parent]!) hi[parent] = hi[bi]!
    }
    bi = bi - 1
  }
  const slotsF = nextSlot
  const nodes: TreeLayoutNode[] = []
  const links: TreeLink[] = []
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!
    let depthF = 0.0
    for (let d = 0; d < f.depth; d++) depthF = depthF + 1.0
    const t = (lo[i]! + hi[i]!) / 2.0
    const p = placeTreeNode(orient, box, gutter, levelsF, slotsF, depthF, t)
    nodes.push({ name: f.node.name, value: f.node.value, at: p.at, depth: f.depth, path: f.path, color: f.color, leaf: leafFlags[i]!, dir: p.dir })
  }
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!
    if (f.parent < 0) continue
    links.push({ from: nodes[f.parent]!.at, to: nodes[i]!.at, path: f.path, depth: f.depth })
  }
  return { nodes, links }
}

/** Points along a link — a smooth S-curve, an elbow, or a straight radial spoke. */
export function linkPoints(link: TreeLink, orient: 'LR' | 'RL' | 'TB' | 'BT' | 'radial', shape: 'curve' | 'elbow'): Pt[] {
  const a = link.from
  const b = link.to
  if (orient === 'radial') return [a, b]
  const horizontal = orient === 'LR' || orient === 'RL'
  if (shape === 'elbow') {
    if (horizontal) return [a, { x: (a.x + b.x) / 2.0, y: a.y }, { x: (a.x + b.x) / 2.0, y: b.y }, b]
    return [a, { x: a.x, y: (a.y + b.y) / 2.0 }, { x: b.x, y: (a.y + b.y) / 2.0 }, b]
  }
  const pts: Pt[] = []
  // iF mirrors the step index as a Double: the curve parameter is a fraction.
  let iF = 0.0
  for (let i = 0; i <= 12; i++) {
    const t = iF / 12.0
    const e = t * t * (3.0 - 2.0 * t)
    if (horizontal) pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * e })
    else pts.push({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * t })
    iF = iF + 1.0
  }
  return pts
}

/** Render links, symbols and labels; levels appear root-first under `progress`. */
export function renderTree(layout: TreeLayout, options?: TreeOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const orient = options?.orient ?? 'LR'
  const shape = options?.edgeShape ?? 'curve'
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  let levelsF = 0.0
  for (const n of layout.nodes) {
    let depthF = 0.0
    for (let d = 0; d < n.depth; d++) depthF = depthF + 1.0
    if (depthF + 1.0 > levelsF) levelsF = depthF + 1.0
  }
  // The whole-level count that has appeared: floor(levels * progress), as a Double scan.
  let shownF = 0.0
  if (progress >= 1.0) shownF = levelsF
  else while (shownF + 1.0 <= levelsF * progress) shownF = shownF + 1.0
  const size = options?.symbolSize ?? 8.0
  const linkColor = options?.linkColor ?? '#94a3b8'
  const showLabels = options?.showLabels ?? true
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#334155'
  for (const l of layout.links) {
    let depthF = 0.0
    for (let d = 0; d < l.depth; d++) depthF = depthF + 1.0
    if (depthF >= shownF) continue
    out.push({ kind: 'polyline', points: linkPoints(l, orient, shape), stroke: linkColor, width: 1.0 })
  }
  for (const n of layout.nodes) {
    let depthF = 0.0
    for (let d = 0; d < n.depth; d++) depthF = depthF + 1.0
    if (depthF >= shownF) continue
    out.push({ kind: 'circle', center: n.at, radius: size / 2.0, fill: n.color })
    if (!showLabels || progress < 1.0) continue
    // Leaves label outward; inner nodes label backward so labels never sit on a child link.
    const sx = n.leaf ? n.dir.x : -n.dir.x
    const sy = n.leaf ? n.dir.y : -n.dir.y
    const off = size / 2.0 + 4.0
    out.push({
      kind: 'text',
      text: n.name,
      at: { x: n.at.x + sx * off, y: n.at.y + sy * off },
      fill: labelColor,
      size: fontSize,
      align: sx > 0.3 ? 'start' : sx < -0.3 ? 'end' : 'middle',
      baseline: sy > 0.3 ? 'top' : sy < -0.3 ? 'bottom' : 'middle',
    })
  }
  return out
}

/** Index of the nearest node whose symbol (plus a halo) contains the point, or -1 — what `onSelectIndex` receives. */
export function hitTreeIndex(layout: TreeLayout, px: Double, py: Double, symbolSize?: Double): number {
  const r = (symbolSize ?? 8.0) / 2.0 + 4.0
  let bestIdx = -1
  let bestD = r * r
  for (let i = 0; i < layout.nodes.length; i++) {
    const n = layout.nodes[i]!
    const dx = px - n.at.x
    const dy = py - n.at.y
    const d = dx * dx + dy * dy
    if (d <= bestD) {
      bestIdx = i
      bestD = d
    }
  }
  return bestIdx
}

/** The nearest node within its symbol (plus a small halo), or null. */
export function hitTree(layout: TreeLayout, px: Double, py: Double, symbolSize?: Double): TreeLayoutNode | null {
  const i = hitTreeIndex(layout, px, py, symbolSize)
  return i < 0 ? null : layout.nodes[i]!
}
