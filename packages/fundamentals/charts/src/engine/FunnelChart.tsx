// `<FunnelChart>` — a conversion funnel on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { funnelLegend, funnelTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import { hitFunnel, renderFunnel } from './funnel'
import type { FunnelOptions, FunnelStage } from './funnel'
import { paletteAt } from './palette'
import type { Double, Rect } from './types'

export interface FunnelChartProps<T> extends CanvasHostProps {
  data: T[] | (() => T[])
  value: (d: T, index: number) => Double
  label: (d: T, index: number) => string
  /** Per-stage colour; the theme palette otherwise. */
  color?: (d: T, index: number) => string
  funnel?: FunnelOptions
  /** Fired with the stage index under the click, or -1 for a miss. */
  onSelect?: (index: number) => void
  /** The engine's INDEX hit — identical to `onSelect` here; the multiplatform-safe name every host carries. */
  onSelectIndex?: (index: number) => void
}

interface Geometry { stages: FunnelStage[]; plot: Rect }

export function FunnelChart<T>(props: FunnelChartProps<T>): VNode {
  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  const stages = (palette: readonly string[]): FunnelStage[] =>
    readData().map((d, i) => ({ value: props.value(d, i), label: props.label(d, i), color: props.color !== undefined ? props.color(d, i) : paletteAt(palette, i) }))
  return canvasHost<Geometry>({
    props,
    defaultHeight: 240,
    caption: 'Funnel data',
    track: () => {
      readData()
    },
    layout: (box, _measure, theme) => ({ stages: stages(theme.palette), plot: { x: box.x + 8.0, y: box.y + 8.0, w: box.w - 16.0, h: box.h - 16.0 } }),
    animates: true,
    render: (g, _measure, _theme, progress) => renderFunnel(g.stages, g.plot, { ...props.funnel, progress }),
    legend: (g) => funnelLegend(g.stages),
    select: (g, px, py) => {
      const i = hitFunnel(g.stages, g.plot, px, py, props.funnel)
      props.onSelect?.(i)
      props.onSelectIndex?.(i)
    },
    tooltip: (g, px, py) => orNull(funnelTip(g.stages, g.plot, px, py, props.funnel)),
    pick: (_g, i) => {
      props.onSelect?.(i)
      props.onSelectIndex?.(i)
    },
    a11y: (g) => ({
      title: props.title,
      categories: g.stages.map((x) => x.label),
      series: [{ label: props.title ?? 'Funnel', values: g.stages.map((x) => x.value), kind: 'bars' }],
    }),
  })
}
