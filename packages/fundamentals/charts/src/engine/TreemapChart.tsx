// `<TreemapChart>` — a squarified hierarchy on a canvas.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { hitTreemap, hitTreemapIndex, layoutTreemap, renderTreemap } from './treemap'
import type { TreeNode, TreemapCell, TreemapOptions } from './treemap'
import { chartTable, describeChart } from './a11y'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface TreemapChartProps {
  data: TreeNode[] | (() => TreeNode[])
  width?: Double
  height?: Double
  treemap?: TreemapOptions
  title?: string
  /** Fired with the deepest cell under the click, or null for a miss. */
  onSelect?: (cell: TreemapCell | null) => void
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

export function TreemapChart(props: TreemapChartProps): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readData = (): TreeNode[] => {
    const d = props.data
    return typeof d === 'function' ? (d as () => TreeNode[])() : d
  }
  const cellsFor = (w: Double, hgt: Double): TreemapCell[] =>
    layoutTreemap(readData(), { x: 0.0, y: 0.0, w, h: hgt }, props.treemap)

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    paint(ctx, renderTreemap(cellsFor(w, hgt), props.treemap, canvasMeasure(ctx, FONT)), w, hgt, FONT)
  }

  effect(() => {
    readData()
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
    const cells = cellsFor(w, hgt)
    const px = ev.clientX - r.left
    const py = ev.clientY - r.top
    if (cb !== undefined) cb(hitTreemap(cells, px, py))
    if (cbi !== undefined) cbi(hitTreemapIndex(cells, px, py))
  }

  const a11y = () => {
    const leaves = cellsFor(300, 300).filter((c) => c.leaf)
    return {
      title: props.title,
      categories: leaves.map((c) => c.name),
      series: [{ label: props.title ?? 'Treemap', values: leaves.map((c) => c.value), kind: 'bars' }],
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
        h('caption', null, props.title ?? 'Treemap data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
