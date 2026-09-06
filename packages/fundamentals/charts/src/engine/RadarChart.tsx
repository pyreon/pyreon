// `<RadarChart>` — the spider family's component surface.
//
// Same design as `<PieChart>`: separate from `<PlotChart>` because a radar has
// no cartesian plot — no gutters, no shared y domain — and folding it in would
// cost every bar chart the radial trigonometry. The geometry lives in
// `./radar`; this file is only the canvas host, the legend, and the
// accessibility contract.

import { h } from '@pyreon/core'
import { resolveChartTheme, useChartTheme } from './theme'
import { paletteAt } from './palette'
import type { ChartTheme } from './render'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { renderRadar } from './radar'
import type { RadarAxis, RadarSeries } from './radar'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { renderLegend } from './legend'
import { chartTable, describeChart } from './a11y'
import { observeWidth, radialWidth } from './radial-host'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface RadarChartProps<T> {
  /** Token overrides merged over the theme in scope (`<ChartThemeProvider>`, else the system scheme). */
  theme?: Partial<ChartTheme>
  /** The rows — one polygon each. An accessor makes it reactive. */
  data: T[] | (() => T[])
  /**
   * The spokes. Each axis normalises by its OWN max, so axes in different
   * units — revenue beside a score out of 5 — are comparable on one chart;
   * see `radarPolygon`. Fewer than three axes has no area to enclose and
   * draws nothing.
   */
  axes: RadarAxis[] | (() => RadarAxis[])
  /** A row's value per axis, index-aligned with `axes`. */
  values: (d: T, index: number) => Double[]
  /** The row's name — the legend and the a11y table. */
  label: (d: T, index: number) => string
  /** Per-row colour; falls back to a built-in palette. */
  color?: (d: T, index: number) => string
  /** Fill opacity 0..1 for each polygon; the outline is always full. */
  fillAlpha?: Double
  /** Concentric grid rings. */
  rings?: number
  showLabels?: boolean
  showLegend?: boolean
  width?: Double
  height?: Double
  title?: string
  accessibleTable?: boolean
  class?: string
}

export function RadarChart<T>(props: RadarChartProps<T>): VNode {
  const themeOf = useChartTheme()
  const theme = (): ChartTheme => resolveChartTheme(themeOf(), props.theme)
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null

  const readData = (): T[] => {
    const d = props.data
    return typeof d === 'function' ? (d as () => T[])() : d
  }
  const readAxes = (): RadarAxis[] => {
    const a = props.axes
    return typeof a === 'function' ? (a as () => RadarAxis[])() : a
  }
  const colorAt = (d: T, i: number): string =>
    props.color?.(d, i) ?? paletteAt(theme().palette, i)

  const seriesOf = (rows: T[]): RadarSeries[] =>
    rows.map((d, i) => ({
      values: props.values(d, i),
      color: colorAt(d, i),
      fillAlpha: props.fillAlpha ?? 0.25,
    }))

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = radialWidth(el, props.width, 300)
    const hgt = props.height ?? 260
    const ctx = prepareCanvas(el, w, hgt, theme().background)
    if (ctx === null) return
    const rows = readData()
    const axes = readAxes()
    const measure = canvasMeasure(ctx, FONT)

    // Legend first, its measured height off the top — same reasoning as the
    // pie: a horizontal legend WRAPS, so its height is an output, not a guess.
    let legendH = 0
    const legendCmds = props.showLegend === true
      ? (() => {
          const l = renderLegend(
            rows.map((d, i) => ({ label: props.label(d, i), color: colorAt(d, i) })),
            { x: 8, y: 8, w: w - 16, h: hgt },
            { fontSize: theme().fontSize, labelColor: theme().label, swatch: 10, gap: 12, orientation: 'horizontal' },
            measure,
          )
          legendH = l.height
          return l.cmds
        })()
      : []

    const cmds = renderRadar(axes, seriesOf(rows), { x: 0, y: legendH, w, h: hgt - legendH }, {
      rings: props.rings ?? 4,
      gridColor: theme().grid,
      labelColor: theme().label,
      fontSize: theme().fontSize,
      showLabels: props.showLabels ?? true,
    })
    paint(ctx, [...legendCmds, ...cmds], w, hgt, FONT)
  }

  effect(() => {
    readData()
    readAxes()
    theme() // a provider mode flip repaints (draw() bails before reading it until the ref attaches)
    draw()
  })

  const a11y = () => {
    const rows = readData()
    return {
      title: props.title,
      categories: readAxes().map((a) => a.label),
      series: rows.map((d, i) => ({
        label: props.label(d, i),
        values: props.values(d, i),
        kind: 'radar',
      })),
    }
  }

  const canvasNode = h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () => describeChart(a11y()),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      if (el === null) {
        sizeObserver?.disconnect()
        sizeObserver = null
        return
      }
      draw()
      sizeObserver = observeWidth(el, () => radialWidth(el, props.width, 300), draw)
    },
  })

  if (props.accessibleTable === false) return canvasNode

  const table = (): VNode => {
    const t = chartTable(a11y())
    return h(
      'div',
      {
        style:
          'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;margin:-1px;padding:0',
      },
      h(
        'table',
        null,
        h('caption', null, props.title ?? 'Chart data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h(
          'tbody',
          null,
          ...t.rows.map((r) =>
            h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))),
          ),
        ),
      ),
    )
  }

  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
