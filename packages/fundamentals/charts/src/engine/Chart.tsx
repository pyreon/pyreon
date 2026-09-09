// `<PlotChart>` — the authoring surface over the engine.
//
// Named `PlotChart` rather than `Chart` because `@pyreon/charts` already
// exports a `Chart` (the ECharts bridge). Both ship side by side: this one owns
// no third-party engine and is the path to native rendering; that one keeps the
// full ECharts feature set for the long tail.

import { createUniqueId, h } from '@pyreon/core'
import { A11Y_TABLE_MAX, shiftCmds } from './canvas-host'
import type { LegendPosition } from './canvas-host'
import { lttbIndices, minMaxBuckets } from './decimate-values'
import { resolveChartTheme, tooltipStyle, useChartTheme } from './theme'
import type { VNode } from '@pyreon/core'
import { batch, effect, isClient, signal, untrack } from '@pyreon/reactivity'
import { canvasMeasure, canvasSizeAttrs, paint, prepareCanvas } from './canvas-web'
import { placeLegend } from './legend'
import type { LegendPager } from './legend'
import { renderTitle } from './title'
import { sameShape, sameValues, tweenValues } from './tween'
import { hitToolbox, renderToolbox, toolboxTools } from './toolbox'
import { renderSvg } from './svg'
import type { ToolboxTool } from './toolbox'
import { placeTooltip, tooltipAt, tooltipLines } from './tooltip'
import type { TooltipContent } from './tooltip'
import { geometrySpec, layoutChart, renderChart, renderChartIn, resolveY2Domain, resolveYDomain, seriesOnRightAxis } from './render'
import { mirrorCmds, screenRectX } from './rtl'
import { layoutSeriesPoints, layoutSeriesPointsAt } from './layout'
import type { PlotLayout } from './layout'
import { dateFormatter, numberFormatter } from './locale'
import type { Annotation, ChartSpec, ChartTheme, PointMarker, Series } from './render'
import { scaleLinear } from './scale'
import { resolveCategories, resolveMarks } from './marks'
import { plotHitBarsIn, plotHitIndexIn } from './plot-hit'
import type { Mark } from './marks'
import { chartTable, describeChart } from './a11y'
import type { A11yInput } from './a11y'
import { brushBand, brushRange, renderBrushBand } from './brush'
import { hideHiddenSeries, legendHitIndex, legendToggle, pagerHit } from './legend-toggle'
import { navigatorDrag, navigatorHit, renderNavigator } from './navigator'
import { presetHit, presetWindow, renderPresets } from './presets'
import { isFullWindow, panWindow, sliceRange, zoomWindow } from './zoom'
import type { ZoomWindow } from './zoom'
import type { ChartHandle, ChartLink } from './link'
import type { Formatter } from './format'
import type { Domain, DrawCmd, Double, Rect } from './types'

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
  /** The engine's INDEX hit — identical to `onSelect` here; the name every host shares, so a native tap and a grammar `<Plot>` bind the same way. */
  onSelectIndex?: (index: number) => void
  /** Draw a legend, using each mark's `label`. */
  showLegend?: boolean
  /** Where the legend sits; `top` by default. `left`/`right` stack the entries beside the plot. */
  legendPosition?: LegendPosition
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
   * Share zoom and crosshair state with other hosts (ECharts `connect`): pass
   * the same `createChartLink()` to every chart in the group and a wheel,
   * pan, navigator drag, preset or hover on any of them moves all of them.
   */
  link?: ChartLink
  /**
   * The imperative handle (ECharts `dispatchAction`): pass `createChartHandle()`
   * and its `dispatch` drives highlight, selection, legend and zoom from
   * outside. Its signals ARE this chart's state — reading `handle.selected()`
   * reads the chart. A handle is also a link: hand it to sibling charts as
   * `link` to connect them.
   */
  handle?: ChartHandle
  /**
   * Click-to-pin selection (ECharts `selectedMode`): `'single'` keeps one
   * datum, `'multiple'` toggles each. Selected datums draw a heavy outline
   * that stays, and every change reports through `onSelectChange` with GLOBAL
   * indices. `onSelect` still fires for the pick itself; a miss leaves the
   * selection alone (clearing is an explicit `unselect` / `restore`).
   */
  selectedMode?: 'single' | 'multiple'
  /** Fired with the selected datums (GLOBAL indices) whenever the set changes — a pick, a dispatch, a `restore`. */
  onSelectChange?: (selected: number[]) => void
  /**
   * Fired with the highlighted datum's GLOBAL index on hover (ECharts
   * `mouseover` / `highlight`) and -1 when it clears (`mouseout` / `downplay`),
   * whatever moved it: the pointer, the keyboard, a link or a dispatch.
   */
  onHighlight?: (index: number) => void
  /** Fired with the hidden series (mark indices) when a legend click or a legend action changes them (ECharts `legendselectchanged`). */
  onLegendChange?: (hidden: number[]) => void
  /** Fired with the zoom window (fractions; null = everything) whenever it changes — wheel, pan, navigator, preset, dispatch (ECharts `datazoom`). */
  onZoom?: (window: { start: number; end: number } | null) => void
  /**
   * Hover emphasis: the highlighted datum's column gets a faint band, its
   * bars and points an outline. On by default when the events model is in
   * play (`selectedMode`, `handle` or `onHighlight`); `false` keeps the
   * crosshair alone.
   */
  emphasis?: boolean
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
  /**
   * Keyboard navigation: the canvas becomes focusable; Left/Right (and
   * Up/Down) move a focus datum, Home/End jump, Enter/Space select (through
   * `onSelect`), Escape clears. The focused datum is announced in a polite
   * live region and drawn with a focus ring. Default on; `false` disables.
   */
  keyboard?: boolean
  /**
   * Range-selector presets (the Highcharts stock idea): buttons in a strip
   * under the plot that set the zoom window to the LAST `count` rows;
   * `count <= 0` shows everything. Works with or without `dataZoom`.
   */
  zoomPresets?: { label: string; count: number }[]
  /**
   * Tween a data change of the same shape (same series count and lengths)
   * from the previous frame to the new one instead of snapping. Default on;
   * respects `prefers-reduced-motion` like the entrance animation.
   */
  updateAnimation?: boolean
  /** Tween duration in ms; default 400. */
  updateDuration?: Double
  /**
   * The slider dataZoom: a navigator strip under the plot showing the first
   * series over ALL rows with the zoom window as a draggable band — drag the
   * band to move it, drag a handle to resize. Works with or without the
   * inside `dataZoom` (wheel + pan).
   */
  navigator?: boolean
  /**
   * Draw at most this many rows: past it the visible slice is thinned with
   * LTTB on the first mark (rows stay aligned across marks), so a 100k-point
   * series paints as a 1k-point one. Hits, tooltips and selection report the
   * GLOBAL index of the row actually drawn.
   */
  maxPoints?: number
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
   * Pin the left y domain. Derived from the data when absent — bars from
   * zero, lines from their own extent (see `resolveYDomain`).
   */
  yDomain?: Domain
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
   * downloads the current frame — `true` / `'svg'` as an SVG (the engine's
   * own serializer: vector, and the same draw list the canvas shows),
   * `'png'` as the canvas's pixels; `restore` resets zoom, brush, legend
   * toggles and any magicType override; `magicType` offers line / bar
   * switches for the independent marks.
   */
  toolbox?: { saveAsImage?: boolean | 'svg' | 'png'; restore?: boolean; magicType?: ('line' | 'bar')[] }
  /** Called with the image (an SVG string, or a PNG data URL) on saveAsImage instead of triggering a download. */
  onSaveImage?: (data: string, format: 'svg' | 'png') => void
  /**
   * Animate the first paint — bars rise, lines draw, points grow. On by
   * default because an entrance orients the eye; OFF automatically under
   * `prefers-reduced-motion`, which is a request, not a hint. A later data
   * change of the same shape tweens to the new frame (`updateAnimation`).
   */
  animate?: boolean
  /**
   * Lay the chart out right-to-left.
   *
   * The chart is painted as the mirror of its LTR drawing about the canvas's
   * vertical centreline, and every pointer is mirrored back before it is hit
   * tested — so bands run from the right, the value axis moves to the right
   * gutter, and a click still reports the category it landed on. Text is
   * repositioned, never reversed: laying a chart out right-to-left does not
   * reverse "Revenue" or "1.2M".
   */
  rtl?: boolean
  /**
   * Drop the offscreen data table. It is on by default because a canvas is a
   * single opaque node to a screen reader — without the table a chart is a
   * blank rectangle to anyone not looking at it.
   */
  accessibleTable?: boolean
  /**
   * The left y scale. `'log'` draws every left-axis mark in the log view:
   * decades on the axis, non-positive values as gaps, bars growing from the
   * axis floor. The tooltip and the table keep the real values.
   */
  yScale?: 'linear' | 'log'
  /** Label the y axis with calendar steps — the y twin of `xTime` (values are epoch ms). */
  yTime?: boolean
  /**
   * Draw the stacked marks as SHARES of each column (the 100% stacked bar).
   * The axis reads as percent unless `format` says otherwise; tooltip and
   * table keep the raw values.
   */
  stackNormalize?: boolean
  /** Axis titles, each drawn in a line of its own outside the tick labels. */
  xTitle?: string
  yTitle?: string
  y2Title?: string
  /**
   * What the x tick labels do when they run out of room: `'auto'` (default)
   * slants category labels 45° and thins numeric ones, `'rotate'` / `'thin'`
   * force one, `'all'` draws every label upright and lets them collide.
   */
  xLabels?: AxisLabelMode
  /**
   * A BCP 47 tag that formats the numbers (axis, tooltip, table, value
   * labels) and, with `xTime` / `yTime`, the dates through `Intl` — `de-DE`
   * reads `1.234,5` and `12. Mär.`. An explicit `format` / `xFormat` wins;
   * a registered locale pack (`registerLocale`) refines what Intl produces.
   * Web only: Intl has no native lowering, so a native host keeps the
   * engine's plain labels.
   */
  locale?: string
}

