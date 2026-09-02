// `<PlotChart>` — the authoring surface over the engine.
//
// Named `PlotChart` rather than `Chart` because `@pyreon/charts` already
// exports a `Chart` (the ECharts bridge). Both ship side by side: this one owns
// no third-party engine and is the path to native rendering; that one keeps the
// full ECharts feature set for the long tail.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { batch, effect, isClient, signal } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { renderLegend } from './legend'
import type { LegendPager } from './legend'
import { renderTitle } from './title'
import { hitToolbox, renderToolbox, toolboxTools } from './toolbox'
import type { ToolboxTool } from './toolbox'
import { renderSvg } from './svg'
import { placeTooltip, tooltipAt, tooltipLines } from './tooltip'
import type { TooltipContent } from './tooltip'
import { barsFor, defaultTheme, layoutChart, renderChart, resolveY2Domain, resolveYDomain, seriesOnRightAxis, stackedHitAt } from './render'
import { hitBar, hitNearestX, layoutSeriesPoints, layoutSeriesPointsAt } from './layout'
import type { Annotation, ChartSpec, ChartTheme, PointMarker, Series } from './render'
import { scaleLinear } from './scale'
import { resolveCategories, resolveMarks } from './marks'
import type { Mark } from './marks'
import { chartTable, describeChart } from './a11y'
import { brushRange, isFullWindow, panWindow, sliceRange, zoomWindow } from './zoom'
import type { ZoomWindow } from './zoom'
import type { Formatter } from './format'
import type { Domain, DrawCmd, Double, Rect } from './types'

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
   * Click a legend entry to hide/show its series. On by default with
   * `showLegend` — it is what a legend is FOR once there are several series.
   * The domain rescales to what is visible (hiding a dominant series is how
   * you read the small one), hidden entries render muted, and the accessible
   * table keeps EVERY series: hiding is a visual focus tool, not a data edit.
   */
  legendToggle?: boolean
  /**
   * Show a tooltip following the pointer. Off by default: it installs pointer
   * handlers and a DOM overlay, which a static chart in a report has no use
   * for.
   */
  tooltip?: boolean
  /**
   * A dashed rule through the hovered datum's column, with a marker on each
   * visible line/area/points series at that datum. Vertical charts only — a
   * horizontal chart's pointer sweeps rows, and a vertical rule there would
   * mislead. Off by default for the same reason as `tooltip`: it installs
   * pointer handlers a static chart in a report has no use for.
   */
  crosshair?: boolean
  /**
   * Wheel-zoom + drag-pan over the x range (ECharts' inside dataZoom).
   *
   * The window is a fraction pair over the data; zoom keeps the datum under
   * the cursor fixed, drag pans by plot-widths, double-click resets. Off by
   * default like every interactive extra: it installs pointer handlers and
   * captures the wheel, which a static chart must never do.
   */
  dataZoom?: boolean
  /**
   * Drag-select a datum range. With `dataZoom` on, brush is Shift+drag (plain
   * drag pans); alone, plain drag brushes. The selection reports through
   * `onBrush` as a GLOBAL, inclusive index range and stays highlighted until
   * the next click, which reports `onBrush(null)`.
   */
  brush?: boolean
  /** Fired when a brush completes (inclusive datum range) or clears (null). */
  onBrush?: (range: { start: number; end: number } | null) => void
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
   * Flip the frame: categories on the Y axis, bars growing rightward.
   *
   * The left gutter sizes itself from the widest CATEGORY label — long
   * category names are the reason horizontal bars exist. Bar marks only: a
   * horizontal line or scatter is a transposed coordinate system, not a
   * flipped bar chart, and non-bar marks are skipped rather than drawn
   * misleadingly.
   */
  horizontal?: boolean
  /** Reference rules and bands — the target line, the healthy range. */
  annotations?: Annotation[]
  /** Datum-anchored point markers (max / min / a concrete index). */
  markers?: PointMarker[]
  /**
   * Right y axis. Marks opt in with `axis: 'right'`; the domain derives from
   * those marks unless pinned here, and `y2Format` labels that axis (the
   * left keeps `format`). Stacked/grouped marks and horizontal charts stay
   * on the left — one stack, one scale.
   */
  y2Domain?: Domain
  y2Format?: Formatter
  /**
   * Cap the legend at this many rows and page the rest — a legend of forty
   * series must not eat the plot. The pager's arrows are clickable.
   */
  legendMaxRows?: number
  /**
   * Draw `title` (and `subtitle`) as a heading above the chart. Off by
   * default: `title` alone names the chart for assistive technology, and a
   * chart in a card usually has the card's own heading.
   */
  showTitle?: boolean
  subtitle?: string
  /**
   * Replace the tooltip's default lines. Receives the resolved content
   * (title + one row per visible series at the hovered datum) and returns
   * the text to show — ECharts' `tooltip.formatter`, over data rather than
   * over a template string.
   */
  tooltipFormatter?: (content: TooltipContent) => string
  /**
   * Toolbox buttons at the top-right (ECharts' `toolbox`). `saveAsImage`
   * downloads the current frame as an SVG (the engine's own serializer —
   * vector, and the same draw list the canvas shows); `restore` resets zoom,
   * brush, legend toggles and any magicType override; `magicType` offers
   * line / bar switches for the independent marks.
   */
  toolbox?: { saveAsImage?: boolean; restore?: boolean; magicType?: ('line' | 'bar')[] }
  /** Called with the SVG string on saveAsImage instead of triggering a download. */
  onSaveImage?: (svg: string) => void
  /**
   * Animate the first paint — bars rise, lines draw, points grow. On by
   * default because an entrance orients the eye; OFF automatically under
   * `prefers-reduced-motion`, which is a request, not a hint. Data UPDATES
   * are not animated: an update should read as the new truth, not a morph.
   */
  animate?: boolean
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

  // Entrance progress. Starts at 1 (fully drawn) and only ever dips for the
  // ONE tween on first data: SSR output, `chartToSvg`, and every later
  // repaint all render the finished frame by default.
  let entrance = 1.0
  let entranceStarted = false
  let entranceFrame = 0.0

  const prefersReducedMotion = (): boolean =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  const startEntrance = (): void => {
    if (entranceStarted) return
    entranceStarted = true
    if (props.animate === false || prefersReducedMotion()) return
    if (typeof requestAnimationFrame !== 'function') return
    const duration = 400.0
    let start = -1.0
    const tick = (now: number): void => {
      if (start < 0.0) start = now
      const t = Math.min(1.0, (now - start) / duration)
      // Ease-out cubic: fast rise, gentle settle — the entrance reads as the
      // chart arriving, not as data still changing.
      const eased = 1.0 - Math.pow(1.0 - t, 3.0)
      entrance = eased
      draw()
      if (t < 1.0) entranceFrame = requestAnimationFrame(tick)
    }
    entrance = 0.0
    entranceFrame = requestAnimationFrame(tick)
  }
  let tip: HTMLDivElement | null = null

  // Toggled-off series, by mark index. A signal so the repaint effect tracks
  // it; an array rather than a Set so every toggle is a fresh value.
  const hiddenSeries = signal<number[]>([])
  // The hovered datum for the crosshair; -1 = no hover.
  const hoverIdx = signal(-1)
  // The dataZoom window; null = everything (the untouched state).
  const zoomWin = signal<ZoomWindow | null>(null)
  // A committed brush band, in GLOBAL datum indices; null = none.
  const brushSel = signal<{ start: number; end: number } | null>(null)
  // In-flight drag bookkeeping. Plain locals, not signals: nothing should
  // repaint on every intermediate pixel except the overlay, which the move
  // handler drives through `draw()` itself.
  let dragMode: 'pan' | 'brush' | null = null
  let dragStartX = 0.0
  let dragLastX = 0.0
  let dragMoved = false
  let suppressClick = false
  // Live brush overlay in CANVAS pixels while dragging; null when idle.
  let brushDrag: { a: Double; b: Double } | null = null
  // Legend entry hit rects from the LAST draw — they match what is on screen.
  let legendBoxes: Rect[] = []
  // Legend pager (when `legendMaxRows` caps an overflowing legend).
  const legendPage = signal(0)
  let legendPager: LegendPager | null = null
  // Pixels consumed above the plot by the title block + legend on the LAST
  // draw. Every pointer handler subtracts it: the plot is drawn shifted down
  // by exactly this much, so a hit test against an unshifted layout would
  // land one legend-height too high — which is what happened before a
  // legend and a click could coexist.
  let topOffset = 0.0
  // Toolbox state: the magicType override, and last-draw hit boxes.
  const typeOverride = signal<'line' | 'bar' | null>(null)
  let toolboxBoxes: Rect[] = []
  let toolList: ToolboxTool[] = []
  // The last painted frame's commands, for saveAsImage.
  let lastFrame: DrawCmd[] = []
  let lastW = 0.0
  let lastH = 0.0

  /**
   * Apply the legend toggle to resolved series.
   *
   * A hidden series keeps its SLOT — colors, labels and tooltip columns stay
   * index-aligned — but contributes no geometry and no domain. Stacked and
   * grouped series are zeroed instead of emptied: their layouts walk every
   * series at every index together, and an empty sibling would misalign them.
   */
  const hideHidden = (series: Series[]): Series[] => {
    const hidden = hiddenSeries()
    if (hidden.length === 0) return series
    return series.map((s, i) => {
      if (!hidden.includes(i)) return s
      if (s.kind === 'stacked' || s.kind === 'grouped') {
        return { ...s, values: s.values.map(() => 0.0), radii: undefined, showValues: false }
      }
      return { ...s, values: [], radii: undefined, showValues: false }
    })
  }

  const readData = (): T[] => {
    const d = props.data
    return typeof d === 'function' ? (d as () => T[])() : d
  }

  /**
   * The visible slice of the data under the zoom window.
   *
   * Slicing ROWS (rather than restricting domains) is what keeps every
   * downstream concern — geometry, hit testing, tooltips, the accessible
   * table — correct with zero further awareness: a zoomed chart is a chart
   * of fewer rows. `viewOffset` maps local indices back to global ones for
   * the callbacks, because the caller's world never zoomed.
   */
  const viewRange = (rows: T[]): { from: number; to: number } => {
    const win = zoomWin()
    if (win === null) return { from: 0, to: rows.length }
    return sliceRange(win, rows.length)
  }
  const viewRows = (rows: T[]): T[] => {
    const r = viewRange(rows)
    return r.from === 0 && r.to === rows.length ? rows : rows.slice(r.from, r.to)
  }

  const buildSpec = (allRows: T[], w: Double, hgt: Double): ChartSpec => {
    const off = viewRange(allRows).from
    const rows = viewRows(allRows)
    return {
    width: w,
    height: hgt,
    // Accessors receive the GLOBAL index — an accessor keyed on position
    // (striping, ids) must not see its data renumbered by a zoom.
    series: hideHidden(resolveMarks(rows, props.marks.map((m) => ({
      ...m,
      // magicType: a line/bar switch retypes the INDEPENDENT marks only —
      // stacked/grouped/points keep their geometry (a stack is not a line).
      kind: typeOverride() !== null && (m.kind === 'bars' || m.kind === 'line' || m.kind === 'area')
        ? (typeOverride() === 'bar' ? 'bars' : 'line')
        : m.kind,
      y: (d: T, i: number) => m.y(d, i + off),
      ...(m.r !== undefined ? { r: (d: T, i: number) => m.r!(d, i + off) } : {}),
    })))),
    categories: resolveCategories(rows, props.x === undefined ? undefined : (d, i) => props.x!(d, i + off)),
    theme: { ...defaultTheme, ...props.theme },
    showXAxis: props.showXAxis ?? true,
    showYAxis: props.showYAxis ?? true,
    showGrid: props.showGrid ?? true,
    ...(props.format !== undefined ? { yFormat: props.format } : {}),
    ...(props.xFormat !== undefined ? { xFormat: props.xFormat } : {}),
    ...(props.xTime === true ? { xTime: true } : {}),
    ...(props.xValue !== undefined
      ? { xValues: rows.map((d, i) => props.xValue!(d, i + off)) }
      : {}),
    annotations: props.annotations,
    markers: props.markers,
    y2Domain: props.y2Domain,
    y2Format: props.y2Format,
    horizontal: props.horizontal === true,
    progress: entrance,
    }
  }

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 200
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    const measure = canvasMeasure(ctx, FONT)
    const rows = readData()

    // Title block first, then the legend, then the plot in what is left. Each
    // reports the height it used, because a wrapped legend or a sub-title is
    // not a fixed strip — reserving one would clip or waste.
    let legendH = 0
    let titleH = 0.0
    let toolH = 0.0
    legendBoxes = []
    legendPager = null
    const legendCmds: ReturnType<typeof renderChart> = []
    toolboxBoxes = []
    toolList = props.toolbox === undefined ? [] : toolboxTools(props.toolbox)
    if (toolList.length > 0) {
      const ov = typeOverride()
      const tb = renderToolbox(toolList, { x: 0, y: 0, w, h: hgt }, {
        fontSize: props.theme?.fontSize ?? defaultTheme.fontSize,
        color: props.theme?.label ?? defaultTheme.label,
        active: ov === null ? undefined : ov === 'bar' ? 'magicBar' : 'magicLine',
      })
      for (const c of tb.cmds) legendCmds.push(c)
      toolboxBoxes = tb.boxes
      toolH = tb.height
    }
    if (props.showTitle === true && props.title !== undefined) {
      const tl = renderTitle(props.title, props.subtitle, { x: 0, y: toolH, w, h: hgt - toolH }, {
        fontSize: (props.theme?.fontSize ?? defaultTheme.fontSize) + 4.0,
        color: props.theme?.label ?? defaultTheme.label,
        align: 'start',
      })
      titleH = tl.height
      for (const c of tl.cmds) legendCmds.push(c)
    }
    titleH = titleH + toolH
    if (props.showLegend === true) {
      const series = resolveMarks(rows, props.marks)
      const hidden = hiddenSeries()
      const l = renderLegend(
        series.map((x, i) => ({ label: x.label, color: x.color, muted: hidden.includes(i) })),
        { x: 0, y: titleH, w, h: hgt - titleH },
        {
          fontSize: 11,
          labelColor: (props.theme?.label ?? defaultTheme.label),
          swatch: 10,
          gap: 12,
          orientation: 'horizontal',
          maxRows: props.legendMaxRows,
          page: legendPage(),
        },
        measure,
      )
      legendH = l.height
      for (const c of l.cmds) legendCmds.push(c)
      legendBoxes = l.boxes
      legendPager = l.pager ?? null
    }

    const top = titleH + legendH
    topOffset = top
    const spec = buildSpec(rows, w, hgt - top)
    const cmds = renderChart(spec, measure)
    // Shift the plot down past the title + legend. Translating the emitted
    // commands rather than threading an origin through the engine keeps the
    // engine's coordinate space at (0,0) and this concern in the host.
    const shifted = top === 0.0 ? cmds : cmds.map((c) => shiftCmd(c, top))
    const cross = crosshairCmds(spec, measure)
    const crossShifted = top === 0.0 ? cross : cross.map((c) => shiftCmd(c, top))
    const band = brushCmds(spec, measure)
    const bandShifted = top === 0.0 ? band : band.map((c) => shiftCmd(c, top))
    lastFrame = [...legendCmds, ...shifted, ...bandShifted, ...crossShifted]
    lastW = w
    lastH = hgt
    paint(ctx, lastFrame, w, hgt, FONT)
  }

  /**
   * The crosshair: a dashed rule through the hovered datum's column plus a
   * marker on every visible line/area/points series at that datum. Painted
   * LAST so nothing covers it. Bars get the rule only — the bar itself is the
   * marker.
   */
  const crosshairCmds = (spec: ChartSpec, measure: (t: string, size: Double) => Double): DrawCmd[] => {
    const out: DrawCmd[] = []
    if (props.crosshair !== true || props.horizontal === true) return out
    const idx = hoverIdx()
    if (idx < 0) return out
    const l = layoutChart(spec, measure)
    const plot = l.plot
    let cx = -1.0
    if (spec.xValues !== undefined && spec.xValues.length > 0) {
      const v = spec.xValues[idx]
      if (v === undefined) return out
      cx = scaleLinear(l.xDomainUsed, plot.x, plot.x + plot.w, v)
    } else if (spec.categories.length > 0) {
      const bw = plot.w / spec.categories.length
      cx = plot.x + bw * (idx + 0.5)
    } else {
      cx = scaleLinear(l.xDomainUsed, plot.x, plot.x + plot.w, idx)
    }
    if (cx < plot.x || cx > plot.x + plot.w) return out
    out.push({
      kind: 'line',
      from: { x: cx, y: plot.y },
      to: { x: cx, y: plot.y + plot.h },
      stroke: spec.theme.axis,
      width: 1.0,
      dash: [4.0, 4.0],
    })
    const yDomain = resolveYDomain(spec)
    const y2Domain = resolveY2Domain(spec)
    for (const sr of spec.series) {
      if (sr.kind !== 'line' && sr.kind !== 'area' && sr.kind !== 'points') continue
      if (idx >= sr.values.length) continue
      // A right-axis series places its marker on ITS domain.
      const dom = seriesOnRightAxis(sr, spec) ? y2Domain : yDomain
      const pts =
        spec.xValues !== undefined && spec.xValues.length > 0
          ? layoutSeriesPointsAt(sr.values, spec.xValues, plot, dom, l.xDomainUsed)
          : layoutSeriesPoints(sr.values, plot, dom)
      const p = pts[idx]
      if (p === undefined) continue
      out.push({ kind: 'circle', center: p, radius: Math.max(3.0, sr.radius), fill: sr.color })
    }
    return out
  }

  /** The brush band — the live drag, or the committed selection. */
  const brushCmds = (spec: ChartSpec, measure: (t: string, size: Double) => Double): DrawCmd[] => {
    const out: DrawCmd[] = []
    if (props.brush !== true || props.horizontal === true) return out
    const l = layoutChart(spec, measure)
    const plot = l.plot
    let lo = -1.0
    let hi = -1.0
    const live = brushDrag
    const committed = brushSel()
    if (live !== null) {
      lo = live.a < live.b ? live.a : live.b
      hi = live.a < live.b ? live.b : live.a
    } else if (committed !== null) {
      const rows = readData()
      const r = viewRange(rows)
      const nView = r.to - r.from
      if (nView <= 0) return out
      // Committed indices are GLOBAL; place the band over the datum bands of
      // the visible slice, clipped to the plot when partly zoomed away.
      const bw = plot.w / nView
      lo = plot.x + (committed.start - r.from) * bw
      hi = plot.x + (committed.end - r.from + 1) * bw
      if (hi < plot.x || lo > plot.x + plot.w) return out
      if (lo < plot.x) lo = plot.x
      if (hi > plot.x + plot.w) hi = plot.x + plot.w
    } else {
      return out
    }
    out.push({
      kind: 'rect',
      rect: { x: lo, y: plot.y, w: hi - lo, h: plot.h },
      fill: 'rgba(99,102,241,0.15)',
    })
    out.push({
      kind: 'line',
      from: { x: lo, y: plot.y },
      to: { x: lo, y: plot.y + plot.h },
      stroke: spec.theme.axis,
      width: 1.0,
      dash: [3.0, 3.0],
    })
    out.push({
      kind: 'line',
      from: { x: hi, y: plot.y },
      to: { x: hi, y: plot.y + plot.h },
      stroke: spec.theme.axis,
      width: 1.0,
      dash: [3.0, 3.0],
    })
    return out
  }

  /** The plot rect at the current size — gestures are plot-relative. */
  const plotNow = (): Rect | null => {
    const el = canvas
    if (el === null) return null
    const ctx = el.getContext('2d')
    if (ctx === null) return null
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 200
    return layoutChart(buildSpec(readData(), w, hgt - topOffset), canvasMeasure(ctx, FONT)).plot
  }

  // Repaint whenever anything the spec reads changes. Registered here rather
  // than in onMount so the first paint happens as soon as the ref lands.
  effect(() => {
    // Touch the reactive inputs so the effect subscribes to them even on a
    // first run where the canvas ref is not attached yet.
    readData()
    void props.marks
    hiddenSeries()
    hoverIdx()
    zoomWin()
    brushSel()
    legendPage()
    typeOverride()
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
    // Hit-test in PLOT space: the plot was drawn `topOffset` px down, under
    // the title + legend, so the pointer's y comes back up by that much.
    const spec = buildSpec(readData(), w, hgt - topOffset)
    py = py - topOffset
    for (let i = 0; i < spec.series.length; i++) {
      if (spec.series[i]!.kind !== 'bars') continue
      const idx = hitBar(barsFor(spec, i, measure), px, py)
      if (idx >= 0) return idx
    }
    // Same gap as the click handler: the tooltip never appeared over a stacked
    // or grouped chart either, because both bailed on the same condition.
    const stackedIdx = stackedHitAt(spec, measure, px, py)
    if (stackedIdx >= 0) return stackedIdx
    const first = spec.series[0]
    if (first === undefined || first.kind === 'bars') return -1
    if (first.kind === 'stacked' || first.kind === 'grouped') return -1
    const l = layoutChart(spec, measure)
    return hitNearestX(layoutSeriesPoints(first.values, l.plot, resolveYDomain(spec)), px)
  }

  const handleWheel = (ev: WheelEvent): void => {
    if (props.dataZoom !== true) return
    const el = canvas
    if (el === null) return
    const plot = plotNow()
    if (plot === null) return
    // Captured deliberately: a wheel over a zoomable plot is a zoom, not a
    // page scroll — half-zooming while the page glides away is worse than
    // either behavior alone.
    ev.preventDefault()
    const rect = el.getBoundingClientRect()
    const px = ev.clientX - rect.left
    const frac = plot.w <= 0.0 ? 0.5 : (px - plot.x) / plot.w
    const win = zoomWin() ?? { start: 0.0, end: 1.0 }
    const next = zoomWindow(win, ev.deltaY > 0 ? 1.25 : 0.8, frac)
    zoomWin.set(isFullWindow(next) ? null : next)
  }

  const handleDown = (ev: MouseEvent): void => {
    if (props.dataZoom !== true && props.brush !== true) return
    const el = canvas
    if (el === null) return
    const rect = el.getBoundingClientRect()
    dragStartX = ev.clientX - rect.left
    dragLastX = dragStartX
    dragMoved = false
    // A new gesture re-arms the click decision. Without this, a drag whose
    // trailing click never fires (pointer released off-canvas) leaves the
    // suppression latched and silently eats the NEXT legitimate click.
    suppressClick = false
    // With both gestures on, Shift picks the brush and plain drag pans; with
    // only one on, the drag is that one. Precedence over guesswork.
    dragMode =
      props.brush === true && (props.dataZoom !== true || ev.shiftKey) ? 'brush' : props.dataZoom === true ? 'pan' : null
    if (dragMode !== null) ev.preventDefault()
  }

  const endDrag = (): void => {
    if (dragMode === 'brush' && dragMoved) {
      const plot = plotNow()
      const rows = readData()
      if (plot !== null && rows.length > 0) {
        const win = zoomWin() ?? { start: 0.0, end: 1.0 }
        const range = brushRange(plot.x, plot.w, dragStartX, dragLastX, win, rows.length)
        brushSel.set(range)
        if (props.onBrush !== undefined) props.onBrush(range)
      }
    }
    if (dragMoved) suppressClick = true
    dragMode = null
    brushDrag = null
    draw()
  }

  const handleMove = (ev: MouseEvent): void => {
    const el = canvas
    if (el === null) return
    if (dragMode !== null) {
      const rect0 = el.getBoundingClientRect()
      const x = ev.clientX - rect0.left
      if (Math.abs(x - dragStartX) > 3.0) dragMoved = true
      if (dragMode === 'pan') {
        const plot = plotNow()
        if (plot !== null && plot.w > 0.0) {
          const win = zoomWin() ?? { start: 0.0, end: 1.0 }
          // Dragging right moves the window LEFT — the data follows the hand.
          const next = panWindow(win, (dragLastX - x) / plot.w)
          zoomWin.set(isFullWindow(next) ? null : next)
        }
      } else {
        brushDrag = { a: dragStartX, b: x }
        draw()
      }
      dragLastX = x
      return
    }
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 200
    const rect = el.getBoundingClientRect()
    const px = ev.clientX - rect.left
    const py = ev.clientY - rect.top
    const idx = datumAt(px, py, w, hgt)
    if (props.crosshair === true) hoverIdx.set(idx)
    const box = tip
    if (props.tooltip !== true || box === null) return
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
    const custom = props.tooltipFormatter
    box.textContent =
      custom === undefined
        ? lines.join('\n')
        : custom(tooltipAt(idx, resolveCategories(rows, props.x), series))
    box.style.display = 'block'
    // Measure AFTER filling it: placement depends on the rendered size, and a
    // stale size flips the tooltip on the wrong side at the edge.
    const size = { w: box.offsetWidth, h: box.offsetHeight }
    const at = placeTooltip({ x: px, y: py }, size, { x: 0, y: 0, w, h: hgt }, 12)
    box.style.left = `${at.x}px`
    box.style.top = `${at.y}px`
  }

  const handleLeave = (): void => {
    if (dragMode !== null) endDrag()
    hoverIdx.set(-1)
    if (tip !== null) tip.style.display = 'none'
  }

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    if (el === null) return
    // A drag is not a click: panning or brushing must not fire onSelect or
    // toggle a legend entry on release.
    if (suppressClick) {
      suppressClick = false
      return
    }
    // A committed brush clears on the next plain click — and says so.
    if (brushSel() !== null) {
      brushSel.set(null)
      if (props.onBrush !== undefined) props.onBrush(null)
      return
    }
    // Legend hits take priority and are NOT a datum selection: a click on an
    // entry toggles its series. Boxes come from the last draw, so they match
    // exactly what is on screen.
    if (toolList.length > 0) {
      const r0 = el.getBoundingClientRect()
      const tool = hitToolbox(toolList, toolboxBoxes, ev.clientX - r0.left, ev.clientY - r0.top)
      if (tool !== null) {
        if (tool === 'restore') {
          // One notify cycle for the five resets, not five redraws.
          batch(() => {
            zoomWin.set(null)
            brushSel.set(null)
            hiddenSeries.set([])
            legendPage.set(0)
            typeOverride.set(null)
          })
        } else if (tool === 'magicLine') {
          typeOverride.set(typeOverride() === 'line' ? null : 'line')
        } else if (tool === 'magicBar') {
          typeOverride.set(typeOverride() === 'bar' ? null : 'bar')
        } else {
          const svg = renderSvg(lastFrame, lastW, lastH, { fontFamily: FONT, ...(props.title !== undefined ? { title: props.title } : {}) })
          if (props.onSaveImage !== undefined) props.onSaveImage(svg)
          else if (isClient && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
            const a = document.createElement('a')
            a.href = url
            a.download = (props.title ?? 'chart') + '.svg'
            a.click()
            URL.revokeObjectURL(url)
          }
        }
        return
      }
    }
    if (props.showLegend === true && legendPager !== null) {
      const r0 = el.getBoundingClientRect()
      const lx = ev.clientX - r0.left
      const ly = ev.clientY - r0.top
      const p = legendPager
      const inside = (b: Rect | null): boolean => b !== null && lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h
      if (inside(p.prev)) {
        legendPage.set(p.page - 1)
        return
      }
      if (inside(p.next)) {
        legendPage.set(p.page + 1)
        return
      }
    }
    if (props.showLegend === true && props.legendToggle !== false && legendBoxes.length > 0) {
      const r0 = el.getBoundingClientRect()
      const lx = ev.clientX - r0.left
      const ly = ev.clientY - r0.top
      for (let i = 0; i < legendBoxes.length; i++) {
        const b = legendBoxes[i]!
        if (lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) {
          const hidden = hiddenSeries()
          hiddenSeries.set(hidden.includes(i) ? hidden.filter((x) => x !== i) : [...hidden, i])
          return
        }
      }
    }
    const cb = props.onSelect
    if (cb === undefined) return
    const ctx = el.getContext('2d')
    if (ctx === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 200
    const spec = buildSpec(readData(), w, hgt - topOffset)
    const measure = canvasMeasure(ctx, FONT)
    const rect = el.getBoundingClientRect()
    const px = ev.clientX - rect.left
    // Plot space (see datumAt): the plot sits under the title + legend.
    const py = ev.clientY - rect.top - topOffset
    // Every BAR mark is hit-testable — plain, stacked and grouped. A line or
    // area chart still reports -1 rather than guessing at a nearest point the
    // caller did not ask for.
    //
    // Stacked and grouped were skipped by a `kind !== 'bars'` bail whose
    // comment excused "a line/area chart" — but they draw real rects, so every
    // click on one reported a miss while `onSelect`'s own contract says it
    // fires "with the datum index when a bar is tapped". They cannot be asked
    // one series at a time (each needs the others to place its bars), hence the
    // separate helper rather than a widened loop condition.
    // Callbacks speak GLOBAL indices — the caller's data never zoomed.
    const off = viewRange(readData()).from
    for (let i = 0; i < spec.series.length; i++) {
      if (spec.series[i]!.kind !== 'bars') continue
      const idx = hitBar(barsFor(spec, i, measure), px, py)
      if (idx >= 0) {
        cb(idx + off)
        return
      }
    }
    const stackedIdx = stackedHitAt(spec, measure, px, py)
    cb(stackedIdx < 0 ? stackedIdx : stackedIdx + off)
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
      if (el === null) {
        if (entranceFrame !== 0.0 && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(entranceFrame)
        }
        return
      }
      startEntrance()
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
    ...(props.dataZoom === true ? { onWheel: handleWheel, onDblClick: () => zoomWin.set(null) } : {}),
    ...(props.dataZoom === true || props.brush === true
      ? { onMouseDown: handleDown, onMouseUp: endDrag }
      : {}),
    ...(props.tooltip === true || props.crosshair === true || props.dataZoom === true || props.brush === true
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
