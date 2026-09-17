// `<OptionChart>` — the ECharts-option-driven host: an ECharts-shaped option in
// (value or accessor), a live chart out. Cartesian plans (single or
// multi-grid) paint on a canvas through the SAME `compiledCommands` that
// `optionToSvg` serialises, so the host and the server never disagree; a
// family plan mounts the family's OWN canvas host (`familyHostNode`), and the
// two host-less shapes render through `optionToSvg` into an inline `<svg>`. A
// `timeline` steps on `autoPlay` or is driven by `timelineIndex`.

import { h, onMount } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { batch, effect, isServer, signal, untrack } from '@pyreon/reactivity'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { pinSelection } from './legend-toggle'
import { compiledCommands, optionBrushSelection, optionToSvg, planOption, zoomedView } from './option'
import { limitWindow } from './option-zoom'
import { applyMagicType } from './magic-type'
import { hitToolbox, renderToolbox } from './toolbox'
import { toolboxTools } from './toolbox-config'
import type { ToolboxTool } from './toolbox-config'
import { brushAreaFromDrag, brushAreaUsable, brushPolygonAdd } from './brush-area'
import type { ChartHandle } from './link'
import type { BrushArea } from './brush-area'
import { brushRange, renderBrushBand } from './brush'
import { chartTable } from './a11y'
import { navigatorDrag, navigatorHit } from './navigator'
import { isFullWindow, panWindow, windowOfRows, zoomWindow } from './zoom'
import type { ZoomWindow } from './zoom'
import type { CompiledOption, EChartsOption, OptionPlan } from './option'
import { familyHostNode } from './family-host'
import type { FamilyPlan } from './option-family'
import { TIMELINE_HEIGHT, defaultTimelineStrip, mergeChartOptions, resolveTimeline, timelineCommands, timelineSteps } from './option-composite'
import { timelineAdvance, timelineHit, timelineTick } from './timeline-strip'
import { paint, prepareCanvas } from './canvas-web'
import type { OptionUpdatePolicy } from './option-composite'
import { graphicCommands } from './option-layer'
import { visualMapCommands } from './visual-map'
import { applySeriesSelection, barsFor, categoryIndex, invertCategories, layoutChart, resolveY2Domain, resolveYDomain, seriesDomain } from './render'
import type { ChartSpec, Emphasis } from './render'
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
  /** How successive reactive option values combine. Default: replace (the existing full-snapshot behavior). */
  optionUpdate?: OptionUpdatePolicy
  /** A registered theme name or an inline definition (see `registerTheme`). */
  theme?: string | ThemeDefinition
  /** BCP 47 tag for axis-label formatting (see `registerLocale`). */
  locale?: string
  /** Drive the `timeline` step from outside; absent = the option's `currentIndex`, advancing on `autoPlay`. */
  timelineIndex?: number
  /** Fired when auto-play advances the step. */
  onTimelineChange?: (index: number) => void
  /** Fired as the `dataZoom` window moves, in ECharts' percent (`start` / `end` 0–100). */
  onDataZoom?: (window: { start: number; end: number }) => void
  /**
   * Fired as a brush (taken up through a toolbox brush tool) settles or
   * clears: per series, the data indices inside it (all rows, not the zoomed
   * view). ECharts' `brushselected` batch, flattened.
   */
  onBrushSelected?: (selected: { seriesIndex: number; dataIndex: number[] }[]) => void
  /**
   * The imperative handle (`createChartHandle()`): its zoom, hover, pinned
   * datums, brush and timeline step / play state ARE this chart's, so
   * `handle.dispatch({ type: 'timelineChange', index: 2 })` moves it, and the
   * change callbacks fire as they would for a pointer.
   */
  handle?: ChartHandle | undefined
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
  /** The zoomed cartesian view: the title/legend offset, the first visible row, the plot and the slider strip in canvas coordinates. */
  zoom: { top: Double; offset: number; plot: Rect; strip: Rect | null; win: ZoomWindow } | null
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
  universalTransition: true,
}

