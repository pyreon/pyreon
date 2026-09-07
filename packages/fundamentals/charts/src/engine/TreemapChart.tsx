// `<TreemapChart>` — a squarified hierarchy on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { treemapLegend, treemapTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { hitTreemap, hitTreemapIndex, layoutTreemap, renderTreemap } from './treemap'
import type { TreeNode, TreemapCell, TreemapOptions } from './treemap'

export interface TreemapChartProps extends CanvasHostProps {
  data: TreeNode[] | (() => TreeNode[])
  treemap?: TreemapOptions
  /** Fired with the deepest cell under the click, or null for a miss. */
  onSelect?: (cell: TreemapCell | null) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: number) => void
}

export function TreemapChart(props: TreemapChartProps): VNode {
  const readData = (): TreeNode[] => (typeof props.data === 'function' ? (props.data as () => TreeNode[])() : props.data)
  return canvasHost<TreemapCell[]>({
    props,
    defaultHeight: 300,
    caption: 'Treemap data',
    track: () => {
      readData()
    },
    layout: (box, _measure, theme) => layoutTreemap(readData(), box, { palette: theme.palette, ...props.treemap }),
    render: (cells, measure, theme) => renderTreemap(cells, { palette: theme.palette, ...props.treemap }, measure),
    legend: treemapLegend,
    select: (cells, px, py) => {
      props.onSelect?.(hitTreemap(cells, px, py))
      props.onSelectIndex?.(hitTreemapIndex(cells, px, py))
    },
    tooltip: (cells, px, py) => orNull(treemapTip(cells, px, py)),
    a11y: (cells) => {
      const leaves = cells.filter((c) => c.leaf)
      return {
        title: props.title,
        categories: leaves.map((c) => c.name),
        series: [{ label: props.title ?? 'Treemap', values: leaves.map((c) => c.value), kind: 'bars' }],
      }
    },
  })
}
