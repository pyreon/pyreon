// `<GraphChart>` — a node/link network on a canvas.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { paint, prepareCanvas } from './canvas-web'
import { layoutGraph, renderGraph } from './graph'
import { hitGraph } from './graph-hit'
import type { GraphLayout, GraphLayoutNode, GraphLink, GraphNode, GraphOptions } from './graph'
import { chartTable, describeChart } from './a11y'
import type { Double, Rect } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface GraphChartProps {
  nodes: GraphNode[] | (() => GraphNode[])
  links: GraphLink[] | (() => GraphLink[])
  width?: Double
  height?: Double
  graph?: GraphOptions
  title?: string
  onSelect?: (node: GraphLayoutNode | null) => void
  accessibleTable?: boolean
  class?: string
}

function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

export function GraphChart(props: GraphChartProps): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readNodes = (): GraphNode[] => (typeof props.nodes === 'function' ? props.nodes() : props.nodes)
  const readLinks = (): GraphLink[] => (typeof props.links === 'function' ? props.links() : props.links)
  const boxFor = (w: Double, hgt: Double): Rect => ({ x: 0.0, y: 0.0, w, h: hgt })
  const layoutFor = (w: Double, hgt: Double): GraphLayout => layoutGraph(readNodes(), readLinks(), boxFor(w, hgt), props.graph)

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    paint(ctx, renderGraph(layoutFor(w, hgt), boxFor(w, hgt), props.graph), w, hgt, FONT)
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
    cb(hitGraph(layoutFor(w, hgt), ev.clientX - r.left, ev.clientY - r.top))
  }

  const a11y = () => {
    const nodes = layoutFor(300, 300).nodes
    return {
      title: props.title,
      categories: nodes.map((n) => n.name),
      series: [{ label: props.title ?? 'Graph', values: nodes.map((n) => n.value ?? 1), kind: 'bars' }],
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
        h('caption', null, props.title ?? 'Graph data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
