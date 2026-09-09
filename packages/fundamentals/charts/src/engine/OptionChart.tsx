// `<OptionChart>` — the ECharts-option-driven host: an ECharts-shaped option in
// (value or accessor), a live chart out. Cartesian plans (single or
// multi-grid) paint on a canvas through the SAME `compiledCommands` that
// `optionToSvg` serialises, so the host and the server never disagree; a
// family plan mounts the family's OWN canvas host (`familyHostNode`), and the
// two host-less shapes render through `optionToSvg` into an inline `<svg>`. A
// `timeline` steps on `autoPlay` or is driven by `timelineIndex`.

import { h, onMount } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { batch, effect, signal } from '@pyreon/reactivity'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
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
import { plain } from './format'
import type { ThemeDefinition } from './theme-registry'
import type { Double, DrawCmd, MeasureText, Rect } from './types'

export interface OptionHit {
  seriesIndex: number
  dataIndex: number
  /** The category label (or the index as text on a value axis). */
  name: string
  value: Double
}

/**
 * The cartesian surface rides the SHARED canvas host (`canvasHost`), so it
 * carries the host's whole interaction stack — `tooltip`, `keyboard` (on by
 * default), `toolbox` / `onSaveImage`, `accessibleTable`, `onSelectIndex` —
 * exactly as every family host does. The option's own `theme` (a registered
 * ECharts-shaped theme) and `locale` stay the facade's; the host's
 * `ChartTheme` prop is not taken here because the compiled option already
 * resolved its colours.
 */
