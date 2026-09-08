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

import { createUniqueId, h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { batch, effect, isClient, signal } from '@pyreon/reactivity'
import { chartTable, describeChart } from './a11y'
import type { A11yInput } from './a11y'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { cmdsEqual, sameCmdShape, tweenCmds } from './cmd-tween'
import { legendPlan, renderLegend } from './legend'
import type { LegendEntry } from './legend'
import type { ChartTheme } from './render'
import { resolveChartTheme, tooltipStyle, useChartTheme } from './theme'
import { renderTitle } from './title'
import { hitToolbox, renderToolbox } from './toolbox'
import type { ToolboxTool } from './toolbox'
import { placeTooltip } from './tooltip'
import { easeOutCubic } from './tween'
import type { ChartGradient, DrawCmd, Double, MeasureText, Rect } from './types'

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

export type LegendPosition = 'top' | 'bottom' | 'left' | 'right'

/** The props every canvas host accepts — the chrome, sizing, theme, interaction and a11y surface. */
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
   * `prefers-reduced-motion`, like the entrance. A shape change (a row added,
   * a series removed) snaps — there is no path between two different shapes
   * that means anything.
   */
  updateAnimation?: boolean
  /** Tween duration in ms; default the theme's `updateMs`. */
  updateDuration?: Double
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
  render: (layout: L, measure: MeasureText, theme: ChartTheme, progress: Double) => DrawCmd[]
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
  /** Tooltip lines for a pointer position, or null for a miss. */
  tooltip?: ((layout: L, px: Double, py: Double, theme: ChartTheme) => string[] | null) | undefined
  /** The accessible description + table input. */
  a11y: (layout: L) => A11yInput
  /** A family-specific `aria-label` sentence, when the generic `describeChart` reads worse than the family's own (range and last close, grid dimensions). */
  describe?: ((layout: L) => string) | undefined
  /** Caption when `title` is absent. */
  caption: string
  /** Whether `render` honours `progress` — only then does the entrance tween run. */
  animates?: boolean | undefined
}

