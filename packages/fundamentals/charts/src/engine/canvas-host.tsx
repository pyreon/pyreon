// The shared canvas host — what every non-cartesian `/plot` component is made
// of. A family supplies its GEOMETRY (layout / render / hit / describe); the
// host owns everything else: the theme in scope, the title block, the legend
// (any side), the toolbox, the tooltip, the entrance and update animations,
// pointer AND keyboard interaction, the resize observer, selection, and the
// accessible table. Seventeen hosts carried seventeen copies of the canvas /
// ref / observer / table boilerplate before this, and none of them had a
// title, a tooltip, an animation — or a keyboard.
//
// Two rules keep the host cheap. The layout the pointer handlers hit-test is
// the one the last draw produced (a draw runs on every tracked change, so it
// is never stale), not a fresh one per pointer move — a force-directed graph
// was re-simulating 200 iterations on every mousemove. And a data change is
// animated at the DRAW-LIST level (`cmd-tween.ts`): two frames of the same
// shape interpolate, so every family gets an update tween without knowing
// what a value is.

import { createUniqueId, h, onUnmount } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { batch, effect, isClient, signal } from '@pyreon/reactivity'
import { chartTable, describeChart } from './a11y'
import type { A11yInput } from './a11y'
import { canvasMeasure, canvasSizeAttrs, paint, prepareCanvas, trackChartImages } from './canvas-web'
import { cmdsEqual, sameCmdShape, tweenCmds, universalTweenCmds } from './cmd-tween'
import { placeLegend } from './legend'
import type { LegendEntry, LegendPosition } from './legend'
import type { ChartTheme } from './render'
import { resolveChartTheme, tooltipStyle, useChartTheme } from './theme'
import { renderTitle } from './title'
import { hitToolbox, renderToolbox } from './toolbox'
import type { ToolboxTool } from './toolbox-config'
import { placeTooltip } from './tooltip'
import type { Size } from './tooltip'
import { renderTooltipHtml } from './tooltip-html'
import { easeOutCubic } from './tween'
import type { ChartGradient, DrawCmd, Double, MeasureText, Pt, Rect } from './types'
import { mirrorCmds, mirrorX, screenRectX , transposeCmds, transposeRect } from './rtl'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
/** The accessible table stops here — a 100k-row table is a 100k-node DOM, and no reader walks it. */
export const A11Y_TABLE_MAX = 1000
const OFFSCREEN = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;margin:-1px;padding:0'

/** The crossing chrome functions return an EMPTY list for a miss; the host's tooltip contract says `null`. */
export function orNull(lines: string[]): string[] | null {
  return lines.length === 0 ? null : lines
}

/**
 * Translate a draw list by (dx, dy) — for families whose frame builders take a
 * width/height rather than a box (heatmap, candlestick, boxplot): they lay out
 * at the origin and the host moves the result under the chrome. Gradients ride
 * along because their axis is in the shape's coordinate space.
 */
export function shiftCmds(cmds: DrawCmd[], dx: Double, dy: Double): DrawCmd[] {
  if (dx === 0 && dy === 0) return cmds
  const pt = (p: { x: Double; y: Double }) => ({ x: p.x + dx, y: p.y + dy })
  const shiftGradient = (c: DrawCmd, next: DrawCmd): DrawCmd => {
    const g = (c as { grad?: ChartGradient }).grad
    return g === undefined ? next : ({ ...next, grad: { ...g, from: pt(g.from), to: pt(g.to) } } as DrawCmd)
  }
  return cmds.map((c): DrawCmd => {
    switch (c.kind) {
      case 'rect':
        return shiftGradient(c, { ...c, rect: { ...c.rect, x: c.rect.x + dx, y: c.rect.y + dy } })
      case 'line':
        return { ...c, from: pt(c.from), to: pt(c.to) }
      case 'polyline':
        return { ...c, points: c.points.map(pt) }
      case 'polygon':
        return shiftGradient(c, { ...c, points: c.points.map(pt) })
      case 'circle':
        return shiftGradient(c, { ...c, center: pt(c.center) })
      case 'text':
        return { ...c, at: pt(c.at) }
    }
  })
}

export type { LegendPosition } from './legend'

/** The props every canvas host accepts — the chrome, sizing, theme, interaction and a11y surface. */
/** Keep a caller-placed box inside the bounds, for a view that asked to be confined. */
function clampTooltip(at: Pt, size: Size, bounds: Rect): Pt {
  let x = at.x
  let y = at.y
  if (x + size.w > bounds.x + bounds.w) x = bounds.x + bounds.w - size.w
  if (x < bounds.x) x = bounds.x
  if (y + size.h > bounds.y + bounds.h) y = bounds.y + bounds.h - size.h
  if (y < bounds.y) y = bounds.y
  return { x, y }
}

/**
 * A tooltip richer than plain lines — what an ECharts-shaped option asks for.
 * Every field is optional; absent means the host's default.
 */
