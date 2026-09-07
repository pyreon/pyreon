// The shared canvas host — what every non-cartesian `/plot` component is made
// of. A family supplies its GEOMETRY (layout / render / hit / describe); the
// host owns everything the audit found only `<PlotChart>` had: the theme in
// scope, the title block, the legend, the tooltip, the entrance animation, the
// resize observer, selection, and the accessible table. Seventeen hosts carried
// seventeen copies of the canvas/ref/observer/table boilerplate before this,
// and none of them had a title, a tooltip or an animation.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { chartTable, describeChart } from './a11y'
import type { A11yInput } from './a11y'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { renderLegend } from './legend'
import type { LegendEntry } from './legend'
import type { ChartTheme } from './render'
import { resolveChartTheme, tooltipStyle, useChartTheme } from './theme'
import { renderTitle } from './title'
import { placeTooltip } from './tooltip'
import type { ChartGradient, DrawCmd, Double, MeasureText, Rect } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

/**
 * Translate a draw list by (dx, dy) — for families whose frame builders take a
 * width/height rather than a box (heatmap, candlestick, boxplot): they lay out
 * at the origin and the host moves the result under the chrome. Gradients ride
 * along because their axis is in the shape's coordinate space.
 */
/** The crossing chrome functions return an EMPTY list for a miss; the host's tooltip contract says `null`. */
export function orNull(lines: string[]): string[] | null {
  return lines.length === 0 ? null : lines
}

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

/** The props every canvas host accepts — the chrome, sizing, theme and a11y surface. */
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
  /** Draw the legend above the chart (families that have named entries). */
  showLegend?: boolean
  /**
   * A tooltip following the pointer. Off by default: pointer handlers and a
   * DOM overlay are dead weight in a static report.
   */
  tooltip?: boolean
  /** Entrance animation on first paint; off under `prefers-reduced-motion`. */
  animate?: boolean
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

export function canvasHost<L>(spec: CanvasHostSpec<L>): VNode {
  const { props } = spec
  const themeOf = useChartTheme()
  const theme = (): ChartTheme => resolveChartTheme(themeOf(), props.theme)
  let canvas: HTMLCanvasElement | null = null
  let tip: HTMLDivElement | null = null
  let sizeObserver: ResizeObserver | null = null

  // Entrance progress — 1 (finished) except during the one tween on first paint.
  let entrance = 1.0
  let entranceStarted = false
  const startEntrance = (): void => {
    if (entranceStarted) return
    entranceStarted = true
    if (spec.animates !== true || props.animate === false || prefersReducedMotion()) return
    if (typeof requestAnimationFrame !== 'function') return
    const duration = theme().enterMs
    if (duration <= 0) return
    let start = -1.0
    const tick = (now: number): void => {
      if (start < 0.0) start = now
      const t = Math.min(1.0, (now - start) / duration)
      entrance = 1.0 - Math.pow(1.0 - t, 3.0)
      draw()
      if (t < 1.0) requestAnimationFrame(tick)
    }
    entrance = 0.0
    requestAnimationFrame(tick)
  }

  /**
   * Chrome first, then the family in what is left. The title and a wrapped
   * legend report the height they used — a fixed strip would clip or waste.
   */
  const frame = (w: Double, hgt: Double, measure: MeasureText, t: ChartTheme): { cmds: DrawCmd[]; box: Rect; layout: L } => {
    const cmds: DrawCmd[] = []
    let top = 0.0
    if (props.showTitle === true && props.title !== undefined) {
      const tl = renderTitle(props.title, props.subtitle, { x: 0, y: 0, w, h: hgt }, { fontSize: t.titleSize, color: t.text, align: 'start' })
      for (const c of tl.cmds) cmds.push(c)
      top += tl.height
    }
    let layout: L | null = null
    if (props.showLegend === true && spec.legend !== undefined) {
      // The legend needs the entries, the entries need a layout: lay out once in
      // the pre-legend box for the names, then again below the legend.
      const probe = spec.layout({ x: 0, y: top, w, h: Math.max(0, hgt - top) }, measure, t)
      const entries = spec.legend(probe, t)
      if (entries.length > 0) {
        const l = renderLegend(entries, { x: 8, y: top + 8, w: w - 16, h: hgt - top }, { fontSize: t.fontSize, labelColor: t.label, swatch: 10, gap: 12, orientation: 'horizontal' }, measure)
        for (const c of l.cmds) cmds.push(c)
        top += l.height + 8
      } else layout = probe
    }
    const box = { x: 0, y: top, w, h: Math.max(0, hgt - top) }
    if (layout === null || top > 0) layout = spec.layout(box, measure, t)
    return { cmds, box, layout }
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
    paint(ctx, [...f.cmds, ...spec.render(f.layout, measure, t, entrance)], w, hgt, FONT)
  }

  effect(() => {
    spec.track()
    theme() // a provider mode flip repaints (draw() bails before reading it until the ref attaches)
    draw()
  })

  /** The layout the pointer handlers must agree with the draw on. */
  const layoutNow = (el: HTMLCanvasElement): L | null => {
    const ctx = el.getContext('2d')
    if (ctx === null) return null
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? spec.defaultHeight
    return frame(w, hgt, canvasMeasure(ctx, FONT), theme()).layout
  }

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    if (el === null || spec.select === undefined) return
    const layout = layoutNow(el)
    if (layout === null) return
    const r = el.getBoundingClientRect()
    spec.select(layout, ev.clientX - r.left, ev.clientY - r.top)
  }

  const handleMove = (ev: MouseEvent): void => {
    const el = canvas
    const box = tip
    if (el === null || box === null || spec.tooltip === undefined) return
    const layout = layoutNow(el)
    if (layout === null) return
    const r = el.getBoundingClientRect()
    const px = ev.clientX - r.left
    const py = ev.clientY - r.top
    const lines = spec.tooltip(layout, px, py, theme())
    if (lines === null || lines.length === 0) {
      box.style.display = 'none'
      return
    }
    box.textContent = lines.join('\n')
    box.style.display = 'block'
    // Measure AFTER filling it: placement depends on the rendered size.
    const size = { w: box.offsetWidth, h: box.offsetHeight }
    const at = placeTooltip({ x: px, y: py }, size, { x: 0, y: 0, w: drawWidth(el, props.width), h: props.height ?? spec.defaultHeight }, 12)
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
  const a11yNow = (): A11yInput => spec.a11y(layoutForA11y())

  const canvasNode = h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () => (spec.describe === undefined ? describeChart(a11yNow()) : spec.describe(layoutForA11y())),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      sizeObserver?.disconnect()
      sizeObserver = null
      if (el === null) return
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
    ...(props.tooltip === true && spec.tooltip !== undefined ? { onMouseMove: handleMove, onMouseLeave: handleLeave } : {}),
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

  if (props.accessibleTable === false) {
    const t = tipNode()
    return t === null ? canvasNode : h('div', { style: 'position:relative' }, canvasNode, t)
  }
  const table = (): VNode => {
    const t = chartTable(a11yNow())
    return h(
      'div',
      { style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;margin:-1px;padding:0' },
      h(
        'table',
        null,
        h('caption', null, props.title ?? spec.caption),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  const t = tipNode()
  return t === null ? h('div', { style: 'position:relative' }, canvasNode, () => table()) : h('div', { style: 'position:relative' }, canvasNode, t, () => table())
}
