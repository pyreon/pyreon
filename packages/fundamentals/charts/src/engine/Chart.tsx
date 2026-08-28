// `<PlotChart>` — the authoring surface over the engine.
//
// Named `PlotChart` rather than `Chart` because `@pyreon/charts` already
// exports a `Chart` (the ECharts bridge). Both ship side by side: this one owns
// no third-party engine and is the path to native rendering; that one keeps the
// full ECharts feature set for the long tail.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { barsFor, defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec, ChartTheme } from './render'
import { resolveCategories, resolveMarks } from './marks'
import type { Mark } from './marks'
import { hitBar } from './layout'
import { chartTable, describeChart } from './a11y'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface PlotChartProps<T> {
  /** The rows. An accessor makes it reactive; a plain array is static. */
  data: T[] | (() => T[])
  /** The marks to draw, in paint order. */
  marks: Mark<T>[]
  /** Category labels for the x axis. Omit for a numeric axis. */
  x?: (d: T, index: number) => string
  width?: Double
  height?: Double
  theme?: Partial<ChartTheme>
  showXAxis?: boolean
  showYAxis?: boolean
  showGrid?: boolean
  /** Fired with the datum index when a bar is tapped, or -1 for a miss. */
  onSelect?: (index: number) => void
  class?: string
  /**
   * Names the chart for assistive technology and titles the data table.
   * Without it the description falls back to a bare "Chart".
   */
  title?: string
  /** Labels for the legend, the tooltip and the accessible table. */
  seriesLabels?: string[]
  /**
   * Drop the offscreen data table. It is on by default because a canvas is a
   * single opaque node to a screen reader — without the table a chart is a
   * blank rectangle to anyone not looking at it.
   */
  accessibleTable?: boolean
}

/**
 * A chart, drawn on a canvas from the engine's command list.
 *
 * Reactive by the framework's normal rules: the `effect` reads `data` (and any
 * signal the accessors touch), so a change repaints without this component
 * knowing anything about what changed. There is no option diffing and no chart
 * instance to manage.
 */
export function PlotChart<T>(props: PlotChartProps<T>): VNode {
  let canvas: HTMLCanvasElement | null = null

  const readData = (): T[] => {
    const d = props.data
    return typeof d === 'function' ? (d as () => T[])() : d
  }

  const buildSpec = (rows: T[], w: Double, hgt: Double): ChartSpec => ({
    width: w,
    height: hgt,
    series: resolveMarks(rows, props.marks),
    categories: resolveCategories(rows, props.x),
    theme: { ...defaultTheme, ...props.theme },
    showXAxis: props.showXAxis ?? true,
    showYAxis: props.showYAxis ?? true,
    showGrid: props.showGrid ?? true,
  })

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = props.width ?? el.clientWidth ?? 300
    const hgt = props.height ?? 200
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    const spec = buildSpec(readData(), w, hgt)
    paint(ctx, renderChart(spec, canvasMeasure(ctx, FONT)), w, hgt, FONT)
  }

  // Repaint whenever anything the spec reads changes. Registered here rather
  // than in onMount so the first paint happens as soon as the ref lands.
  effect(() => {
    // Touch the reactive inputs so the effect subscribes to them even on a
    // first run where the canvas ref is not attached yet.
    readData()
    void props.marks
    draw()
  })

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const ctx = el.getContext('2d')
    if (ctx === null) return
    const w = props.width ?? el.clientWidth ?? 300
    const hgt = props.height ?? 200
    const spec = buildSpec(readData(), w, hgt)
    const measure = canvasMeasure(ctx, FONT)
    const rect = el.getBoundingClientRect()
    const px = ev.clientX - rect.left
    const py = ev.clientY - rect.top
    // Only bar marks are hit-testable today; a line/area chart reports -1
    // rather than guessing at a nearest point the caller did not ask for.
    for (let i = 0; i < spec.series.length; i++) {
      if (spec.series[i]!.kind !== 'bars') continue
      const idx = hitBar(barsFor(spec, i, measure), px, py)
      if (idx >= 0) {
        cb(idx)
        return
      }
    }
    cb(-1)
  }

  const a11yInput = (): { title?: string | undefined; categories: string[]; series: { label: string; values: Double[]; kind: string }[] } => {
    const rows = readData()
    const resolved = resolveMarks(rows, props.marks)
    return {
      title: props.title,
      categories: resolveCategories(rows, props.x),
      series: resolved.map((s, i) => ({
        label: props.seriesLabels?.[i] ?? `Series ${i + 1}`,
        values: s.values,
        kind: s.kind,
      })),
    }
  }

  const canvasNode = h('canvas', {
    class: props.class,
    // `img` + a label is what makes the canvas announce as a single described
    // thing rather than being skipped over entirely.
    role: 'img',
    'aria-label': () => describeChart(a11yInput()),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      if (el !== null) draw()
    },
    onClick: handleClick,
  })

  if (props.accessibleTable === false) return canvasNode

  // A real table rather than a longer label: a label is read as one
  // unstructured string, while a table can be navigated by row and column.
  // Positioned offscreen instead of `display: none`, which would remove it
  // from the accessibility tree along with the visual layout.
  const table = (): VNode => {
    const t = chartTable(a11yInput())
    // The clip styles go on a WRAPPER, not the table. A `<table>` uses auto
    // layout and expands to its content regardless of `width: 1px`, so styling
    // the table directly leaves ~126px of visible layout — which the browser
    // test caught by measuring the rendered box rather than trusting the CSS.
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

export { layoutChart, renderChart }
