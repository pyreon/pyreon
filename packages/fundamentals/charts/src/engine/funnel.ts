// Funnel geometry — a stack of trapezoids whose widths follow the values.
//
// Pure functions to flat commands, like everything else here: a funnel is
// polygons plus labels, which every backend already executes, so the family
// is free on native. Written in the native subset (Double-only math, no
// closures in structs, no early returns inside lambdas) and BUNDLED into the
// generated Swift/Kotlin engine — the svg half lives in family-svg.ts, which
// is not.

import { autoLabelStyle } from './labels'
import { isFiniteNumber } from './scale'
import type { Double, DrawCmd, Pt, Rect } from './types'

export interface FunnelStage {
  value: Double
  label: string
  color: string
}

export interface FunnelOptions {
  /** Vertical gap between stages, in pixels. */
  gap?: Double | undefined
  /** Narrowest stage width as a fraction of the widest (0..1); 0 = to a point. */
  minWidthRatio?: Double | undefined
  /** 'descending' sorts by value (the classic funnel); 'none' keeps input order. */
  sort?: 'descending' | 'ascending' | 'none' | undefined
  /** Horizontal alignment of the stack inside the plot. */
  align?: 'center' | 'left' | 'right' | undefined
  showLabels?: boolean | undefined
  labelColor?: string | undefined
  fontSize?: Double | undefined
  /** Entrance progress 0..1; stages grow from their centre lines. */
  progress?: Double | undefined
}

export interface FunnelStageGeometry {
  /** Index into the INPUT stages (sorting reorders drawing, not identity). */
  index: number
  top: Double
  bottom: Double
  topWidth: Double
  bottomWidth: Double
  centerX: Double
}

/** Lay the stages out top to bottom. Pure; the geometry the renderer and a hit test share. */
export function layoutFunnel(stages: FunnelStage[], plot: Rect, options?: FunnelOptions): FunnelStageGeometry[] {
  const out: FunnelStageGeometry[] = []
  const n = stages.length
  if (n === 0) return out
  const gap = options?.gap ?? 2.0
  const rawMin = options?.minWidthRatio ?? 0.0
  const minRatio = rawMin < 0.0 ? 0.0 : rawMin > 1.0 ? 1.0 : rawMin
  const sort = options?.sort ?? 'descending'
  const align = options?.align ?? 'center'
  // Draw order: an index permutation, so the output still names INPUT indices.
  const order: number[] = []
  // nf mirrors n as a Double: the stage height divides a pixel length by the
  // count, and Swift will not mix an Int count into Double arithmetic.
  let nf = 0.0
  for (let i = 0; i < n; i++) {
    order.push(i)
    nf = nf + 1.0
  }
  if (sort !== 'none') {
    // Insertion sort — tiny n, and it lowers cleanly.
    for (let i = 1; i < n; i++) {
      const cur = order[i]!
      let j = i - 1
      while (j >= 0) {
        const a = stages[order[j]!]!.value
        const b = stages[cur]!.value
        const swap = sort === 'descending' ? a < b : a > b
        if (!swap) break
        order[j + 1] = order[j]!
        j = j - 1
      }
      order[j + 1] = cur
    }
  }
  let maxV = 0.0
  for (const s of stages) if (s.value > maxV) maxV = s.value
  const stageH = (plot.h - gap * (nf - 1.0)) / nf
  // kf mirrors the draw index k as a Double, for the same reason as nf.
  let kf = 0.0
  for (let k = 0; k < n; k++) {
    const idx = order[k]!
    const next = k + 1 < n ? order[k + 1]! : -1
    const topRatio = maxV <= 0.0 ? 1.0 : stages[idx]!.value / maxV
    const topW = plot.w * (topRatio < minRatio ? minRatio : topRatio)
    // The bottom edge narrows toward the NEXT stage's width (the classic
    // funnel taper); the last stage narrows to the minimum width.
    const nextRatio = next >= 0 ? (maxV <= 0.0 ? 1.0 : stages[next]!.value / maxV) : minRatio
    const bottomW = plot.w * (nextRatio < minRatio ? minRatio : nextRatio)
    const top = plot.y + kf * (stageH + gap)
    const cx = align === 'left' ? plot.x + topW / 2.0 : align === 'right' ? plot.x + plot.w - topW / 2.0 : plot.x + plot.w / 2.0
    out.push({ index: idx, top, bottom: top + stageH, topWidth: topW, bottomWidth: bottomW, centerX: cx })
    kf = kf + 1.0
  }
  return out
}

