// Sunburst geometry — radial partition of a value hierarchy.
//
// Each depth is a ring; each node's angular span is its share of its parent's
// span. Output is a flat list of arcs so the renderer, the hit test and a
// native executor all consume the same thing (the treemap's radial twin).
// Written in the native subset and BUNDLED into the generated Swift/Kotlin
// engine (index-cursor work stacks, insertion-sorted siblings, no spreads,
// no optional narrowing); the svg half lives in family-svg.ts.

import { arcPolygon } from './arc'
import { approxTextWidth, nodeValue, orderByValue, tintHex } from './treemap'
import type { TreeNode } from './treemap'
import type { Double, DrawCmd, MeasureText, Pt } from './types'

const SUNBURST_TAU = Math.PI * 2.0
const SUNBURST_PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

export interface SunburstArc {
  name: string
  value: Double
  depth: number
  /** Path of child indices from the root — stable identity for selection. */
  path: number[]
  /** Angles in radians, screen orientation, `start <= end`. */
  start: Double
  end: Double
  innerR: Double
  outerR: Double
  color: string
  leaf: boolean
}

export interface SunburstOptions {
  /** Where the first arc begins; default 12 o'clock. */
  startAngle?: Double | undefined
  /** Gap between sibling arcs, radians. */
  padAngle?: Double | undefined
  /** Only lay out this many rings (1 = top level only). */
  maxDepth?: Double | undefined
  /** Sort siblings by value (default) or keep data order. */
  sort?: 'desc' | 'none' | undefined
  showLabels?: boolean | undefined
  labelColor?: string | undefined
  fontSize?: Double | undefined
  /** Entrance progress 0..1; arcs sweep in clockwise from `startAngle`. */
  progress?: Double | undefined
}

/** Number of levels in the hierarchy (0 for no nodes) — iterative. */
export function treeDepth(nodes: TreeNode[]): number {
  let deepest = 0
  const stack: TreeNode[] = []
  const depths: number[] = []
  let sp = 0
  for (const n of nodes) {
    stack.push(n)
    depths.push(1)
    sp = sp + 1
  }
  while (sp > 0) {
    sp = sp - 1
    const cur = stack[sp]!
    const d = depths[sp]!
    if (d > deepest) deepest = d
    for (const c of cur.children ?? []) {
      if (sp < stack.length) {
        stack[sp] = c
        depths[sp] = d + 1
      } else {
        stack.push(c)
        depths.push(d + 1)
      }
      sp = sp + 1
    }
  }
  return deepest
}

interface SunburstFrame {
  children: TreeNode[]
  a0: Double
  a1: Double
  depth: number
  path: number[]
  inherited: string
  hasInherited: boolean
}

/** Lay out the hierarchy into rings between `innerR` and `outerR`. */
export function layoutSunburst(
  nodes: TreeNode[],
  innerR: Double,
  outerR: Double,
  options?: SunburstOptions,
): SunburstArc[] {
  const arcs: SunburstArc[] = []
  const rawLevels = treeDepth(nodes)
  const maxDepth = options?.maxDepth ?? 64.0
  // levelsF mirrors the level count as a Double for the ring-width division.
  let levelsF = 0.0
  for (let i = 0; i < rawLevels; i++) levelsF = levelsF + 1.0
  if (levelsF > maxDepth) levelsF = maxDepth
  if (levelsF <= 0.0) return arcs
  const ringW = (outerR - innerR) / levelsF
  const pad = options?.padAngle ?? 0.0
  const sortMode = options?.sort ?? 'desc'
  const startAngle = options?.startAngle ?? -Math.PI / 2.0
  const stack: SunburstFrame[] = []
  stack.push({ children: nodes, a0: startAngle, a1: startAngle + SUNBURST_TAU, depth: 0, path: [], inherited: '', hasInherited: false })
  // The live stack height; the array only ever grows (no `pop` in the subset).
  let sp = 1
  while (sp > 0) {
    sp = sp - 1
    const frame = stack[sp]!
    // depthF mirrors the Int depth for the radius arithmetic.
    let depthF = 0.0
    for (let d = 0; d < frame.depth; d++) depthF = depthF + 1.0
    if (depthF >= levelsF || frame.children.length === 0) continue
    const order: number[] = []
    if (sortMode === 'desc') for (const i of orderByValue(frame.children)) order.push(i)
    else for (let i = 0; i < frame.children.length; i++) order.push(i)
    let total = 0.0
    let count = 0.0
    for (const i of order) {
      const v = nodeValue(frame.children[i]!)
      total = total + (v < 0.0 ? 0.0 : v)
      count = count + 1.0
    }
    const usable = frame.a1 - frame.a0 - pad * (count - 1.0)
    let cursor = frame.a0
    const pushed: SunburstFrame[] = []
    for (const idx of order) {
      const node = frame.children[idx]!
      const raw = nodeValue(node)
      const v = raw < 0.0 ? 0.0 : raw
      const span = total <= 0.0 || usable <= 0.0 ? 0.0 : usable * (v / total)
      const color = node.color ?? (frame.hasInherited ? frame.inherited : SUNBURST_PALETTE[idx % SUNBURST_PALETTE.length]!)
      const kids = node.children ?? []
      const cellPath: number[] = []
      for (const p of frame.path) cellPath.push(p)
      cellPath.push(idx)
      const r0 = innerR + ringW * depthF
      arcs.push({
        name: node.name,
        value: v,
        depth: frame.depth,
        path: cellPath,
        start: cursor,
        end: cursor + span,
        innerR: r0,
        outerR: r0 + ringW,
        color,
        leaf: kids.length === 0,
      })
      if (kids.length > 0) pushed.push({ children: kids, a0: cursor, a1: cursor + span, depth: frame.depth + 1, path: cellPath, inherited: color, hasInherited: true })
      cursor = cursor + span + pad
    }
    let pk = pushed.length - 1
    while (pk >= 0) {
      if (sp < stack.length) stack[sp] = pushed[pk]!
      else stack.push(pushed[pk]!)
      sp = sp + 1
      pk = pk - 1
    }
  }
  return arcs
}

