// Treemap geometry — squarified layout of a value hierarchy.
//
// Bruls / Huizing / van Wijk squarify: children are laid in rows so that the
// worst aspect ratio in the row stays as close to 1 as the greedy step allows.
// Output is a flat list of cells (one rect per node at every depth) so the
// renderer, the hit test and a native executor all consume the same thing.
// Written in the native subset and BUNDLED into the generated Swift/Kotlin
// engine: explicit work stacks with an index cursor (no `pop`), insertion
// sorts instead of comparator sorts, no spreads, no Infinity sentinels, no
// optional narrowing (every optional read goes through `??`); the svg half
// lives in family-svg.ts.

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

const TREEMAP_PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

/** A node's value: its own, else the sum of its children (iterative — a deep tree must not recurse). */
export function nodeValue(node: TreeNode): Double {
  if (node.value !== undefined) return node.value ?? 0.0
  let sum = 0.0
  const stack: TreeNode[] = []
  // sp is the live stack height; the array only ever grows (no `pop` in the subset).
  let sp = 0
  for (const c of node.children ?? []) {
    if (sp < stack.length) stack[sp] = c
    else stack.push(c)
    sp = sp + 1
  }
  while (sp > 0) {
    sp = sp - 1
    const cur = stack[sp]!
    const own = cur.value
    if (own !== undefined) sum = sum + (own ?? 0.0)
    else {
      for (const c of cur.children ?? []) {
        if (sp < stack.length) stack[sp] = c
        else stack.push(c)
        sp = sp + 1
      }
    }
  }
  return sum
}

/** Worst aspect ratio of a row laid along `side`; -1 when there is no row to measure. */
function worstRatio(row: Double[], side: Double, areaScale: Double): Double {
  if (row.length === 0 || side <= 0.0) return -1.0
  let sum = 0.0
  let maxA = 0.0
  let minA = -1.0
  for (const v of row) {
    const a = v * areaScale
    sum = sum + a
    if (a > maxA) maxA = a
    if (minA < 0.0 || a < minA) minA = a
  }
  if (sum <= 0.0 || minA <= 0.0) return -1.0
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
  for (let i = 0; i < values.length; i++) out.push({ x: rect.x, y: rect.y, w: 0.0, h: 0.0 })
  if (values.length === 0 || total <= 0.0 || rect.w <= 0.0 || rect.h <= 0.0) return out
  const areaScale = (rect.w * rect.h) / total
  let x = rect.x
  let y = rect.y
  let w = rect.w
  let h = rect.h
  let i = 0
  // One outer pass per ROW: the row arrays are fresh per pass (no array
  // reassignment in the subset); the inner loop extends the row while the
  // worst aspect ratio keeps improving, then the row is laid along the
  // shorter side of what is left.
  while (i < values.length) {
    const row: Double[] = []
    const rowIdx: number[] = []
    let grow = true
    while (grow && i < values.length) {
      const v = values[i]!
      const side = w >= h ? h : w
      if (row.length > 0) {
        const before = worstRatio(row, side, areaScale)
        const candidate: Double[] = []
        for (const r of row) candidate.push(r)
        candidate.push(v)
        const after = worstRatio(candidate, side, areaScale)
        if (before >= 0.0 && after > before) grow = false
      }
      if (grow) {
        row.push(v)
        rowIdx.push(i)
        i = i + 1
      }
    }
    let rowSum = 0.0
    for (const v of row) rowSum = rowSum + v * areaScale
    const vertical = w >= h
    const side = vertical ? h : w
    const thick = side <= 0.0 ? 0.0 : rowSum / side
    let offset = 0.0
    for (let k = 0; k < row.length; k++) {
      const a = row[k]! * areaScale
      const len = thick <= 0.0 ? 0.0 : a / thick
      const target = rowIdx[k]!
      if (vertical) out[target] = { x, y: y + offset, w: thick, h: len }
      else out[target] = { x: x + offset, y, w: len, h: thick }
      offset = offset + len
    }
    if (vertical) {
      x = x + thick
      w = w - thick
    } else {
      y = y + thick
      h = h - thick
    }
  }
  return out
}

/** Child indices sorted by value, descending (insertion sort — tiny n, lowers cleanly). */
export function orderByValue(children: TreeNode[]): number[] {
  const order: number[] = []
  const vals: Double[] = []
  for (let i = 0; i < children.length; i++) {
    order.push(i)
    vals.push(nodeValue(children[i]!))
  }
  for (let i = 1; i < order.length; i++) {
    const cur = order[i]!
    const cv = vals[cur]!
    let j = i - 1
    while (j >= 0) {
      if (vals[order[j]!]! >= cv) break
      order[j + 1] = order[j]!
      j = j - 1
    }
    order[j + 1] = cur
  }
  return order
}

interface TreemapFrame {
  children: TreeNode[]
  area: Rect
  depth: number
  path: number[]
  inherited: string
  hasInherited: boolean
}