/** Render the funnel: one polygon per stage, labels inside. */
export function renderFunnel(stages: FunnelStage[], plot: Rect, options?: FunnelOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const geo = layoutFunnel(stages, plot, options)
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  const showLabels = options?.showLabels ?? true
  const labelColor = options?.labelColor ?? '#ffffff'
  const fontSize = options?.fontSize ?? 11.0
  const align = options?.align ?? 'center'
  for (const g of geo) {
    const s = stages[g.index]!
    const tw = g.topWidth * progress
    const bw = g.bottomWidth * progress
    // Left-aligned funnels keep their left edge fixed; others grow from the centre.
    const cxTop = align === 'left' ? plot.x + tw / 2.0 : g.centerX
    const cxBottom = align === 'left' ? plot.x + bw / 2.0 : align === 'right' ? plot.x + plot.w - bw / 2.0 : g.centerX
    out.push({
      kind: 'polygon',
      points: [
        { x: cxTop - tw / 2.0, y: g.top },
        { x: cxTop + tw / 2.0, y: g.top },
        { x: cxBottom + bw / 2.0, y: g.bottom },
        { x: cxBottom - bw / 2.0, y: g.bottom },
      ],
      fill: s.color,
    })
    if (showLabels && progress >= 1.0) {
      out.push({
        kind: 'text',
        text: s.label,
        at: { x: cxTop, y: (g.top + g.bottom) / 2.0 },
        fill: labelColor,
        size: fontSize,
        align: 'middle',
        baseline: 'middle',
      })
    }
  }
  return out
}

/** Which stage contains a point (input index), or -1. */
export function hitFunnel(stages: FunnelStage[], plot: Rect, px: Double, py: Double, options?: FunnelOptions): number {
  for (const g of layoutFunnel(stages, plot, options)) {
    if (py < g.top || py > g.bottom) continue
    // Width at this y interpolates between the top and bottom edges.
    const t = g.bottom <= g.top ? 0.0 : (py - g.top) / (g.bottom - g.top)
    const w = g.topWidth + (g.bottomWidth - g.topWidth) * t
    if (px >= g.centerX - w / 2.0 && px <= g.centerX + w / 2.0) return g.index
  }
  return -1
}

// ---- the ECharts funnel (the option path) ----
//
// A port of ECharts 6's `funnelLayout.js` (layout + labelLayout) and the
// label/border styling of `FunnelView.js`, differential-tested against
// ECharts' own SSR output (echarts-differential.test.ts). `<FunnelChart>`'s
// props keep the simpler layout above; an ECharts option reaches this one.

/**
 * An ECharts funnel series, resolved for layout. A size's `...Pct` twin says
 * it is a FRACTION of the view (ECharts' `'50%'`) rather than pixels.
 */
export interface FunnelEcConfig {
  /** 'vertical' (stages stacked top to bottom) or 'horizontal'. */
  orient: string
  /** 'descending', 'ascending' (laid out from the far end) or 'none'. */
  sort: string
  /** The value mapped to `minSize`; NaN = the smaller of the data minimum and 0. */
  min: Double
  /** The value mapped to `maxSize`; NaN = the data maximum. */
  max: Double
  minSize: Double
  minSizePct: boolean
  maxSize: Double
  maxSizePct: boolean
  gap: Double
  /** 'center', 'left' / 'right' (vertical) or 'top' / 'bottom' (horizontal). */
  align: string
  /** Per-stage thickness (`itemStyle.height`, or `width` when horizontal); NaN = the even share. */
  itemSizes: Double[]
  itemSizesPct: boolean[]
  labelShow: boolean
  /** ECharts' `label.position`: outer / right / left / top / bottom / inside / insideLeft / insideRight / leftTop / … */
  labelPosition: string
  labelLineShow: boolean
  labelLineLength: Double
  /** '' = zrender's automatic colour, 'inherit' = the stage colour, else that colour. */
  labelColor: string
  labelFontSize: Double
  /** Index-aligned label texts; a missing entry uses the stage label. */
  labelTexts: string[]
  /** '' = the chart background (white on a bare chart). */
  borderColor: string
  borderWidth: Double
}

/** One laid-out stage: its polygon (four corners, ECharts' order) and its label's placement. */
export interface FunnelEcPiece {
  /** Index into the INPUT stages. */
  index: number
  points: Pt[]
  labelAt: Pt
  /** 'start' | 'middle' | 'end'. */
  labelAlign: string
  inside: boolean
  /** The leader line, two points (zero length for an inside label). */
  line: Pt[]
}

