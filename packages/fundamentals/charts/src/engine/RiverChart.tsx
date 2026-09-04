// `<RiverChart>` — a streamgraph on a canvas.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { hitRiver, hitRiverIndex, layoutRiver, renderRiver } from './river'
import type { RiverLayer, RiverLayout, RiverOptions, RiverSeries } from './river'
import { chartTable, describeChart } from './a11y'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface RiverChartProps {
  series: RiverSeries[] | (() => RiverSeries[])
  width?: Double
  height?: Double
  river?: RiverOptions
  title?: string
  onSelect?: (layer: RiverLayer | null) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: number) => void
  accessibleTable?: boolean
  class?: string
}

function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

export function RiverChart(props: RiverChartProps): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readSeries = (): RiverSeries[] => (typeof props.series === 'function' ? props.series() : props.series)
  const layoutFor = (w: Double, hgt: Double): RiverLayout => layoutRiver(readSeries(), { x: 8.0, y: 8.0, w: Math.max(0.0, w - 16.0), h: Math.max(0.0, hgt - 16.0) }, props.river)

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    paint(ctx, renderRiver(layoutFor(w, hgt), props.river, canvasMeasure(ctx, FONT)), w, hgt, FONT)
  }

  effect(() => {
    readSeries()
    draw()
  })

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    const cbi = props.onSelectIndex
    if (el === null || (cb === undefined && cbi === undefined)) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const r = el.getBoundingClientRect()
    const layout = layoutFor(w, hgt)
    const px = ev.clientX - r.left
    const py = ev.clientY - r.top
    if (cb !== undefined) cb(hitRiver(layout, px, py, props.river?.curve))
    if (cbi !== undefined) cbi(hitRiverIndex(layout, px, py, props.river?.curve))
  }

  const a11y = () => {
    const series = readSeries()
    let n = 0
    for (const s of series) if (s.values.length > n) n = s.values.length
    const cats = props.river?.categories ?? Array.from({ length: n }, (_, i) => String(i + 1))
    return { title: props.title, categories: cats, series: series.map((s) => ({ label: s.name, values: s.values, kind: 'area' })) }
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
        h('caption', null, props.title ?? 'Stream data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