export interface TooltipView {
  /** Plain lines, rendered as text. */
  lines?: string[] | undefined
  /** HTML, rendered through an allow-list (`renderTooltipHtml`): tags and inline styles survive, scripts and handlers do not. */
  html?: string | undefined
  /** Where the box's top-left goes, in chart space, given its measured size; absent follows the pointer. */
  place?: ((at: Pt, size: Size, bounds: Rect) => Pt) | undefined
  /** Keep the box inside the chart (default true). */
  confine?: boolean | undefined
  /** CSS appended to the themed box style. */
  css?: string | undefined
  className?: string | undefined
  /** The pointer may enter the box (links and buttons in it work). */
  enterable?: boolean | undefined
  /** Milliseconds before the box hides after the pointer leaves. */
  hideDelay?: Double | undefined
  /** Keep the box on screen after the pointer leaves. */
  keepOnLeave?: boolean | undefined
  /** Seconds the box glides between positions. */
  transition?: Double | undefined
}

export interface CanvasHostProps {

  width?: Double
  height?: Double
  /** Token overrides merged over the theme in scope (`<ChartThemeProvider>`, else the system scheme). */
  theme?: Partial<ChartTheme>
  /** Names the chart for assistive tech and the accessible table's caption; drawn when `showTitle` is on. */
  title?: string
  /** A second line under the title, at the label size. */
  subtitle?: string
  /** Draw the title block above the chart (the title is otherwise only announced). */
  showTitle?: boolean
  /** Draw the legend (families that have named entries). */
  showLegend?: boolean
  /** Where the legend sits; `top` by default. `left`/`right` stack the entries in a column beside the chart. */
  legendPosition?: LegendPosition
  /**
   * A tooltip following the pointer — and, on touch, the last tap. Off by
   * default: pointer handlers and a DOM overlay are dead weight in a static
   * report.
   */
  tooltip?: boolean
  /** Entrance animation on first paint; off under `prefers-reduced-motion`. */
  animate?: boolean
  /**
   * Tween a data change from the previous frame to the new one instead of
   * snapping, when the two frames have the same shape. Default on; respects
   * `prefers-reduced-motion`, like the entrance. Shape-changing updates snap
   * unless `universalTransition` is enabled.
   */
  updateAnimation?: boolean
  /** Tween duration in ms; default the theme's `updateMs`. */
  updateDuration?: Double
  /** Entrance duration in ms; default the theme's `enterMs`. */
  enterDuration?: Double
  /** Wait before the entrance starts, in ms. Default 0. */
  enterDelay?: Double
  /** Wait before an update tween starts, in ms. Default 0. */
  updateDelay?: Double
  /** The entrance's easing curve, 0..1 → 0..1. Default cubic ease-out. */
  enterEasing?: (t: Double) => Double
  /** The update tween's easing curve. Default cubic ease-out. */
  updateEasing?: (t: Double) => Double
  /** Morph updates even when the family or item count changes. Opt-in. */
  universalTransition?: boolean
  /**
   * Keyboard navigation: the canvas is focusable; Left/Right (and Up/Down)
   * move through the chart's items, Home/End jump, Enter/Space select
   * (through the family's index selection), Escape clears. The focused item
   * is announced in a polite live region. Default on; `false` disables.
   */
  keyboard?: boolean
  /**
   * A toolbox at the top-right. `saveAsImage` downloads the canvas as a PNG
   * — the pixels are already there, so the family hosts pay no serializer
   * for it; the vector form is the family's own `*ToSvg` function.
   */
  toolbox?: { saveAsImage?: boolean }
  /** Called with the PNG data URL on saveAsImage instead of triggering a download. */
  onSaveImage?: (dataUrl: string) => void
  /**
   * Lay the chart out right-to-left: bands run from the right, the value axis
   * moves to the right gutter, the legend's swatch sits right of its label.
   *
   * Implemented as a mirror of the finished draw list about the canvas's
   * vertical centreline (`./rtl`), so every family gets it from one seam
   * rather than each honouring a flag of its own. Text is repositioned, never
   * reversed — laying a chart out right-to-left does not reverse "Revenue".
   */
  rtl?: boolean
  /** Render the hidden data table (default on). */
  accessibleTable?: boolean
  class?: string
}

