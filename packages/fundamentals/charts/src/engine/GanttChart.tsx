// `<GanttChart>` — tasks on a time axis, on a canvas.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { ganttDurationDays, hitGantt, layoutGantt, renderGantt } from './gantt'
import type { GanttLayout, GanttOptions, GanttRow, GanttTask } from './gantt'
import { chartTable, describeChart } from './a11y'
import { measureApprox } from './svg'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface GanttChartProps {
  tasks: GanttTask[] | (() => GanttTask[])
  width?: Double
  height?: Double
  gantt?: GanttOptions
  title?: string
  onSelect?: (row: GanttRow | null) => void
  accessibleTable?: boolean
  class?: string
}

function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

export function GanttChart(props: GanttChartProps): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readTasks = (): GanttTask[] => (typeof props.tasks === 'function' ? props.tasks() : props.tasks)
  const layoutFor = (w: Double, hgt: Double, ctx: CanvasRenderingContext2D | null): GanttLayout =>
    layoutGantt(readTasks(), { x: 4.0, y: 4.0, w: w - 8.0, h: hgt - 8.0 }, props.gantt, ctx === null ? measureApprox() : canvasMeasure(ctx, FONT))

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 320
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    paint(ctx, renderGantt(layoutFor(w, hgt, ctx), props.gantt), w, hgt, FONT)
  }

  effect(() => {
    readTasks()
    draw()
  })

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 320
    const r = el.getBoundingClientRect()
    cb(hitGantt(layoutFor(w, hgt, el.getContext('2d')), ev.clientX - r.left, ev.clientY - r.top))
  }

  const a11y = () => {
    const layout = layoutFor(600, 320, null)
    return {
      title: props.title,
      categories: layout.rows.map((r) => r.task.name),
      series: [{ label: props.title ?? 'Duration (days)', values: layout.rows.map((r) => ganttDurationDays(r)), kind: 'bars' }],
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
        h('caption', null, props.title ?? 'Gantt data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
