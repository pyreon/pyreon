// `<RadarChart>` — series polygons over a spider grid, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { plain } from './format'
import { paletteAt } from './palette'
import { hitRadarIndex, renderRadar } from './radar'
import type { RadarAxis, RadarHitIndex, RadarOptions, RadarSeries } from './radar'
import type { Double, Rect } from './types'

export interface RadarChartProps<T> extends CanvasHostProps {
  data: T[] | (() => T[])
  axes: RadarAxis[] | (() => RadarAxis[])
  /** One value per axis, in axis order. */
  values: (d: T, index: number) => Double[]
  label: (d: T, index: number) => string
  /** Per-series colour; the theme palette otherwise. */
  color?: (d: T, index: number) => string
  /** Polygon fill opacity; default 0.25. */
  fillAlpha?: Double
  /** Grid rings; default 4. */
  rings?: number
  /** Axis labels around the rim (default on). */
  showLabels?: boolean
  /** Fired with the nearest polygon vertex as `{ series, axis }`, or `{ series: -1, axis: -1 }` for a miss. */
  onSelect?: (hit: RadarHitIndex) => void
  /** The engine's INDEX hit — the same `{ series, axis }`; the multiplatform-safe name every host carries. */
  onSelectIndex?: (hit: RadarHitIndex) => void
}

interface Geometry { axes: RadarAxis[]; series: RadarSeries[]; labels: string[]; box: Rect; opts: RadarOptions }

export function RadarChart<T>(props: RadarChartProps<T>): VNode {
  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  const readAxes = (): RadarAxis[] => (typeof props.axes === 'function' ? (props.axes as () => RadarAxis[])() : props.axes)
  return canvasHost<Geometry>({
    props,
    defaultHeight: 260,
    caption: 'Radar data',
    track: () => {
      readData()
      readAxes()
    },
    layout: (box, _measure, theme) => {
      const rows = readData()
      return {
        axes: readAxes(),
        series: rows.map((d, i) => ({ values: props.values(d, i), color: props.color?.(d, i) ?? paletteAt(theme.palette, i), fillAlpha: props.fillAlpha ?? 0.25 })),
        labels: rows.map((d, i) => props.label(d, i)),
        box,
        opts: { rings: props.rings ?? 4, gridColor: theme.grid, labelColor: theme.label, fontSize: theme.fontSize, showLabels: props.showLabels ?? true },
      }
    },
    render: (g) => renderRadar(g.axes, g.series, g.box, g.opts),
    legend: (g) => g.series.map((s, i) => ({ label: g.labels[i] ?? `Series ${i + 1}`, color: s.color })),
    select: (g, px, py) => {
      const hit = hitRadarIndex(g.axes, g.series, g.box, g.opts, px, py)
      props.onSelect?.(hit)
      props.onSelectIndex?.(hit)
    },
    tooltip: (g, px, py) => {
      const hit = hitRadarIndex(g.axes, g.series, g.box, g.opts, px, py)
      if (hit.series < 0) return null
      const v = g.series[hit.series]!.values[hit.axis]
      return [g.labels[hit.series] ?? `Series ${hit.series + 1}`, `${g.axes[hit.axis]?.label ?? ''}: ${plain(v ?? 0)}`]
    },
    a11y: (g) => ({
      title: props.title,
      categories: g.axes.map((a) => a.label),
      series: g.series.map((s, i) => ({ label: g.labels[i] ?? `Series ${i + 1}`, values: s.values, kind: 'radar' })),
    }),
  })
}
