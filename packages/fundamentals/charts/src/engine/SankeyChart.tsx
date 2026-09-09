// `<SankeyChart>` — a flow diagram on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { sankeyLegend, sankeyTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import type { ChartTheme } from './render'
import { hitSankeyIndex, layoutSankey, renderSankey } from './sankey'
import type { SankeyHitIndex, SankeyLayout, SankeyLink, SankeyNode, SankeyOptions } from './sankey'
import { hitSankey } from './sankey-hit'
import type { SankeyHit } from './sankey-hit'
import type { Double } from './types'

export interface SankeyChartProps extends CanvasHostProps {
  nodes: SankeyNode[] | (() => SankeyNode[])
  links: SankeyLink[] | (() => SankeyLink[])
  /** Space kept for labels on both sides; default 80. */
  gutter?: Double
  sankey?: SankeyOptions
  /** Fired with the node or link under the click, or null for a miss. */
  onSelect?: (hit: SankeyHit) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: SankeyHitIndex) => void
}

export function SankeyChart(props: SankeyChartProps): VNode {
  const readNodes = (): SankeyNode[] => (typeof props.nodes === 'function' ? props.nodes() : props.nodes)
  const readLinks = (): SankeyLink[] => (typeof props.links === 'function' ? props.links() : props.links)
  const opts = (t: ChartTheme): SankeyOptions => ({ palette: t.palette, labelColor: t.label, ...props.sankey })
  return canvasHost<SankeyLayout>({
    props,
    defaultHeight: 300,
    caption: 'Flow data',
    track: () => {
      readNodes()
      readLinks()
    },
    layout: (box, _measure, theme) => {
      const g = props.gutter ?? 80.0
      return layoutSankey(readNodes(), readLinks(), { x: box.x + g, y: box.y + 8.0, w: Math.max(0.0, box.w - g * 2.0), h: Math.max(0.0, box.h - 16.0) }, opts(theme))
    },
    animates: true,
    render: (layout, _measure, theme, progress) => renderSankey(layout, { ...opts(theme), progress }),
    legend: sankeyLegend,
    select: (layout, px, py) => {
      props.onSelect?.(hitSankey(layout, px, py))
      props.onSelectIndex?.(hitSankeyIndex(layout, px, py))
    },
    tooltip: (layout, px, py) => orNull(sankeyTip(layout, px, py)),
    // Enter on a node selects it through the same hit path a click takes, at the node's centre.
    pick: (layout, i) => {
      const node = layout.nodes[i]
      if (node === undefined) return
      const cx = node.rect.x + node.rect.w / 2.0
      const cy = node.rect.y + node.rect.h / 2.0
      props.onSelect?.(hitSankey(layout, cx, cy))
      props.onSelectIndex?.(hitSankeyIndex(layout, cx, cy))
    },
    focusRect: (layout, i) => layout.nodes[i]?.rect ?? null,
    a11y: (layout) => ({
      title: props.title,
      categories: layout.nodes.map((n) => n.name),
      series: [{ label: props.title ?? 'Flow', values: layout.nodes.map((n) => n.value), kind: 'bars' }],
    }),
  })
}
