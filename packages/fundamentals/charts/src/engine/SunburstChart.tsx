// `<SunburstChart>` — a radial partition on a canvas.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { hitSunburst, layoutSunburst, renderSunburst } from './sunburst'
import type { SunburstArc, SunburstOptions } from './sunburst'
import type { TreeNode } from './treemap'
import { chartTable, describeChart } from './a11y'
import type { Double, Pt } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface SunburstChartProps {
  data: TreeNode[] | (() => TreeNode[])
  width?: Double
  height?: Double
  /** Hole radius as a fraction of the outer radius; default 0.2. */
  innerRatio?: Double
  sunburst?: SunburstOptions
  title?: string
  /** Fired with the deepest arc under the click, or null for a miss. */
  onSelect?: (arc: SunburstArc | null) => void
  accessibleTable?: boolean
  class?: string
}

function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

export function SunburstChart(props: SunburstChartProps): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readData = (): TreeNode[] => {
    const d = props.data
    return typeof d === 'function' ? (d as () => TreeNode[])() : d
  }
  const geometry = (w: Double, hgt: Double): { arcs: SunburstArc[]; center: Pt } => {
    const outerR = Math.max(0.0, Math.min(w, hgt) / 2.0 - 4.0)
    const innerR = outerR * (props.innerRatio ?? 0.2)
    return { arcs: layoutSunburst(readData(), innerR, outerR, props.sunburst), center: { x: w / 2.0, y: hgt / 2.0 } }
  }

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    const g = geometry(w, hgt)
    paint(ctx, renderSunburst(g.arcs, g.center, props.sunburst, canvasMeasure(ctx, FONT)), w, hgt, FONT)
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
    const hgt = props.height ?? 300
    const r = el.getBoundingClientRect()
    const g = geometry(w, hgt)
    cb(hitSunburst(g.arcs, g.center, ev.clientX - r.left, ev.clientY - r.top))
  }

  const a11y = () => {
    const leaves = geometry(300, 300).arcs.filter((a) => a.leaf)
    return {
      title: props.title,
      categories: leaves.map((a) => a.name),
      series: [{ label: props.title ?? 'Sunburst', values: leaves.map((a) => a.value), kind: 'bars' }],
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
        h('caption', null, props.title ?? 'Sunburst data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