export interface OptionChartProps extends Omit<CanvasHostProps, 'theme' | 'showTitle' | 'subtitle' | 'showLegend' | 'legendPosition' | 'animate' | 'updateAnimation' | 'updateDuration'> {
  /** An ECharts-shaped option. An accessor makes it reactive; a plain object is static. */
  option: EChartsOption | (() => EChartsOption)
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
  /** The datum INDEX under a click (or the keyboard's pick), -1 for a miss — the multiplatform-safe twin of `onSelect`. */
  onSelectIndex?: (index: number) => void
  /** Fired by a family host (pie, sankey, treemap, …) with ITS hit value, tagged with the family kind. */
  onFamilySelect?: (kind: FamilyPlan['kind'], hit: unknown) => void
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

/** What the shared host lays out for a cartesian plan: the compiled commands and the plan the hit test reads. */
interface OptionGeometry {
  cmds: DrawCmd[]
  plan: OptionPlan
  option: EChartsOption
  measure: MeasureText
  w: Double
  hgt: Double
}

/** The `CanvasHostProps` keys `OptionChartProps` does NOT take (its own `theme`, and the chrome the compiled option draws itself). */
type HostOmitted = 'theme' | 'showTitle' | 'subtitle' | 'showLegend' | 'legendPosition' | 'animate' | 'updateAnimation' | 'updateDuration'
/** Every host key the facade forwards verbatim — the host's whole surface minus the omitted set and the defaulted `height`. */
type HostPassthrough = Exclude<keyof CanvasHostProps, HostOmitted | 'height'>
/**
 * The forwarded keys as a TOTAL record over `HostPassthrough`: adding a key to
 * `CanvasHostProps` is a type error here until it is listed (or omitted), so a
 * typed-but-never-forwarded prop — `rtl` shipped that way — cannot recur.
 */
export const HOST_PASSTHROUGH_KEYS: { readonly [K in HostPassthrough]: true } = {
  width: true,
  title: true,
  tooltip: true,
  keyboard: true,
  toolbox: true,
  onSaveImage: true,
  accessibleTable: true,
  class: true,
  rtl: true,
}

/** The shared host's props for an option chart: every passthrough key present on `props`, plus the facade's fixed values. */
export function hostPropsFor(props: OptionChartProps): CanvasHostProps {
  const out: CanvasHostProps = { height: props.height ?? 320.0, animate: false, updateAnimation: false }
  const sink = out as Record<string, unknown>
  for (const k of Object.keys(HOST_PASSTHROUGH_KEYS) as HostPassthrough[]) {
    const v = props[k]
    if (v !== undefined) sink[k] = v
  }
  return out
}

export function OptionChart(props: OptionChartProps): VNode {
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
  // The effect stays PURE: it derives the auto-play plan (a fresh object per
  // option change, null when nothing plays) into a signal. The interval itself
  // is imperative work and is owned by onMount below — a server render never
  // starts one, and the mount cleanup stops it.
  const autoPlan = signal<{ n: number; start: number; interval: Double } | null>(null)
  effect(() => {
    const opt = readOption()
    const steps = timelineSteps(opt)
    autoPlan.set(
      steps === null || !steps.autoPlay || props.timelineIndex !== undefined || steps.labels.length < 2
        ? null
        : { n: steps.labels.length, start: steps.current, interval: steps.playInterval },
    )
  })
  onMount(() => {
    const play = (): void => {
      stopTimer()
      const plan = autoPlan()
      if (plan === null) return
      let cur = plan.start
      step.set(cur)
      timer = setInterval(() => {
        cur = (cur + 1) % plan.n
        step.set(cur)
        props.onTimelineChange?.(cur)
      }, plan.interval)
    }
    play()
    const unsubscribe = autoPlan.subscribe(play)
    return () => {
      unsubscribe()
      stopTimer()
    }
  })

  // One batch per draw: the mode and host-node writes of a family host, or the
  // mode flip to svg/canvas, must repaint the surface once, not per write.
  const draw = (): void => batch(() => {
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
    // A cartesian plan paints through the shared host below.
    mode.set('canvas')
  })

  /** The cartesian draw list for the host's box — the same commands `optionToSvg` serialises. */
  const cartesian = (w: Double, hgt: Double, measure: MeasureText): OptionGeometry => {
    const opt = readOption()
    const idx = stepIndex()
    const steps = timelineSteps(opt)
    const stripH = steps === null ? 0.0 : TIMELINE_HEIGHT
    const plan = planOption(opt, compileOpts(w, hgt - stripH, idx))
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
    return { cmds, plan, option: resolved, measure, w, hgt }
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

  const hitAt = (g: OptionGeometry, px: Double, py: Double): OptionHit | null => {
    const plan = g.plan
    if (plan.kind === 'cartesian') return hitIn(plan.compiled, g.option, g.measure, px, py)
    if (plan.kind === 'grids') {
      for (const part of plan.parts) {
        const r = part.rect
        if (part.plan.kind !== 'cartesian' || px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue
        return hitIn(part.plan.compiled, {}, g.measure, px - r.x, py - r.y)
      }
    }
    return null
  }

  /** The first cartesian spec of the geometry — the keyboard and the table walk its rows. */
  const firstSpec = (g: OptionGeometry): { spec: ChartSpec; top: Double; dx: Double; dy: Double } | null => {
    if (g.plan.kind === 'cartesian') {
      const top = compiledCommands(g.plan.compiled, g.option, g.measure).top
      return { spec: { ...g.plan.compiled.spec, height: Math.max(0.0, g.plan.compiled.spec.height - top) }, top, dx: 0.0, dy: 0.0 }
    }
    if (g.plan.kind === 'grids') {
      const part = g.plan.parts.find((p) => p.plan.kind === 'cartesian')
      if (part !== undefined && part.plan.kind === 'cartesian') {
        const top = compiledCommands(part.plan.compiled, {}, g.measure).top
        return { spec: { ...part.plan.compiled.spec, height: Math.max(0.0, part.plan.compiled.spec.height - top) }, top, dx: part.rect.x, dy: part.rect.y }
      }
    }
    return null
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

  // The cartesian surface: the shared host paints the compiled commands and
  // owns the pointer, keyboard, tooltip, toolbox and accessible-table paths.
  // The host's `title` chrome stays off — a compiled option draws its own
  // `title` — and it takes the props the facade shares with every host.
  const hostProps = hostPropsFor(props)
  const hit = (g: OptionGeometry, i: number): OptionHit | null => {
    const f = firstSpec(g)
    if (f === null || i < 0) return null
    const s = f.spec.series[0]
    if (s === undefined || i >= s.values.length) return null
    return { seriesIndex: 0, dataIndex: i, name: f.spec.categories[i] ?? String(i), value: s.values[i] ?? NaN }
  }
  const canvasNode = canvasHost<OptionGeometry>({
    props: hostProps,
    defaultHeight: 320,
    caption: 'Chart data',
    track: () => {
      readOption()
      step()
      void props.timelineIndex
    },
    layout: (box, measure) => cartesian(box.w, box.h, measure),
    render: (g) => g.cmds,
    select: (g, px, py) => {
      const h1 = hitAt(g, px, py)
      props.onSelect?.(h1)
      props.onSelectIndex?.(h1 === null ? -1 : h1.dataIndex)
    },
    tooltip: (g, px, py) => {
      const h1 = hitAt(g, px, py)
      if (h1 === null) return null
      const f = firstSpec(g)
      const label = f?.spec.series[h1.seriesIndex]?.label ?? `Series ${h1.seriesIndex + 1}`
      return [h1.name, `${label}: ${plain(h1.value)}`]
    },
    pick: (g, i) => {
      const h1 = hit(g, i)
      if (h1 === null) return
      props.onSelect?.(h1)
      props.onSelectIndex?.(i)
    },
    focusRect: (g, i): Rect | null => {
      const f = firstSpec(g)
      if (f === null) return null
      const s = f.spec.series[0]
      if (s === undefined || i < 0 || i >= s.values.length) return null
      if (s.kind === 'bars') {
        const r = barsFor(f.spec, 0, g.measure)[i]
        return r === undefined ? null : { x: r.x + f.dx, y: r.y + f.dy + f.top, w: r.w, h: r.h }
      }
      const plot = layoutChart(f.spec, g.measure).plot
      const p = layoutSeriesPoints(s.values, plot, seriesOnRightAxis(s, f.spec) ? resolveY2Domain(f.spec) : resolveYDomain(f.spec))[i]
      return p === undefined ? null : { x: p.x + f.dx - 6.0, y: p.y + f.dy + f.top - 6.0, w: 12.0, h: 12.0 }
    },
    a11y: () => a11y(),
  })
  const canvasSlot = (): VNode | null => (mode() === 'canvas' ? canvasNode : null)
  const svgNode = h('div', {
    style: () => (mode() === 'svg' ? '' : 'display:none'),
    ref: (el: HTMLDivElement | null) => {
      svgHost = el
      if (el !== null) draw()
    },
  })
  const hostSlot = (): VNode | null => (mode() === 'host' ? hostNode() : null)
  return h('div', { style: 'position:relative', 'data-pyreon-step': () => String(stepIndex() ?? -1) }, canvasSlot, svgNode, hostSlot)
}
