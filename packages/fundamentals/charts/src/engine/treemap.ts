// Treemap geometry — squarified layout of a value hierarchy.
//
// Bruls / Huizing / van Wijk squarify: children are laid in rows so that the
// worst aspect ratio in the row stays as close to 1 as the greedy step allows.
// Output is a flat list of cells (one rect per node at every depth) so the
// renderer, the hit test and a native executor all consume the same thing.

import { measureApprox, renderSvg } from './svg'
import type { SvgOptions } from './svg'
import type { Double, DrawCmd, MeasureText, Rect } from './types'

export interface TreeNode {
  name: string
  /** Leaf value; a parent's value is the sum of its children when absent. */
  value?: Double | undefined
  children?: TreeNode[] | undefined
  color?: string | undefined
}

export interface TreemapCell {
  name: string
  value: Double
  rect: Rect
  depth: number
  /** Path of child indices from the root — stable identity for selection. */
  path: number[]
  color: string
  /** True for a node without children. */
  leaf: boolean
}

export interface TreemapOptions {
  /** Inner padding around a parent's children, in pixels. */
  padding?: Double | undefined
  /** Only lay out this many levels (1 = top level only). */
  maxDepth?: Double | undefined
  showLabels?: boolean | undefined
  labelColor?: string | undefined
  fontSize?: Double | undefined
  /** Entrance progress 0..1; cells scale from their centres. */
  progress?: Double | undefined
}

const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

/** A node's value: its own, else the sum of its children. */
export function nodeValue(node: TreeNode): Double {
  if (node.value !== undefined) return node.value
  let sum = 0.0
  for (const c of node.children ?? []) sum = sum + nodeValue(c)
  return sum
}

function worst(row: Double[], side: Double, total: Double, areaScale: Double): Double {
  if (row.length === 0 || side <= 0.0) return Infinity
  let sum = 0.0
  let maxA = 0.0
  let minA = Infinity
  for (const v of row) {
    const a = v * areaScale
    sum = sum + a
    if (a > maxA) maxA = a
    if (a < minA) minA = a
  }
  void total
  const s2 = side * side
  const r1 = (s2 * maxA) / (sum * sum)
  const r2 = (sum * sum) / (s2 * minA)
  return r1 > r2 ? r1 : r2
}

/** Squarify one level: values (already sorted descending) into `rect`. */
function squarify(values: Double[], rect: Rect): Rect[] {
  const out: Rect[] = []
  let total = 0.0
  for (const v of values) total = total + v
  if (values.length === 0 || total <= 0.0 || rect.w <= 0.0 || rect.h <= 0.0) {
    for (let i = 0; i < values.length; i++) out.push({ x: rect.x, y: rect.y, w: 0.0, h: 0.0 })
    return out
  }
  const areaScale = (rect.w * rect.h) / total
  let x = rect.x
  let y = rect.y
  let w = rect.w
  let h = rect.h
  let row: Double[] = []
  let rowIdx: number[] = []
  const layoutRow = (): void => {
    let rowSum = 0.0
    for (const v of row) rowSum = rowSum + v * areaScale
    const vertical = w >= h
    const side = vertical ? h : w
    const thick = side <= 0.0 ? 0.0 : rowSum / side
    let offset = 0.0
    for (let k = 0; k < row.length; k++) {
      const a = row[k]! * areaScale
      const len = thick <= 0.0 ? 0.0 : a / thick
      const r: Rect = vertical
        ? { x, y: y + offset, w: thick, h: len }
        : { x: x + offset, y, w: len, h: thick }
      out[rowIdx[k]!] = r
      offset = offset + len
    }
    if (vertical) {
      x = x + thick
      w = w - thick
    } else {
      y = y + thick
      h = h - thick
    }
    row = []
    rowIdx = []
  }
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    const side = w >= h ? h : w
    if (row.length > 0) {
      const before = worst(row, side, total, areaScale)
      const candidate = [...row, v]
      const after = worst(candidate, side, total, areaScale)
      if (after > before) layoutRow()
    }
    row.push(v)
    rowIdx.push(i)
  }
  if (row.length > 0) layoutRow()
  return out
}