/** Lay out the whole hierarchy into flat cells (parents before children). */
export function layoutTreemap(nodes: TreeNode[], rect: Rect, options?: TreemapOptions): TreemapCell[] {
  const cells: TreemapCell[] = []
  const padding = options?.padding ?? 2.0
  const maxDepth = options?.maxDepth ?? 64.0
  const stack: TreemapFrame[] = []
  stack.push({ children: nodes, area: rect, depth: 0, path: [], inherited: '', hasInherited: false })
  // The live stack height; the array only ever grows (no `pop` in the subset).
  let sp = 1
  while (sp > 0) {
    sp = sp - 1
    const frame = stack[sp]!
    // depthF mirrors the Int depth as a Double for the maxDepth comparison.
    let depthF = 0.0
    for (let d = 0; d < frame.depth; d++) depthF = depthF + 1.0
    if (depthF >= maxDepth || frame.children.length === 0) continue
    const order = orderByValue(frame.children)
    const values: Double[] = []
    for (const i of order) {
      const v = nodeValue(frame.children[i]!)
      values.push(v < 0.0 ? 0.0 : v)
    }
    const rects = squarify(values, frame.area)
    // Children go on the stack in REVERSE draw order so they come off in order —
    // parents stay before their children in the output, as the renderer expects.
    const pushed: TreemapFrame[] = []
    for (let k = 0; k < order.length; k++) {
      const idx = order[k]!
      const node = frame.children[idx]!
      const r = rects[k]!
      const color = node.color ?? (frame.hasInherited ? frame.inherited : TREEMAP_PALETTE[idx % TREEMAP_PALETTE.length]!)
      const kids = node.children ?? []
      const cellPath: number[] = []
      for (const p of frame.path) cellPath.push(p)
      cellPath.push(idx)
      cells.push({ name: node.name, value: values[k]!, rect: r, depth: frame.depth, path: cellPath, color, leaf: kids.length === 0 })
      if (kids.length > 0) {
        const innerW = r.w - padding * 2.0
        const innerH = r.h - padding * 2.0
        pushed.push({
          children: kids,
          area: { x: r.x + padding, y: r.y + padding, w: innerW < 0.0 ? 0.0 : innerW, h: innerH < 0.0 ? 0.0 : innerH },
          depth: frame.depth + 1,
          path: cellPath,
          inherited: color,
          hasInherited: true,
        })
      }
    }
    let pk = pushed.length - 1
    while (pk >= 0) {
      if (sp < stack.length) stack[sp] = pushed[pk]!
      else stack.push(pushed[pk]!)
      sp = sp + 1
      pk = pk - 1
    }
  }
  return cells
}

/** One hex digit's value from its char code (0 for anything else). */
function hexDigit(c: Double): Double {
  if (c >= 48.0 && c <= 57.0) return c - 48.0
  if (c >= 97.0 && c <= 102.0) return c - 87.0
  if (c >= 65.0 && c <= 70.0) return c - 55.0
  return 0.0
}

/** The channel at `at` of a `#rrggbb` string as 0..255 (0 when malformed). */
function hexPair(hex: string, at: number): Double {
  if (hex.length < at + 2) return 0.0
  return hexDigit(hex.charCodeAt(at)) * 16.0 + hexDigit(hex.charCodeAt(at + 1))
}

/** Lighten a colour toward white by `t` (0..1) — deeper levels read as nested, not stacked. */
export function tintHex(hex: string, t: Double): string {
  if (hex.length < 7) return hex
  const r = Math.round(hexPair(hex, 1) + (255.0 - hexPair(hex, 1)) * t)
  const g = Math.round(hexPair(hex, 3) + (255.0 - hexPair(hex, 3)) * t)
  const b = Math.round(hexPair(hex, 5) + (255.0 - hexPair(hex, 5)) * t)
  // A template literal, like the crossed colour ramp: the rounded channels interpolate as integers on every target.
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Text width without a canvas: the same per-character units `measureApprox`
 * uses (digits narrower than letters, separators narrower still) at its
 * default 0.52 em ratio — written with `charCodeAt` so it lowers natively.
 */
export function approxTextWidth(text: string, fontSize: Double): Double {
  let units = 0.0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 48.0 && c <= 57.0) units = units + 0.9
    else if (c === 46.0 || c === 44.0 || c === 32.0) units = units + 0.45
    else units = units + 1.0
  }
  return units * fontSize * 0.52
}

/** Render the cells: fills per depth, labels where they fit. */
export function renderTreemap(cells: TreemapCell[], options?: TreemapOptions, measure?: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const showLabels = options?.showLabels ?? true
  const fontSize = options?.fontSize ?? 11.0
  const labelColor = options?.labelColor ?? '#ffffff'
  const m: MeasureText = measure ?? approxTextWidth
  for (const c of cells) {
    const w = c.rect.w * progress
    const h = c.rect.h * progress
    const x = c.rect.x + (c.rect.w - w) / 2.0
    const y = c.rect.y + (c.rect.h - h) / 2.0
    // depthF mirrors the Int depth as a Double for the tint arithmetic.
    let depthF = 0.0
    for (let d = 0; d < c.depth; d++) depthF = depthF + 1.0
    const tintT = 0.35 + depthF * 0.15
    out.push({ kind: 'rect', rect: { x, y, w, h }, fill: c.leaf ? c.color : tintHex(c.color, tintT > 0.6 ? 0.6 : tintT) })
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
/** Index of the deepest cell under the point, or -1 — what `onSelectIndex` receives. */
export function hitTreemapIndex(cells: TreemapCell[], px: Double, py: Double): number {
  let bestIdx = -1
  let bestDepth = -1
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!
    const r = c.rect
    if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue
    if (c.depth > bestDepth) {
      bestDepth = c.depth
      bestIdx = i
    }
  }
  return bestIdx
}

export function hitTreemap(cells: TreemapCell[], px: Double, py: Double): TreemapCell | null {
  const i = hitTreemapIndex(cells, px, py)
  return i < 0 ? null : cells[i]!
}
