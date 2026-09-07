// `<SankeyChart>` — a flow diagram on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { plain } from './format'
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
  const opts = (palette: readonly string[]): SankeyOptions => ({ palette, ...props.sankey })
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
      return layoutSankey(readNodes(), readLinks(), { x: box.x + g, y: box.y + 8.0, w: Math.max(0.0, box.w - g * 2.0), h: Math.max(0.0, box.h - 16.0) }, opts(theme.palette))
    },
    render: (layout, _measure, theme) => renderSankey(layout, opts(theme.palette)),
    legend: (layout) => layout.nodes.map((n) => ({ label: n.name, color: n.color })),
    select: (layout, px, py) => {
      props.onSelect?.(hitSankey(layout, px, py))
      props.onSelectIndex?.(hitSankeyIndex(layout, px, py))
    },
    tooltip: (layout, px, py) => {
      const hit = hitSankey(layout, px, py)
      if (hit === null) return null
      if (hit.kind === 'node') return [hit.node.name, plain(hit.node.value)]
      const l = hit.link
      const from = layout.nodes[l.source]
      const to = layout.nodes[l.target]
      return [`${from?.name ?? l.source} → ${to?.name ?? l.target}`, plain(l.value)]
    },
    a11y: (layout) => ({
      title: props.title,
      categories: layout.nodes.map((n) => n.name),
      series: [{ label: props.title ?? 'Flow', values: layout.nodes.map((n) => n.value), kind: 'bars' }],
    }),
  })
}