/** What a family gives the host. `L` is its layout; the host never looks inside it. */
export interface CanvasHostSpec<L> {
  props: CanvasHostProps
  defaultHeight: Double
  /** Read the reactive inputs so the draw effect tracks them (called inside the effect, before draw). */
  track: () => void
  /** Lay the family out in the box left after the chrome. */
  layout: (box: Rect, measure: MeasureText, theme: ChartTheme) => L
  /** Paint a layout; `progress` is 0..1 during the entrance (families that cannot grow ignore it). */
  render: (layout: L, measure: MeasureText, theme: ChartTheme, progress: Double, time: Double) => DrawCmd[]
  /**
   * Whether this layout draws a continuous effect (a `lines` trail) that
   * `render` reads from `time`. While true, the host runs a frame clock —
   * stopped under `prefers-reduced-motion`, where time holds at 0 and the
   * chart is still. (It is not the entrance: an option chart's `animate` is
   * off, and a trail is the chart's content, not its arrival.)
   */
  effectClock?: ((layout: L) => boolean) | undefined
  /**
   * Pan / zoom by pointer (ECharts' `roam`). The host keeps the view in a
   * signal its `track` reads, so a gesture repaints; here the canvas only
   * turns the wheel into `zoom` about the pointer and a drag into `pan`. A
   * drag that moved never fires the click after it.
   */
  roam?: {
    move: () => boolean
    scale: () => boolean
    zoom: (factor: Double, px: Double, py: Double) => void
    pan: (dx: Double, dy: Double) => void
  } | undefined
  /**
   * A pointer drag the chart owns (a visualMap handle). `start` answers
   * whether the press lands on something draggable; while it does, every move
   * goes to `move` in the layout's coordinates and roam stays out of it. The
   * click that ends a drag is swallowed.
   */
  drag?: {
    start: (layout: L, px: Double, py: Double) => boolean
    move: (layout: L, px: Double, py: Double) => void
    end?: (() => void) | undefined
  } | undefined
  /** Legend entries for this layout, when the family has named series. */
  legend?: ((layout: L, theme: ChartTheme) => LegendEntry[]) | undefined
  /** Report the click through the family's own callbacks (rich hit and/or engine index). */
  select?: ((layout: L, px: Double, py: Double) => void) | undefined
  /**
   * Select the item at an INDEX into the accessible table's rows — what
   * Enter on the keyboard fires. Absent means the keyboard can walk and
   * announce the items but not pick one.
   */
  pick?: ((layout: L, index: number) => void) | undefined
  /** The rect to draw the keyboard focus ring around, for an item index; null draws none. */
  focusRect?: ((layout: L, index: number) => Rect | null) | undefined
  /**
   * The tooltip for a pointer position: plain lines, a richer `TooltipView`
   * (HTML, placement, look, timing), or null for a miss. `press` is true for a
   * pointer DOWN (a click or a tap), false for a hover move.
   */
  tooltip?: ((layout: L, px: Double, py: Double, theme: ChartTheme, press: boolean) => string[] | TooltipView | null) | undefined
  /** The CSS cursor for a pointer position (ECharts' per-series `cursor`); '' is the default. */
  cursor?: ((layout: L, px: Double, py: Double) => string) | undefined
  /** The pointer left the canvas (or the gesture was cancelled): whatever `tooltip` set as the hover is over. */
  leave?: (() => void) | undefined
  /** The accessible description + table input. */
  a11y: (layout: L) => A11yInput
  /** A family-specific `aria-label` sentence, when the generic `describeChart` reads worse than the family's own (range and last close, grid dimensions). */
  describe?: ((layout: L) => string) | undefined
  /** Caption when `title` is absent. */
  caption: string
  /** Whether `render` honours `progress` — only then does the entrance tween run. */
  animates?: boolean | undefined
  /**
   * Lay the family out TRANSPOSED (a vertical sankey / calendar / parallel):
   * the layout runs in the box reflected across the diagonal, the draw list is
   * reflected back, and every pointer is reflected before its hit test.
   */
  transpose?: (() => boolean) | undefined
}

/** Measures the PARENT, never the canvas: a canvas pinned to its own last width can never shrink with its container (the pinned-width trap). */
function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const hasRaf = (): boolean => typeof requestAnimationFrame === 'function'
const cancelFrame = (id: number): void => {
  if (id !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)
}

/** What one draw laid out — the pointer and keyboard handlers work from it rather than re-laying out. */
interface Frame<L> {
  w: Double
  hgt: Double
  box: Rect
  layout: L
  /** The chrome (title, legend, toolbox) — painted before the family. */
  chrome: DrawCmd[]
  toolBoxes: Rect[]
}

/** A dashed rect — the keyboard focus ring, in the chart's accent. */
function focusRing(r: Rect): DrawCmd {
  return {
    kind: 'polyline',
    points: [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }],
    stroke: '#2563eb',
    width: 2.0,
    dash: [4.0, 3.0],
  }
}