/**
 * The shared host's props for an option chart: every passthrough key, plus the
 * facade's fixed values.
 *
 * Forwarded as live GETTERS, not copied values. `<OptionChart>` receives a
 * signal-driven prop as a getter (the compiler emits `_rp(() => …)` and
 * `makeReactiveProps` installs it), and this function runs ONCE at setup — so
 * reading `props[k]` here fires that getter and pins the result forever. The
 * host reads `width`, `height`, `title` and `rtl` lazily, so they WOULD have
 * been live; a value copy is what froze them. `<OptionChart width={w()} />`
 * then ignored every later `w.set(...)`, laying out at the mount-time width.
 *
 * GETTERS rather than `_rp` thunks, which is the difference that matters:
 * `canvasHost({ props: … })` takes a PLAIN OBJECT, not component props, so
 * nothing runs `makeReactiveProps` over it — a thunk would arrive at
 * `drawWidth(el, props.width)` as a function and the canvas would size to 0.
 * A getter reads transparently at every call site while staying live, which is
 * the descriptor-copy idiom the anti-pattern catalog prescribes for exactly
 * this "wrapper forwards user props" shape.
 *
 * PRESENCE is decided with `in`, which does not fire the getter, and is a
 * static property of the call site: `<OptionChart width={w()} />` always has
 * the key, whatever `w()` currently returns. An absent key must stay absent so
 * the host's own defaults apply. Only the VALUE is deferred.
 */
export function hostPropsFor(props: OptionChartProps): CanvasHostProps {
  const sink: Record<string, unknown> = { animate: false, updateAnimation: false }
  Object.defineProperty(sink, 'height', {
    get: () => props.height ?? 320.0,
    enumerable: true,
    configurable: true,
  })
  for (const k of Object.keys(HOST_PASSTHROUGH_KEYS) as HostPassthrough[]) {
    if (!(k in props)) continue
    Object.defineProperty(sink, k, {
      get: () => props[k],
      enumerable: true,
      configurable: true,
    })
  }
  return sink as CanvasHostProps
}

