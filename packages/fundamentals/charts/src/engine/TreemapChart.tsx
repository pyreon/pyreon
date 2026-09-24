// `<TreemapChart>` — a squarified hierarchy on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { treemapLegend, treemapTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { hitTreemap, hitTreemapIndex, layoutTreemap, renderTreemap, renderTreemapEc, treemapEcCells, treemapGround } from './treemap'
import type { TreeNode, TreemapCell, TreemapOptions } from './treemap'
import type { TreemapEc } from './option-treemap'
import type { Rect } from './types'

export interface TreemapChartProps extends CanvasHostProps {
  data: TreeNode[] | (() => TreeNode[])
  treemap?: TreemapOptions
  /**
   * ECharts' own treemap (what `<OptionChart>` compiles an option to): its
   * squarify, sort, levels, thresholds and painting, laid out in the whole
   * box. Replaces `treemap`'s simpler layout when set.
   */
  echarts?: TreemapEc
  /** Fired with the deepest cell under the click, or null for a miss. */
  onSelect?: (cell: TreemapCell | null) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: number) => void
}

/** The cells, and the series box an ECharts treemap paints its background in. */
interface Geometry { cells: TreemapCell[]; box: Rect }

export function TreemapChart(props: TreemapChartProps): VNode {
  const readData = (): TreeNode[] => (typeof props.data === 'function' ? (props.data as () => TreeNode[])() : props.data)
  return canvasHost<Geometry>({
    props,
    defaultHeight: 300,
    caption: 'Treemap data',
    track: () => {
      readData()
    },
    layout: (box, _measure, theme) => ({
      box,
      cells: props.echarts !== undefined ? treemapEcCells(props.echarts.root, box, props.echarts.cfg, theme.palette) : layoutTreemap(readData(), box, { palette: theme.palette, ...props.treemap }),
    }),
    animates: true,
    render: (g, measure, theme, progress) => {
      const ec = props.echarts
      if (ec === undefined) return renderTreemap(g.cells, { palette: theme.palette, ...props.treemap, progress }, measure)
      const bg = treemapGround(ec.borderColor, theme.background ?? '')
      return renderTreemapEc(g.cells, g.box, bg, ec.labelColor, ec.fontSize, ec.showLabels, progress, measure)
    },
    legend: (g) => treemapLegend(g.cells),
    select: ({ cells }, px, py) => {
      props.onSelect?.(hitTreemap(cells, px, py))
      props.onSelectIndex?.(hitTreemapIndex(cells, px, py))
    },
    tooltip: ({ cells }, px, py) => orNull(treemapTip(cells, px, py)),
    item: ({ cells }, px, py) => {
      const i = hitTreemapIndex(cells, px, py)
      const c = cells[i]
      return c === undefined ? null : { seriesIndex: 0, dataIndex: i, name: c.name, value: c.value, color: c.color }
    },
    // The keyboard walks the LEAVES (what the accessible table lists); the ring and the pick address the leaf's cell.
    pick: ({ cells }, i) => {
      const leaf = cells.filter((c) => c.leaf)[i]
      if (leaf === undefined) return
      props.onSelect?.(leaf)
      props.onSelectIndex?.(cells.indexOf(leaf))
    },
    focusRect: ({ cells }, i) => cells.filter((c) => c.leaf)[i]?.rect ?? null,
    a11y: ({ cells }) => {
      const leaves = cells.filter((c) => c.leaf)
      return {
        title: props.title,
        categories: leaves.map((c) => c.name),
        series: [{ label: props.title ?? 'Treemap', values: leaves.map((c) => c.value), kind: 'bars' }],
      }
    },
  })
}
