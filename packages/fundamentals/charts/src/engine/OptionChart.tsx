// `<OptionChart>` — the ECharts-option-driven host: an ECharts-shaped option in
// (value or accessor), a live chart out. Cartesian plans (single or
// multi-grid) paint on a canvas through the SAME `compiledCommands` that
// `optionToSvg` serialises, so the host and the server never disagree; a
// family plan mounts the family's OWN canvas host (`familyHostNode`), and the
// two host-less shapes render through `optionToSvg` into an inline `<svg>`. A
// `timeline` steps on `autoPlay` or is driven by `timelineIndex`.

import { h, onUnmount } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect, onCleanup, signal } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { compiledCommands, optionToSvg, planOption } from './option'
import type { CompiledOption, EChartsOption, OptionPlan } from './option'
import { familyHostNode } from './family-host'
import type { FamilyPlan } from './option-family'
import { TIMELINE_HEIGHT, resolveTimeline, timelineCommands, timelineSteps } from './option-composite'
import { graphicCommands } from './option-layer'
import { visualMapCommands } from './visual-map'
import { barsFor, layoutChart, resolveY2Domain, resolveYDomain, seriesOnRightAxis } from './render'
import type { ChartSpec } from './render'
import { hitBar, hitNearestX, layoutSeriesPoints } from './layout'
import { measureApprox } from './svg'
import { chartTable, describeChart } from './a11y'
import type { ThemeDefinition } from './theme-registry'
import type { Double, DrawCmd, MeasureText } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export interface OptionHit {
  seriesIndex: number
  dataIndex: number
  /** The category label (or the index as text on a value axis). */
  name: string
  value: Double
}

export interface OptionChartProps {
  /** An ECharts-shaped option. An accessor makes it reactive; a plain object is static. */
  option: EChartsOption | (() => EChartsOption)
  width?: Double
  height?: Double
  /** A registered theme name or an inline definition (see `registerTheme`). */
  theme?: string | ThemeDefinition
  /** BCP 47 tag for axis-label formatting (see `registerLocale`). */
  locale?: string
  /** Drive the `timeline` step from outside; absent = the option's `currentIndex`, advancing on `autoPlay`. */
  timelineIndex?: number
  /** Fired when auto-play advances the step. */
  onTimelineChange?: (index: number) => void
  /** Fired with the datum under a click (cartesian plans), or null for a miss. */
  onSelect?: (hit: OptionHit | null) => void
  /** Fired by a family host (pie, sankey, treemap, …) with ITS hit value, tagged with the family kind. */
  onFamilySelect?: (kind: FamilyPlan['kind'], hit: unknown) => void
  /** Accessible name; defaults to the option's title. */
  title?: string
  accessibleTable?: boolean
  class?: string
}