/** ECharts' `linearMap` with `clamp: true`. */
function funnelMap(val: Double, d0: Double, d1: Double, r0: Double, r1: Double): Double {
  const subDomain = d1 - d0
  const subRange = r1 - r0
  if (subDomain === 0.0) return subRange === 0.0 ? r0 : (r0 + r1) / 2.0
  if (subDomain > 0.0) {
    if (val <= d0) return r0
    if (val >= d1) return r1
  } else {
    if (val >= d0) return r0
    if (val <= d1) return r1
  }
  return ((val - d0) / subDomain) * subRange + r0
}

/** The two ends of the stage edge at `offset` for value index `idx` (-1 = the tip, value 0). */
function funnelEdge(values: Double[], idx: number, offset: Double, box: Rect, cfg: FunnelEcConfig, lo: Double, hi: Double, sizeLo: Double, sizeHi: Double): Pt[] {
  const raw = idx >= 0 && idx < values.length ? values[idx]! : 0.0
  // ECharts reads `data.get(...) || 0`: a missing or NaN value maps as 0.
  const val = isFiniteNumber(raw) ? raw : 0.0
  const size = funnelMap(val, lo, hi, sizeLo, sizeHi)
  if (cfg.orient === 'horizontal') {
    const y0 = cfg.align === 'top' ? box.y : cfg.align === 'bottom' ? box.y + box.h - size : box.y + (box.h - size) / 2.0
    return [{ x: offset, y: y0 }, { x: offset, y: y0 + size }]
  }
  const x0 = cfg.align === 'left' ? box.x : cfg.align === 'right' ? box.x + box.w - size : box.x + (box.w - size) / 2.0
  return [{ x: x0, y: offset }, { x: x0 + size, y: offset }]
}

/** ECharts' label placement for one stage (`labelLayout` in funnelLayout.js). */
function funnelLabelPiece(index: number, pts: Pt[], cfg: FunnelEcConfig): FunnelEcPiece {
  const horizontal = cfg.orient === 'horizontal'
  let pos = cfg.labelPosition
  const p0 = pts[0]!
  const p1 = pts[1]!
  const p2 = pts[2]!
  const p3 = pts[3]!
  const inside = pos === 'inner' || pos === 'inside' || pos === 'center' || pos === 'insideLeft' || pos === 'insideRight'
  if (inside) {
    if (pos === 'insideLeft') {
      const at: Pt = { x: (p0.x + p3.x) / 2.0 + 5.0, y: (p0.y + p3.y) / 2.0 }
      return { index, points: pts, labelAt: at, labelAlign: 'start', inside: true, line: [at, at] }
    }
    if (pos === 'insideRight') {
      const at: Pt = { x: (p1.x + p2.x) / 2.0 - 5.0, y: (p1.y + p2.y) / 2.0 }
      return { index, points: pts, labelAt: at, labelAlign: 'end', inside: true, line: [at, at] }
    }
    const at: Pt = { x: (p0.x + p1.x + p2.x + p3.x) / 4.0, y: (p0.y + p1.y + p2.y + p3.y) / 4.0 }
    return { index, points: pts, labelAt: at, labelAlign: 'middle', inside: true, line: [at, at] }
  }
  // A vertical funnel has no top/bottom side, a horizontal one no left/right: ECharts moves the label.
  if (!horizontal && (pos === 'top' || pos === 'bottom')) pos = 'left'
  if (horizontal && (pos === 'left' || pos === 'right')) pos = 'bottom'
  const len = cfg.labelLineLength
  let x1 = 0.0
  let y1 = 0.0
  let x2 = 0.0
  let y2 = 0.0
  let tx = 0.0
  let ty = 0.0
  let align = 'start'
  if (pos === 'left') {
    x1 = (p3.x + p0.x) / 2.0
    y1 = (p3.y + p0.y) / 2.0
    x2 = x1 - len
    tx = x2 - 5.0
    align = 'end'
  } else if (pos === 'right') {
    x1 = (p1.x + p2.x) / 2.0
    y1 = (p1.y + p2.y) / 2.0
    x2 = x1 + len
    tx = x2 + 5.0
    align = 'start'
  } else if (pos === 'top') {
    x1 = (p3.x + p0.x) / 2.0
    y1 = (p3.y + p0.y) / 2.0
    y2 = y1 - len
    ty = y2 - 5.0
    align = 'middle'
  } else if (pos === 'bottom') {
    x1 = (p1.x + p2.x) / 2.0
    y1 = (p1.y + p2.y) / 2.0
    y2 = y1 + len
    ty = y2 + 5.0
    align = 'middle'
  } else if (pos === 'rightTop') {
    x1 = horizontal ? p3.x : p1.x
    y1 = horizontal ? p3.y : p1.y
    if (horizontal) {
      y2 = y1 - len
      ty = y2 - 5.0
      align = 'middle'
    } else {
      x2 = x1 + len
      tx = x2 + 5.0
      // ECharts writes textAlign 'top' here, which zrender draws left-aligned.
      align = 'start'
    }
  } else if (pos === 'rightBottom') {
    x1 = p2.x
    y1 = p2.y
    if (horizontal) {
      y2 = y1 + len
      ty = y2 + 5.0
      align = 'middle'
    } else {
      x2 = x1 + len
      tx = x2 + 5.0
      align = 'start'
    }
  } else if (pos === 'leftTop') {
    x1 = p0.x
    y1 = horizontal ? p0.y : p1.y
    if (horizontal) {
      y2 = y1 - len
      ty = y2 - 5.0
      align = 'middle'
    } else {
      x2 = x1 - len
      tx = x2 - 5.0
      align = 'end'
    }
  } else if (pos === 'leftBottom') {
    x1 = horizontal ? p1.x : p3.x
    y1 = horizontal ? p1.y : p2.y
    if (horizontal) {
      y2 = y1 + len
      ty = y2 + 5.0
      align = 'middle'
    } else {
      x2 = x1 - len
      tx = x2 - 5.0
      align = 'end'
    }
  } else {
    // 'outer' and anything else: the right side (the bottom when horizontal).
    x1 = (p1.x + p2.x) / 2.0
    y1 = (p1.y + p2.y) / 2.0
    if (horizontal) {
      y2 = y1 + len
      ty = y2 + 5.0
      align = 'middle'
    } else {
      x2 = x1 + len
      tx = x2 + 5.0
      align = 'start'
    }
  }
  if (horizontal) {
    x2 = x1
    tx = x2
  } else {
    y2 = y1
    ty = y2
  }
  return { index, points: pts, labelAt: { x: tx, y: ty }, labelAlign: align, inside: false, line: [{ x: x1, y: y1 }, { x: x2, y: y2 }] }
}

