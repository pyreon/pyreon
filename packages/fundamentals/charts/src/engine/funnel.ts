// Funnel geometry — a stack of trapezoids whose widths follow the values.
//
// Pure functions to flat commands, like everything else here: a funnel is
// polygons plus labels, which every backend already executes, so the family
// is free on native. Written in the native subset (Double-only math, no
// closures in structs, no early returns inside lambdas).

import type { Double, DrawCmd, Rect } from './types'
import { measureApprox, renderSvg } from './svg'
import type { MeasureText } from './types'
import type { SvgOptions } from './svg'

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
  for (let i = 0; i < n; i++) order.push(i)
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
  const stageH = (plot.h - gap * (n - 1.0)) / n
  const widthOf = (v: Double): Double => {
    const ratio = maxV <= 0.0 ? 1.0 : v / maxV
    const clamped = ratio < minRatio ? minRatio : ratio
    return plot.w * clamped
  }
  for (let k = 0; k < n; k++) {
    const idx = order[k]!
    const next = k + 1 < n ? order[k + 1]! : -1
    const topW = widthOf(stages[idx]!.value)
    // The bottom edge narrows toward the NEXT stage's width (the classic
    // funnel taper); the last stage narrows to the minimum width.
    const bottomW = next >= 0 ? widthOf(stages[next]!.value) : plot.w * minRatio
    const top = plot.y + k * (stageH + gap)
    const centerX = align === 'left' ? plot.x + plot.w / 2.0 - (plot.w - topW) / 2.0 + 0.0 : align === 'right' ? plot.x + plot.w - topW / 2.0 : plot.x + plot.w / 2.0
    const cx = align === 'left' ? plot.x + topW / 2.0 : centerX
    out.push({ index: idx, top, bottom: top + stageH, topWidth: topW, bottomWidth: bottomW, centerX: cx })
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

export interface FunnelToSvgOptions<T> {
  data: T[]
  value: (d: T, index: number) => Double
  label: (d: T, index: number) => string
  color?: (d: T, index: number) => string
  width?: Double
  height?: Double
  funnel?: FunnelOptions
  measure?: MeasureText
  title?: string
  description?: string
  svg?: Omit<SvgOptions, 'title' | 'description'>
}

const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

/** Funnel → `<svg>` string, server-safe. */
export function funnelToSvg<T>(options: FunnelToSvgOptions<T>): string {
  const width = options.width ?? 480.0
  const height = options.height ?? 320.0
  const stages: FunnelStage[] = options.data.map((d, i) => ({
    value: options.value(d, i),
    label: options.label(d, i),
    color: options.color !== undefined ? options.color(d, i) : PALETTE[i % PALETTE.length]!,
  }))
  const pad = 8.0
  const cmds = renderFunnel(stages, { x: pad, y: pad, w: width - pad * 2.0, h: height - pad * 2.0 }, options.funnel)
  void (options.measure ?? measureApprox())
  const description =
    options.description ??
    (options.title !== undefined
      ? `${options.title}: ${stages.length} stages, ${stages.map((s) => `${s.label} ${s.value}`).join(', ')}.`
      : undefined)
  return renderSvg(cmds, width, height, {
    ...options.svg,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  })
}
