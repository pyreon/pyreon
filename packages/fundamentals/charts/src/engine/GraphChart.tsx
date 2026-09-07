// `<GraphChart>` — a node-link graph on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { graphTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { hitGraphIndex, layoutGraph, renderGraph } from './graph'
import { hitGraph } from './graph-hit'
import type { GraphLayout, GraphLayoutNode, GraphLink, GraphNode, GraphOptions } from './graph'
import type { Rect } from './types'

export interface GraphChartProps extends CanvasHostProps {
  nodes: GraphNode[] | (() => GraphNode[])
  links: GraphLink[] | (() => GraphLink[])
  graph?: GraphOptions
  /** Fired with the node under the click, or null for a miss. */
  onSelect?: (node: GraphLayoutNode | null) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: number) => void
}

interface Geometry { layout: GraphLayout; box: Rect }

export function GraphChart(props: GraphChartProps): VNode {
  const readNodes = (): GraphNode[] => (typeof props.nodes === 'function' ? props.nodes() : props.nodes)
  const readLinks = (): GraphLink[] => (typeof props.links === 'function' ? props.links() : props.links)
  const opts = (palette: readonly string[]): GraphOptions => ({ palette, ...props.graph })
  return canvasHost<Geometry>({
    props,
    defaultHeight: 300,
    caption: 'Graph data',
    track: () => {
      readNodes()
      readLinks()
    },
    layout: (box, _measure, theme) => ({ layout: layoutGraph(readNodes(), readLinks(), box, opts(theme.palette)), box }),
    animates: true,
    render: (g, _measure, theme, progress) => renderGraph(g.layout, g.box, { ...opts(theme.palette), progress }),
    select: (g, px, py) => {
      props.onSelect?.(hitGraph(g.layout, px, py))
      props.onSelectIndex?.(hitGraphIndex(g.layout, px, py))
    },
    tooltip: (g, px, py) => orNull(graphTip(g.layout, px, py)),
    a11y: (g) => ({
      title: props.title,
      categories: g.layout.nodes.map((n) => n.name),
      series: [{ label: props.title ?? 'Graph', values: g.layout.nodes.map((n) => n.value ?? 1), kind: 'bars' }],
    }),
  })
}
