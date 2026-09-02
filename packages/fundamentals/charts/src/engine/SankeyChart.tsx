// `<SankeyChart>` — a flow diagram on a canvas.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { hitSankey, layoutSankey, renderSankey } from './sankey'
import type { SankeyHit, SankeyLayout, SankeyLink, SankeyNode, SankeyOptions } from './sankey'
import { chartTable, describeChart } from './a11y'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface SankeyChartProps {
  nodes: SankeyNode[] | (() => SankeyNode[])
  links: SankeyLink[] | (() => SankeyLink[])
  width?: Double
  height?: Double
  /** Space kept for labels on both sides; default 80. */
  gutter?: Double
  sankey?: SankeyOptions
  title?: string
  onSelect?: (hit: SankeyHit) => void
  accessibleTable?: boolean
  class?: string
}

function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

export function SankeyChart(props: SankeyChartProps): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readNodes = (): SankeyNode[] => (typeof props.nodes === 'function' ? props.nodes() : props.nodes)
  const readLinks = (): SankeyLink[] => (typeof props.links === 'function' ? props.links() : props.links)
  const layoutFor = (w: Double, hgt: Double): SankeyLayout => {
    const g = props.gutter ?? 80.0
    return layoutSankey(readNodes(), readLinks(), { x: g, y: 8.0, w: Math.max(0.0, w - g * 2.0), h: Math.max(0.0, hgt - 16.0) }, props.sankey)
  }

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    paint(ctx, renderSankey(layoutFor(w, hgt), props.sankey, canvasMeasure(ctx, FONT)), w, hgt, FONT)
  }

  effect(() => {
    readNodes()
    readLinks()
    draw()
  })

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const r = el.getBoundingClientRect()
    cb(hitSankey(layoutFor(w, hgt), ev.clientX - r.left, ev.clientY - r.top))
  }

  const a11y = () => {
    const nodes = layoutFor(300, 300).nodes
    return {
      title: props.title,
      categories: nodes.map((n) => n.name),
      series: [{ label: props.title ?? 'Flow', values: nodes.map((n) => n.value), kind: 'bars' }],
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
        h('caption', null, props.title ?? 'Flow data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
