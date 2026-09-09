// `<ParallelChart>` — parallel coordinates on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import type { ChartTheme } from './render'
import { layoutParallel, renderParallel } from './parallel'
import type { ParallelAxis, ParallelLayout, ParallelLine, ParallelOptions } from './parallel'
import { hitParallel, parallelLineColors, parallelRows } from './parallel-web'
import type { ParallelRow } from './parallel-web'
import type { Double } from './types'

export interface ParallelChartProps extends CanvasHostProps {
  axes: ParallelAxis[]
  rows: ParallelRow[] | (() => ParallelRow[])
  /** Space kept beyond the outer axes; default 40. */
  gutter?: Double
  parallel?: ParallelOptions
  /** Per-row line colour; the theme palette's first colour otherwise. */
  rowColor?: (row: ParallelRow, index: number) => string
  /** Fired with the line under the click, or null for a miss. */
  onSelect?: (line: ParallelLine | null) => void
  /** The line's row INDEX under the click, or -1 — the multiplatform-safe twin of `onSelect`. */
  onSelectIndex?: (index: number) => void
}

export function ParallelChart(props: ParallelChartProps): VNode {
  const readRows = (): ParallelRow[] => (typeof props.rows === 'function' ? props.rows() : props.rows)
  const opts = (t: ChartTheme): ParallelOptions => {
    const base: ParallelOptions = { palette: t.palette, labelColor: t.label, axisColor: t.axis, ...props.parallel }
    const colorOf = props.rowColor
    return colorOf === undefined ? base : { ...base, lineColors: parallelLineColors(readRows(), colorOf) }
  }
  return canvasHost<ParallelLayout>({
    props,
    defaultHeight: 300,
    caption: 'Parallel coordinates data',
    track: () => {
      readRows()
    },
    layout: (box, _measure, theme) => {
      const g = props.gutter ?? 40.0
      return layoutParallel(props.axes, parallelRows(props.axes, readRows()), { x: box.x + g, y: box.y + 8.0, w: Math.max(0.0, box.w - g * 2.0), h: Math.max(0.0, box.h - 16.0) }, opts(theme))
    },
    animates: true,
    render: (layout, _measure, theme, progress) => renderParallel(layout, { ...opts(theme), progress }),
    select: (layout, px, py) => {
      const line = hitParallel(layout, px, py)
      props.onSelect?.(line)
      props.onSelectIndex?.(line === null ? -1 : line.index)
    },
    pick: (layout, i) => {
      const line = layout.lines[i] ?? null
      props.onSelect?.(line)
      props.onSelectIndex?.(line === null ? -1 : line.index)
    },
    tooltip: (layout, px, py) => {
      const line = hitParallel(layout, px, py)
      if (line === null) return null
      const row = readRows()[line.index]
      return [`Row ${line.index + 1}`, ...props.axes.map((a, i) => `${a.name}: ${String(row?.[i] ?? '')}`)]
    },
    a11y: () => {
      const rows = readRows()
      return {
        title: props.title,
        categories: rows.map((_, i) => 'Row ' + String(i + 1)),
        series: props.axes.map((axis, a) => ({ label: axis.name, values: rows.map((r) => (typeof r[a] === 'number' ? (r[a] as number) : NaN)), kind: 'bars' })),
      }
    },
  })
}
