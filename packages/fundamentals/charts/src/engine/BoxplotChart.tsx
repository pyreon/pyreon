// `<BoxplotChart>` — five-number summaries per category on a canvas.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { computeLayout } from './layout'
import { boxplotExtent, fiveNumber, hitBox, renderBoxplot } from './boxplot'
import type { BoxplotOptions, FiveNumber } from './boxplot'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { niceDomain } from './scale'
import { chartTable, describeChart } from './a11y'
import type { Formatter } from './format'
import type { Double, DrawCmd } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface BoxplotChartProps<T> {
  data: T[] | (() => T[])
  /** Raw observations per datum — summarised with `fiveNumber`. */
  values: (d: T, index: number) => Double[]
  x?: (d: T, index: number) => string
  width?: Double
  height?: Double
  theme?: Partial<ChartTheme>
  box?: BoxplotOptions
  format?: Formatter
  title?: string
  onSelect?: (index: number) => void
  accessibleTable?: boolean
  class?: string
}

function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

export function BoxplotChart<T>(props: BoxplotChartProps<T>): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readData = (): T[] => {
    const d = props.data
    return typeof d === 'function' ? (d as () => T[])() : d
  }
  const rowsOf = (data: T[]): FiveNumber[] => data.map((d, i) => fiveNumber(props.values(d, i)))
  const frame = (data: T[], rows: FiveNumber[], w: Double, hgt: Double, measure: (t: string, s: Double) => Double) => {
    const t = { ...defaultTheme, ...props.theme }
    const domain = niceDomain(boxplotExtent(rows), 5.0)
    const l = computeLayout(
      {
        width: w,
        height: hgt,
        xDomain: { min: 0.0, max: rows.length > 1 ? rows.length - 1 : 1.0 },
        yDomain: domain,
        categories: props.x !== undefined ? data.map((d, i) => props.x!(d, i)) : [],
        fontSize: t.fontSize,
        xTickCount: 5.0,
        yTickCount: 5.0,
        showXAxis: true,
        showYAxis: true,
        yFormat: props.format,
      },
      measure,
    )
    return { t, domain, l }
  }

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 240
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    const measure = canvasMeasure(ctx, FONT)
    const data = readData()
    const rows = rowsOf(data)
    const { t, domain, l } = frame(data, rows, w, hgt, measure)
    const cmds: DrawCmd[] = []
    for (const tick of l.yTicks) {
      cmds.push({ kind: 'line', from: { x: l.plot.x, y: tick.pos }, to: { x: l.plot.x + l.plot.w, y: tick.pos }, stroke: t.grid, width: 1.0 })
      cmds.push({ kind: 'text', text: tick.label, at: { x: l.plot.x - 6.0, y: tick.pos }, fill: t.label, size: t.fontSize, align: 'end', baseline: 'middle' })
    }
    for (const tick of l.xTicks) {
      cmds.push({ kind: 'text', text: tick.label, at: { x: tick.pos, y: l.plot.y + l.plot.h + 6.0 }, fill: t.label, size: t.fontSize, align: 'middle', baseline: 'top' })
    }
    for (const c of renderBoxplot(rows, l.plot, domain, props.box)) cmds.push(c)
    paint(ctx, cmds, w, hgt, FONT)
  }

  effect(() => {
    readData()
    draw()
  })

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const ctx = el.getContext('2d')
    if (ctx === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 240
    const data = readData()
    const rows = rowsOf(data)
    const { l } = frame(data, rows, w, hgt, canvasMeasure(ctx, FONT))
    const r = el.getBoundingClientRect()
    cb(hitBox(rows.length, l.plot, ev.clientX - r.left, ev.clientY - r.top))
  }

  const a11y = () => {
    const data = readData()
    const rows = rowsOf(data)
    return {
      title: props.title,
      categories: props.x !== undefined ? data.map((d, i) => props.x!(d, i)) : rows.map((_, i) => `${i + 1}`),
      series: [
        { label: 'Median', values: rows.map((r) => r.median), kind: 'points' },
        { label: 'Q1', values: rows.map((r) => r.q1), kind: 'points' },
        { label: 'Q3', values: rows.map((r) => r.q3), kind: 'points' },
      ],
      format: props.format,
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
        h('caption', null, props.title ?? 'Boxplot data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