/** Lay an ECharts funnel out in `box`: ECharts' `funnelLayout`, stage by stage. */
export function layoutFunnelEc(values: Double[], box: Rect, cfg: FunnelEcConfig): FunnelEcPiece[] {
  const out: FunnelEcPiece[] = []
  const n = values.length
  if (n === 0) return out
  const horizontal = cfg.orient === 'horizontal'
  // Draw order: a stable sort of the input indices, as ECharts' Array.sort.
  const order: number[] = []
  let nf = 0.0
  for (let i = 0; i < n; i++) {
    order.push(i)
    nf = nf + 1.0
  }
  if (cfg.sort === 'descending' || cfg.sort === 'ascending') {
    for (let i = 1; i < n; i++) {
      const cur = order[i]!
      let j = i - 1
      while (j >= 0) {
        const a = values[order[j]!]!
        const b = values[cur]!
        const swap = cfg.sort === 'ascending' ? a > b : a < b
        if (!swap) break
        order[j + 1] = order[j]!
        j = j - 1
      }
      order[j + 1] = cur
    }
  }
  // The data extent ignores gaps; min defaults to the smaller of it and 0.
  let dataLo = 0.0
  let dataHi = 0.0
  let seen = false
  for (const v of values) {
    if (!isFiniteNumber(v)) continue
    if (!seen || v < dataLo) dataLo = v
    if (!seen || v > dataHi) dataHi = v
    seen = true
  }
  const lo = isFiniteNumber(cfg.min) ? cfg.min : dataLo < 0.0 ? dataLo : 0.0
  const hi = isFiniteNumber(cfg.max) ? cfg.max : dataHi
  const across = horizontal ? box.h : box.w
  const sizeLo = cfg.minSizePct ? cfg.minSize * across : cfg.minSize
  const sizeHi = cfg.maxSizePct ? cfg.maxSize * across : cfg.maxSize
  const along = horizontal ? box.w : box.h
  const ascending = cfg.sort === 'ascending'
  let gap = cfg.gap
  let itemSize = (along - gap * (nf - 1.0)) / nf
  let x = box.x
  let y = box.y
  // Ascending funnels are laid out from the far end, largest first.
  const seq: number[] = []
  if (ascending) {
    itemSize = -itemSize
    gap = -gap
    if (horizontal) x = x + box.w
    else y = y + box.h
    for (let i = n - 1; i >= 0; i--) seq.push(order[i]!)
  } else {
    for (let i = 0; i < n; i++) seq.push(order[i]!)
  }
  for (let i = 0; i < n; i++) {
    const idx = seq[i]!
    const next = i + 1 < n ? seq[i + 1]! : -1
    let size = itemSize
    if (idx < cfg.itemSizes.length && isFiniteNumber(cfg.itemSizes[idx]!)) {
      const pct = idx < cfg.itemSizesPct.length ? cfg.itemSizesPct[idx]! : false
      const own = pct ? cfg.itemSizes[idx]! * along : cfg.itemSizes[idx]!
      size = ascending ? -own : own
    }
    const offset = horizontal ? x : y
    const start = funnelEdge(values, idx, offset, box, cfg, lo, hi, sizeLo, sizeHi)
    const end = funnelEdge(values, next, offset + size, box, cfg, lo, hi, sizeLo, sizeHi)
    const pts: Pt[] = [start[0]!, start[1]!, end[1]!, end[0]!]
    out.push(funnelLabelPiece(idx, pts, cfg))
    if (horizontal) x = x + size + gap
    else y = y + size + gap
  }
  return out
}