/** Move a command by (dx, dy) — a multi-grid part painted at its rect. */
function offsetCmd(c: DrawCmd, dx: Double, dy: Double): DrawCmd {
  if (dx === 0.0 && dy === 0.0) return c
  switch (c.kind) {
    case 'rect':
      return { ...c, rect: { ...c.rect, x: c.rect.x + dx, y: c.rect.y + dy } }
    case 'line':
      return { ...c, from: { x: c.from.x + dx, y: c.from.y + dy }, to: { x: c.to.x + dx, y: c.to.y + dy } }
    case 'polyline':
    case 'polygon':
      return { ...c, points: c.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
    case 'circle':
      return { ...c, center: { x: c.center.x + dx, y: c.center.y + dy } }
    case 'text':
      return { ...c, at: { x: c.at.x + dx, y: c.at.y + dy } }
  }
}

const canvasable = (p: OptionPlan): boolean => p.kind === 'cartesian' || (p.kind === 'grids' && p.parts.every((q) => q.plan.kind === 'cartesian'))

export function OptionChart(props: OptionChartProps): VNode {
  let canvas: HTMLCanvasElement | null = null
  let svgHost: HTMLDivElement | null = null
  // The auto-played step; -1 = not started (use the option's currentIndex).
  const step = signal(-1)
  // Which surface shows: the built-in canvas, a family host, or the svg fallback.
  const mode = signal<'canvas' | 'host' | 'svg'>('canvas')
  const hostNode = signal<VNode | null>(null)
  const readOption = (): EChartsOption => (typeof props.option === 'function' ? props.option() : props.option)
  const stepIndex = (): number | undefined => props.timelineIndex ?? (step() >= 0 ? step() : undefined)
  const width = (): Double => props.width ?? 640.0
  const height = (): Double => props.height ?? 320.0
  const compileOpts = (w: Double, hgt: Double, idx: number | undefined) => ({
    width: w,
    height: hgt,
    ...(props.theme !== undefined ? { theme: props.theme } : {}),
    ...(props.locale !== undefined ? { locale: props.locale } : {}),
    ...(idx !== undefined ? { timelineIndex: idx } : {}),
  })

  // Auto-play: ONE interval at a time, owned here — every re-run of the effect
  // stops the previous one before starting another, the effect's cleanup and
  // the unmount both stop it (leak class I closed by construction).
  let timer: ReturnType<typeof setInterval> | null = null
  const stopTimer = (): void => {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }
  effect(() => {
    stopTimer()
    const opt = readOption()
    const steps = timelineSteps(opt)
    if (steps === null || !steps.autoPlay || props.timelineIndex !== undefined || steps.labels.length < 2) return
    const n = steps.labels.length
    let cur = steps.current
    step.set(cur)
    timer = setInterval(() => {
      cur = (cur + 1) % n
      step.set(cur)
      props.onTimelineChange?.(cur)
    }, steps.playInterval)
    onCleanup(stopTimer)
  })
  onUnmount(stopTimer)

  const draw = (): void => {
    const opt = readOption()
    const idx = stepIndex()
    const w = width()
    const hgt = height()
    const steps = timelineSteps(opt)
    const stripH = steps === null ? 0.0 : TIMELINE_HEIGHT
    const plan = planOption(opt, compileOpts(w, hgt - stripH, idx))
    if (!canvasable(plan)) {
      if (plan.kind === 'family') {
        const node = familyHostNode(plan.compiled.plan, { width: w, height: hgt - stripH, ...(props.onFamilySelect !== undefined ? { onSelect: props.onFamilySelect } : {}) })
        if (node !== null) {
          mode.set('host')
          hostNode.set(node)
          return
        }
      }
      mode.set('svg')
      const host = svgHost
      if (host !== null) host.innerHTML = optionToSvg(opt, compileOpts(w, hgt, idx))
      return
    }
    mode.set('canvas')
    const el = canvas
    if (el === null) return
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    const measure = canvasMeasure(ctx, FONT)
    const resolved = resolveTimeline(opt, idx).option as EChartsOption
    const cmds: DrawCmd[] = []
    if (plan.kind === 'cartesian') {
      for (const c of compiledCommands(plan.compiled, resolved, measure).cmds) cmds.push(c)
    } else if (plan.kind === 'grids') {
      for (const part of plan.parts) {
        if (part.plan.kind !== 'cartesian') continue
        for (const c of compiledCommands(part.plan.compiled, {}, measure).cmds) cmds.push(offsetCmd(c, part.rect.x, part.rect.y))
      }
      for (const c of visualMapCommands(resolved, w, hgt - stripH).cmds) cmds.push(c)
      for (const c of graphicCommands(resolved, w, hgt - stripH).cmds) cmds.push(c)
    }
    if (steps !== null) for (const c of timelineCommands({ ...steps, current: idx ?? steps.current }, w, hgt - stripH, stripH)) cmds.push(c)
    paint(ctx, cmds, w, hgt, FONT)
  }

  effect(() => {
    readOption()
    step()
    void props.timelineIndex
    void props.width
    void props.height
    draw()
  })

  const hitIn = (compiled: CompiledOption, option: EChartsOption, measure: MeasureText, px: Double, py: Double): OptionHit | null => {
    const top = compiledCommands(compiled, option, measure).top
    const spec: ChartSpec = { ...compiled.spec, height: Math.max(0.0, compiled.spec.height - top) }
    const ly = py - top
    const mk = (i: number, di: number): OptionHit => ({
      seriesIndex: i,
      dataIndex: di,
      name: spec.categories[di] ?? String(di),
      value: spec.series[i]!.values[di] ?? NaN,
    })
    for (let i = 0; i < spec.series.length; i++) {
      if (spec.series[i]!.kind !== 'bars') continue
      const di = hitBar(barsFor(spec, i, measure), px, ly)
      if (di >= 0) return mk(i, di)
    }
    const plot = layoutChart(spec, measure).plot
    let best: OptionHit | null = null
    let bestD = 12.0
    for (let i = 0; i < spec.series.length; i++) {
      const s = spec.series[i]!
      if (s.kind === 'bars' || s.kind === 'stacked' || s.kind === 'grouped') continue
      const pts = layoutSeriesPoints(s.values, plot, seriesOnRightAxis(s, spec) ? resolveY2Domain(spec) : resolveYDomain(spec))
      const di = hitNearestX(pts, px)
      if (di < 0) continue
      const d = Math.abs(pts[di]!.x - px)
      if (d < bestD) {
        bestD = d
        best = mk(i, di)
      }
    }
    return best
  }

  const hitAt = (px: Double, py: Double): OptionHit | null => {
    const opt = readOption()
    const idx = stepIndex()
    const w = width()
    const stripH = timelineSteps(opt) === null ? 0.0 : TIMELINE_HEIGHT
    const plan = planOption(opt, compileOpts(w, height() - stripH, idx))
    const ctx = canvas === null ? null : canvas.getContext('2d')
    const measure = ctx === null ? measureApprox() : canvasMeasure(ctx, FONT)
    if (plan.kind === 'cartesian') return hitIn(plan.compiled, resolveTimeline(opt, idx).option as EChartsOption, measure, px, py)
    if (plan.kind === 'grids') {
      for (const part of plan.parts) {
        const r = part.rect
        if (part.plan.kind !== 'cartesian' || px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue
        return hitIn(part.plan.compiled, {}, measure, px - r.x, py - r.y)
      }
    }
    return null
  }

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const r = el.getBoundingClientRect()
    cb(hitAt(ev.clientX - r.left, ev.clientY - r.top))
  }

  const a11y = () => {
    const opt = readOption()
    const plan = planOption(opt, compileOpts(width(), height(), stepIndex()))
    let spec: ChartSpec | null = null
    if (plan.kind === 'cartesian') spec = plan.compiled.spec
    else if (plan.kind === 'grids') {
      const first = plan.parts.find((p) => p.plan.kind === 'cartesian')
      if (first !== undefined && first.plan.kind === 'cartesian') spec = first.plan.compiled.spec
    }
    const titleRaw = opt['title']
    const title = props.title ?? (typeof titleRaw === 'object' && titleRaw !== null && !Array.isArray(titleRaw) && typeof (titleRaw as Record<string, unknown>)['text'] === 'string' ? ((titleRaw as Record<string, unknown>)['text'] as string) : undefined)
    return {
      title,
      categories: spec === null ? [] : spec.categories,
      series: spec === null ? [] : spec.series.map((s) => ({ label: s.label, values: s.values, kind: s.kind })),
    }
  }

  const canvasNode = h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () => describeChart(a11y()),
    'data-pyreon-step': () => String(stepIndex() ?? -1),
    style: () => (mode() === 'canvas' ? '' : 'display:none'),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      if (el !== null) draw()
    },
    onClick: handleClick,
  })
  const svgNode = h('div', {
    style: () => (mode() === 'svg' ? '' : 'display:none'),
    ref: (el: HTMLDivElement | null) => {
      svgHost = el
      if (el !== null) draw()
    },
  })
  const hostSlot = (): VNode | null => (mode() === 'host' ? hostNode() : null)
  if (props.accessibleTable === false) return h('div', { style: 'position:relative' }, canvasNode, svgNode, hostSlot)
  const table = (): VNode | null => {
    const t = chartTable(a11y())
    if (t.rows.length === 0) return null
    return h(
      'div',
      { style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;margin:-1px;padding:0' },
      h('table', null,
        h('caption', null, a11y().title ?? 'Chart data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, svgNode, hostSlot, () => table())
}
