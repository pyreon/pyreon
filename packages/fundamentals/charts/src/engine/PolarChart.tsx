// `<PolarChart>` — bars and lines on a polar coordinate system, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import { polarLegend, polarTip } from './chrome'
import type { CanvasHostProps } from './canvas-host'
import type { ChartTheme } from './render'
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
  const opts = (t: ChartTheme): PolarOptions => ({ palette: t.palette, labelColor: t.label, gridColor: t.grid, ...props.polar })
  return canvasHost<PolarLayout>({
    props,
    defaultHeight: 300,
    caption: 'Polar data',
    track: () => {
      readSeries()
    },
    layout: (box, _measure, theme) => layoutPolar(props.axes, readSeries(), box, opts(theme)),
    animates: true,
    render: (layout, _measure, theme, progress) => renderPolar(layout, { ...opts(theme), progress }),
    legend: (_layout, theme) => polarLegend(readSeries(), theme.palette),
    select: (layout, px, py) => {
      props.onSelect?.(hitPolar(layout, px, py))
      props.onSelectIndex?.(hitPolarIndex(layout, px, py))
    },
    tooltip: (layout, px, py) => orNull(polarTip(layout, readSeries(), px, py)),
    // The keyboard walks the CATEGORIES (the table's rows): Enter picks the
    // first series' item at the focused category — its sector, or its line
    // point — and the ring wraps it.
    pick: (layout, i) => {
      const si = layout.sectors.findIndex((s) => s.index === i)
      if (si >= 0) {
        props.onSelect?.({ kind: 'sector', sector: layout.sectors[si]! })
        props.onSelectIndex?.({ sector: si, line: -1, point: -1 })
        return
      }
      for (let li = 0; li < layout.lines.length; li++) {
        const pi = layout.lines[li]!.points.findIndex((p) => p.index === i)
        if (pi < 0) continue
        props.onSelect?.({ kind: 'point', point: layout.lines[li]!.points[pi]! })
        props.onSelectIndex?.({ sector: -1, line: li, point: pi })
        return
      }
    },
    focusRect: (layout, i) => {
      const sector = layout.sectors.find((s) => s.index === i)
      if (sector !== undefined) {
        // The sector's bounding box: its two radii at the start and end angles plus the mid angle.
        const angles = [sector.start, sector.end, (sector.start + sector.end) / 2.0]
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
        for (const a of angles) for (const r of [sector.innerR, sector.outerR]) {
          const x = layout.center.x + Math.cos(a) * r
          const y = layout.center.y + Math.sin(a) * r
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
      }
      for (const line of layout.lines) {
        const p = line.points.find((q) => q.index === i)
        if (p !== undefined) return { x: p.at.x - 6.0, y: p.at.y - 6.0, w: 12.0, h: 12.0 }
      }
      return null
    },
    a11y: () => ({
      title: props.title,
      categories: props.axes.categories,
      series: readSeries().map((s) => ({ label: s.name, values: s.values, kind: s.kind === 'bar' ? 'bars' : 'line' })),
    }),
  })
}