/** Lay out the whole hierarchy into flat cells (parents before children). */
export function layoutTreemap(nodes: TreeNode[], rect: Rect, options?: TreemapOptions): TreemapCell[] {
  const cells: TreemapCell[] = []
  const padding = options?.padding ?? 2.0
  const maxDepth = options?.maxDepth ?? 64.0
  const walk = (children: TreeNode[], area: Rect, depth: number, path: number[], inherited: string | undefined): void => {
    if (depth >= maxDepth || children.length === 0) return
    const order: number[] = []
    for (let i = 0; i < children.length; i++) order.push(i)
    order.sort((a, b) => nodeValue(children[b]!) - nodeValue(children[a]!))
    const values = order.map((i) => Math.max(0.0, nodeValue(children[i]!)))
    const rects = squarify(values, area)
    for (let k = 0; k < order.length; k++) {
      const idx = order[k]!
      const node = children[idx]!
      const r = rects[k]!
      const color = node.color ?? inherited ?? PALETTE[idx % PALETTE.length]!
      const kids = node.children ?? []
      const cellPath = [...path, idx]
      cells.push({ name: node.name, value: values[k]!, rect: r, depth, path: cellPath, color, leaf: kids.length === 0 })
      if (kids.length > 0) {
        const inner: Rect = {
          x: r.x + padding,
          y: r.y + padding,
          w: Math.max(0.0, r.w - padding * 2.0),
          h: Math.max(0.0, r.h - padding * 2.0),
        }
        walk(kids, inner, depth + 1, cellPath, color)
      }
    }
  }
  walk(nodes, rect, 0, [], undefined)
  return cells
}

/** Lighten a colour toward white by `t` (0..1) — deeper levels read as nested, not stacked. */
function tint(hex: string, t: Double): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  if (h.length < 6) return hex
  const ch = (at: number): number => parseInt(h.slice(at, at + 2), 16)
  const mix = (c: number): number => Math.round(c + (255 - c) * t)
  return `rgb(${mix(ch(0))}, ${mix(ch(2))}, ${mix(ch(4))})`
}

/** Render the cells: fills per depth, labels where they fit. */
export function renderTreemap(cells: TreemapCell[], options?: TreemapOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const showLabels = options?.showLabels ?? true
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#ffffff'
  const m = measure ?? measureApprox()
  for (const c of cells) {
    const w = c.rect.w * progress
    const h = c.rect.h * progress
    const x = c.rect.x + (c.rect.w - w) / 2.0
    const y = c.rect.y + (c.rect.h - h) / 2.0
    out.push({ kind: 'rect', rect: { x, y, w, h }, fill: c.leaf ? c.color : tint(c.color, Math.min(0.6, 0.35 + c.depth * 0.15)) })
    if (showLabels && progress >= 1.0 && c.leaf) {
      const tw = m(c.name, fontSize)
      if (tw + 8.0 <= c.rect.w && fontSize + 6.0 <= c.rect.h) {
        out.push({
          kind: 'text',
          text: c.name,
          at: { x: c.rect.x + 4.0, y: c.rect.y + 4.0 },
          fill: labelColor,
          size: fontSize,
          align: 'start',
          baseline: 'top',
        })
      }
    }
  }
  return out
}

/** The DEEPEST cell containing a point, or null. */
export function hitTreemap(cells: TreemapCell[], px: Double, py: Double): TreemapCell | null {
  let best: TreemapCell | null = null
  for (const c of cells) {
    const r = c.rect
    if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue
    if (best === null || c.depth > best.depth) best = c
  }
  return best
}

export interface TreemapToSvgOptions {
  data: TreeNode[]
  width?: Double
  height?: Double
  treemap?: TreemapOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

/** Treemap → `<svg>` string, server-safe. */
export function treemapToSvg(options: TreemapToSvgOptions): string {
  const width = options.width ?? 640.0
  const height = options.height ?? 400.0
  const cells = layoutTreemap(options.data, { x: 0.0, y: 0.0, w: width, h: height }, options.treemap)
  const cmds = renderTreemap(cells, options.treemap, options.measure ?? measureApprox())
  const leaves = cells.filter((c) => c.leaf)
  const description =
    options.description ??
    (options.title !== undefined
      ? `${options.title}: ${leaves.length} leaves, largest ${leaves.length > 0 ? leaves.reduce((a, b) => (b.value > a.value ? b : a)).name : 'none'}.`
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
