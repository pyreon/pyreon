// `<RiverChart>` — a theme river (streamgraph) on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { riverLegend, riverTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { hitRiver, hitRiverIndex, layoutRiver, renderRiver } from './river'
import type { RiverLayer, RiverLayout, RiverOptions, RiverSeries } from './river'

export interface RiverChartProps extends CanvasHostProps {
  series: RiverSeries[] | (() => RiverSeries[])
  river?: RiverOptions
  /** Fired with the layer under the click, or null for a miss. */
  onSelect?: (layer: RiverLayer | null) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: number) => void
}

export function RiverChart(props: RiverChartProps): VNode {
  const readSeries = (): RiverSeries[] => (typeof props.series === 'function' ? props.series() : props.series)
  const opts = (palette: readonly string[]): RiverOptions => ({ palette, ...props.river })
  return canvasHost<RiverLayout>({
    props,
    defaultHeight: 300,
    caption: 'River data',
    track: () => {
      readSeries()
    },
    layout: (box, _measure, theme) => layoutRiver(readSeries(), { x: box.x + 8.0, y: box.y + 8.0, w: Math.max(0.0, box.w - 16.0), h: Math.max(0.0, box.h - 16.0) }, opts(theme.palette)),
    render: (layout, measure, theme) => renderRiver(layout, opts(theme.palette), measure),
    legend: riverLegend,
    select: (layout, px, py) => {
      props.onSelect?.(hitRiver(layout, px, py, props.river?.curve))
      props.onSelectIndex?.(hitRiverIndex(layout, px, py, props.river?.curve))
    },
    tooltip: (layout, px, py) => orNull(riverTip(layout, px, py, props.river?.curve)),
    a11y: () => {
      const series = readSeries()
      let n = 0
      for (const s of series) if (s.values.length > n) n = s.values.length
      const cats = props.river?.categories ?? Array.from({ length: n }, (_, i) => String(i + 1))
      return { title: props.title, categories: cats, series: series.map((s) => ({ label: s.name, values: s.values, kind: 'area' })) }
    },
  })
}