/** Measures the PARENT, never the canvas (the pinned-width trap — see radial-host.ts). */
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
  const { props } = spec
  const themeOf = useChartTheme()
  const theme = (): ChartTheme => resolveChartTheme(themeOf(), props.theme)
  let canvas: HTMLCanvasElement | null = null
  let tip: HTMLDivElement | null = null
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
    const duration = theme().enterMs
    if (duration <= 0) return
    let start = -1.0
    const tick = (now: number): void => {
      if (start < 0.0) start = now
      const t = Math.min(1.0, (now - start) / duration)
      entrance = easeOutCubic(t)
      draw()
      entranceFrame = t < 1.0 ? requestAnimationFrame(tick) : 0
    }
    entrance = 0.0
    entranceFrame = requestAnimationFrame(tick)
  }

  // Update tween: from → to over `updateMs`, painted from the cached frame.
  let tweenFrom: DrawCmd[] | null = null
  let tweenTo: DrawCmd[] | null = null
  let tweenT = 1.0
  let tweenFrame = 0
  const startTween = (): void => {
    const duration = props.updateDuration ?? theme().updateMs
    let start = -1.0
    cancelFrame(tweenFrame)
    const tick = (now: number): void => {
      if (start < 0.0) start = now
      tweenT = Math.min(1.0, (now - start) / duration)
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
  const shownFamily = (): DrawCmd[] => (tweenFrom !== null && tweenTo !== null && tweenT < 1.0 ? tweenCmds(tweenFrom, tweenTo, easeOutCubic(tweenT)) : (lastFamily ?? []))

  /** The vertical legend's column width — the widest entry plus its swatch and gap. */
  const legendColumnWidth = (entries: LegendEntry[], measure: MeasureText, t: ChartTheme): Double => {
    let w = 0.0
    for (const e of entries) {
      const ew = 10.0 + 4.0 + measure(e.label, t.fontSize) + 12.0
      if (ew > w) w = ew
    }
    return w
  }

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
      const probe = spec.layout({ x: 0, y: top, w, h: Math.max(0, hgt - top) }, measure, t)
      const entries = spec.legend(probe, t)
      const pos = props.legendPosition ?? 'top'
      if (entries.length === 0) layout = probe
      else if (pos === 'left' || pos === 'right') {
        const col = Math.min(legendColumnWidth(entries, measure, t), w * 0.4)
        const lx = pos === 'left' ? 8.0 : w - col
        const l = renderLegend(entries, { x: lx, y: top + 8, w: col, h: hgt - top }, { fontSize: t.fontSize, labelColor: t.label, swatch: 10, gap: 12, orientation: 'vertical' }, measure)
        for (const c of l.cmds) chrome.push(c)
        if (pos === 'left') left = col + 8
        else right = col + 8
      } else {
        const opts = { fontSize: t.fontSize, labelColor: t.label, swatch: 10, gap: 12, orientation: 'horizontal' as const }
        if (pos === 'bottom') {
          // Its height decides where it sits, so plan it first, then place it.
          const rows = legendPlan(entries, { x: 8, y: 0, w: w - 16, h: hgt }, opts, measure, w - 16).rows
          const rowH = Math.max(10.0, t.fontSize) + 12.0
          const lh = rows * rowH
          const l = renderLegend(entries, { x: 8, y: hgt - lh, w: w - 16, h: lh }, opts, measure)
          for (const c of l.cmds) chrome.push(c)
          bottom = l.height + 8
        } else {
          const l = renderLegend(entries, { x: 8, y: top + 8, w: w - 16, h: hgt - top }, opts, measure)
          for (const c of l.cmds) chrome.push(c)
          top += l.height + 8
        }
      }
    }
    const box = { x: left, y: top, w: Math.max(0, w - left - right), h: Math.max(0, hgt - top - bottom) }
    if (layout === null || top > 0 || left > 0 || right > 0 || bottom > 0) layout = spec.layout(box, measure, t)
    return { w, hgt, box, layout, chrome, toolBoxes }
  }

  /** The keyboard focus ring for the focused item, when the family can place one. */
  const ringCmds = (f: Frame<L>): DrawCmd[] => {
    const i = focusIdx()
    if (i < 0 || spec.focusRect === undefined) return []
    const r = spec.focusRect(f.layout, i)
    return r === null ? [] : [focusRing(r)]
  }

  /** Paint the cached frame with the family commands to show now — the tween's tick path, no layout. */
  const paintCached = (): void => {
    const el = canvas
    const f = last
    if (el === null || f === null) return
    const t = theme()
    const ctx = prepareCanvas(el, f.w, f.hgt, t.background)
    if (ctx === null) return
    paint(ctx, [...f.chrome, ...shownFamily(), ...ringCmds(f)], f.w, f.hgt, FONT)
  }

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
    const family = spec.render(f.layout, measure, t, entrance)
    if (entrance >= 1.0) {
      const enabled = props.updateAnimation !== false && hasRaf() && !prefersReducedMotion() && (props.updateDuration ?? t.updateMs) > 0
      if (enabled && lastFamily !== null && sameCmdShape(lastFamily, family) && !cmdsEqual(lastFamily, family)) {
        // Retarget a running tween from where it is; start one from the last frame otherwise.
        tweenFrom = tweenFrom !== null && tweenTo !== null && tweenT < 1.0 ? tweenCmds(tweenFrom, tweenTo, easeOutCubic(tweenT)) : lastFamily
        tweenTo = family
        lastFamily = family
        startTween()
        paint(ctx, [...f.chrome, ...tweenCmds(tweenFrom, family, 0.0), ...ringCmds(f)], w, hgt, FONT)
        return
      }
      // A shape change snaps, and cancels any tween still running toward the old shape.
      cancelFrame(tweenFrame)
      tweenFrame = 0
      tweenFrom = null
      tweenTo = null
      lastFamily = family
    }
    paint(ctx, [...f.chrome, ...family, ...ringCmds(f)], w, hgt, FONT)
  }

  effect(() => {
    spec.track()
    theme() // a provider mode flip repaints (draw() bails before reading it until the ref attaches)
    // `peek`, not a read: reading the version here would subscribe this
    // effect to its own write and re-run it once per batch pass (32 times,
    // cancelling the update tween on every pass).
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
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
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
    spec.select(f.layout, p.x, p.y)
  }

  const handleMove = (ev: PointerEvent): void => {
    const el = canvas
    const box = tip
    if (el === null || box === null || spec.tooltip === undefined) return
    const f = layoutNow(el)
    if (f === null) return
    const p = localPoint(el, ev)
    const lines = spec.tooltip(f.layout, p.x, p.y, theme())
    if (lines === null || lines.length === 0) {
      box.style.display = 'none'
      return
    }
    box.textContent = lines.join('\n')
    box.style.display = 'block'
    // Measure AFTER filling it: placement depends on the rendered size.
    const size = { w: box.offsetWidth, h: box.offsetHeight }
    const at = placeTooltip(p, size, { x: 0, y: 0, w: f.w, h: f.hgt }, 12)
    box.style.left = `${at.x}px`
    box.style.top = `${at.y}px`
  }
  const handleLeave = (): void => {
    if (tip !== null) tip.style.display = 'none'
  }

  const layoutForA11y = (): L => {
    const el = canvas
    const w = el === null ? 300 : drawWidth(el, props.width)
    const hgt = props.height ?? spec.defaultHeight
    const measure: MeasureText = (text, size) => text.length * size * 0.6
    return spec.layout({ x: 0, y: 0, w, h: hgt }, measure, theme())
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

  const canvasNode = h('canvas', {
    class: props.class,
    // `img` + a label is what makes the canvas announce as a single described
    // thing; the table it is described BY carries the numbers.
    role: 'img',
    'aria-label': () => (spec.describe === undefined ? describeChart(a11yNow()) : spec.describe(layoutForA11y())),
    ...(props.accessibleTable === false ? {} : { 'aria-describedby': tableId }),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      sizeObserver?.disconnect()
      sizeObserver = null
      if (el === null) {
        // Unmounted mid-animation: the frames must not keep the closure alive.
        cancelFrame(entranceFrame)
        cancelFrame(tweenFrame)
        entranceFrame = 0
        tweenFrame = 0
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
    onClick: handleClick,
    ...(keyboardOn ? { tabIndex: 0, onKeyDown: handleKeyDown, onBlur: () => { batch(() => { focusIdx.set(-1); announce.set('') }); paintCached() } } : {}),
    // Pointer events, not mouse events: a finger gets the tooltip on tap
    // (pointerdown) and on drag (pointermove) exactly as a mouse does on hover.
    ...(props.tooltip === true && spec.tooltip !== undefined ? { onPointerMove: handleMove, onPointerDown: handleMove, onPointerLeave: handleLeave, onPointerCancel: handleLeave } : {}),
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
