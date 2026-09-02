// `<ParallelChart>` — parallel coordinates on a canvas.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { paint, prepareCanvas } from './canvas-web'
import { layoutParallel, renderParallel } from './parallel'
import type { ParallelAxis, ParallelLayout, ParallelLine, ParallelOptions } from './parallel'
import { hitParallel, parallelLineColors, parallelRows } from './parallel-web'
import type { ParallelRow } from './parallel-web'
import { chartTable, describeChart } from './a11y'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface ParallelChartProps {
  axes: ParallelAxis[]
  rows: ParallelRow[] | (() => ParallelRow[])
  width?: Double
  height?: Double
  /** Space kept for labels on both sides; default 40. */
  gutter?: Double
  parallel?: ParallelOptions
  /** Per-row line colour; sets `lineColors` on the engine options. */
  rowColor?: (row: ParallelRow, index: number) => string
  title?: string
  onSelect?: (line: ParallelLine | null) => void
  accessibleTable?: boolean
  class?: string
}

function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

export function ParallelChart(props: ParallelChartProps): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readRows = (): ParallelRow[] => (typeof props.rows === 'function' ? props.rows() : props.rows)
  const opts = (): ParallelOptions | undefined => {
    const colorOf = props.rowColor
    if (colorOf === undefined) return props.parallel
    return { ...props.parallel, lineColors: parallelLineColors(readRows(), colorOf) }
  }
  const layoutFor = (w: Double, hgt: Double): ParallelLayout => {
    const g = props.gutter ?? 40.0
    return layoutParallel(props.axes, parallelRows(props.axes, readRows()), { x: g, y: 8.0, w: Math.max(0.0, w - g * 2.0), h: Math.max(0.0, hgt - 16.0) }, opts())
  }

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    paint(ctx, renderParallel(layoutFor(w, hgt), opts()), w, hgt, FONT)
  }

  effect(() => {
    readRows()
    draw()
  })

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const r = el.getBoundingClientRect()
    cb(hitParallel(layoutFor(w, hgt), ev.clientX - r.left, ev.clientY - r.top))
  }

  const a11y = () => {
    const rows = readRows()
    return {
      title: props.title,
      categories: rows.map((_, i) => 'Row ' + String(i + 1)),
      series: props.axes.map((axis, a) => ({ label: axis.name, values: rows.map((r) => (typeof r[a] === 'number' ? (r[a] as number) : NaN)), kind: 'bars' })),
    }
  }

  const canvasNode = h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () => describeChart(a11y()),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      sizeObserver?.disconnect()
      sizeObserver = null
      if (el === null) return
      draw()
      const box = el.parentElement
      if (box === null || typeof ResizeObserver === 'undefined') return
      sizeObserver = new ResizeObserver(() => {
        if (canvas === null) return
        const next = drawWidth(canvas, props.width)
        const dpr = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1
        if (Math.round(next * dpr) === canvas.width) return
        draw()
      })
      sizeObserver.observe(box)
    },
    onClick: handleClick,
  })
  if (props.accessibleTable === false) return canvasNode
  const table = (): VNode => {
    const t = chartTable(a11y())
    return h(
      'div',
      { style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;margin:-1px;padding:0' },
      h('table', null,
        h('caption', null, props.title ?? 'Parallel coordinates data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
