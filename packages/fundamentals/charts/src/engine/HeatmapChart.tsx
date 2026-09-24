// `<HeatmapChart>` — a category×category value grid on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, shiftCmds } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { plain } from './format'
import type { Formatter } from './format'
import type { HeatGrid } from './heat'
import { heatGridFrom, heatPlotFor, hitHeatChart, renderHeatChart } from './heat-chart'
import type { ChartTheme } from './render'
import type { Double, MeasureText, Rect } from './types'
import type { VisualMapSpec } from './visual-map'
import { visualMapHost } from './visual-map-host'
import type { VisualMapSelection } from './visual-map-host'

export interface HeatmapChartProps<T> extends CanvasHostProps {
  data: T[] | (() => T[])
  x: (d: T, index: number) => string
  y: (d: T, index: number) => string
  value: (d: T, index: number) => Double
  /** Colour ramp stops from the minimum to the maximum value. */
  colors?: string[]
  /** Gap between cells, px; default 1. */
  gap?: Double
  /** Formats values in the tooltip. */
  format?: Formatter
  /** Fired with the cell under the click, or null for a miss. */
  onSelect?: (cell: { x: string; y: string; value: Double } | null) => void
  /** The cell's INDEX under the click, or -1 — the multiplatform-safe twin of `onSelect`. */
  onSelectIndex?: (index: number) => void
  /**
   * An ECharts-style visualMap beside the grid: its domain drives the ramp,
   * a `calculable` strip's handles drag the in-range interval and a piecewise
   * strip's swatches toggle; cells outside the selection take the inactive colour.
   */
  visualMap?: VisualMapSpec | (() => VisualMapSpec | undefined) | undefined
  /** Fired as the visualMap selection changes. */
  onVisualMapChange?: (selection: VisualMapSelection) => void
}

interface Geometry { grid: HeatGrid; box: Rect; outer: Rect; theme: ChartTheme; measure: MeasureText }

export function HeatmapChart<T>(props: HeatmapChartProps<T>): VNode {
  const readData = (): T[] => (typeof props.data === 'function' ? (props.data as () => T[])() : props.data)
  const resolve = (rows: T[]): HeatGrid =>
    heatGridFrom(
      rows.map((d, i) => props.x(d, i)),
      rows.map((d, i) => props.y(d, i)),
      rows.map((d, i) => {
        const v = props.value(d, i)
        return Number.isFinite(v) ? v : 0
      }),
    )
  const vm = visualMapHost(
    () => (typeof props.visualMap === 'function' ? props.visualMap() : props.visualMap),
    (sel) => props.onVisualMapChange?.(sel),
  )
  const cellAt = (g: Geometry, px: Double, py: Double): number => hitHeatChart(g.grid, g.box.w, g.box.h, g.theme.fontSize, props.gap ?? 1.0, g.measure, px - g.box.x, py - g.box.y)
  return canvasHost<Geometry>({
    props,
    defaultHeight: 200,
    caption: 'Heatmap data',
    track: () => {
      readData()
      vm.track()
    },
    layout: (box, measure, theme) => ({ grid: resolve(readData()), box: vm.chartBox(box), outer: box, theme, measure }),
    animates: true,
    render: (g, measure, theme, progress) => {
      const spec = vm.current()
      const cmds = shiftCmds(renderHeatChart(g.grid, g.box.w, g.box.h, theme, props.colors ?? spec?.stops ?? theme.ramp, props.gap ?? 1.0, measure, progress, vm.selection()), g.box.x, g.box.y)
      for (const c of vm.cmds(g.outer)) cmds.push(c)
      return cmds
    },
    drag: {
      start: (g, px, py) => vm.start(g.outer, px, py),
      move: (g, px, py) => vm.move(g.outer, px, py),
      end: () => vm.end(),
    },
    select: (g, px, py) => {
      if (vm.click(g.outer, px, py)) return
      const idx = cellAt(g, px, py)
      props.onSelectIndex?.(idx)
      if (props.onSelect === undefined) return
      const c = g.grid.cells[idx]
      props.onSelect(c === undefined ? null : { x: g.grid.cols[c.col]!, y: g.grid.rows[c.row]!, value: c.value })
    },
    tooltip: (g, px, py) => {
      const c = g.grid.cells[cellAt(g, px, py)]
      if (c === undefined) return null
      const fmt = props.format ?? plain
      return [`${g.grid.rows[c.row]!} \u00b7 ${g.grid.cols[c.col]!}: ${fmt(c.value)}`]
    },
    // ECharts' heatmap datum: [x, y, value].
    item: (g, px, py) => {
      const idx = cellAt(g, px, py)
      const c = g.grid.cells[idx]
      if (c === undefined) return null
      return { seriesIndex: 0, dataIndex: idx, name: '', value: [g.grid.cols[c.col]!, g.grid.rows[c.row]!, c.value] }
    },
    // The keyboard walks the COLUMNS — the accessible table's rows, which is
    // what the live region announces (one column per row, a cell per series).
    // Enter picks the column's first cell; the ring wraps the column.
    pick: (g, i) => {
      const col = g.grid.cols[i]
      if (col === undefined) return
      let ci = -1
      for (let k = 0; k < g.grid.cells.length; k++) if (ci < 0 && g.grid.cells[k]!.col === i) ci = k
      props.onSelectIndex?.(ci)
      const c = g.grid.cells[ci]
      if (props.onSelect !== undefined) props.onSelect(c === undefined ? null : { x: col, y: g.grid.rows[c.row]!, value: c.value })
    },
    focusRect: (g, i) => {
      if (i < 0 || i >= g.grid.cols.length || g.grid.rows.length === 0) return null
      const plot = heatPlotFor(g.grid, g.box.w, g.box.h, g.theme.fontSize, g.measure)
      const cw = plot.w / g.grid.cols.length
      const gap = props.gap ?? 1.0
      return { x: g.box.x + plot.x + cw * i + gap / 2.0, y: g.box.y + plot.y, w: Math.max(0.0, cw - gap), h: plot.h }
    },
    describe: (g) => {
      const title = props.title ?? 'Heatmap'
      if (g.grid.cells.length === 0) return `${title}: no data.`
      return `${title}: ${g.grid.cols.length} columns by ${g.grid.rows.length} rows, values ${g.grid.min} to ${g.grid.max}.`
    },
    a11y: (g) => ({
      title: props.title,
      categories: g.grid.cols,
      series: g.grid.rows.map((row, r) => ({ label: row, values: g.grid.cols.map((_, c) => g.grid.cells.find((cell) => cell.row === r && cell.col === c)?.value ?? NaN), kind: 'bars' })),
      format: props.format,
    }),
  })
}
