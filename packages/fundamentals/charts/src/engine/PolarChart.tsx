// `<PolarChart>` — bars and lines on a polar coordinate system, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { polarLegend, polarTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { hitPolarIndex, layoutPolar, renderPolar } from './polar'
import type { PolarAxes, PolarHitIndex, PolarLayout, PolarOptions, PolarSeries } from './polar'
import { hitPolar } from './polar-hit'
import type { PolarHit } from './polar-hit'

export interface PolarChartProps extends CanvasHostProps {
  axes: PolarAxes
  series: PolarSeries[] | (() => PolarSeries[])
  polar?: PolarOptions
  /** Fired with the sector or line point under the click, or null for a miss. */
  onSelect?: (hit: PolarHit) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: PolarHitIndex) => void
}

export function PolarChart(props: PolarChartProps): VNode {
  const readSeries = (): PolarSeries[] => (typeof props.series === 'function' ? props.series() : props.series)
  const opts = (palette: readonly string[]): PolarOptions => ({ palette, ...props.polar })
  return canvasHost<PolarLayout>({
    props,
    defaultHeight: 300,
    caption: 'Polar data',
    track: () => {
      readSeries()
    },
    layout: (box, _measure, theme) => layoutPolar(props.axes, readSeries(), box, opts(theme.palette)),
    render: (layout, _measure, theme) => renderPolar(layout, opts(theme.palette)),
    legend: (_layout, theme) => polarLegend(readSeries(), theme.palette),
    select: (layout, px, py) => {
      props.onSelect?.(hitPolar(layout, px, py))
      props.onSelectIndex?.(hitPolarIndex(layout, px, py))
    },
    tooltip: (layout, px, py) => orNull(polarTip(layout, readSeries(), px, py)),
    a11y: () => ({
      title: props.title,
      categories: props.axes.categories,
      series: readSeries().map((s) => ({ label: s.name, values: s.values, kind: s.kind === 'bar' ? 'bars' : 'line' })),
    }),
  })
}
