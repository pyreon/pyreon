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

import { isFiniteNumber } from './scale'
import type { Double, DrawCmd, MeasureText, Rect } from './types'
import { truncateLabel } from './pie-labels'
import { DEFAULT_PALETTE, hexDigit, paletteAt } from './palette'

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
  /** Series colours for nodes without one; defaults to the theme palette. */
  palette?: readonly string[] | undefined
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


/** A node's value: its own, else the sum of its children (iterative — a deep tree must not recurse). */
export function nodeValue(node: TreeNode): Double {
  /* v8 ignore next — the `?? 0.0` arm is unreachable on the web: the test
     already established the value is not undefined. It unwraps the optional
     for the native emit, where that test does not narrow. */
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
    /* v8 ignore next — same unreachable native unwrap as `nodeValue`'s own
       first line: `own` is known defined here. */
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
  const palette = options?.palette ?? DEFAULT_PALETTE
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
      const color = node.color ?? (frame.hasInherited ? frame.inherited : paletteAt(palette, idx))
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

/** The DEEPEST cell containing a point, or null. */
export function hitTreemap(cells: TreemapCell[], px: Double, py: Double): TreemapCell | null {
  const i = hitTreemapIndex(cells, px, py)
  return i < 0 ? null : cells[i]!
}

// ---- the ECharts treemap (the option path) ----
//
// A port of ECharts 6's `treemapLayout.js` (`squarify`, `initChildren`,
// `filterByThreshold`, `worst`, `position`), differential-tested against the
// layouts ECharts' own model computes (echarts-differential.test.ts).
// `<TreemapChart>`'s props keep the simpler layout above.

/**
 * A treemap node with its ECharts styling already resolved (own `itemStyle`
 * / `upperLabel`, else `levels[depth]`, else the series). A NaN threshold
 * means none. `value` is ECharts' completed value: the node's own, else the
 * sum of its children, never below zero.
 */
export interface TreemapEcNode {
  name: string
  value: Double
  color: string
  children: TreemapEcNode[]
  borderWidth: Double
  gapWidth: Double
  /** The upper label band's height when `upperLabel.show`, else 0. */
  upperLabelHeight: Double
  visibleMin: Double
  childrenVisibleMin: Double
}

export interface TreemapEcConfig {
  /** Target aspect ratio of the cells (ECharts' golden ratio by default). */
  squareRatio: Double
  /** 'desc', 'asc', or '' for input order. */
  sort: string
  /** Levels drawn below the root; NaN = all. */
  leafDepth: Double
}

/** ECharts' `worst`: how far a row of cells strays from the square ratio. */
function treemapWorst(areas: Double[], rowArea: Double, fixed: Double, ratio: Double): Double {
  let areaMax = 0.0
  let areaMin = 1.0 / 0.0
  for (const a of areas) {
    if (a !== 0.0) {
      if (a < areaMin) areaMin = a
      if (a > areaMax) areaMax = a
    }
  }
  const squareArea = rowArea * rowArea
  const f = fixed * fixed * ratio
  if (squareArea === 0.0) return 1.0 / 0.0
  const a1 = (f * areaMax) / squareArea
  const a2 = squareArea / (f * areaMin)
  return a1 > a2 ? a1 : a2
}

/** A frame of the layout's work stack: a node, its absolute rect, and how it was reached. */
interface TreemapEcFrame {
  node: TreemapEcNode
  rect: Rect
  depth: number
  path: number[]
  hide: boolean
}

/**
 * Lay an ECharts treemap out: `root` (the series itself, whose children are the
 * top-level data) fills `box`. Every visible node comes back, parents before
 * their children.
 */
export function layoutTreemapEc(root: TreemapEcNode, box: Rect, cfg: TreemapEcConfig): TreemapCell[] {
  // `TreemapCell`, counted from the series root (depth 0, empty path);
  // `treemapEcCells` drops the root for `<TreemapChart>`.
  const out: TreemapCell[] = []
  const stack: TreemapEcFrame[] = []
  stack.push({ node: root, rect: box, depth: 0, path: [], hide: false })
  let sp = 1
  while (sp > 0) {
    sp = sp - 1
    const frame = stack[sp]!
    const node = frame.node
    const halfGap = node.gapWidth / 2.0
    const upperHeight = node.borderWidth > node.upperLabelHeight ? node.borderWidth : node.upperLabelHeight
    const offset = node.borderWidth - halfGap
    const offsetUpper = upperHeight - halfGap
    const w0 = frame.rect.w - 2.0 * offset
    const h0 = frame.rect.h - offset - offsetUpper
    const width = w0 > 0.0 ? w0 : 0.0
    const height = h0 > 0.0 ? h0 : 0.0
    const totalArea = width * height
    // `initChildren`: which children are laid out, in what order, with what area.
    const overLeafDepth = isFiniteNumber(cfg.leafDepth) && cfg.leafDepth <= countDepth(frame.depth)
    const kids: number[] = []
    if (!(frame.hide && !overLeafDepth)) {
      for (let i = 0; i < node.children.length; i++) kids.push(i)
      if (cfg.sort === 'desc' || cfg.sort === 'asc') {
        // Insertion sort; ties go by input index — descending for 'desc', as ECharts' comparator does.
        for (let i = 1; i < kids.length; i++) {
          const cur = kids[i]!
          let j = i - 1
          while (j >= 0) {
            const a = node.children[kids[j]!]!.value
            const b = node.children[cur]!.value
            const swap = cfg.sort === 'asc' ? a > b || (a === b && kids[j]! > cur) : a < b || (a === b && kids[j]! < cur)
            if (!swap) break
            kids[j + 1] = kids[j]!
            j = j - 1
          }
          kids[j + 1] = cur
        }
      }
    }
    let sum = 0.0
    for (const k of kids) sum = sum + node.children[k]!.value
    // `filterByThreshold`: with a sort, the smallest children under `visibleMin` pixels² drop out.
    let visible: number[] = kids
    if (sum > 0.0 && (cfg.sort === 'desc' || cfg.sort === 'asc') && isFiniteNumber(node.visibleMin)) {
      const n = kids.length
      let deletePoint = n
      for (let i = n - 1; i >= 0; i--) {
        const value = node.children[kids[cfg.sort === 'asc' ? n - i - 1 : i]!]!.value
        if ((value / sum) * totalArea < node.visibleMin) {
          deletePoint = i
          sum = sum - value
        }
      }
      const kept: number[] = []
      if (cfg.sort === 'asc') {
        for (let i = n - deletePoint; i < n; i++) kept.push(kids[i]!)
      } else {
        for (let i = 0; i < deletePoint; i++) kept.push(kids[i]!)
      }
      visible = kept
    }
    const laidOut = sum > 0.0 && !overLeafDepth && visible.length > 0
    out.push({ path: frame.path, depth: frame.depth, rect: frame.rect, name: node.name, value: node.value, color: node.color, leaf: !laidOut })
    if (!laidOut) continue
    const areas: Double[] = []
    for (const k of visible) areas.push((node.children[k]!.value / sum) * totalArea)
    // `squarify`: rows along the shorter side, each closed when adding a cell makes it worse.
    const rects: Rect[] = []
    for (let i = 0; i < visible.length; i++) rects.push({ x: 0.0, y: 0.0, w: 0.0, h: 0.0 })
    let rx = frame.rect.x + offset
    let ry = frame.rect.y + offsetUpper
    let rw = width
    let rh = height
    let fixed = rw < rh ? rw : rh
    let best = 1.0 / 0.0
    let rowStart = 0
    let rowArea = 0.0
    let i = 0
    while (i <= visible.length) {
      const closing = i === visible.length
      let accept = false
      if (!closing) {
        const trial: Double[] = []
        for (let q = rowStart; q <= i; q++) trial.push(areas[q]!)
        const score = treemapWorst(trial, rowArea + areas[i]!, fixed, cfg.squareRatio)
        if (score <= best) {
          accept = true
          best = score
          rowArea = rowArea + areas[i]!
          i = i + 1
        }
      }
      if (accept) continue
      if (i === rowStart) break
      // `position`: lay the row [rowStart, i) along the fixed side.
      const alongX = fixed === rw
      let rowOther = fixed !== 0.0 ? rowArea / fixed : 0.0
      const across = alongX ? rh : rw
      if (closing || rowOther > across) rowOther = across
      let last = alongX ? rx : ry
      const end = alongX ? rx + rw : ry + rh
      for (let q = rowStart; q < i; q++) {
        const step = rowOther !== 0.0 ? areas[q]! / rowOther : 0.0
        const wh1raw = rowOther - 2.0 * halfGap
        const wh1 = wh1raw > 0.0 ? wh1raw : 0.0
        const remain = end - last
        const mod = q === i - 1 || remain < step ? remain : step
        const wh0raw = mod - 2.0 * halfGap
        const wh0 = wh0raw > 0.0 ? wh0raw : 0.0
        const off1 = halfGap < wh1 / 2.0 ? halfGap : wh1 / 2.0
        const off0 = halfGap < wh0 / 2.0 ? halfGap : wh0 / 2.0
        if (alongX) rects[q] = { x: last + off0, y: ry + off1, w: wh0, h: wh1 }
        else rects[q] = { x: rx + off1, y: last + off0, w: wh1, h: wh0 }
        last = last + mod
      }
      if (alongX) {
        ry = ry + rowOther
        rh = rh - rowOther
      } else {
        rx = rx + rowOther
        rw = rw - rowOther
      }
      if (closing) break
      fixed = rw < rh ? rw : rh
      best = 1.0 / 0.0
      rowStart = i
      rowArea = 0.0
    }
    // `childrenVisibleMin`: a parent too small hides its grandchildren.
    const hideNext = frame.hide || (isFiniteNumber(node.childrenVisibleMin) && totalArea < node.childrenVisibleMin)
    // Pushed in reverse so the first child pops (and appears) first.
    for (let q = visible.length - 1; q >= 0; q--) {
      const k = visible[q]!
      const path: number[] = []
      for (const p of frame.path) path.push(p)
      path.push(k)
      const f: TreemapEcFrame = { node: node.children[k]!, rect: rects[q]!, depth: frame.depth + 1, path, hide: hideNext }
      if (sp < stack.length) stack[sp] = f
      else stack.push(f)
      sp = sp + 1
    }
  }
  return out
}

/** A depth as a Double, for comparing with `leafDepth` (the native targets will not mix Int into Double math). */
function countDepth(d: number): Double {
  let f = 0.0
  for (let i = 0; i < d; i++) f = f + 1.0
  return f
}

/**
 * The ECharts layout as `TreemapCell`s, the way `<TreemapChart>` counts: the
 * series root dropped, depth 0 the top level. A node without a colour takes
 * the palette's (top level) or its parent's.
 */
export function treemapEcCells(root: TreemapEcNode, box: Rect, cfg: TreemapEcConfig, palette: readonly string[]): TreemapCell[] {
  const out: TreemapCell[] = []
  // The colour at each depth of the current branch, the root's at 0: cells come parents first.
  const colors: string[] = ['']
  for (const c of layoutTreemapEc(root, box, cfg)) {
    if (c.depth === 0) continue
    const inherited = c.depth === 1 ? (palette.length === 0 ? '#5070dd' : palette[c.path[0]! % palette.length]!) : colors[c.depth - 1]!
    const color = c.color !== '' ? c.color : inherited
    if (c.depth < colors.length) colors[c.depth] = color
    else colors.push(color)
    out.push({ name: c.name, value: c.value, rect: c.rect, depth: c.depth - 1, path: c.path, color, leaf: c.leaf })
  }
  return out
}

/**
 * Draw an ECharts treemap: the series box and every parent as a background in
 * `borderColor` (which the gaps and borders show through), each leaf in its
 * colour, and each leaf's name centred in it, truncated to fit, as ECharts
 * labels a leaf. `progress` (0..1) grows the leaves from their centres.
 */
export function renderTreemapEc(cells: TreemapCell[], box: Rect, borderColor: string, labelColor: string, fontSize: Double, showLabels: boolean, progress: Double, measure: MeasureText): DrawCmd[] {
  const out: DrawCmd[] = []
  const p = progress < 0.0 ? 0.0 : progress > 1.0 ? 1.0 : progress
  out.push({ kind: 'rect', rect: box, fill: borderColor })
  for (const c of cells) {
    if (!c.leaf) {
      out.push({ kind: 'rect', rect: c.rect, fill: borderColor })
      continue
    }
    const w = c.rect.w * p
    const h = c.rect.h * p
    out.push({ kind: 'rect', rect: { x: c.rect.x + (c.rect.w - w) / 2.0, y: c.rect.y + (c.rect.h - h) / 2.0, w, h }, fill: c.color })
  }
  if (!showLabels || p < 1.0) return out
  for (const c of cells) {
    if (!c.leaf || c.rect.h < fontSize) continue
    const text = truncateLabel(c.name, c.rect.w, fontSize, measure)
    if (text === '') continue
    out.push({ kind: 'text', text, at: { x: c.rect.x + c.rect.w / 2.0, y: c.rect.y + c.rect.h / 2.0 }, fill: labelColor, size: fontSize, align: 'middle', baseline: 'middle' })
  }
  return out
}

/** A treemap parent's background: its `borderColor`, else the chart's background, else white (ECharts' default). */
export function treemapGround(borderColor: string, background: string): string {
  if (borderColor !== '') return borderColor
  return background !== '' ? background : '#ffffff'
}
