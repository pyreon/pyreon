// `<FunnelChart>` — a conversion funnel on a canvas, over the engine's funnel geometry.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { paint, prepareCanvas } from './canvas-web'
import { hitFunnel, renderFunnel } from './funnel'
import type { FunnelOptions, FunnelStage } from './funnel'
import { chartTable, describeChart } from './a11y'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const PALETTE = ['#0f766e', '#b45309', '#1d4ed8', '#b42318', '#15803d', '#7c3aed']

export interface FunnelChartProps<T> {
  data: T[] | (() => T[])
  value: (d: T, index: number) => Double
  label: (d: T, index: number) => string
  color?: (d: T, index: number) => string
  width?: Double
  height?: Double
  funnel?: FunnelOptions
  title?: string
  onSelect?: (index: number) => void
  accessibleTable?: boolean
  class?: string
}

/** Measures the PARENT, never the canvas (the pinned-width trap). */
function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

export function FunnelChart<T>(props: FunnelChartProps<T>): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readData = (): T[] => {
    const d = props.data
    return typeof d === 'function' ? (d as () => T[])() : d
  }
  const stages = (): FunnelStage[] =>
    readData().map((d, i) => ({
      value: props.value(d, i),
      label: props.label(d, i),
      color: props.color !== undefined ? props.color(d, i) : PALETTE[i % PALETTE.length]!,
    }))
  const plotFor = (w: Double, hgt: Double) => ({ x: 8.0, y: 8.0, w: w - 16.0, h: hgt - 16.0 })

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 240
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    paint(ctx, renderFunnel(stages(), plotFor(w, hgt), props.funnel), w, hgt, FONT)
  }

  effect(() => {
    readData()
    draw()
  })

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 240
    const r = el.getBoundingClientRect()
    cb(hitFunnel(stages(), plotFor(w, hgt), ev.clientX - r.left, ev.clientY - r.top, props.funnel))
  }

  const a11y = () => {
    const s = stages()
    return {
      title: props.title,
      categories: s.map((x) => x.label),
      series: [{ label: props.title ?? 'Funnel', values: s.map((x) => x.value), kind: 'bars' }],
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
        h('caption', null, props.title ?? 'Funnel data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
