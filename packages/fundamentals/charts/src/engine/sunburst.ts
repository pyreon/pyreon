// Sunburst geometry — radial partition of a value hierarchy.
//
// Each depth is a ring; each node's angular span is its share of its parent's
// span. Output is a flat list of arcs so the renderer, the hit test and a
// native executor all consume the same thing (the treemap's radial twin).

import { arcPolygon } from './arc'
import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import { nodeValue } from './treemap'
import type { TreeNode } from './treemap'
import type { Double, DrawCmd, MeasureText, Pt } from './types'

const TAU = Math.PI * 2.0
const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

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

/** Number of levels in the hierarchy (0 for no nodes). */
export function treeDepth(nodes: TreeNode[]): number {
  let deepest = 0
  for (const n of nodes) {
    const d = 1 + treeDepth(n.children ?? [])
    if (d > deepest) deepest = d
  }
  return deepest
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
  const levels = rawLevels < maxDepth ? rawLevels : maxDepth
  if (levels <= 0) return arcs
  const ringW = (outerR - innerR) / levels
  const pad = options?.padAngle ?? 0.0
  const sortMode = options?.sort ?? 'desc'
  const walk = (children: TreeNode[], a0: Double, a1: Double, depth: number, path: number[], inherited: string | undefined): void => {
    if (depth >= levels || children.length === 0) return
    const order: number[] = []
    for (let i = 0; i < children.length; i++) order.push(i)
    if (sortMode === 'desc') order.sort((a, b) => nodeValue(children[b]!) - nodeValue(children[a]!))
    let total = 0.0
    for (const i of order) total = total + Math.max(0.0, nodeValue(children[i]!))
    const usable = a1 - a0 - pad * (order.length - 1)
    let cursor = a0
    for (const idx of order) {
      const node = children[idx]!
      const v = Math.max(0.0, nodeValue(node))
      const span = total <= 0.0 || usable <= 0.0 ? 0.0 : usable * (v / total)
      const color = node.color ?? inherited ?? PALETTE[idx % PALETTE.length]!
      const kids = node.children ?? []
      const cellPath = [...path, idx]
      const r0 = innerR + ringW * depth
      arcs.push({
        name: node.name,
        value: v,
        depth,
        path: cellPath,
        start: cursor,
        end: cursor + span,
        innerR: r0,
        outerR: r0 + ringW,
        color,
        leaf: kids.length === 0,
      })
      if (kids.length > 0) walk(kids, cursor, cursor + span, depth + 1, cellPath, color)
      cursor = cursor + span + pad
    }
  }
  walk(nodes, options?.startAngle ?? -Math.PI / 2.0, (options?.startAngle ?? -Math.PI / 2.0) + TAU, 0, [], undefined)
  return arcs
}

/** Lighten toward white so deeper rings read as nested, not stacked. */
function tint(hex: string, t: Double): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  if (h.length < 6) return hex
  const ch = (at: number): number => parseInt(h.slice(at, at + 2), 16)
  const mix = (c: number): number => Math.round(c + (255 - c) * t)
  return `rgb(${mix(ch(0))}, ${mix(ch(2))}, ${mix(ch(4))})`
}

/** Render the arcs around `center`: bands per ring, labels where the chord fits. */
export function renderSunburst(arcs: SunburstArc[], center: Pt, options?: SunburstOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const startAngle = options?.startAngle ?? -Math.PI / 2.0
  const limit = startAngle + TAU * progress
  const showLabels = options?.showLabels ?? true
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#ffffff'
  const m = measure ?? measureApprox()
  for (const a of arcs) {
    if (a.start >= limit || a.end <= a.start) continue
    const end = a.end < limit ? a.end : limit
    const fill = a.leaf ? a.color : tint(a.color, Math.min(0.5, 0.2 + a.depth * 0.15))
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
export function hitSunburst(arcs: SunburstArc[], center: Pt, px: Double, py: Double): SunburstArc | null {
  const dx = px - center.x
  const dy = py - center.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const ang = Math.atan2(dy, dx)
  let best: SunburstArc | null = null
  for (const a of arcs) {
    if (dist < a.innerR || dist > a.outerR) continue
    let t = ang
    while (t < a.start) t = t + TAU
    while (t >= a.start + TAU) t = t - TAU
    if (t > a.end) continue
    if (best === null || a.depth > best.depth) best = a
  }
  return best
}

export interface SunburstToSvgOptions {
  data: TreeNode[]
  width?: Double
  height?: Double
  /** Hole radius as a fraction of the outer radius (0 = full disc). */
  innerRatio?: Double
  sunburst?: SunburstOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Sunburst → `<svg>` string, server-safe. */
export function sunburstToSvg(options: SunburstToSvgOptions): string {
  const width = options.width ?? 480.0
  const height = options.height ?? 480.0
  const center: Pt = { x: width / 2.0, y: height / 2.0 }
  const outerR = Math.max(0.0, Math.min(width, height) / 2.0 - 4.0)
  const innerR = outerR * (options.innerRatio ?? 0.2)
  const arcs = layoutSunburst(options.data, innerR, outerR, options.sunburst)
  const cmds = renderSunburst(arcs, center, options.sunburst, options.measure ?? measureApprox())
  const leaves = arcs.filter((a) => a.leaf)
  const description =
    options.description ??
    (options.title !== undefined
      ? `${options.title}: ${treeDepth(options.data)} levels, ${leaves.length} leaves.`
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