/**
 * How the x tick labels react to running out of room — the union
 * `LayoutConfig.xLabels` takes, named for the web props (the engine keeps
 * the inline union so it lowers as a plain String).
 */
export type AxisLabelMode = 'auto' | 'rotate' | 'thin' | 'all'

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
    const duration = theme().enterMs
    if (duration <= 0.0) return
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
  const hiddenSeries = props.handle?.hidden ?? signal<number[]>([])
  // The hovered datum for the crosshair; -1 = no hover.
  const hoverIdx = props.handle?.hover ?? props.link?.hover ?? signal(-1)
  // The dataZoom window; null = everything (the untouched state).
  const zoomWin = props.handle?.zoom ?? props.link?.zoom ?? signal<ZoomWindow | null>(null)
  // Pinned datums, GLOBAL indices (they survive a zoom); the handle owns them when given.
  const selected = props.handle?.selected ?? signal<number[]>([])
  const eventsOn = props.selectedMode !== undefined || props.handle !== undefined || props.onHighlight !== undefined
  const emphasisOn = props.emphasis ?? eventsOn
  // A committed brush band, in GLOBAL datum indices; null = none.
  const brushSel = signal<{ start: number; end: number } | null>(null)
  // In-flight drag bookkeeping. Plain locals, not signals: nothing should
  // repaint on every intermediate pixel except the overlay, which the move
  // handler drives through `draw()` itself.
  let dragMode: 'pan' | 'brush' | 'nav' | null = null
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
  // Pixels consumed BELOW the plot (preset strip, navigator, a bottom legend) on the last draw;
  // every hit test shrinks the plot height by it, as `topOffset` shifts it.
  let bottomOffset = 0.0
  // Pixels consumed LEFT of the plot (a left legend) on the last draw; hit tests come left by it.
  let leftOffset = 0.0
  // The width the plot region was drawn at (the canvas minus a side legend).
  let plotW = 0.0
  // What the last draw laid out — the pointer handlers and the click ask THIS
  // spec and layout, not a fresh one: a draw runs on every tracked change, so
  // the cache is never stale, and one pointer move stopped costing four to six
  // `layoutChart` calls (every one of which measures every tick label).
  let frameCache: { spec: ChartSpec; layout: PlotLayout; w: Double; hgt: Double } | null = null
  const tableId = createUniqueId()
  // Navigator strip rect from the last draw + the in-flight band drag.
  let navRect: Rect | null = null
  // 1 = band, 2 = left handle, 3 = right handle (the engine's `navigatorHit`).
  let navDrag: { kind: number; startWin: ZoomWindow } | null = null
  const navJson = signal('null')
  // Keyboard focus datum (LOCAL index into the visible rows); -1 = none.
  const focusIdx = signal(-1)
  // What the live region says about the focused datum.
  const announce = signal('')
  // Preset button hit rects from the LAST draw, in canvas pixels.
  let presetBoxes: Rect[] = []
  const presetBoxesJson = signal('[]')
  // Update tween: the previous frame's values, the running t, and its frame.
  let lastValues: Double[][] | null = null
  let tweenFrom: Double[][] | null = null
  let tweenT = 1.0
  let tweenFrame = 0.0
  const keyboardOn = props.keyboard !== false
  const startTween = (): void => {
    if (typeof requestAnimationFrame !== 'function') {
      tweenT = 1.0
      tweenFrom = null
      return
    }
    const duration = props.updateDuration ?? theme().updateMs
    let start = -1.0
    if (tweenFrame !== 0.0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(tweenFrame)
    const tick = (now: number): void => {
      if (start < 0.0) start = now
      tweenT = Math.min(1.0, (now - start) / duration)
      if (tweenT >= 1.0) tweenFrom = null
      draw()
      if (tweenT < 1.0) tweenFrame = requestAnimationFrame(tick)
      else tweenFrame = 0.0
    }
    tweenT = 0.0
    tweenFrame = requestAnimationFrame(tick)
  }
  /** The spec actually painted: mid-tween values when a data update is animating. */
  const tweened = (spec: ChartSpec): ChartSpec => {
    const cur = spec.series.map((x) => x.values)
    if (tweenT >= 1.0 || tweenFrom === null) {
      const enabled = props.updateAnimation !== false && !prefersReducedMotion() && entrance >= 1.0 && (props.updateDuration ?? theme().updateMs) > 0.0
      if (enabled && lastValues !== null && sameShape(lastValues, cur) && !sameValues(lastValues, cur)) {
        tweenFrom = lastValues
        lastValues = cur
        startTween()
        // The first tween frame is painted synchronously at t = 0.
        return { ...spec, series: spec.series.map((x, i) => ({ ...x, values: tweenValues(tweenFrom!, cur, 0.0)[i]! })) }
      }
      lastValues = cur
      return spec
    }
    const frame = tweenValues(tweenFrom, cur, tweenT)
    return { ...spec, series: spec.series.map((x, i) => ({ ...x, values: frame[i]! })) }
  }
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
  const hideHidden = (series: Series[]): Series[] => hideHiddenSeries(series, hiddenSeries())

  const readData = (): T[] => {
    const d = props.data
    return typeof d === 'function' ? (d as () => T[])() : d
  }
  // The theme in scope (provider → system scheme) with the prop merged over
  // it. Read inside the draw effect so a mode flip repaints.
  const themeOf = useChartTheme()
  const theme = (): ChartTheme => resolveChartTheme(themeOf(), props.theme)

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

  // `maxPoints` decimation: the rows KEPT from the visible slice, as indices
  // into it, or null when nothing was dropped. Chosen once per spec build by
  // LTTB over the first mark's values, so every mark stays aligned on the same
  // rows and a hit/tooltip still names a real datum. Selection and keyboard
  // navigation map back through it (`lastKeep`) — a decimated chart reports
  // the GLOBAL index of the row it drew, never a position in the thinned list.
  let lastKeep: number[] | null = null
  // The inverse of `lastKeep`, built once per decimation: a pinned selection
  // looked its row up with `indexOf` — O(kept) per pin, per spec build.
  let keepPos: Map<number, number> | null = null
  /** The visible (thinned) row for a slice index, or -1 when decimation dropped it. */
  const visibleIndexOf = (sliceIndex: number, keep: number[] | null): number => (keep === null ? sliceIndex : (keepPos?.get(sliceIndex) ?? -1))
  const globalOf = (visibleIndex: number, off: number): number => (lastKeep === null ? visibleIndex : (lastKeep[visibleIndex] ?? visibleIndex)) + off
  const decimateRows = (rows: T[]): number[] | null => {
    const max = props.maxPoints
    if (max === undefined || max < 3 || rows.length <= max) return null
    const first = props.marks[0]
    if (first === undefined) return null
    // `lttbIndices` with no `xs` treats the index as x — which is what this is,
    // rows being evenly spaced — so there is no `{x, y}` object per row and no
    // `.x` read back out afterwards.
    const keep = lttbIndices([], rows.map((d, i) => first.y(d, i)), max)
    return keep.length === 0 ? null : keep
  }

  // The number formatter every surface shares: the explicit `format`, else
  // the locale's Intl formatter (built once per tag), else the engine's
  // plain labels. `xFormat` gets the locale's DATE formatter under `xTime`.
  let localeMemo: { tag: string; number: Formatter; date: Formatter } | null = null
  const localeFmts = (tag: string): { number: Formatter; date: Formatter } => {
    if (localeMemo === null || localeMemo.tag !== tag) localeMemo = { tag, number: numberFormatter(tag), date: dateFormatter(tag) }
    return localeMemo
  }
  const resolvedFormat = (): Formatter | undefined => props.format ?? (props.locale === undefined ? undefined : localeFmts(props.locale).number)
  const resolvedXFormat = (): Formatter | undefined =>
    props.xFormat ?? (props.locale === undefined ? undefined : props.xTime === true ? localeFmts(props.locale).date : undefined)

  const buildSpec = (allRows: T[], w: Double, hgt: Double): ChartSpec => {
    const off = viewRange(allRows).from
    const visible = viewRows(allRows)
    const keep = decimateRows(visible)
    if (keep !== lastKeep) {
      lastKeep = keep
      keepPos = keep === null ? null : new Map(keep.map((k, i) => [k, i]))
    }
    const rows = keep === null ? visible : keep.map((i) => visible[i]!)
    /** The GLOBAL row index behind visible row `i`. */
    const gi = (i: number): number => (keep === null ? i : keep[i]!) + off
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
      y: (d: T, i: number) => m.y(d, gi(i)),
      ...(m.r !== undefined ? { r: (d: T, i: number) => m.r!(d, gi(i)) } : {}),
    })), theme().palette)),
    categories: resolveCategories(rows, props.x === undefined ? undefined : (d, i) => props.x!(d, gi(i))),
    theme: theme(),
    showXAxis: props.showXAxis ?? true,
    showYAxis: props.showYAxis ?? true,
    showGrid: props.showGrid ?? true,
    yFormat: resolvedFormat(),
    xFormat: resolvedXFormat(),
    ...(props.xTime === true ? { xTime: true } : {}),
    yScale: props.yScale,
    yTime: props.yTime === true,
    stackNormalize: props.stackNormalize === true,
    xTitle: props.xTitle,
    yTitle: props.yTitle,
    y2Title: props.y2Title,
    xLabels: props.xLabels,
    ...(props.xValue !== undefined
      ? { xValues: rows.map((d, i) => props.xValue!(d, gi(i))) }
      : {}),
    annotations: props.annotations,
    markers: props.markers,
    yDomain: props.yDomain,
    y2Domain: props.y2Domain,
    y2Format: props.y2Format,
    horizontal: props.horizontal === true,
    progress: entrance,
    // Emphasis speaks VISIBLE indices: the hover already does, the pins are
    // global and come down by the window's offset (off-window pins are just
    // not drawn — they are still selected).
    ...(emphasisOn
      ? { emphasis: { highlight: hoverIdx(), selected: selected().map((g) => visibleIndexOf(g - off, keep)).filter((i) => i >= 0 && i < rows.length) } }
      : {}),
    }
  }

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 200
    const ctx = prepareCanvas(el, w, hgt, theme().background)
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
        fontSize: theme().fontSize,
        color: theme().label,
        active: ov === null ? undefined : ov === 'bar' ? 'magicBar' : 'magicLine',
      })
      for (const c of tb.cmds) legendCmds.push(c)
      toolboxBoxes = tb.boxes
      toolH = tb.height
    }
    if (props.showTitle === true && props.title !== undefined) {
      const tl = renderTitle(props.title, props.subtitle, { x: 0, y: toolH, w, h: hgt - toolH }, {
        fontSize: theme().titleSize,
        color: theme().text,
        align: 'start',
      })
      titleH = tl.height
      for (const c of tl.cmds) legendCmds.push(c)
    }
    titleH = titleH + toolH
    // The legend: above the plot by default, else below it or in a column
    // beside it. A side legend narrows the plot; a bottom one sits under the
    // navigator and the presets.
    // Placement is the ENGINE's `placeLegend`, the same call `canvas-host.tsx`
    // and both native emitters make. This host used to carry its OWN copy of
    // the four branches — a THIRD implementation — and the copies had already
    // drifted: a top legend sat at x = 0 here and x = 8 in the family hosts, a
    // bottom one reserved `height + 4` here and `height + 8` there. Neither
    // difference was reported by anything.
    const legendPos = props.legendPosition ?? 'top'
    let legendBottom = 0.0
    let legendLeft = 0.0
    let legendRight = 0.0
    if (props.showLegend === true) {
      const series = resolveMarks(rows, props.marks, theme().palette)
      const hidden = hiddenSeries()
      const entries = series.map((x, i) => ({ label: x.label, color: x.color, muted: hidden.includes(i) }))
      const placed = placeLegend(
        entries,
        { x: 0, y: titleH, w, h: hgt - titleH },
        legendPos,
        {
          fontSize: theme().fontSize,
          labelColor: theme().label,
          swatch: 10,
          gap: 12,
          orientation: 'horizontal',
          maxRows: props.legendMaxRows,
          page: legendPage(),
        },
        measure,
      )
      for (const c of placed.cmds) legendCmds.push(c)
      legendBoxes = placed.boxes
      legendPager = placed.pager ?? null
      legendH = placed.top
      legendBottom = placed.bottom
      legendLeft = placed.left
      legendRight = placed.right
    }

    const top = titleH + legendH
    topOffset = top
    leftOffset = legendLeft
    const pw = Math.max(0.0, w - legendLeft - legendRight)
    plotW = pw
    // Zoom presets take a strip under the plot. The engine lays it out and
    // hit-tests it (iOS and Android place the same buttons); the boxes are
    // kept for the click handler.
    const presetItems = props.zoomPresets ?? []
    let presetH = 0.0
    let presetCmds: DrawCmd[] = []
    presetBoxes = []
    if (presetItems.length > 0) {
      const strip = renderPresets(
        presetItems,
        rows.length,
        zoomWin() ?? { start: 0.0, end: 1.0 },
        { x: 0.0, y: 0.0, w: pw, h: hgt - legendBottom },
        {
          fontSize: 11.0,
          padX: 8.0,
          padY: 3.0,
          gap: 6.0,
          inset: 8.0,
          activeFill: theme().axis,
          idleFill: theme().grid,
          activeText: '#ffffff',
          idleText: theme().label,
        },
        measure,
      )
      presetCmds = shiftCmds(strip.cmds, legendLeft, 0.0)
      presetBoxes = legendLeft === 0.0 ? strip.boxes : strip.boxes.map((b) => ({ ...b, x: b.x + legendLeft }))
      presetH = strip.height
    }
    // Test hooks: written only when the value moved, so a tween frame does not
    // allocate two strings and notify two signals for nothing.
    const presetsJson = JSON.stringify(presetBoxes)
    if (presetsJson !== untrack(presetBoxesJson)) presetBoxesJson.set(presetsJson)
    const navH = props.navigator === true ? 36.0 : 0.0
    bottomOffset = presetH + navH + legendBottom
    const spec = tweened(buildSpec(rows, pw, hgt - top - presetH - navH - legendBottom))
    // ONE layout per frame: the paint, the crosshair, the brush band and the
    // focus ring all read it, and the pointer handlers read it from the cache.
    const l = layoutChart(spec, measure)
    frameCache = { spec, layout: l, w, hgt }
    const cmds = renderChartIn(spec, measure, l)
    const navCmds = shiftCmds(navigatorCmds(rows, pw, hgt - presetH - navH - legendBottom, navH), legendLeft, 0.0)
    if (navRect !== null && legendLeft !== 0.0) navRect = { ...navRect, x: navRect.x + legendLeft }
    const navStr = JSON.stringify(navRect)
    if (navStr !== untrack(navJson)) navJson.set(navStr)
    // Shift the plot down past the title + legend (and right past a side
    // legend). Translating the emitted commands rather than threading an
    // origin through the engine keeps the engine's coordinate space at (0,0)
    // and this concern in the host.
    const shifted = shiftCmds(cmds, legendLeft, top)
    const crossShifted = shiftCmds(crosshairCmds(spec, l), legendLeft, top)
    const bandShifted = shiftCmds(brushCmds(spec, l), legendLeft, top)
    const ringShifted = shiftCmds(focusRingCmds(spec, l), legendLeft, top)
    const frame = [...legendCmds, ...shifted, ...bandShifted, ...crossShifted, ...ringShifted, ...navCmds, ...presetCmds]
    // Capture what was actually painted so `saveAsImage` serializes THIS
    // frame rather than re-deriving one. Declared beside the toolbox for
    // that single reader; without the write it handed `renderSvg` an empty
    // list at 0x0 and the download was a blank <svg> with only its title.
    // The MIRRORED list under `rtl`: an SVG export must be the chart the user
    // sees, and it is the PNG path's `toDataURL` of the same pixels.
    const painted = props.rtl === true ? mirrorCmds(frame, w) : frame
    lastFrame = painted
    lastW = w
    lastH = hgt
    paint(ctx, painted, w, hgt, FONT)
  }

  // The navigator's series over ALL rows, resolved once per data change (the
  // strip was re-resolving every row on every entrance and tween frame) and
  // thinned to the strip's width — a 36px-tall overview needs the min/max
  // envelope per pixel column, not 100k points.
  let navCache: { rows: T[]; marks: Mark<T>[]; w: Double; values: Double[]; color: string } | null = null
  const navigatorSeries = (allRows: T[], w: Double): { values: Double[]; color: string } => {
    const c = navCache
    if (c !== null && c.rows === allRows && c.marks === props.marks && c.w === w) return c
    const first = resolveMarks(allRows, props.marks, theme().palette).find((x) => x.values.length > 1)
    const buckets = Math.max(1, Math.floor(w / 2.0))
    const next = { rows: allRows, marks: props.marks, w, values: minMaxBuckets(first?.values ?? [], buckets), color: first?.color ?? '#000000' }
    navCache = next
    return next
  }
  /** The navigator strip — engine-laid-out (iOS and Android drive the same one); `navRect` is what the drag measures against. */
  const navigatorCmds = (allRows: T[], w: Double, y0: Double, navH: Double): DrawCmd[] => {
    navRect = null
    if (props.navigator !== true || navH <= 0.0) return []
    const nav = navigatorSeries(allRows, w)
    const l = renderNavigator(
      nav.values,
      nav.color,
      zoomWin() ?? { start: 0.0, end: 1.0 },
      { x: 0.0, y: 0.0, w, h: y0 + navH },
      theme().grid,
    )
    navRect = l.strip
    return l.cmds
  }

  /** A dashed rectangle around the focused datum's column — the keyboard focus ring. */
  const focusRingCmds = (spec: ChartSpec, l: PlotLayout): DrawCmd[] => {
    const idx = focusIdx()
    if (idx < 0 || props.horizontal === true) return []
    const plot = l.plot
    let cx = -1.0
    let bw = 16.0
    if (spec.xValues !== undefined && spec.xValues.length > 0) {
      const v = spec.xValues[idx]
      if (v === undefined) return []
      cx = scaleLinear(l.xDomainUsed, plot.x, plot.x + plot.w, v)
    } else if (spec.categories.length > 0) {
      bw = plot.w / spec.categories.length
      cx = plot.x + bw * (idx + 0.5)
    } else {
      cx = scaleLinear(l.xDomainUsed, plot.x, plot.x + plot.w, idx)
    }
    const x0 = cx - bw / 2.0
    const x1 = cx + bw / 2.0
    return [{
      kind: 'polyline',
      points: [{ x: x0, y: plot.y }, { x: x1, y: plot.y }, { x: x1, y: plot.y + plot.h }, { x: x0, y: plot.y + plot.h }, { x: x0, y: plot.y }],
      stroke: '#2563eb',
      width: 2.0,
      dash: [4.0, 3.0],
    }]
  }

  /** Move the keyboard focus datum and announce it. */
  const moveFocus = (delta: number, absolute?: number): void => {
    const all = readData()
    const n = viewRows(all).length
    if (n === 0) return
    const cur = focusIdx()
    let next = absolute !== undefined ? absolute : cur < 0 ? (delta > 0 ? 0 : n - 1) : cur + delta
    if (next < 0) next = 0
    if (next > n - 1) next = n - 1
    const off = viewRange(all).from
    const t = chartTable(a11yInput())
    const row = t.rows[globalOf(next, off)]
    // One notify cycle for the three writes a keystroke makes (focus, hover, live region).
    batch(() => {
      focusIdx.set(next)
      hoverIdx.set(next)
      announce.set(row === undefined ? '' : row.join(', '))
    })
  }

  /** A datum was picked (click or keyboard): pin it per `selectedMode`, then report the pick. */
  const pickDatum = (global: number): void => {
    const mode = props.selectedMode
    if (mode !== undefined && global >= 0) {
      const cur = selected()
      const has = cur.includes(global)
      selected.set(mode === 'single' ? (has ? [] : [global]) : has ? cur.filter((i) => i !== global) : [...cur, global])
    }
    if (props.onSelect !== undefined) props.onSelect(global)
    if (props.onSelectIndex !== undefined) props.onSelectIndex(global)
  }

  const handleKeyDown = (ev: KeyboardEvent): void => {
    const key = ev.key
    if (key === 'ArrowRight' || key === 'ArrowUp') moveFocus(1)
    else if (key === 'ArrowLeft' || key === 'ArrowDown') moveFocus(-1)
    else if (key === 'Home') moveFocus(0, 0)
    else if (key === 'End') moveFocus(0, viewRows(readData()).length - 1)
    else if (key === 'Enter' || key === ' ') {
      const idx = focusIdx()
      if (idx >= 0) pickDatum(idx + viewRange(readData()).from)
    } else if (key === 'Escape') {
      batch(() => {
        focusIdx.set(-1)
        hoverIdx.set(-1)
        announce.set('')
      })
    } else return
    ev.preventDefault()
    draw()
  }

  /**
   * The crosshair: a dashed rule through the hovered datum's column plus a
   * marker on every visible line/area/points series at that datum. Painted
   * LAST so nothing covers it. Bars get the rule only — the bar itself is the
   * marker.
   */
  const crosshairCmds = (spec: ChartSpec, l: PlotLayout): DrawCmd[] => {
    const out: DrawCmd[] = []
    if (props.crosshair !== true || props.horizontal === true) return out
    const idx = hoverIdx()
    if (idx < 0) return out
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
    // The markers sit where the VIEW placed the points — a log chart's
    // crosshair must land on the drawn line, not on the raw value.
    const g = geometrySpec(spec)
    const yDomain = resolveYDomain(g)
    const y2Domain = resolveY2Domain(g)
    for (const sr of g.series) {
      if (sr.kind !== 'line' && sr.kind !== 'area' && sr.kind !== 'points') continue
      if (idx >= sr.values.length) continue
      // A right-axis series places its marker on ITS domain.
      const dom = seriesOnRightAxis(sr, g) ? y2Domain : yDomain
      const pts =
        g.xValues !== undefined && g.xValues.length > 0
          ? layoutSeriesPointsAt(sr.values, g.xValues, plot, dom, l.xDomainUsed)
          : layoutSeriesPoints(sr.values, plot, dom)
      const p = pts[idx]
      if (p === undefined) continue
      out.push({ kind: 'circle', center: p, radius: Math.max(3.0, sr.radius), fill: sr.color })
    }
    return out
  }

  /** The brush band — the live drag, or the committed selection projected through the window (engine-drawn; iOS and Android paint the same band). */
  const brushCmds = (spec: ChartSpec, l: PlotLayout): DrawCmd[] => {
    if (props.brush !== true || props.horizontal === true) return []
    const plot = l.plot
    const live = brushDrag
    if (live !== null) return renderBrushBand(plot, live.a < live.b ? live.a : live.b, live.a < live.b ? live.b : live.a, spec.theme.axis)
    const committed = brushSel()
    if (committed === null) return []
    const band = brushBand(plot, committed, zoomWin() ?? { start: 0.0, end: 1.0 }, readData().length)
    return band.visible ? renderBrushBand(plot, band.lo, band.hi, spec.theme.axis) : []
  }

  /**
   * The spec + layout the pointer handlers hit-test: the last draw's, re-laid
   * only when the canvas size moved under it (a resize the observer has not
   * yet repainted for).
   */
  const frameNow = (): { spec: ChartSpec; layout: PlotLayout } | null => {
    const el = canvas
    if (el === null) return null
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 200
    const c = frameCache
    if (c !== null && c.w === w && c.hgt === hgt) return c
    const ctx = el.getContext('2d')
    if (ctx === null) return null
    const spec = buildSpec(readData(), plotW > 0.0 ? plotW : w, hgt - topOffset - bottomOffset)
    return { spec, layout: layoutChart(spec, canvasMeasure(ctx, FONT)) }
  }
  /** The plot rect at the current size (in PLOT space — right of a side legend, under the chrome) — gestures are plot-relative. */
  const plotNow = (): Rect | null => frameNow()?.layout.plot ?? null

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
    selected()
    brushSel()
    legendPage()
    focusIdx()
    typeOverride()
    // The theme in scope — a provider mode flip repaints; touched HERE because
    // draw() bails before reading it while the canvas ref is still unattached.
    theme()
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
  const datumAt = (px: Double, py: Double): number => {
    const f = frameNow()
    if (f === null) return -1
    // Hit-test in PLOT space: the plot was drawn `topOffset` px down, under
    // the title + legend, and `leftOffset` px right of a side legend.
    return plotHitIndexIn(f.spec, f.layout, px - leftOffset, py - topOffset)
  }
  /**
   * A pointer's x in CHART coordinates.
   *
   * Under `rtl` the chart is painted as the mirror of the drawing about the
   * canvas centreline, so every hit test — the plot, the legend pager, the
   * preset strip, the toolbox, a pan, a brush — has to mirror its input back
   * or it answers about the opposite side of the chart. One helper rather
   * than a copy of `ev.clientX - rect.left` per handler, because that is exactly the
   * shape where one call site gets forgotten and only one interaction is
   * silently wrong.
   */
  const localX = (clientX: Double, rect: { left: Double; width: Double }): Double => {
    const x = clientX - rect.left
    return props.rtl === true ? rect.width - x : x
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
    const px = localX(ev.clientX, rect) - leftOffset
    const frac = plot.w <= 0.0 ? 0.5 : (px - plot.x) / plot.w
    const win = zoomWin() ?? { start: 0.0, end: 1.0 }
    const next = zoomWindow(win, ev.deltaY > 0 ? 1.25 : 0.8, frac)
    zoomWin.set(isFullWindow(next) ? null : next)
  }

  // Touch: every pointer currently down on the canvas, for the pinch. Two
  // fingers zoom the window around their midpoint by the ratio of their
  // distance to the distance they started at; one finger is a drag like a mouse.
  const pointers = new Map<number, { x: Double; y: Double }>()
  let pinch: { dist: Double; win: ZoomWindow } | null = null
  const pinchDistance = (): Double => {
    const pts = [...pointers.values()]
    if (pts.length < 2) return 0.0
    const dx = pts[0]!.x - pts[1]!.x
    const dy = pts[0]!.y - pts[1]!.y
    return Math.sqrt(dx * dx + dy * dy)
  }
  const pinchCenterFrac = (plot: Rect): Double => {
    const pts = [...pointers.values()]
    if (pts.length < 2 || plot.w <= 0.0) return 0.5
    const mid = (pts[0]!.x + pts[1]!.x) / 2.0 - leftOffset
    return (mid - plot.x) / plot.w
  }

  const handleDown = (ev: PointerEvent): void => {
    if (props.dataZoom !== true && props.brush !== true && props.navigator !== true) return
    const el = canvas
    if (el === null) return
    const rect = el.getBoundingClientRect()
    pointers.set(ev.pointerId, { x: localX(ev.clientX, rect), y: ev.clientY - rect.top })
    // A drag that leaves the canvas must still end here, not on whatever
    // element the pointer is over when it lifts.
    // A synthetic pointer (a test's dispatched event) has no active pointer to capture — that is not an error worth surfacing.
    if (typeof el.setPointerCapture === 'function') {
      try {
        el.setPointerCapture(ev.pointerId)
      } catch {
        /* no active pointer with this id */
      }
    }
    if (pointers.size === 2 && props.dataZoom === true) {
      pinch = { dist: pinchDistance(), win: zoomWin() ?? { start: 0.0, end: 1.0 } }
      dragMode = null
      brushDrag = null
      navDrag = null
      suppressClick = true
      ev.preventDefault()
      return
    }
    dragStartX = localX(ev.clientX, rect)
    dragLastX = dragStartX
    dragMoved = false
    // A press inside the navigator strip grabs the band or one of its handles.
    const pressY = ev.clientY - rect.top
    if (props.navigator === true && navRect !== null && pressY >= navRect.y && pressY <= navRect.y + navRect.h) {
      const win = zoomWin() ?? { start: 0.0, end: 1.0 }
      navDrag = { kind: navigatorHit(navRect, win, dragStartX), startWin: win }
      dragMode = 'nav'
      suppressClick = false
      ev.preventDefault()
      return
    }
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

  const endDrag = (ev?: PointerEvent): void => {
    if (ev !== undefined) pointers.delete(ev.pointerId)
    if (pinch !== null) {
      // The pinch ends when the second finger lifts; the remaining finger does not start a pan.
      if (pointers.size < 2) pinch = null
      return
    }
    if (dragMode === 'brush' && dragMoved) {
      const plot = plotNow()
      const rows = readData()
      if (plot !== null && rows.length > 0) {
        const win = zoomWin() ?? { start: 0.0, end: 1.0 }
        const range = brushRange(plot.x, plot.w, dragStartX - leftOffset, dragLastX - leftOffset, win, rows.length)
        brushSel.set(range)
        if (props.onBrush !== undefined) props.onBrush(range)
      }
    }
    if (dragMoved) suppressClick = true
    dragMode = null
    brushDrag = null
    navDrag = null
    draw()
  }

  const handleMove = (ev: PointerEvent): void => {
    const el = canvas
    if (el === null) return
    if (pointers.has(ev.pointerId)) {
      const r0 = el.getBoundingClientRect()
      pointers.set(ev.pointerId, { x: localX(ev.clientX, r0), y: ev.clientY - r0.top })
    }
    if (pinch !== null && pointers.size >= 2) {
      const plot = plotNow()
      const d = pinchDistance()
      if (plot !== null && d > 0.0 && pinch.dist > 0.0) {
        // Fingers apart = zoom in = a narrower window.
        const next = zoomWindow(pinch.win, pinch.dist / d, pinchCenterFrac(plot))
        zoomWin.set(isFullWindow(next) ? null : next)
      }
      ev.preventDefault()
      return
    }
    if (dragMode !== null) {
      const rect0 = el.getBoundingClientRect()
      const x = localX(ev.clientX, rect0)
      if (Math.abs(x - dragStartX) > 3.0) dragMoved = true
      if (dragMode === 'nav') {
        if (navDrag !== null && navRect !== null && navRect.w > 0.0) {
          const next = navigatorDrag(navDrag.kind, navDrag.startWin, (x - dragStartX) / navRect.w)
          zoomWin.set(isFullWindow(next) ? null : next)
        }
        dragLastX = x
        return
      }
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
    const px = localX(ev.clientX, rect)
    const py = ev.clientY - rect.top
    const idx = datumAt(px, py)
    if (props.crosshair === true || eventsOn) hoverIdx.set(idx)
    const box = tip
    if (props.tooltip !== true || box === null) return
    if (idx < 0) {
      box.style.display = 'none'
      return
    }
    // The frame's spec already holds the visible rows' series and categories —
    // the tooltip reads the same numbers the chart drew (a hidden series is
    // zeroed there, so it is skipped here).
    const f = frameNow()
    if (f === null) return
    const hidden = hiddenSeries()
    const series = f.spec.series.filter((_x, i) => !hidden.includes(i))
    const content = tooltipAt(idx, f.spec.categories, series)
    const custom = props.tooltipFormatter
    box.textContent = custom === undefined ? tooltipLines(content, resolvedFormat()).join('\n') : custom(content)
    box.style.display = 'block'
    // Measure AFTER filling it: placement depends on the rendered size, and a
    // stale size flips the tooltip on the wrong side at the edge.
    const size = { w: box.offsetWidth, h: box.offsetHeight }
    const at = placeTooltip({ x: px, y: py }, size, { x: 0, y: 0, w, h: hgt }, 12)
    // `px` is CHART space (mirrored in by `localX`); the tooltip is a DOM node
    // in SCREEN space, so its left edge mirrors back out — the other half of
    // the RTL seam (`./rtl`).
    box.style.left = `${screenRectX(at.x, size.w, w, props.rtl === true)}px`
    box.style.top = `${at.y}px`
  }

  const handleLeave = (ev?: PointerEvent): void => {
    // With the pointer captured a drag never "leaves"; a leave is a real exit.
    if (ev !== undefined) pointers.delete(ev.pointerId)
    pinch = null
    if (dragMode !== null) endDrag()
    hoverIdx.set(-1)
    if (tip !== null) tip.style.display = 'none'
  }

  // The whole click is one batch: a preset, legend-page or legend-toggle click
  // writes two or three signals, and the canvas must repaint once, not per write.
  const handleClick = (ev: MouseEvent): void => batch(() => {
    const el = canvas
    if (el === null) return
    // A drag is not a click: panning or brushing must not fire onSelect or
    // toggle a legend entry on release.
    if (suppressClick) {
      suppressClick = false
      return
    }
    // Zoom presets: a click on a button sets the window and stops here.
    if (presetBoxes.length > 0) {
      const r0 = el.getBoundingClientRect()
      const hit = presetHit(presetBoxes, localX(ev.clientX, r0), ev.clientY - r0.top)
      if (hit >= 0) {
        const it = props.zoomPresets?.[hit]
        const next = presetWindow(it === undefined ? 0 : it.count, readData().length)
        zoomWin.set(isFullWindow(next) ? null : next)
        return
      }
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
      const tool = hitToolbox(toolList, toolboxBoxes, localX(ev.clientX, r0), ev.clientY - r0.top)
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
          // Static, and deliberately not dynamic: `@pyreon/charts/plot` is
          // ONE package entry (rolldown builds it as a single-chunk bundle —
          // no code splitting), so `import('./svg')` inlines to exactly the
          // same bytes as a static import while adding an async indirection
          // that never pays off. See anti-patterns.md — saveAsImage is now a
          // permanent, unavoidable part of the plot-minimal bundle; the
          // import-budget and tree-shake suite are relocked accordingly.
          if (props.toolbox?.saveAsImage === 'png') {
            const url = el.toDataURL('image/png')
            if (props.onSaveImage !== undefined) props.onSaveImage(url, 'png')
            else if (isClient) {
              const a = document.createElement('a')
              a.href = url
              a.download = (props.title ?? 'chart') + '.png'
              a.click()
            }
          } else {
            const svg = renderSvg(lastFrame, lastW, lastH, { fontFamily: FONT, ...(props.title !== undefined ? { title: props.title } : {}) })
            if (props.onSaveImage !== undefined) props.onSaveImage(svg, 'svg')
            else if (isClient && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
              const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
              const a = document.createElement('a')
              a.href = url
              a.download = (props.title ?? 'chart') + '.svg'
              a.click()
              URL.revokeObjectURL(url)
            }
          }
        }
        return
      }
    }
    if (props.showLegend === true && legendPager !== null) {
      const r0 = el.getBoundingClientRect()
      const lx = localX(ev.clientX, r0)
      const ly = ev.clientY - r0.top
      const p = legendPager
      const d = pagerHit(p, lx, ly)
      if (d !== 0.0) {
        legendPage.set(p.page + d)
        return
      }
    }
    if (props.showLegend === true && props.legendToggle !== false && legendBoxes.length > 0) {
      const r0 = el.getBoundingClientRect()
      const lx = localX(ev.clientX, r0)
      const ly = ev.clientY - r0.top
      const i = legendHitIndex(legendBoxes, lx, ly)
      if (i >= 0) {
        hiddenSeries.set(legendToggle(hiddenSeries(), i))
        return
      }
    }
    if (props.onSelect === undefined && props.onSelectIndex === undefined && props.selectedMode === undefined) return
    const f = frameNow()
    if (f === null) return
    const rect = el.getBoundingClientRect()
    // Plot space (see datumAt): the plot sits under the title + legend and right of a side legend.
    const px = localX(ev.clientX, rect) - leftOffset
    const py = ev.clientY - rect.top - topOffset
    // Callbacks speak GLOBAL indices — the caller's data never zoomed.
    // `plotHitBars` (native-crossing, plot-hit.ts) owns EVERY mark kind now —
    // plain, stacked, and grouped bars all place their rects through it, so
    // there is no separate loop here to keep in sync with it.
    const off = viewRange(readData()).from
    const idx = plotHitBarsIn(f.spec, f.layout, px, py)
    pickDatum(idx < 0 ? idx : globalOf(idx, off))
  })

  // The a11y input is read by the description, the table and every keystroke;
  // resolving the marks over all rows each time was a full O(N) pass per read.
  // Memoized on the inputs' identity — a new rows array or marks array is a new pass.
  let a11yMemo: { rows: T[]; marks: Mark<T>[]; labels: string[] | undefined; format: Formatter | undefined; title: string | undefined; input: A11yInput } | null = null
  const a11yInput = (): A11yInput => {
    const rows = readData()
    const m = a11yMemo
    const fmtNow = resolvedFormat()
    if (m !== null && m.rows === rows && m.marks === props.marks && m.labels === props.seriesLabels && m.format === fmtNow && m.title === props.title) return m.input
    const resolved = resolveMarks(rows, props.marks)
    const input: A11yInput = {
      title: props.title,
      // The spoken description says the same numbers the axis shows. A chart
      // whose axis reads "$3.2K" and whose description reads "3204.55" is one
      // chart to a sighted reader and another to a screen-reader user.
      format: fmtNow,
      categories: resolveCategories(rows, props.x),
      series: resolved.map((s, i) => ({
        label: props.seriesLabels?.[i] ?? `Series ${i + 1}`,
        values: s.values,
        kind: s.kind,
        // A band's low edge. Mapping field by field is how it went missing:
        // the Series carries it and this object did not name it.
        ...(s.values2 !== undefined ? { values2: s.values2 } : {}),
        ...(s.errLow !== undefined ? { errLow: s.errLow } : {}),
        ...(s.errHigh !== undefined ? { errHigh: s.errHigh } : {}),
        ...(s.rValues !== undefined ? { rValues: s.rValues } : {}),
      })),
    }
    a11yMemo = { rows, marks: props.marks, labels: props.seriesLabels, format: fmtNow, title: props.title, input }
    return input
  }

  const canvasNode = h('canvas', {
    class: props.class,
    // `img` + a label is what makes the canvas announce as a single described
    // thing rather than being skipped over entirely.
    role: 'img',
    'aria-label': () => describeChart(a11yInput()),
    ...(props.accessibleTable === false ? {} : { 'aria-describedby': tableId }),
    // The box the client will paint into, as SSR attributes: `prepareCanvas`
    // never runs on the server, and a server-rendered canvas with no size is
    // a 300x150 default that the first client paint resizes — a layout shift
    // on every hydrated chart. Width is only known when explicit.
    ...canvasSizeAttrs(props.width, props.height ?? 200, props.dataZoom === true || props.brush === true || props.navigator === true),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      sizeObserver?.disconnect()
      sizeObserver = null
      if (el === null) {
        // Unmounted mid-animation: neither frame may keep the closure alive.
        if (typeof cancelAnimationFrame === 'function') {
          if (entranceFrame !== 0.0) cancelAnimationFrame(entranceFrame)
          if (tweenFrame !== 0.0) cancelAnimationFrame(tweenFrame)
        }
        entranceFrame = 0.0
        tweenFrame = 0.0
        frameCache = null
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
    // Stable, reactive hooks for consumers and tests: the zoom window and the
    // preset button boxes as drawn.
    'data-pyreon-zoom': () => {
      const z = zoomWin()
      return z === null ? 'all' : z.start.toFixed(3) + '-' + z.end.toFixed(3)
    },
    'data-pyreon-presets': () => presetBoxesJson(),
    'data-pyreon-nav': () => navJson(),
    'data-pyreon-hover': () => String(hoverIdx()),
    'data-pyreon-selected': () => selected().join(','),
    ...(keyboardOn ? { tabIndex: 0, onKeyDown: handleKeyDown, onBlur: () => batch(() => { focusIdx.set(-1); announce.set('') }) } : {}),
    ...(props.dataZoom === true ? { onWheel: handleWheel, onDblClick: () => zoomWin.set(null) } : {}),
    // Pointer events, not mouse events: a finger drags, pans, brushes and
    // pinches exactly as a mouse does — and the tooltip follows a touch.
    ...(props.dataZoom === true || props.brush === true || props.navigator === true
      ? { onPointerDown: handleDown, onPointerUp: endDrag, onPointerCancel: handleLeave }
      : {}),
    ...(props.tooltip === true || props.crosshair === true || props.dataZoom === true || props.brush === true || props.navigator === true || eventsOn
      ? { onPointerMove: handleMove, onPointerLeave: handleLeave }
      : {}),
  })

  // The events model: each callback fires when ITS state changes, whoever
  // changed it (pointer, keyboard, link, dispatch) — one effect per event,
  // the callback untracked so a handler's own signal reads never subscribe.
  const fireOnChange = <V,>(read: () => V, same: (a: V, b: V) => boolean, cb: ((v: V) => void) | undefined): void => {
    if (cb === undefined) return
    let prev = untrack(read)
    effect(() => {
      const v = read()
      if (same(prev, v)) return
      prev = v
      untrack(() => cb(v))
    })
  }
  fireOnChange(
    () => {
      const i = hoverIdx()
      return i < 0 ? -1 : i + viewRange(readData()).from
    },
    (a, b) => a === b,
    props.onHighlight,
  )
  fireOnChange(() => selected(), (a, b) => a === b, props.onSelectChange)
  fireOnChange(() => hiddenSeries(), (a, b) => a === b, props.onLegendChange)
  fireOnChange(
    () => zoomWin(),
    (a, b) => a === b || (a !== null && b !== null && a.start === b.start && a.end === b.end),
    props.onZoom,
  )

  const tooltipNode = (): VNode =>
    h('div', {
      // A stable hook so a consumer can style it and a test can find it —
      // matching on the style string is fragile, and the accessible-table
      // wrapper is absolutely positioned too.
      'data-pyreon-chart-tooltip': 'true',
      // `pointer-events: none` is load-bearing: without it the tooltip sits
      // under the cursor, swallows the next mousemove, and the chart flickers
      // as the tooltip hides and reappears.
      style: () => tooltipStyle(theme(), FONT),
      ref: (el: HTMLDivElement | null) => {
        tip = el
      },
    })

  const liveNode = (): VNode =>
    h('div', {
      role: 'status',
      'aria-live': 'polite',
      style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;margin:-1px;padding:0',
    }, () => announce())

  if (props.accessibleTable === false && props.tooltip !== true && !keyboardOn) return canvasNode

  // A real table rather than a longer label: a label is read as one
  // unstructured string, while a table can be navigated by row and column.
  // Positioned offscreen instead of `display: none`, which would remove it
  // from the accessibility tree along with the visual layout.
  const table = (): VNode => {
    const t = chartTable(a11yInput())
    // Capped: a 100k-row chart drawn through `maxPoints` must not also
    // materialize 100k table rows in the DOM; the caption says what was cut.
    const shown = t.rows.length > A11Y_TABLE_MAX ? t.rows.slice(0, A11Y_TABLE_MAX) : t.rows
    const caption = (props.title ?? 'Chart data') + (shown.length < t.rows.length ? ` (first ${A11Y_TABLE_MAX} of ${t.rows.length} rows)` : '')
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
      { id: tableId },
      h('caption', null, caption),
      h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
      h(
        'tbody',
        null,
        ...shown.map((r) =>
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
    ...(keyboardOn ? [liveNode()] : []),
    ...(props.accessibleTable === false ? [] : [() => table()]),
  )
}

export { layoutChart, renderChart }
