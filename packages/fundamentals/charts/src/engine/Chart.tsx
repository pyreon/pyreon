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

  return h('canvas', {
    class: props.class,
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      if (el !== null) draw()
    },
    onClick: handleClick,
  })
}

export { layoutChart, renderChart }
