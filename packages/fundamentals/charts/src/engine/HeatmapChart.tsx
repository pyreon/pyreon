// `<HeatmapChart>` — two categorical axes, a value per cell, color as the
// third channel.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { HEAT_RAMP } from './heat'
import { heatGridFrom, hitHeatChart, renderHeatChart } from './heat-chart'
import type { HeatGrid } from './heat'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { placeTooltip } from './tooltip'
import { plain } from './format'
import type { Formatter } from './format'
import type { Double } from './types'

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
  /** Formats cell values — the tooltip and nothing else reads it yet. */
  format?: Formatter
  /**
   * Fired with the tapped CELL — its categories and aggregated value — or
   * null for a miss. The cell rather than a datum index, because duplicate
   * observations SUM into one cell: the cell is the unit on screen.
   */
  onSelect?: (cell: { x: string; y: string; value: Double } | null) => void
  /** Cell tooltip following the pointer. Off by default, like PlotChart's. */
  tooltip?: boolean
}

export function HeatmapChart<T>(props: HeatmapChartProps<T>): VNode {
  let canvas: HTMLCanvasElement | null = null
  let tip: HTMLDivElement | null = null

  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)

  // Category order and the aggregated grid come from the SHARED engine
  // resolver, so the web and native canvases build the same grid.
  const resolve = (rows: T[]): HeatGrid =>
    heatGridFrom(
      rows.map((d, i) => props.x(d, i)),
      rows.map((d, i) => props.y(d, i)),
      rows.map((d, i) => {
        const v = props.value(d, i)
        return Number.isFinite(v) ? v : 0
      }),
    )
  const widthOf = (el: HTMLCanvasElement): Double => {
    const box = el.parentElement
    return props.width ?? ((box?.clientWidth ?? 0) > 0 ? box!.clientWidth : 300)
  }

  const cellAt = (el: HTMLCanvasElement, ev: MouseEvent): number => {
    const ctx = el.getContext('2d')
    if (ctx === null) return -1
    const w = widthOf(el)
    const hgt = props.height ?? 200
    const t = { ...defaultTheme, ...props.theme }
    const grid = resolve(readData())
    const r = el.getBoundingClientRect()
    return hitHeatChart(grid, w, hgt, t.fontSize, props.gap ?? 1.0, canvasMeasure(ctx, FONT), ev.clientX - r.left, ev.clientY - r.top)
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
    const cmds = renderHeatChart(grid, w, hgt, t, props.colors ?? HEAT_RAMP, props.gap ?? 1.0, measure)
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

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const grid = resolve(readData())
    const idx = cellAt(el, ev)
    if (idx < 0) {
      cb(null)
      return
    }
    const c = grid.cells[idx]!
    cb({ x: grid.cols[c.col]!, y: grid.rows[c.row]!, value: c.value })
  }

  const handleMove = (ev: MouseEvent): void => {
    const el = canvas
    const box = tip
    if (el === null || box === null) return
    const grid = resolve(readData())
    const idx = cellAt(el, ev)
    if (idx < 0) {
      box.style.display = 'none'
      return
    }
    const c = grid.cells[idx]!
    const fmt = props.format ?? plain
    box.textContent = `${grid.rows[c.row]!} \u00b7 ${grid.cols[c.col]!}: ${fmt(c.value)}`
    box.style.display = 'block'
    const r = el.getBoundingClientRect()
    const px = ev.clientX - r.left
    const py = ev.clientY - r.top
    const w = widthOf(el)
    const hgt = props.height ?? 200
    const size = { w: box.offsetWidth, h: box.offsetHeight }
    const at = placeTooltip({ x: px, y: py }, size, { x: 0, y: 0, w, h: hgt }, 12)
    box.style.left = `${at.x}px`
    box.style.top = `${at.y}px`
  }

  const handleLeave = (): void => {
    if (tip !== null) tip.style.display = 'none'
  }

  const canvasNode = h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () => describe(),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      if (el !== null) draw()
    },
    onClick: handleClick,
    ...(props.tooltip === true
      ? { onMouseMove: handleMove, onMouseLeave: handleLeave }
      : {}),
  })

  if (props.tooltip !== true) return canvasNode

  return h(
    'div',
    { style: 'position:relative' },
    canvasNode,
    h('div', {
      'data-pyreon-chart-tooltip': 'true',
      style:
        'position:absolute;display:none;pointer-events:none;white-space:pre;' +
        'background:rgba(16,22,29,0.92);color:#f7f9fa;font:11px ' +
        FONT +
        ';padding:6px 8px;border-radius:4px;z-index:1',
      ref: (el: HTMLDivElement | null) => {
        tip = el
      },
    }),
  )
}
