// `<HeatmapChart>` — two categorical axes, a value per cell, color as the
// third channel.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { buildHeatGrid, colorRamp, HEAT_RAMP, renderHeat } from './heat'
import type { HeatGrid } from './heat'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import type { Double, DrawCmd } from './types'

const FONT = 'system-ui, sans-serif'

export interface HeatmapChartProps<T> {
  /** The observations. An accessor makes it reactive; a plain array is static. */
  data: T[] | (() => T[])
  /** Column category per datum. */
  x: (d: T, index: number) => string
  /** Row category per datum. */
  y: (d: T, index: number) => string
  /** The cell value. Duplicate (x, y) observations SUM. */
  value: (d: T, index: number) => Double
  width?: Double
  height?: Double
  /** `#rrggbb` ramp stops, cold to hot. */
  colors?: string[]
  /** Gap between cells in pixels. */
  gap?: Double
  theme?: Partial<ChartTheme>
  class?: string
  /** Accessible name; also titles the derived description. */
  title?: string
}

/**
 * Resolve first-seen category order from the data — the order the data
 * means. Weekday names, funnel stages and cohort labels all carry an order
 * that alphabetical sorting would destroy.
 */
function firstSeen<T>(data: T[], of: (d: T, i: number) => string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (let i = 0; i < data.length; i++) {
    const k = of(data[i]!, i)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

export function HeatmapChart<T>(props: HeatmapChartProps<T>): VNode {
  let canvas: HTMLCanvasElement | null = null

  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)

  const resolve = (rows: T[]): HeatGrid => {
    const cols = firstSeen(rows, props.x)
    const yCats = firstSeen(rows, props.y)
    const colIdx = new Map(cols.map((c, i) => [c, i]))
    const rowIdx = new Map(yCats.map((r, i) => [r, i]))
    return buildHeatGrid(
      cols,
      yCats,
      rows.map((d, i) => colIdx.get(props.x(d, i)) ?? -1),
      rows.map((d, i) => rowIdx.get(props.y(d, i)) ?? -1),
      rows.map((d, i) => {
        const v = props.value(d, i)
        return Number.isFinite(v) ? v : 0
      }),
    )
  }

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const box = el.parentElement
    const w = props.width ?? ((box?.clientWidth ?? 0) > 0 ? box!.clientWidth : 300)
    const hgt = props.height ?? 200
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    const t = { ...defaultTheme, ...props.theme }
    const measure = canvasMeasure(ctx, FONT)
    const grid = resolve(readData())

    // Gutters: rows label the left edge (sized by the widest row label —
    // same rule as horizontal bars), columns label the bottom.
    let widest = 0.0
    for (const r of grid.rows) {
      const lw = measure(r, t.fontSize)
      if (lw > widest) widest = lw
    }
    const left = widest + 8.0
    const bottom = t.fontSize + 8.0
    const plot = { x: left, y: 4.0, w: Math.max(0, w - left - 4.0), h: Math.max(0, hgt - 4.0 - bottom) }

    const cmds: DrawCmd[] = renderHeat({
      grid,
      plot,
      ramp: colorRamp(props.colors ?? HEAT_RAMP),
      gap: props.gap,
    })
    const nc = grid.cols.length
    const nr = grid.rows.length
    for (let i = 0; i < nr; i++) {
      cmds.push({
        kind: 'text',
        text: grid.rows[i]!,
        at: { x: plot.x - 4.0, y: plot.y + (plot.h / Math.max(1, nr)) * (i + 0.5) },
        fill: t.label,
        size: t.fontSize,
        align: 'end',
        baseline: 'middle',
      })
    }
    for (let i = 0; i < nc; i++) {
      cmds.push({
        kind: 'text',
        text: grid.cols[i]!,
        at: { x: plot.x + (plot.w / Math.max(1, nc)) * (i + 0.5), y: plot.y + plot.h + 4.0 },
        fill: t.label,
        size: t.fontSize,
        align: 'middle',
        baseline: 'top',
      })
    }
    paint(ctx, cmds, w, hgt, FONT)
  }

  effect(() => {
    readData()
    draw()
  })

  const describe = (): string => {
    const grid = resolve(readData())
    const title = props.title ?? 'Heatmap'
    if (grid.cells.length === 0) return `${title}: no data.`
    return `${title}: ${grid.cols.length} columns by ${grid.rows.length} rows, values ${grid.min} to ${grid.max}.`
  }

  return h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () => describe(),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      if (el !== null) draw()
    },
  })
}
