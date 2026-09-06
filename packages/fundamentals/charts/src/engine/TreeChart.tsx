// `<TreeChart>` — a node-link hierarchy on a canvas.

import { h } from '@pyreon/core'
import type { ChartTheme } from './render'
import { resolveChartTheme, useChartTheme } from './theme'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { paint, prepareCanvas } from './canvas-web'
import { hitTree, hitTreeIndex, layoutTree, renderTree } from './tree'
import type { TreeLayout, TreeLayoutNode, TreeOptions } from './tree'
import type { TreeNode } from './treemap'
import { chartTable, describeChart } from './a11y'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface TreeChartProps {
  /** Token overrides merged over the theme in scope (`<ChartThemeProvider>`, else the system scheme). */
  theme?: Partial<ChartTheme>
  data: TreeNode[] | (() => TreeNode[])
  width?: Double
  height?: Double
  tree?: TreeOptions
  title?: string
  /** Fired with the node under the click, or null for a miss. */
  onSelect?: (node: TreeLayoutNode | null) => void
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

export function TreeChart(props: TreeChartProps): VNode {
  const themeOf = useChartTheme()
  const theme = (): ChartTheme => resolveChartTheme(themeOf(), props.theme)
  const treeOpts = (): TreeOptions => ({ palette: theme().palette, ...props.tree })
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const readData = (): TreeNode[] => {
    const d = props.data
    return typeof d === 'function' ? (d as () => TreeNode[])() : d
  }
  const layoutFor = (w: Double, hgt: Double): TreeLayout => layoutTree(readData(), { x: 0.0, y: 0.0, w, h: hgt }, treeOpts())

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const ctx = prepareCanvas(el, w, hgt, theme().background)
    if (ctx === null) return
    paint(ctx, renderTree(layoutFor(w, hgt), treeOpts()), w, hgt, FONT)
  }

  effect(() => {
    readData()
    theme() // a provider mode flip repaints (draw() bails before reading it until the ref attaches)
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
    if (cb !== undefined) cb(hitTree(layout, px, py, treeOpts()?.symbolSize))
    if (cbi !== undefined) cbi(hitTreeIndex(layout, px, py, treeOpts()?.symbolSize))
  }

  const a11y = () => {
    const nodes = layoutFor(300, 300).nodes
    return {
      title: props.title,
      categories: nodes.map((n) => n.name),
      series: [{ label: props.title ?? 'Tree', values: nodes.map((n) => n.value ?? n.depth), kind: 'bars' }],
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
        h('caption', null, props.title ?? 'Tree data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