export function OptionChart(props: OptionChartProps): VNode {
  let svgHost: HTMLDivElement | null = null
  // The auto-played step; -1 = not started (use the option's currentIndex).
  const step = props.handle?.step ?? signal(-1)
  // Which surface shows: the built-in canvas, a family host, or the svg fallback.
  const mode = signal<'canvas' | 'host' | 'svg'>('canvas')
  const hostNode = signal<VNode | null>(null)
  let retainedOption: EChartsOption | undefined
  let retainedInput: EChartsOption | undefined
  const readOption = (): EChartsOption => {
    const input = typeof props.option === 'function' ? props.option() : props.option
    if (input === retainedInput && retainedOption !== undefined) return retainedOption
    retainedInput = input
    retainedOption = mergeChartOptions(retainedOption, input, props.optionUpdate ?? { mode: 'replace' }) as EChartsOption
    return retainedOption
  }
  const stepIndex = (): number | undefined => props.timelineIndex ?? (step() >= 0 ? step() : undefined)
  // The dataZoom window the user has moved to; null = the option's own start/end.
  const zoomWin = props.handle?.zoom ?? signal<ZoomWindow | null>(null)
  // Toolbox state: the magicType switches, the box-select zoom (mode, live band, undo stack) and the data view.
  const magicKind = signal<'' | 'line' | 'bar'>('')
  const magicStack = signal<'' | 'stack' | 'tiled'>('')
  const zoomSelect = signal(false)
  const selectBand = signal<{ a: Double; b: Double } | null>(null)
  let zoomHistory: (ZoomWindow | null)[] = []
  const dataView = signal(false)
  // The brush: the type a tool took up ('' = none), keep mode, committed areas in plot-frame pixels, the one being drawn.
  const brushType = props.handle?.brushType ?? signal<string>('')
  const brushKeep = signal<boolean | null>(null)
  const brushAreas = props.handle?.brushAreas ?? signal<BrushArea[]>([])
  const brushLive = signal<BrushArea | null>(null)
  let brushOrigin: { x: Double; y: Double; top: Double; plot: Rect } | null = null
  const brushTool = (t: string): ToolboxTool => (t === 'rect' ? 'brushRect' : t === 'polygon' ? 'brushPolygon' : t === 'lineX' ? 'brushLineX' : 'brushLineY')
  const toolActives = (): ToolboxTool[] => {
    const out: ToolboxTool[] = []
    if (magicKind() !== '') out.push(magicKind() === 'bar' ? 'magicBar' : 'magicLine')
    if (magicStack() !== '') out.push(magicStack() === 'stack' ? 'magicStack' : 'magicTiled')
    if (zoomSelect()) out.push('dataZoom')
    if (dataView()) out.push('dataView')
    if (brushType() !== '') out.push(brushTool(brushType()))
    if (brushKeep() === true) out.push('brushKeep')
    return out
  }
  /** The compiled option with the magicType switches applied to its series. */
  const magicOf = (compiled: CompiledOption): CompiledOption =>
    magicKind() === '' && magicStack() === '' ? compiled : { ...compiled, spec: applyMagicType(compiled.spec, magicKind(), magicStack()) }
  const winOf = (compiled: CompiledOption): ZoomWindow | undefined => zoomWin() ?? compiled.zoom?.window
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
  // The play button's choice; null = the option's `autoPlay`.
  const playOverride = props.handle?.playing ?? signal<boolean | null>(null)
  const autoPlan = signal<{ n: number; start: number; interval: Double; strip: ReturnType<typeof defaultTimelineStrip> } | null>(null)
  effect(() => {
    const opt = readOption()
    const steps = timelineSteps(opt)
    const wantPlay = steps !== null && (playOverride() ?? steps.autoPlay)
    autoPlan.set(
      steps === null || !wantPlay || props.timelineIndex !== undefined || steps.labels.length < 2
        ? null
        : { n: steps.labels.length, start: steps.current, interval: steps.playInterval, strip: { ...(steps.strip ?? defaultTimelineStrip(steps.labels)), labels: steps.labels } },
    )
  })
  /** Whether the strip shows the pause control. */
  const isPlaying = (): boolean => autoPlan() !== null
  onMount(() => {
    const play = (): void => {
      stopTimer()
      const plan = autoPlan()
      if (plan === null) return
      // Resume from where the user left the step, not from the option's index.
      let cur = step.peek() >= 0 ? step.peek() : plan.start
      step.set(cur)
      timer = setInterval(() => {
        const next = timelineTick(plan.strip, cur)
        if (next < 0) {
          // Past the end without `loop`: auto-play stops, like ECharts.
          stopTimer()
          playOverride.set(false)
          return
        }
        cur = next
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

  /** A click on the timeline strip along the bottom of a `w × hgt` box: a checkpoint jumps, the controls play / pause / step. */
  const timelineClick = (w: Double, hgt: Double, px: Double, py: Double): boolean => {
    const steps = timelineSteps(readOption())
    if (steps === null) return false
    const strip = { ...(steps.strip ?? defaultTimelineStrip(steps.labels)), labels: steps.labels }
    const hit = timelineHit(strip, { x: 0.0, y: hgt - TIMELINE_HEIGHT, w, h: TIMELINE_HEIGHT }, px, py)
    if (hit.kind === 0) return false
    const cur = stepIndex() ?? steps.current
    const go = (i: number): void => {
      if (i < 0) return
      step.set(i)
      props.onTimelineChange?.(i)
    }
    if (hit.kind === 2) {
      playOverride.set(!isPlaying())
    } else {
      playOverride.set(false)
      go(hit.kind === 1 ? hit.index : timelineAdvance(strip, cur, hit.kind === 3 ? -1 : 1, true))
    }
    return true
  }

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
    const planned = planOption(opt, compileOpts(w, hgt - stripH, idx))
    // `selectedMode: 'series'` tints every datum of a pinned series.
    const withSeriesPins = (c: CompiledOption): CompiledOption => (pinnedSeries().length === 0 ? c : { ...c, spec: applySeriesSelection(c.spec, pinnedSeries()) })
    const plan: OptionPlan = planned.kind === 'cartesian' ? { ...planned, compiled: withSeriesPins(magicOf(planned.compiled)) } : planned
    const resolved = resolveTimeline(opt, idx).option as EChartsOption
    const cmds: DrawCmd[] = []
    let zoom: OptionGeometry['zoom'] = null
    if (plan.kind === 'cartesian') {
      const live = brushLive()
      const areas = live === null ? brushAreas() : [...brushAreas(), live]
      const composed = compiledCommands(plan.compiled, resolved, measure, winOf(plan.compiled), toolActives(), areas)
      for (const c of composed.cmds) cmds.push(c)
      if (plan.compiled.zoom !== undefined) {
        const win = winOf(plan.compiled)!
        const view = zoomedView(plan.compiled, composed.top, win)
        const p = layoutChart(view.spec, measure).plot
        zoom = { top: composed.top, offset: view.offset, plot: { x: p.x, y: p.y + composed.top, w: p.w, h: p.h }, strip: view.navigator?.strip ?? null, win }
      }
    } else if (plan.kind === 'grids') {
      for (const part of plan.parts) {
        if (part.plan.kind !== 'cartesian') continue
        for (const c of compiledCommands(part.plan.compiled, {}, measure).cmds) cmds.push(offsetCmd(c, part.rect.x, part.rect.y))
      }
      for (const c of visualMapCommands(resolved, w, hgt - stripH).cmds) cmds.push(c)
      for (const c of graphicCommands(resolved, w, hgt - stripH).cmds) cmds.push(c)
    }
    if (steps !== null) for (const c of timelineCommands({ ...steps, current: idx ?? steps.current }, w, hgt - stripH, stripH, isPlaying())) cmds.push(c)
    return { cmds, plan, option: resolved, measure, w, hgt, zoom }
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
    // Under a dataZoom the hit runs on the rows in view; the reported index is global.
    const zoomed = zoomedView(compiled, top, winOf(compiled))
    const spec: ChartSpec = zoomed.spec
    const ly = py - top
    const mk = (i: number, di: number): OptionHit => ({
      seriesIndex: i,
      dataIndex: di + zoomed.offset,
      name: spec.categories[di] ?? String(di),
      value: spec.series[i]!.values[di] ?? NaN,
    })
    for (let i = 0; i < spec.series.length; i++) {
      if (spec.series[i]!.kind !== 'bars') continue
      const di = categoryIndex(spec, hitBar(barsFor(spec, i, measure), px, ly))
      if (di >= 0) return mk(i, di)
    }
    const plot = layoutChart(spec, measure).plot
    let best: OptionHit | null = null
    let bestD = 12.0
    const view = invertCategories(spec)
    for (let i = 0; i < spec.series.length; i++) {
      const s = view.series[i]!
      if (s.kind === 'bars' || s.kind === 'stacked' || s.kind === 'grouped') continue
      const pts = layoutSeriesPoints(s.values, plot, seriesDomain(s, spec, resolveYDomain(spec), resolveY2Domain(spec)))
      const vi = hitNearestX(pts, px)
      if (vi < 0) continue
      const d = Math.abs(pts[vi]!.x - px)
      if (d < bestD) {
        bestD = d
        best = mk(i, categoryIndex(spec, vi))
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
      return { spec: zoomedView(g.plan.compiled, top, winOf(g.plan.compiled)).spec, top, dx: 0.0, dy: 0.0 }
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
  // The host attaches its pointer listeners only for a tooltip; an option
  // whose series carry states (`emphasis` / `select` / `blur`) needs the
  // hover too, so the host's tooltip switch is on for either — and the
  // tooltip callback below hands back no rows unless the prop asked for them.
  const hasStates = (opt: EChartsOption): boolean => {
    const list = opt['series']
    const entries = Array.isArray(list) ? list : list === undefined ? [] : [list]
    return entries.some((entry) => typeof entry === 'object' && entry !== null && ('emphasis' in entry || 'select' in entry || 'blur' in entry))
  }
  Object.defineProperty(hostProps, 'tooltip', {
    get: () => props.tooltip === true || hasStates(readOption()),
    enumerable: true,
    configurable: true,
  })
  const hit = (g: OptionGeometry, i: number): OptionHit | null => {
    const f = firstSpec(g)
    if (f === null || i < 0) return null
    const s = f.spec.series[0]
    if (s === undefined || i >= s.values.length) return null
    return { seriesIndex: 0, dataIndex: i + (g.zoom?.offset ?? 0), name: f.spec.categories[i] ?? String(i), value: s.values[i] ?? NaN }
  }
  // ECharts' states on the compiled option: the hovered datum is the
  // highlight (`emphasis`), a click pins per the option's `selectedMode`
  // (`select`), and a series' `emphasis.focus` blurs the others. Both live in
  // signals the draw effect tracks; the commands are re-rendered with the
  // `emphasis` set only while a state is active, so a plain chart paints the
  // compiled commands as before.
  const hoverIndex = props.handle?.hover ?? signal(-1)
  const pinned = props.handle?.selected ?? signal<number[]>([])
  // `selectedMode: 'series'` pins SERIES indices rather than datums.
  const pinnedSeries = signal<number[]>([])
  /** True when a cartesian option draws an animated `lines` trail. */
  const linesEffectOn = (g: OptionGeometry): boolean =>
    g.plan.kind === 'cartesian' && (g.plan.compiled.spec.lines ?? []).some((ls) => ls.effect)
  const stateCmds = (g: OptionGeometry, time = 0.0): DrawCmd[] => {
    const highlight = hoverIndex()
    const selected = pinned()
    const clocked = linesEffectOn(g)
    if (highlight < 0 && selected.length === 0 && !clocked) return g.cmds
    // Emphasis indices are global; the zoomed spec counts from its first visible row.
    const off = g.zoom?.offset ?? 0
    const emphasis: Emphasis = { highlight: highlight < 0 ? highlight : highlight - off, selected: selected.map((k) => k - off) }
    if (g.plan.kind === 'cartesian') return compiledCommands({ ...g.plan.compiled, spec: { ...g.plan.compiled.spec, ...(highlight < 0 && selected.length === 0 ? {} : { emphasis }), effectTime: time } }, g.option, g.measure, winOf(g.plan.compiled), toolActives()).cmds
    if (g.plan.kind === 'grids') {
      const cmds: DrawCmd[] = []
      let first = true
      for (const part of g.plan.parts) {
        if (part.plan.kind !== 'cartesian') continue
        const compiled = first ? { ...part.plan.compiled, spec: { ...part.plan.compiled.spec, emphasis } } : part.plan.compiled
        first = false
        for (const c of compiledCommands(compiled, {}, g.measure).cmds) cmds.push(offsetCmd(c, part.rect.x, part.rect.y))
      }
      return cmds
    }
    return g.cmds
  }
  const pinMode = (g: OptionGeometry): 'single' | 'multiple' | 'series' | undefined => {
    if (g.plan.kind === 'cartesian') return g.plan.compiled.selectedMode
    if (g.plan.kind === 'grids') {
      const part = g.plan.parts.find((p) => p.plan.kind === 'cartesian')
      if (part !== undefined && part.plan.kind === 'cartesian') return part.plan.compiled.selectedMode
    }
    return undefined
  }
  let rootEl: HTMLDivElement | null = null
  /** ECharts' `saveAsImage`: the canvas as PNG / JPEG, or the option as SVG — handed to `onSaveImage`, else downloaded. */
  const saveImage = (tb: NonNullable<CompiledOption['toolbox']>): void => {
    let data = ''
    if (tb.imageType === 'svg') data = optionToSvg(readOption(), compileOpts(width(), height(), stepIndex()))
    else {
      const canvas = rootEl?.querySelector('canvas')
      if (canvas == null) return
      data = canvas.toDataURL(tb.imageType === 'jpeg' ? 'image/jpeg' : 'image/png')
    }
    if (props.onSaveImage !== undefined) {
      props.onSaveImage(data)
      return
    }
    if (isServer) return
    const a = document.createElement('a')
    const svgUrl = tb.imageType === 'svg' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([data], { type: 'image/svg+xml' })) : ''
    a.href = tb.imageType === 'svg' ? svgUrl : data
    a.download = `${tb.name}.${tb.imageType === 'jpeg' ? 'jpg' : tb.imageType}`
    a.click()
    if (svgUrl !== '') URL.revokeObjectURL(svgUrl)
  }
  /** Report the brush's selection, per series, as data indices over every row. */
  const reportBrush = (g: OptionGeometry): void => {
    const cb = props.onBrushSelected
    if (cb === undefined || g.plan.kind !== 'cartesian') return
    const compiled = g.plan.compiled
    const top = compiledCommands(compiled, g.option, g.measure).top
    const view = zoomedView(compiled, top, winOf(compiled))
    const sel = optionBrushSelection(compiled, view.spec, g.measure, brushAreas.peek())
    cb(sel.map((x) => ({ seriesIndex: x.seriesIndex, dataIndex: x.dataIndex.map((v) => categoryIndex(view.spec, v) + view.offset) })))
  }
  /** A click on the option's toolbox, top-right: true when a tool took it. */
  const toolboxClick = (g: OptionGeometry, px: Double, py: Double): boolean => {
    if (g.plan.kind !== 'cartesian' || g.plan.compiled.toolbox === undefined) return false
    const tb = g.plan.compiled.toolbox
    const tools = toolboxTools(tb)
    const layout = renderToolbox(tools, { x: 0.0, y: 0.0, w: g.w, h: g.hgt }, { fontSize: g.plan.compiled.spec.theme.fontSize, color: '' })
    const tool = hitToolbox(tools, layout.boxes, px, py)
    if (tool === null) return false
    batch(() => {
      if (tool === 'restore') {
        zoomWin.set(null)
        magicKind.set('')
        magicStack.set('')
        zoomSelect.set(false)
        dataView.set(false)
        pinned.set([])
        zoomHistory = []
        brushType.set('')
        brushKeep.set(null)
        brushAreas.set([])
      } else if (tool === 'magicLine') magicKind.set(magicKind() === 'line' ? '' : 'line')
      else if (tool === 'magicBar') magicKind.set(magicKind() === 'bar' ? '' : 'bar')
      else if (tool === 'magicStack') magicStack.set(magicStack() === 'stack' ? '' : 'stack')
      else if (tool === 'magicTiled') magicStack.set(magicStack() === 'tiled' ? '' : 'tiled')
      else if (tool === 'dataZoom') {
        zoomSelect.set(!zoomSelect())
        brushType.set('')
      } else if (tool === 'brushRect' || tool === 'brushPolygon' || tool === 'brushLineX' || tool === 'brushLineY') {
        const type = tool === 'brushRect' ? 'rect' : tool === 'brushPolygon' ? 'polygon' : tool === 'brushLineX' ? 'lineX' : 'lineY'
        brushType.set(brushType() === type ? '' : type)
        zoomSelect.set(false)
      } else if (tool === 'brushKeep') brushKeep.set(!(brushKeep() ?? (g.plan.kind === 'cartesian' && g.plan.compiled.brush?.multiple === true)))
      else if (tool === 'brushClear') brushAreas.set([])
      else if (tool === 'dataZoomBack') {
        const prev = zoomHistory.length > 0 ? zoomHistory[zoomHistory.length - 1]! : null
        zoomHistory = zoomHistory.slice(0, -1)
        zoomWin.set(prev)
        props.onDataZoom?.(prev === null ? { start: 0, end: 100 } : { start: prev.start * 100, end: prev.end * 100 })
      } else if (tool === 'dataView') dataView.set(!dataView())
      else if (tool === 'saveAsImage') saveImage(tb)
    })
    return true
  }
  let lastGeometry: OptionGeometry | null = null
  // Every change to the brush areas reports — a drag, a clear, a restore, or a dispatched `brush` action alike.
  if (props.onBrushSelected !== undefined) {
    let prevAreas = brushAreas.peek()
    effect(() => {
      const next = brushAreas()
      if (next === prevAreas) return
      prevAreas = next
      const g = lastGeometry
      if (g !== null) untrack(() => reportBrush(g))
    })
  }
  let lastZoom: CompiledOption['zoom'] = undefined
  let navGrab: { kind: number; x: Double; win: ZoomWindow } | null = null
  const setWindow = (prev: ZoomWindow, next: ZoomWindow): void => {
    const z = lastZoom
    if (z === undefined) return
    const w = limitWindow(z, prev, next)
    zoomWin.set(w)
    props.onDataZoom?.(isFullWindow(w) ? { start: 0, end: 100 } : { start: w.start * 100, end: w.end * 100 })
  }
  const canvasNode = canvasHost<OptionGeometry>({
    props: hostProps,
    defaultHeight: 320,
    caption: 'Chart data',
    track: () => {
      readOption()
      step()
      autoPlan()
      void props.timelineIndex
      magicKind()
      magicStack()
      zoomSelect()
      selectBand()
      dataView()
      brushType()
      brushKeep()
      brushAreas()
      brushLive()
      hoverIndex()
      pinned()
      pinnedSeries()
      zoomWin()
    },
    layout: (box, measure) => {
      const g = cartesian(box.w, box.h, measure)
      lastGeometry = g
      lastZoom = g.plan.kind === 'cartesian' ? g.plan.compiled.zoom : undefined
      return g
    },
    render: (g, _measure, _theme, _progress, time) => {
      const band = selectBand()
      if (band === null || g.zoom === null) return stateCmds(g, time)
      const out = stateCmds(g, time).slice()
      for (const c of renderBrushBand(g.zoom.plot, Math.min(band.a, band.b), Math.max(band.a, band.b), '#6366f1')) out.push(c)
      return out
    },
    effectClock: (g) => linesEffectOn(g),
    // ECharts' inside dataZoom: the wheel zooms the window about the pointer, a drag pans it.
    roam: {
      move: () => lastZoom?.inside === true && lastZoom.move,
      scale: () => lastZoom?.inside === true && lastZoom.wheel && !lastZoom.lock,
      zoom: (factor, px) => {
        const g = lastGeometry
        if (g?.zoom == null || lastZoom === undefined) return
        const frac = g.zoom.plot.w <= 0.0 ? 0.5 : (px - g.zoom.plot.x) / g.zoom.plot.w
        setWindow(g.zoom.win, zoomWindow(g.zoom.win, 1.0 / factor, frac))
      },
      pan: (dx) => {
        const g = lastGeometry
        if (g?.zoom == null || g.zoom.plot.w <= 0.0) return
        setWindow(g.zoom.win, panWindow(g.zoom.win, -dx / g.zoom.plot.w))
      },
    },
    // The slider: a press in the strip grabs a handle or the band; the drag is absolute from where it started.
    drag: {
      start: (g, px, py) => {
        if (brushType() !== '' && g.plan.kind === 'cartesian') {
          const top = compiledCommands(g.plan.compiled, g.option, g.measure).top
          const plot = layoutChart(zoomedView(g.plan.compiled, top, winOf(g.plan.compiled)).spec, g.measure).plot
          if (px >= plot.x && px <= plot.x + plot.w && py - top >= plot.y && py - top <= plot.y + plot.h) {
            brushOrigin = { x: px, y: py - top, top, plot }
            brushLive.set(brushAreaFromDrag(brushType(), plot, px, py - top, px, py - top))
            return true
          }
        }
        const z = g.zoom
        // The toolbox box zoom, while on, takes a drag that starts over the plot.
        if (z !== null && zoomSelect() && px >= z.plot.x && px <= z.plot.x + z.plot.w && py >= z.plot.y && py <= z.plot.y + z.plot.h) {
          selectBand.set({ a: px, b: px })
          return true
        }
        if (z === null || z.strip === null) return false
        const r = z.strip
        if (px < r.x - 8.0 || px > r.x + r.w + 8.0 || py < r.y - 4.0 || py > r.y + r.h + 4.0) return false
        navGrab = { kind: navigatorHit(r, z.win, px), x: px, win: z.win }
        return true
      },
      move: (g, px, py) => {
        const o = brushOrigin
        if (o !== null) {
          const live = brushLive()
          brushLive.set(brushType() === 'polygon' && live !== null ? brushPolygonAdd(live, o.plot, px, py - o.top) : brushAreaFromDrag(brushType(), o.plot, o.x, o.y, px, py - o.top))
          return
        }
        const band = selectBand()
        if (band !== null) {
          selectBand.set({ a: band.a, b: px })
          return
        }
        const z = g.zoom
        if (z === null || z.strip === null || navGrab === null || z.strip.w <= 0.0) return
        setWindow(navGrab.win, navigatorDrag(navGrab.kind, navGrab.win, (px - navGrab.x) / z.strip.w))
      },
      end: () => {
        navGrab = null
        if (brushOrigin !== null) {
          brushOrigin = null
          const area = brushLive()
          const g0 = lastGeometry
          const keep = brushKeep() ?? (g0?.plan.kind === 'cartesian' && g0.plan.compiled.brush?.multiple === true)
          batch(() => {
            brushLive.set(null)
            if (area !== null && brushAreaUsable(area)) brushAreas.set(keep ? [...brushAreas.peek(), area] : [area])
            else if (!keep) brushAreas.set([])
          })
          return
        }
        const band = selectBand()
        const g = lastGeometry
        if (band === null) return
        selectBand.set(null)
        if (g?.zoom == null || Math.abs(band.b - band.a) < 3.0 || g.plan.kind !== 'cartesian') return
        const n = g.plan.compiled.spec.categories.length
        const range = brushRange(g.zoom.plot.x, g.zoom.plot.w, band.a, band.b, g.zoom.win, n)
        zoomHistory = [...zoomHistory, zoomWin()]
        setWindow(g.zoom.win, windowOfRows(range.start, range.end, n))
      },
    },
    select: (g, px, py) => {
      if (toolboxClick(g, px, py)) return
      if (timelineClick(g.w, g.hgt, px, py)) return
      const h1 = hitAt(g, px, py)
      const pin = pinMode(g)
      // `series` pins the whole series the hit belongs to; the other modes pin the datum.
      if (pin === 'series' && h1 !== null) pinnedSeries.set(pinSelection(pinnedSeries(), h1.seriesIndex, true))
      else if (pin !== undefined && h1 !== null) pinned.set(pinSelection(pinned(), h1.dataIndex, pin === 'multiple'))
      props.onSelect?.(h1)
      props.onSelectIndex?.(h1 === null ? -1 : h1.dataIndex)
    },
    leave: () => hoverIndex.set(-1),
    tooltip: (g, px, py) => {
      const h1 = hitAt(g, px, py)
      hoverIndex.set(h1 === null ? -1 : h1.dataIndex)
      if (h1 === null || props.tooltip !== true) return null
      const f = firstSpec(g)
      const label = f?.spec.series[h1.seriesIndex]?.label ?? `Series ${h1.seriesIndex + 1}`
      return [h1.name, `${label}: ${plain(h1.value)}`]
    },
    pick: (g, i) => {
      const h1 = hit(g, i)
      if (h1 === null) return
      props.onSelect?.(h1)
      props.onSelectIndex?.(h1.dataIndex)
    },
    focusRect: (g, i): Rect | null => {
      const f = firstSpec(g)
      if (f === null) return null
      const s = f.spec.series[0]
      if (s === undefined || i < 0 || i >= s.values.length) return null
      const vi = categoryIndex(f.spec, i)
      if (s.kind === 'bars') {
        const r = barsFor(f.spec, 0, g.measure)[vi]
        return r === undefined ? null : { x: r.x + f.dx, y: r.y + f.dy + f.top, w: r.w, h: r.h }
      }
      const plot = layoutChart(f.spec, g.measure).plot
      const p = layoutSeriesPoints(invertCategories(f.spec).series[0]!.values, plot, seriesDomain(s, f.spec, resolveYDomain(f.spec), resolveY2Domain(f.spec)))[vi]
      return p === undefined ? null : { x: p.x + f.dx - 6.0, y: p.y + f.dy + f.top - 6.0, w: 12.0, h: 12.0 }
    },
    a11y: () => a11y(),
  })
  const canvasSlot = (): VNode | null => (mode() === 'canvas' ? canvasNode : null)
  const svgNode = h('div', {
    style: () => (mode() === 'svg' ? '' : 'display:none'),
    onClick: (ev: MouseEvent) => {
      const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
      timelineClick(width(), height(), ev.clientX - r.left, ev.clientY - r.top)
    },
    ref: (el: HTMLDivElement | null) => {
      svgHost = el
      if (el !== null) draw()
    },
  })
  // A family chart renders through its own host, which has no timeline: the strip is its own canvas under it.
  let barCanvas: HTMLCanvasElement | null = null
  const paintBar = (): void => {
    const el = barCanvas
    const steps = timelineSteps(readOption())
    if (el === null || steps === null) return
    const ctx = prepareCanvas(el, width(), TIMELINE_HEIGHT)
    if (ctx !== null) paint(ctx, timelineCommands({ ...steps, current: stepIndex() ?? steps.current }, width(), 0.0, TIMELINE_HEIGHT, isPlaying()), width(), TIMELINE_HEIGHT, 'system-ui, sans-serif')
  }
  effect(() => {
    readOption()
    step()
    autoPlan()
    mode()
    void props.timelineIndex
    paintBar()
  })
  const barNode = h('canvas', {
    'aria-hidden': 'true',
    ref: (el: HTMLCanvasElement | null) => {
      barCanvas = el
      paintBar()
    },
    onClick: (ev: MouseEvent) => {
      const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
      timelineClick(width(), TIMELINE_HEIGHT, ev.clientX - r.left, ev.clientY - r.top)
    },
  })
  const hostSlot = (): VNode | null => (mode() === 'host' ? hostNode() : null)
  const barSlot = (): VNode | null => (mode() === 'host' && timelineSteps(readOption()) !== null ? barNode : null)
  // The toolbox data view: the option's data as a visible table over the chart.
  const dataViewSlot = (): VNode | null => {
    if (!dataView()) return null
    const t = chartTable(a11y())
    return h(
      'div',
      { 'data-pyreon-dataview': '', style: 'position:absolute;inset:0;overflow:auto;background:#ffffff;color:#1f2937;font:12px system-ui,sans-serif;padding:8px;box-sizing:border-box' },
      h('button', { type: 'button', style: 'float:right', onClick: () => dataView.set(false) }, 'Close'),
      h(
        'table',
        { style: 'border-collapse:collapse' },
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { style: 'text-align:left;padding:2px 8px;border-bottom:1px solid #d1d5db' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, ...r.map((c) => h('td', { style: 'padding:2px 8px' }, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative', 'data-pyreon-step': () => String(stepIndex() ?? -1), ref: (el: HTMLDivElement | null) => { rootEl = el } }, canvasSlot, svgNode, hostSlot, barSlot, dataViewSlot)
}