export function canvasHost<L>(spec: CanvasHostSpec<L>): VNode {
  const transposed = (): boolean => spec.transpose?.() === true
  /** The family's layout, in the box reflected across the diagonal when transposed (the render reflects it back). */
  const lay = (box: Rect, measure: MeasureText, t: ChartTheme): L => spec.layout(transposed() ? transposeRect(box) : box, measure, t)
  const { props } = spec
  const themeOf = useChartTheme()
  const theme = (): ChartTheme => resolveChartTheme(themeOf(), props.theme)
  let canvas: HTMLCanvasElement | null = null
  let tip: HTMLDivElement | null = null
  // CSS a rich tooltip view last added to the themed box (its colours, border, padding, transition).
  let appliedLook = ''
  let sizeObserver: ResizeObserver | null = null
  const keyboardOn = props.keyboard !== false
  const toolList: ToolboxTool[] = props.toolbox?.saveAsImage === true ? ['saveAsImage'] : []
  const tableId = createUniqueId()

  // The last draw's frame: what every hit test and the keyboard read.
  let last: Frame<L> | null = null
  // The family's commands as last painted at progress 1 — the update tween's "from".
  let lastFamily: DrawCmd[] | null = null
  // A version the a11y readers key their memo on; bumped by the draw effect.
  const a11yVersion = signal(0)
  let a11yMemo: { version: number; w: Double; input: A11yInput } | null = null
  // Keyboard focus item (an index into the accessible table's rows); -1 = none.
  const focusIdx = signal(-1)
  const announce = signal('')

  // Entrance progress — 1 (finished) except during the one tween on first paint.
  let entrance = 1.0
  let entranceStarted = false
  let entranceFrame = 0
  const startEntrance = (): void => {
    if (entranceStarted) return
    entranceStarted = true
    if (spec.animates !== true || props.animate === false || prefersReducedMotion() || !hasRaf()) return
    const duration = props.enterDuration ?? theme().enterMs
    if (duration <= 0) return
    const delay = props.enterDelay ?? 0.0
    const curve = props.enterEasing ?? easeOutCubic
    let start = -1.0
    const tick = (now: number): void => {
      if (start < 0.0) start = now + delay
      const t = now < start ? 0.0 : Math.min(1.0, (now - start) / duration)
      // An overshooting curve (backOut, elasticOut) passes 1 mid-flight; the
      // engine clamps progress anyway, and `entrance >= 1` is how this host
      // knows the entrance is OVER, so it may only reach 1 when time does.
      entrance = t >= 1.0 ? 1.0 : Math.min(curve(t), 0.999999)
      draw()
      entranceFrame = t < 1.0 ? requestAnimationFrame(tick) : 0
    }
    entrance = 0.0
    entranceFrame = requestAnimationFrame(tick)
  }

  // Effect clock: seconds since the effect first painted, advanced once per frame.
  let effectTime = 0.0
  let effectStart = -1.0
  let effectFrame = 0
  const clockWanted = (layout: L): boolean =>
    spec.effectClock !== undefined && spec.effectClock(layout) && !prefersReducedMotion() && hasRaf()
  const syncClock = (layout: L): void => {
    if (!clockWanted(layout)) {
      cancelFrame(effectFrame)
      effectFrame = 0
      return
    }
    if (effectFrame !== 0) return
    effectFrame = requestAnimationFrame((now: number) => {
      effectFrame = 0
      if (effectStart < 0.0) effectStart = now
      effectTime = (now - effectStart) / 1000.0
      draw()
    })
  }

  // Update tween: from → to over `updateMs`, painted from the cached frame.
  let tweenFrom: DrawCmd[] | null = null
  let tweenTo: DrawCmd[] | null = null
  let tweenT = 1.0
  let tweenFrame = 0
  const startTween = (): void => {
    const duration = props.updateDuration ?? theme().updateMs
    const delay = props.updateDelay ?? 0.0
    let start = -1.0
    cancelFrame(tweenFrame)
    const tick = (now: number): void => {
      if (start < 0.0) start = now + delay
      tweenT = now < start ? 0.0 : Math.min(1.0, (now - start) / duration)
      paintCached()
      if (tweenT < 1.0) tweenFrame = requestAnimationFrame(tick)
      else {
        tweenFrame = 0
        tweenFrom = null
        tweenTo = null
      }
    }
    tweenT = 0.0
    tweenFrame = requestAnimationFrame(tick)
  }
  /** The family commands to show right now: the tween's frame, else the last full frame. */
  const transitionFrame = (from: DrawCmd[], to: DrawCmd[], t: Double): DrawCmd[] =>
    props.universalTransition === true ? universalTweenCmds(from, to, t) : tweenCmds(from, to, t)
  const shownFamily = (): DrawCmd[] => (tweenFrom !== null && tweenTo !== null && tweenT < 1.0 ? transitionFrame(tweenFrom, tweenTo, (props.updateEasing ?? easeOutCubic)(tweenT)) : (lastFamily ?? []))

  /**
   * Chrome first, then the family in what is left. The title and a wrapped
   * legend report the height they used — a fixed strip would clip or waste.
   */
  const frame = (w: Double, hgt: Double, measure: MeasureText, t: ChartTheme): Frame<L> => {
    const chrome: DrawCmd[] = []
    let top = 0.0
    let bottom = 0.0
    let left = 0.0
    let right = 0.0
    let toolBoxes: Rect[] = []
    if (toolList.length > 0) {
      const tb = renderToolbox(toolList, { x: 0, y: 0, w, h: hgt }, { fontSize: t.fontSize, color: t.label })
      for (const c of tb.cmds) chrome.push(c)
      toolBoxes = tb.boxes
      top += tb.height
    }
    if (props.showTitle === true && props.title !== undefined) {
      const tl = renderTitle(props.title, props.subtitle, { x: 0, y: top, w, h: hgt - top }, { fontSize: t.titleSize, color: t.text, align: 'start' })
      for (const c of tl.cmds) chrome.push(c)
      top += tl.height
    }
    let layout: L | null = null
    if (props.showLegend === true && spec.legend !== undefined) {
      // The legend needs the entries, the entries need a layout: lay out once in
      // the pre-legend box for the names, then again in what the legend leaves.
      const probe = lay({ x: 0, y: top, w, h: Math.max(0, hgt - top) }, measure, t)
      const entries = spec.legend(probe, t)
      if (entries.length === 0) layout = probe
      else {
        // Placement is the ENGINE's — one function the web host and both
        // native emitters call, so `legendPosition` cannot mean one thing in
        // a browser and another on a phone.
        const placed = placeLegend(
          entries,
          { x: 0, y: top, w, h: hgt - top },
          props.legendPosition ?? 'top',
          { fontSize: t.fontSize, labelColor: t.label, swatch: 10, gap: 12, orientation: 'horizontal' },
          measure,
        )
        for (const c of placed.cmds) chrome.push(c)
        top += placed.top
        bottom = placed.bottom
        left = placed.left
        right = placed.right
      }
    }
    const box = { x: left, y: top, w: Math.max(0, w - left - right), h: Math.max(0, hgt - top - bottom) }
    if (layout === null || top > 0 || left > 0 || right > 0 || bottom > 0) layout = lay(box, measure, t)
    return { w, hgt, box, layout, chrome, toolBoxes }
  }

  /** The keyboard focus ring for the focused item, when the family can place one. */
  const ringCmds = (f: Frame<L>): DrawCmd[] => {
    const i = focusIdx()
    if (i < 0 || spec.focusRect === undefined) return []
    const r = spec.focusRect(f.layout, i)
    return r === null ? [] : [focusRing(transposed() ? transposeRect(r) : r)]
  }

  /**
   * The presentation transform. EVERY paint must go through this: it is the
   * last step before pixels, and it is what makes an RTL chart RTL.
   *
   * It lives here, above both paint paths, because having two of them is
   * exactly how it got dropped — `draw()` applied it and `paintCached()` did
   * not, so an RTL chart un-mirrored on the tween's every tick, on each arrow
   * key, on Escape and on blur, and the tween's final frame SETTLED unmirrored
   * while the pointer seam kept mirroring. The chrome and family are cached
   * BEFORE this runs, so there was no compensation downstream either.
   */
  const present = (list: DrawCmd[], w: Double): DrawCmd[] =>
    props.rtl === true ? mirrorCmds(list, w) : list

  /** Paint the cached frame with the family commands to show now — the tween's tick path, no layout. */
  const paintCached = (): void => {
    const el = canvas
    const f = last
    if (el === null || f === null) return
    const t = theme()
    const ctx = prepareCanvas(el, f.w, f.hgt, t.background)
    if (ctx === null) return
    paint(ctx, present([...f.chrome, ...shownFamily(), ...ringCmds(f)], f.w), f.w, f.hgt, FONT)
  }

  /**
   * The last step before pixels: right-to-left charts are the mirror of the
   * list about the canvas centreline. It sits HERE, after the chrome, the
   * family and the focus ring have been concatenated, so all three mirror
   * together and nothing downstream has to know about direction.
   */

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? spec.defaultHeight
    const t = theme()
    const ctx = prepareCanvas(el, w, hgt, t.background)
    if (ctx === null) return
    const measure = canvasMeasure(ctx, FONT)
    const f = frame(w, hgt, measure, t)
    last = f
    const family = transposed() ? transposeCmds(spec.render(f.layout, measure, t, entrance, effectTime)) : spec.render(f.layout, measure, t, entrance, effectTime)
    // A clock-driven frame changes every tick by design; it is never an update to tween.
    const clockDriven = clockWanted(f.layout)
    syncClock(f.layout)
    if (entrance >= 1.0 && clockDriven) {
      lastFamily = family
    } else if (entrance >= 1.0) {
      // A redraw whose content is what a running tween is ALREADY heading to
      // (an unrelated tracked read re-ran the draw) must let it finish. It used
      // to fall through to the snap below, which cancels the tween: invisible
      // on a host that draws once per change, fatal on one that redraws.
      if (tweenFrame !== 0 && tweenTo !== null && cmdsEqual(tweenTo, family)) {
        paint(ctx, present([...f.chrome, ...shownFamily(), ...ringCmds(f)], w), w, hgt, FONT)
        return
      }
      const enabled = props.updateAnimation !== false && hasRaf() && !prefersReducedMotion() && (props.updateDuration ?? t.updateMs) > 0
      const transitionable = lastFamily !== null && (sameCmdShape(lastFamily, family) || props.universalTransition === true)
      if (enabled && transitionable && lastFamily !== null && !cmdsEqual(lastFamily, family)) {
        // Retarget a running tween from where it is; start one from the last frame otherwise.
        tweenFrom = tweenFrom !== null && tweenTo !== null && tweenT < 1.0 ? transitionFrame(tweenFrom, tweenTo, (props.updateEasing ?? easeOutCubic)(tweenT)) : lastFamily
        tweenTo = family
        lastFamily = family
        startTween()
        paint(ctx, present([...f.chrome, ...transitionFrame(tweenFrom, family, 0.0), ...ringCmds(f)], w), w, hgt, FONT)
        return
      }
      // A shape change snaps, and cancels any tween still running toward the old shape.
      cancelFrame(tweenFrame)
      tweenFrame = 0
      tweenFrom = null
      tweenTo = null
      lastFamily = family
    }
    paint(ctx, present([...f.chrome, ...family, ...ringCmds(f)], w), w, hgt, FONT)
  }

  effect(() => {
    spec.track()
    theme() // a provider mode flip repaints (draw() bails before reading it until the ref attaches)
    trackChartImages() // a pattern image that finishes loading repaints
    // `peek`, not a read: reading the version here would subscribe this
    // effect to its own write and re-run it once per batch pass (32 times,
    // cancelling the update tween on every pass) — the intentional
    // loop-prevention use the lint rule cannot tell from a stale read.
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    a11yVersion.set(a11yVersion.peek() + 1)
    draw()
  })

  /** The layout the pointer handlers must agree with the draw on — the last draw's, re-laid only if the size moved under it. */
  const layoutNow = (el: HTMLCanvasElement): Frame<L> | null => {
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? spec.defaultHeight
    const f = last
    if (f !== null && f.w === w && f.hgt === hgt) return f
    const ctx = el.getContext('2d')
    if (ctx === null) return null
    return frame(w, hgt, canvasMeasure(ctx, FONT), theme())
  }

  const localPoint = (el: HTMLCanvasElement, ev: { clientX: number; clientY: number }): { x: Double; y: Double } => {
    const r = el.getBoundingClientRect()
    const x = ev.clientX - r.left
    // Hit tests, the tooltip's crossing read and the keyboard all speak the
    // UNMIRRORED geometry the family laid out, so an RTL pointer is mirrored
    // back here rather than mirroring every consumer. One seam in, one seam
    // out — `present` is the other.
    return { x: props.rtl === true ? mirrorX(x, r.width) : x, y: ev.clientY - r.top }
  }

  const saveImage = (el: HTMLCanvasElement): void => {
    const url = el.toDataURL('image/png')
    if (props.onSaveImage !== undefined) props.onSaveImage(url)
    else if (isClient) {
      const a = document.createElement('a')
      a.href = url
      a.download = (props.title ?? 'chart') + '.png'
      a.click()
    }
  }

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    if (el === null) return
    const p = localPoint(el, ev)
    if (toolList.length > 0) {
      const f = layoutNow(el)
      if (f !== null && hitToolbox(toolList, f.toolBoxes, p.x, p.y) === 'saveAsImage') {
        saveImage(el)
        return
      }
    }
    if (spec.select === undefined) return
    const f = layoutNow(el)
    if (f === null) return
    if (transposed()) spec.select(f.layout, p.y, p.x)
    else spec.select(f.layout, p.x, p.y)
  }

  const handleMove = (ev: PointerEvent): void => {
    const el = canvas
    const box = tip
    if (el === null || box === null || spec.tooltip === undefined) return
    const f = layoutNow(el)
    if (f === null) return
    const p = localPoint(el, ev)
    if (spec.cursor !== undefined) el.style.cursor = transposed() ? spec.cursor(f.layout, p.y, p.x) : spec.cursor(f.layout, p.x, p.y)
    const press = ev.type === 'pointerdown'
    const out = transposed() ? spec.tooltip(f.layout, p.y, p.x, theme(), press) : spec.tooltip(f.layout, p.x, p.y, theme(), press)
    const view: TooltipView | null = out === null ? null : Array.isArray(out) ? { lines: out } : out
    if (view === null || (view.html === undefined && (view.lines === undefined || view.lines.length === 0))) {
      hideTip()
      return
    }
    cancelHide()
    currentView = view
    // The view's look is written with the rest of the box's state, in this one
    // handler: a REACTIVE style attribute would be re-applied after these writes
    // and reset `display`, `left` and `top` with it.
    const look = `${view.css === undefined || view.css === '' ? '' : ';' + view.css}${view.enterable === true ? ';pointer-events:auto' : ''}${view.transition !== undefined && view.transition > 0 ? `;transition:left ${view.transition}s,top ${view.transition}s` : ''}`
    if (look !== appliedLook) {
      box.setAttribute('style', tooltipStyle(theme(), FONT) + look)
      appliedLook = look
    }
    box.className = view.className ?? ''
    if (view.html !== undefined) renderTooltipHtml(box, view.html)
    else box.textContent = view.lines!.join('\n')
    box.style.display = 'block'
    // Measure AFTER filling it: placement depends on the rendered size.
    const size = { w: box.offsetWidth, h: box.offsetHeight }
    const bounds = { x: 0, y: 0, w: f.w, h: f.hgt }
    const placed = view.place === undefined ? placeTooltip(p, size, bounds, 12) : view.place(p, size, bounds)
    const at = view.confine === false || view.place === undefined ? placed : clampTooltip(placed, size, bounds)
    // `p` is CHART space (mirrored in by `localPoint`); the tooltip is a DOM
    // node in SCREEN space, so its left edge mirrors back out (`./rtl`).
    box.style.left = `${screenRectX(at.x, size.w, f.w, props.rtl === true)}px`
    box.style.top = `${at.y}px`
  }
  // The rich view the box last showed — its leave/hide behaviour applies until the next one.
  let currentView: TooltipView | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  const cancelHide = (): void => {
    if (hideTimer !== null) clearTimeout(hideTimer)
    hideTimer = null
  }
  const hideTip = (): void => {
    cancelHide()
    if (tip !== null) tip.style.display = 'none'
  }
  onUnmount(cancelHide)
  const handleLeave = (): void => {
    if (canvas !== null && spec.cursor !== undefined) canvas.style.cursor = ''
    spec.leave?.()
    const view = currentView
    if (view?.keepOnLeave === true) return
    const delay = view?.hideDelay ?? 0.0
    if (delay <= 0.0 || tip === null) {
      hideTip()
      return
    }
    cancelHide()
    hideTimer = setTimeout(() => {
      hideTimer = null
      if (tip !== null) tip.style.display = 'none'
    }, delay)
  }

  const layoutForA11y = (): L => {
    const el = canvas
    const w = el === null ? 300 : drawWidth(el, props.width)
    const hgt = props.height ?? spec.defaultHeight
    const measure: MeasureText = (text, size) => text.length * size * 0.6
    return lay({ x: 0, y: 0, w, h: hgt }, measure, theme())
  }
  /** The a11y input, computed once per draw (the description, the table and the keyboard all read it). */
  const a11yNow = (): A11yInput => {
    const version = a11yVersion()
    const w = canvas === null ? 300 : drawWidth(canvas, props.width)
    const m = a11yMemo
    if (m !== null && m.version === version && m.w === w) return m.input
    const input = spec.a11y(layoutForA11y())
    a11yMemo = { version, w, input }
    return input
  }

  /** Move the keyboard focus item and announce it. */
  const moveFocus = (delta: number, absolute?: number): void => {
    const rows = chartTable(a11yNow()).rows
    const n = rows.length
    if (n === 0) return
    const cur = focusIdx()
    let next = absolute !== undefined ? absolute : cur < 0 ? (delta > 0 ? 0 : n - 1) : cur + delta
    if (next < 0) next = 0
    if (next > n - 1) next = n - 1
    const row = rows[next]
    batch(() => {
      focusIdx.set(next)
      announce.set(row === undefined ? '' : row.join(', '))
    })
    paintCached()
  }
  const handleKeyDown = (ev: KeyboardEvent): void => {
    const key = ev.key
    if (key === 'ArrowRight' || key === 'ArrowUp') moveFocus(1)
    else if (key === 'ArrowLeft' || key === 'ArrowDown') moveFocus(-1)
    else if (key === 'Home') moveFocus(0, 0)
    else if (key === 'End') moveFocus(0, chartTable(a11yNow()).rows.length - 1)
    else if (key === 'Enter' || key === ' ') {
      const i = focusIdx()
      const f = last
      if (i >= 0 && f !== null && spec.pick !== undefined) spec.pick(f.layout, i)
    } else if (key === 'Escape') {
      batch(() => {
        focusIdx.set(-1)
        announce.set('')
      })
      paintCached()
    } else return
    ev.preventDefault()
  }

  // Roam gestures. `dragFrom` is the last pointer position of a live drag;
  // `dragMoved` swallows the click that ends a real pan.
  let dragFrom: { x: Double; y: Double; id: number } | null = null
  let dragMoved = false
  const roam = spec.roam
  const handleWheel = (ev: WheelEvent): void => {
    const el = canvas
    if (roam === undefined || el === null || !roam.scale()) return
    ev.preventDefault()
    const p = localPoint(el, ev)
    roam.zoom(Math.exp(-ev.deltaY * 0.0015), p.x, p.y)
  }
  const chartDrag = spec.drag
  let chartDragId = -1
  const dragDown = (ev: PointerEvent): boolean => {
    const el = canvas
    if (chartDrag === undefined || el === null) return false
    const f = layoutNow(el)
    const p = localPoint(el, ev)
    if (f === null || !chartDrag.start(f.layout, p.x, p.y)) return false
    chartDragId = ev.pointerId
    dragMoved = false
    if (typeof el.setPointerCapture === 'function') {
      try {
        el.setPointerCapture(ev.pointerId)
      } catch {
        // not capturable — drag without it
      }
    }
    return true
  }
  const dragMove = (ev: PointerEvent): boolean => {
    const el = canvas
    if (chartDrag === undefined || el === null || chartDragId !== ev.pointerId) return false
    const f = layoutNow(el)
    if (f === null) return true
    const p = localPoint(el, ev)
    dragMoved = true
    chartDrag.move(f.layout, p.x, p.y)
    return true
  }
  const roamDown = (ev: PointerEvent): void => {
    const el = canvas
    if (roam === undefined || el === null || !roam.move()) return
    const p = localPoint(el, ev)
    dragFrom = { x: p.x, y: p.y, id: ev.pointerId }
    dragMoved = false
  }
  const roamMove = (ev: PointerEvent): void => {
    const el = canvas
    if (roam === undefined || el === null || dragFrom === null || dragFrom.id !== ev.pointerId) return
    const p = localPoint(el, ev)
    const dx = p.x - dragFrom.x
    const dy = p.y - dragFrom.y
    if (!dragMoved && Math.abs(dx) + Math.abs(dy) < 3.0) return
    if (!dragMoved && typeof el.setPointerCapture === 'function') {
      // Capture keeps a drag that leaves the canvas panning; a pointer the
      // browser no longer tracks throws, and the pan must still happen.
      try {
        el.setPointerCapture(ev.pointerId)
      } catch {
        // not capturable — pan without it
      }
    }
    dragMoved = true
    dragFrom = { x: p.x, y: p.y, id: ev.pointerId }
    roam.pan(dx, dy)
  }
  const roamUp = (): void => {
    dragFrom = null
    if (chartDragId >= 0) {
      chartDragId = -1
      chartDrag?.end?.()
    }
  }
  const tooltipOn = props.tooltip === true && spec.tooltip !== undefined
  const onPointerDown = (ev: PointerEvent): void => {
    if (dragDown(ev)) return
    roamDown(ev)
    if (tooltipOn) handleMove(ev)
  }
  const onPointerMove = (ev: PointerEvent): void => {
    if (dragMove(ev)) return
    roamMove(ev)
    if (tooltipOn && !dragMoved) handleMove(ev)
  }
  const onClickRoamAware = (ev: MouseEvent): void => {
    if (dragMoved) {
      dragMoved = false
      return
    }
    handleClick(ev)
  }

  const canvasNode = h('canvas', {
    class: props.class,
    // `img` + a label is what makes the canvas announce as a single described
    // thing; the table it is described BY carries the numbers.
    role: 'img',
    'aria-label': () => (spec.describe === undefined ? describeChart(a11yNow()) : spec.describe(layoutForA11y())),
    ...(props.accessibleTable === false ? {} : { 'aria-describedby': tableId }),
    // The SSR box (see `canvasSizeAttrs`): without it a hydrated chart shifts
    // from the 300x150 canvas default to its real size on the first paint.
    ...canvasSizeAttrs(props.width, props.height ?? spec.defaultHeight, false),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      sizeObserver?.disconnect()
      sizeObserver = null
      if (el === null) {
        // Unmounted mid-animation: the frames must not keep the closure alive.
        cancelFrame(entranceFrame)
        cancelFrame(tweenFrame)
        cancelFrame(effectFrame)
        entranceFrame = 0
        tweenFrame = 0
        effectFrame = 0
        last = null
        return
      }
      startEntrance()
      draw()
      const box = el.parentElement
      if (box === null || typeof ResizeObserver === 'undefined') return
      sizeObserver = new ResizeObserver(() => {
        if (canvas === null) return
        const next = drawWidth(canvas, props.width)
        const dpr = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1
        if (Math.round(next * dpr) === canvas.width) return
        draw()
      })
      sizeObserver.observe(box)
    },
    onClick: onClickRoamAware,
    ...(roam !== undefined ? { onWheel: handleWheel } : {}),
    ...(roam !== undefined || chartDrag !== undefined ? { onPointerUp: roamUp } : {}),
    ...(keyboardOn ? { tabIndex: 0, onKeyDown: handleKeyDown, onBlur: () => { batch(() => { focusIdx.set(-1); announce.set('') }); paintCached() } } : {}),
    // Pointer events, not mouse events: a finger gets the tooltip on tap
    // (pointerdown) and on drag (pointermove) exactly as a mouse does on hover.
    ...(tooltipOn || roam !== undefined || chartDrag !== undefined ? { onPointerMove, onPointerDown } : {}),
    ...(tooltipOn ? { onPointerLeave: handleLeave, onPointerCancel: () => { roamUp(); handleLeave() } } : roam !== undefined || chartDrag !== undefined ? { onPointerCancel: roamUp } : {}),
  })

  const tipNode = (): VNode | null =>
    props.tooltip === true && spec.tooltip !== undefined
      ? h('div', {
          'data-pyreon-chart-tooltip': 'true',
          style: () => tooltipStyle(theme(), FONT),
          ref: (el: HTMLDivElement | null) => {
            tip = el
          },
        })
      : null

  const liveNode = (): VNode => h('div', { role: 'status', 'aria-live': 'polite', style: OFFSCREEN }, () => announce())

  const extras: (VNode | (() => VNode))[] = []
  const t = tipNode()
  if (t !== null) extras.push(t)
  if (keyboardOn) extras.push(liveNode())
  if (props.accessibleTable !== false) {
    const table = (): VNode => {
      const a = chartTable(a11yNow())
      const shown = a.rows.length > A11Y_TABLE_MAX ? a.rows.slice(0, A11Y_TABLE_MAX) : a.rows
      const caption = (props.title ?? spec.caption) + (shown.length < a.rows.length ? ` (first ${A11Y_TABLE_MAX} of ${a.rows.length} rows)` : '')
      return h(
        'div',
        { style: OFFSCREEN },
        h(
          'table',
          { id: tableId },
          h('caption', null, caption),
          h('thead', null, h('tr', null, ...a.headers.map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', null, ...shown.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
        ),
      )
    }
    extras.push(() => table())
  }
  if (extras.length === 0) return canvasNode
  return h('div', { style: 'position:relative' }, canvasNode, ...extras)
}