/** Whether (px, py) falls inside the convex polygon `pts`. */
function funnelContains(pts: Pt[], px: Double, py: Double): boolean {
  const n = pts.length
  if (n < 3) return false
  let inside = false
  let j = n - 1
  for (let i = 0; i < n; i++) {
    const a = pts[i]!
    const b = pts[j]!
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
    j = i
  }
  return inside
}

/**
 * Draw an ECharts funnel: leader lines, then the stages with their border,
 * then the labels, in ECharts' order. `progress` (0..1) grows each stage out
 * of its centre on entrance; labels appear when it completes. `background` is
 * the chart's, which ECharts' border and outside-label halo take.
 */
export function renderFunnelEc(stages: FunnelStage[], box: Rect, cfg: FunnelEcConfig, progress: Double, background: string): DrawCmd[] {
  const out: DrawCmd[] = []
  const values: Double[] = []
  for (const st of stages) values.push(st.value)
  const pieces = layoutFunnelEc(values, box, cfg)
  const p = progress < 0.0 ? 0.0 : progress > 1.0 ? 1.0 : progress
  const labelsOn = cfg.labelShow && p >= 1.0
  if (labelsOn && cfg.labelLineShow) {
    for (const pc of pieces) {
      if (pc.inside) continue
      out.push({ kind: 'polyline', points: pc.line, stroke: stages[pc.index]!.color, width: 1.0 })
    }
  }
  const border = cfg.borderColor !== '' ? cfg.borderColor : background !== '' ? background : '#ffffff'
  for (const pc of pieces) {
    let cx = 0.0
    let cy = 0.0
    for (const q of pc.points) {
      cx = cx + q.x / 4.0
      cy = cy + q.y / 4.0
    }
    const pts: Pt[] = []
    for (const q of pc.points) pts.push({ x: cx + (q.x - cx) * p, y: cy + (q.y - cy) * p })
    out.push({ kind: 'polygon', points: pts, fill: stages[pc.index]!.color })
    if (cfg.borderWidth > 0.0) {
      const ring: Pt[] = []
      for (const q of pts) ring.push(q)
      ring.push(pts[0]!)
      out.push({ kind: 'polyline', points: ring, stroke: border, width: cfg.borderWidth })
    }
  }
  if (!labelsOn) return out
  for (const pc of pieces) {
    const color = stages[pc.index]!.color
    const auto = autoLabelStyle(pc.inside, color, background)
    let fill = auto.textFill
    let halo = auto.halo
    if (cfg.labelColor === 'inherit') {
      if (pc.inside) halo = color
      else fill = color
    } else if (cfg.labelColor !== '') {
      fill = cfg.labelColor
      if (pc.inside) halo = ''
    }
    const text = pc.index < cfg.labelTexts.length ? cfg.labelTexts[pc.index]! : stages[pc.index]!.label
    const align = pc.labelAlign === 'end' ? 'end' : pc.labelAlign === 'middle' ? 'middle' : 'start'
    if (halo !== '') out.push({ kind: 'text', text, at: pc.labelAt, fill, size: cfg.labelFontSize, align, baseline: 'middle', stroke: halo, strokeWidth: 2.0 })
    else out.push({ kind: 'text', text, at: pc.labelAt, fill, size: cfg.labelFontSize, align, baseline: 'middle' })
  }
  return out
}

/** Which stage of an ECharts funnel contains a point (input index), or -1. */
export function hitFunnelEc(stages: FunnelStage[], box: Rect, cfg: FunnelEcConfig, px: Double, py: Double): number {
  const values: Double[] = []
  for (const st of stages) values.push(st.value)
  for (const pc of layoutFunnelEc(values, box, cfg)) if (funnelContains(pc.points, px, py)) return pc.index
  return -1
}
