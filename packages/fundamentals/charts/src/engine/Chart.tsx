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
import { renderLegend } from './legend'
import { placeTooltip, tooltipAt, tooltipLines } from './tooltip'
import { barsFor, defaultTheme, layoutChart, renderChart, resolveYDomain } from './render'
import { hitBar, hitNearestX, layoutSeriesPoints } from './layout'
import type { ChartSpec, ChartTheme } from './render'
import { resolveCategories, resolveMarks } from './marks'
import type { Mark } from './marks'
import { chartTable, describeChart } from './a11y'
import type { Formatter } from './format'
import type { DrawCmd, Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'


/**
 * Move a draw command down the canvas.
 *
 * Used to sit the plot below the legend. Translating the emitted commands
 * rather than threading an origin through the engine keeps the engine's
 * coordinate space at (0,0) — every layout function stays expressible without
 * knowing what else the host drew.
 */
function shiftCmd(c: DrawCmd, dy: Double): DrawCmd {
  switch (c.kind) {
    case 'rect':
      return { ...c, rect: { ...c.rect, y: c.rect.y + dy } }
    case 'line':
      return { ...c, from: { ...c.from, y: c.from.y + dy }, to: { ...c.to, y: c.to.y + dy } }
    case 'polyline':
    case 'polygon':
      return { ...c, points: c.points.map((p) => ({ ...p, y: p.y + dy })) }
    case 'circle':
      return { ...c, center: { ...c.center, y: c.center.y + dy } }
    default:
      return { ...c, at: { ...c.at, y: c.at.y + dy } }
  }
}

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
  /** Draw a legend above the plot, using each mark's `label`. */
  showLegend?: boolean
  /**
   * Show a tooltip following the pointer. Off by default: it installs pointer
   * handlers and a DOM overlay, which a static chart in a report has no use
   * for.
   */
  tooltip?: boolean
  class?: string
  /**
   * Names the chart for assistive technology and titles the data table.
   * Without it the description falls back to a bare "Chart".
   */
  title?: string
  /** Labels for the legend, the tooltip and the accessible table. */
  seriesLabels?: string[]
  /**
   * Formats the y-axis tick labels, the tooltip values and the accessible
   * description.
   *
   * The default trims float noise and prints the number, which is right for
   * counts and wrong for money, percentages, and anything above about ten
   * thousand — a revenue axis reading `3200000` is the first thing anyone
   * notices. `currency`, `percent`, `compact` and `fixed` ship in the same
   * subpath; any `(v: number) => string` works.
   *
   * One formatter rather than one per surface, because an axis that says
   * `$3.2K` and a tooltip that says `3204.55` for the same point reads as a
   * bug. Format once, apply everywhere the number is shown.
   */
  format?: Formatter
  /**
   * Per-datum x position for a CONTINUOUS axis — a timestamp, or any number.
   *
   * Without it the points are spaced evenly by index, which is right for a
   * categorical axis and misstates an irregular one: readings on Jan 1, Jan 2
   * and Mar 1 drawn at even spacing claim the first gap equals the second. That
   * makes this a correctness feature rather than a styling one.
   *
   * Bars stay categorical either way — bars on a continuous axis need a width
   * in domain units, which is a different chart.
   */
  xValue?: (d: T, index: number) => Double
  /**
   * Label the x axis with calendar steps rather than the numeric ladder. Only
   * meaningful with `xValue` returning epoch milliseconds.
   */
  xTime?: boolean
  /** Formats the x-axis ticks. Overrides the calendar default when `xTime`. */
  xFormat?: Formatter
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
/**
 * The width to draw at.
 *
 * Measures the canvas's PARENT, never the canvas. A canvas sized by this very
 * function reports back whatever it was last set to, so measuring it means
 * measuring your own previous output: the first draw finds 0, falls back to the
 * default, sets the canvas to that, and every later draw reads the default back
 * and stays there — a chart pinned at 300px inside a 430px column, forever, with
 * nothing in the DOM looking wrong.
 *
 * The fallback is for a parent with no layout width of its own (a detached
 * node, or a shrink-to-fit ancestor), where there is nothing to fill.
 */
function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

export function PlotChart<T>(props: PlotChartProps<T>): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  let tip: HTMLDivElement | null = null

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
    ...(props.format !== undefined ? { yFormat: props.format } : {}),
    ...(props.xFormat !== undefined ? { xFormat: props.xFormat } : {}),
    ...(props.xTime === true ? { xTime: true } : {}),
    ...(props.xValue !== undefined
      ? { xValues: rows.map((d, i) => props.xValue!(d, i)) }
      : {}),
  })

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 200
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    const measure = canvasMeasure(ctx, FONT)
    const rows = readData()

    // The legend is laid out FIRST and the height it reports is taken off the
    // plot, because a horizontal legend WRAPS — reserving a fixed strip would
    // clip it on a narrow chart and waste space on a wide one.
    let legendH = 0
    const legendCmds: ReturnType<typeof renderChart> = []
    if (props.showLegend === true) {
      const series = resolveMarks(rows, props.marks)
      const l = renderLegend(
        series.map((x) => ({ label: x.label, color: x.color })),
        { x: 0, y: 0, w, h: hgt },
        {
          fontSize: 11,
          labelColor: (props.theme?.label ?? defaultTheme.label),
          swatch: 10,
          gap: 12,
          orientation: 'horizontal',
        },
        measure,
      )
      legendH = l.height
      for (const c of l.cmds) legendCmds.push(c)
    }

    const spec = buildSpec(rows, w, hgt - legendH)
    const cmds = renderChart(spec, measure)
    // Shift the plot down past the legend. Translating the emitted commands
    // rather than threading an origin through the engine keeps the engine's
    // coordinate space at (0,0) and this concern in the host.
    const shifted = legendH === 0 ? cmds : cmds.map((c) => shiftCmd(c, legendH))
    paint(ctx, [...legendCmds, ...shifted], w, hgt, FONT)
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

  /**
   * Which datum the pointer is over.
   *
   * A bar chart hit-tests the RECTS, so only a pointer actually inside a bar
   * counts. Anything else falls back to nearest-by-x, which is what a
   * line/area chart wants: sweeping horizontally should pick the point in the
   * cursor's column however far the line sits vertically from the pointer.
   */
  const datumAt = (px: Double, py: Double, w: Double, hgt: Double): number => {
    const el = canvas
    if (el === null) return -1
    const ctx = el.getContext('2d')
    if (ctx === null) return -1
    const measure = canvasMeasure(ctx, FONT)
    const spec = buildSpec(readData(), w, hgt)
    for (let i = 0; i < spec.series.length; i++) {
      if (spec.series[i]!.kind !== 'bars') continue
      const idx = hitBar(barsFor(spec, i, measure), px, py)
      if (idx >= 0) return idx
    }
    const first = spec.series[0]
    if (first === undefined || first.kind === 'bars') return -1
    const l = layoutChart(spec, measure)
    return hitNearestX(layoutSeriesPoints(first.values, l.plot, resolveYDomain(spec)), px)
  }

  const handleMove = (ev: MouseEvent): void => {
    const el = canvas
    const box = tip
    if (el === null || box === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 200
    const rect = el.getBoundingClientRect()
    const px = ev.clientX - rect.left
    const py = ev.clientY - rect.top
    const idx = datumAt(px, py, w, hgt)
    if (idx < 0) {
      box.style.display = 'none'
      return
    }
    const rows = readData()
    const series = resolveMarks(rows, props.marks)
    const lines = tooltipLines(
      tooltipAt(idx, resolveCategories(rows, props.x), series),
      props.format,
    )
    box.textContent = lines.join('\n')
    box.style.display = 'block'
    // Measure AFTER filling it: placement depends on the rendered size, and a
    // stale size flips the tooltip on the wrong side at the edge.
    const size = { w: box.offsetWidth, h: box.offsetHeight }
    const at = placeTooltip({ x: px, y: py }, size, { x: 0, y: 0, w, h: hgt }, 12)
    box.style.left = `${at.x}px`
    box.style.top = `${at.y}px`
  }

  const handleLeave = (): void => {
    if (tip !== null) tip.style.display = 'none'
  }

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const ctx = el.getContext('2d')
    if (ctx === null) return
    const w = drawWidth(el, props.width)
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

  const a11yInput = (): {
    title?: string | undefined
    categories: string[]
    series: { label: string; values: Double[]; kind: string }[]
    format?: Formatter | undefined
  } => {
    const rows = readData()
    const resolved = resolveMarks(rows, props.marks)
    return {
      title: props.title,
      // The spoken description says the same numbers the axis shows. A chart
      // whose axis reads "$3.2K" and whose description reads "3204.55" is one
      // chart to a sighted reader and another to a screen-reader user.
      format: props.format,
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
      sizeObserver?.disconnect()
      sizeObserver = null
      if (el === null) return
      draw()
      // Observe the CONTAINER, because the first draw runs before it has laid
      // out: the ref fires while the wrapper still measures 0, the fallback
      // width is used, and a one-shot measurement would leave the chart pinned
      // at that fallback forever — 300px inside a 430px column, with nothing in
      // the DOM looking wrong. Observing also makes the chart genuinely
      // responsive to a window resize or a column that changes, which a
      // mount-time read never can.
      const box = el.parentElement
      if (box === null || typeof ResizeObserver === 'undefined') return
      sizeObserver = new ResizeObserver(() => {
        // The observer fires for the resize this draw itself causes, so redraw
        // ONLY when the width the next draw would use actually differs from the
        // one already on the canvas — otherwise every paint schedules another.
        if (canvas === null) return
        const next = drawWidth(canvas, props.width)
        const dpr = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1
        if (Math.round(next * dpr) === canvas.width) return
        draw()
      })
      sizeObserver.observe(box)
    },
    onClick: handleClick,
    ...(props.tooltip === true
      ? { onMouseMove: handleMove, onMouseLeave: handleLeave }
      : {}),
  })

  const tooltipNode = (): VNode =>
    h('div', {
      // A stable hook so a consumer can style it and a test can find it —
      // matching on the style string is fragile, and the accessible-table
      // wrapper is absolutely positioned too.
      'data-pyreon-chart-tooltip': 'true',
      // `pointer-events: none` is load-bearing: without it the tooltip sits
      // under the cursor, swallows the next mousemove, and the chart flickers
      // as the tooltip hides and reappears.
      style:
        'position:absolute;display:none;pointer-events:none;white-space:pre;' +
        'background:rgba(16,22,29,0.92);color:#f7f9fa;font:11px ' +
        FONT +
        ';padding:6px 8px;border-radius:4px;z-index:1',
      ref: (el: HTMLDivElement | null) => {
        tip = el
      },
    })

  if (props.accessibleTable === false && props.tooltip !== true) return canvasNode

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

  return h(
    'div',
    { style: 'position:relative' },
    canvasNode,
    ...(props.tooltip === true ? [tooltipNode()] : []),
    ...(props.accessibleTable === false ? [] : [() => table()]),
  )
}

export { layoutChart, renderChart }
