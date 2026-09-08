// `<TreeChart>` — a node-link hierarchy on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { treeLegend, treeTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { hitTree, hitTreeIndex, layoutTree, renderTree } from './tree'
import type { TreeLayout, TreeLayoutNode, TreeOptions } from './tree'
import type { TreeNode } from './treemap'

export interface TreeChartProps extends CanvasHostProps {
  data: TreeNode[] | (() => TreeNode[])
  tree?: TreeOptions
  /** Fired with the node under the click, or null for a miss. */
  onSelect?: (node: TreeLayoutNode | null) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: number) => void
}

export function TreeChart(props: TreeChartProps): VNode {
  const readData = (): TreeNode[] => (typeof props.data === 'function' ? (props.data as () => TreeNode[])() : props.data)
  const opts = (palette: readonly string[]): TreeOptions => ({ palette, ...props.tree })
  return canvasHost<TreeLayout>({
    props,
    defaultHeight: 300,
    caption: 'Tree data',
    track: () => {
      readData()
    },
    layout: (box, _measure, theme) => layoutTree(readData(), box, opts(theme.palette)),
    animates: true,
    render: (layout, _measure, theme, progress) => renderTree(layout, { ...opts(theme.palette), progress }),
    legend: treeLegend,
    select: (layout, px, py) => {
      props.onSelect?.(hitTree(layout, px, py, props.tree?.symbolSize))
      props.onSelectIndex?.(hitTreeIndex(layout, px, py, props.tree?.symbolSize))
    },
    tooltip: (layout, px, py) => orNull(treeTip(layout, px, py, props.tree?.symbolSize)),
    pick: (layout, i) => {
      const node = layout.nodes[i]
      if (node === undefined) return
      props.onSelect?.(node)
      props.onSelectIndex?.(i)
    },
    focusRect: (layout, i) => {
      const node = layout.nodes[i]
      if (node === undefined) return null
      const r = (props.tree?.symbolSize ?? 8.0) / 2.0 + 3.0
      return { x: node.at.x - r, y: node.at.y - r, w: r * 2.0, h: r * 2.0 }
    },
    a11y: (layout) => ({
      title: props.title,
      categories: layout.nodes.map((n) => n.name),
      series: [{ label: props.title ?? 'Tree', values: layout.nodes.map((n) => n.value ?? n.depth), kind: 'bars' }],
    }),
  })
}