/** Render the arcs around `center`: bands per ring, labels where the chord fits. */
export function renderSunburst(arcs: SunburstArc[], center: Pt, options?: SunburstOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const startAngle = options?.startAngle ?? -Math.PI / 2.0
  const limit = startAngle + SUNBURST_TAU * progress
  const showLabels = options?.showLabels ?? true
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#ffffff'
  const m: MeasureText = measure ?? approxTextWidth
  for (const a of arcs) {
    if (a.start >= limit || a.end <= a.start) continue
    const end = a.end < limit ? a.end : limit
    let depthF = 0.0
    for (let d = 0; d < a.depth; d++) depthF = depthF + 1.0
    const tintT = 0.2 + depthF * 0.15
    const fill = a.leaf ? a.color : tintHex(a.color, tintT > 0.5 ? 0.5 : tintT)
    out.push({ kind: 'polygon', points: arcPolygon(center, a.outerR, a.innerR, a.start, end), fill })
    if (showLabels && progress >= 1.0) {
      const midR = (a.innerR + a.outerR) / 2.0
      const chord = midR * (a.end - a.start)
      const tw = m(a.name, fontSize)
      if (chord >= tw + 4.0 && a.outerR - a.innerR >= fontSize + 4.0) {
        const mid = (a.start + a.end) / 2.0
        out.push({
          kind: 'text',
          text: a.name,
          at: { x: center.x + Math.cos(mid) * midR, y: center.y + Math.sin(mid) * midR },
          fill: labelColor,
          size: fontSize,
          align: 'middle',
          baseline: 'middle',
        })
      }
    }
  }
  return out
}

/** The DEEPEST arc containing a point, or null. */
/** Index of the deepest arc under the point, or -1 — what `onSelectIndex` receives. */
export function hitSunburstIndex(arcs: SunburstArc[], center: Pt, px: Double, py: Double): number {
  const dx = px - center.x
  const dy = py - center.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const ang = Math.atan2(dy, dx)
  let bestIdx = -1
  let bestDepth = -1
  for (let i = 0; i < arcs.length; i++) {
    const a = arcs[i]!
    if (dist < a.innerR || dist > a.outerR) continue
    let t = ang
    while (t < a.start) t = t + SUNBURST_TAU
    while (t >= a.start + SUNBURST_TAU) t = t - SUNBURST_TAU
    if (t > a.end) continue
    if (a.depth > bestDepth) {
      bestDepth = a.depth
      bestIdx = i
    }
  }
  return bestIdx
}

export function hitSunburst(arcs: SunburstArc[], center: Pt, px: Double, py: Double): SunburstArc | null {
  const i = hitSunburstIndex(arcs, center, px, py)
  return i < 0 ? null : arcs[i]!
}
