// `<SunburstChart>` — a radial hierarchy on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { sunburstLegend, sunburstTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { hitSunburst, hitSunburstIndex, layoutSunburst, renderSunburst } from './sunburst'
import type { SunburstArc, SunburstOptions } from './sunburst'
import type { TreeNode } from './treemap'
import type { Double, Pt } from './types'

export interface SunburstChartProps extends CanvasHostProps {
  data: TreeNode[] | (() => TreeNode[])
  /** Hole radius as a fraction of the outer radius; default 0.2. */
  innerRatio?: Double
  sunburst?: SunburstOptions
  /** Fired with the arc under the click, or null for a miss. */
  onSelect?: (arc: SunburstArc | null) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: number) => void
}

interface Geometry { arcs: SunburstArc[]; center: Pt }

export function SunburstChart(props: SunburstChartProps): VNode {
  const readData = (): TreeNode[] => (typeof props.data === 'function' ? (props.data as () => TreeNode[])() : props.data)
  return canvasHost<Geometry>({
    props,
    defaultHeight: 300,
    caption: 'Sunburst data',
    track: () => {
      readData()
    },
    layout: (box, _measure, theme) => {
      const outerR = Math.max(0.0, Math.min(box.w, box.h) / 2.0 - 4.0)
      const innerR = outerR * (props.innerRatio ?? 0.2)
      return { arcs: layoutSunburst(readData(), innerR, outerR, { palette: theme.palette, ...props.sunburst }), center: { x: box.x + box.w / 2.0, y: box.y + box.h / 2.0 } }
    },
    render: (g, measure, theme) => renderSunburst(g.arcs, g.center, { palette: theme.palette, ...props.sunburst }, measure),
    legend: (g) => sunburstLegend(g.arcs),
    select: (g, px, py) => {
      props.onSelect?.(hitSunburst(g.arcs, g.center, px, py))
      props.onSelectIndex?.(hitSunburstIndex(g.arcs, g.center, px, py))
    },
    tooltip: (g, px, py) => orNull(sunburstTip(g.arcs, g.center, px, py)),
    a11y: (g) => {
      const leaves = g.arcs.filter((a) => a.leaf)
      return {
        title: props.title,
        categories: leaves.map((a) => a.name),
        series: [{ label: props.title ?? 'Sunburst', values: leaves.map((a) => a.value), kind: 'bars' }],
      }
    },
  })
}
