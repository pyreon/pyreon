// `<TreeChart>` — a node-link hierarchy on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { plain } from './format'
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
    render: (layout, _measure, theme) => renderTree(layout, opts(theme.palette)),
    legend: (layout) => layout.nodes.filter((n) => n.depth === 0).map((n) => ({ label: n.name, color: n.color })),
    select: (layout, px, py) => {
      props.onSelect?.(hitTree(layout, px, py, props.tree?.symbolSize))
      props.onSelectIndex?.(hitTreeIndex(layout, px, py, props.tree?.symbolSize))
    },
    tooltip: (layout, px, py) => {
      const n = hitTree(layout, px, py, props.tree?.symbolSize)
      return n === null ? null : n.value === undefined ? [n.name] : [n.name, plain(n.value)]
    },
    a11y: (layout) => ({
      title: props.title,
      categories: layout.nodes.map((n) => n.name),
      series: [{ label: props.title ?? 'Tree', values: layout.nodes.map((n) => n.value ?? n.depth), kind: 'bars' }],
    }),
  })
}
