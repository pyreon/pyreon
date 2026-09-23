// `<OptionChart>` — the ECharts-option-driven host: an ECharts-shaped option in
// (value or accessor), a live chart out. Cartesian plans (single or
// multi-grid) paint on a canvas through the SAME `compiledCommands` that
// `optionToSvg` serialises, so the host and the server never disagree; a
// family plan mounts the family's OWN canvas host (`familyHostNode`), and the
// two host-less shapes render through `optionToSvg` into an inline `<svg>`. A
// `timeline` steps on `autoPlay` or is driven by `timelineIndex`.

import { tooltipMarkup, tooltipNumber } from './tooltip-markup'
import type { TitleLink } from './option-title'
import { h, onMount } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { batch, computed, effect, isServer, signal, untrack } from '@pyreon/reactivity'
import { canvasHost } from './canvas-host'
import { readTooltipOption } from './option-tooltip'
import { tooltipPlace } from './tooltip-place'
import type { TooltipSpec } from './option-tooltip'
import { formatTooltipTemplate, orderTooltipEntries, tooltipBreaks, tooltipMarker } from './tooltip-format'
import type { TooltipEntry } from './tooltip-format'
import { plotHitIndexIn } from './plot-hit'
import { AXIS_POINTER_DEFAULTS, axisPointerCmds } from './axis-pointer'
import type { AxisPointerStyle } from './axis-pointer'
import { paletteAt } from './palette'

import { ECHARTS_ANIMATION_DEFAULTS, resolveAnimation } from './animation-option'
import type { ChartAnimation } from './animation-option'
import { ease } from './easing'
import type { CanvasHostProps, TooltipView } from './canvas-host'
import { legendHitIndex, pinSelection } from './legend-toggle'
import { applyLegendHidden, legendClick } from './option-legend'
import type { LegendPager } from './option-legend'
import { compiledCommands, optionBrushSelection, optionToSvg, planOption, zoomedView } from './option'
import { limitWindow } from './option-zoom'
import { applyMagicType } from './magic-type'
import { hitToolbox, renderToolbox } from './toolbox'
import { toolboxTools } from './toolbox-config'
import type { ToolboxTool } from './toolbox-config'
import { brushAreaFromDrag, brushAreaUsable, brushPolygonAdd } from './brush-area'
import type { ChartHandle, ChartLink } from './link'
import type { BrushArea } from './brush-area'
import { brushRange, renderBrushBand } from './brush'
import { chartTable } from './a11y'
import { navigatorDrag, navigatorHit } from './navigator'
import { isFullWindow, panWindow, windowOfRows, zoomWindow } from './zoom'
import type { ZoomWindow } from './zoom'
import type { CompiledOption, EChartsOption, OptionPlan, OptionChrome } from './option'
import { familyHostNode, familyHostShape } from './family-host'
import { circleView, familyRect } from './option-layers'
import type { FamilyHostOptions } from './family-host'
import { selectedSeed } from './option-selected-map'
import { familyItemCursor, familyItemSilent, familyItemTooltip } from './family-tooltip'
import type { FamilyPlan } from './option-family'
import { TIMELINE_HEIGHT, defaultTimelineStrip, mergeChartOptions, resolveTimeline, timelineCommands, timelineSteps } from './option-composite'
import { timelineAdvance, timelineHit, timelineTick } from './timeline-strip'
import { paint, prepareCanvas } from './canvas-web'
import type { OptionUpdatePolicy } from './option-composite'
import { graphicCommands } from './option-layer'
import { visualMapCommands } from './visual-map'
import { applySeriesSelection, barsFor, categoryIndex, categoryPoints, invertCategories, layoutChart, resolveY2Domain, resolveYDomain, seriesDomain } from './render'
import type { ChartSpec, Emphasis } from './render'
import { hitBar, hitNearestX } from './layout'
import { plain } from './format'
import type { ThemeDefinition } from './theme-registry'
import type { Double, DrawCmd, MeasureText, Rect } from './types'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v])

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
export interface OptionChartProps extends Omit<CanvasHostProps, 'theme' | 'showTitle' | 'subtitle' | 'showLegend' | 'legendPosition' | 'animate' | 'updateAnimation' | 'updateDuration' | 'enterDuration' | 'enterDelay' | 'updateDelay' | 'enterEasing' | 'updateEasing'> {
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
  /**
   * Couple this chart to others (ECharts' `echarts.connect`): every chart given
   * the same `createChartLink()` shares one zoom window and one hovered datum.
   */
  link?: ChartLink | undefined
  /** Fired with the datum under a click (cartesian plans), or null for a miss. */
  onSelect?: (hit: OptionHit | null) => void
  /** The datum INDEX under a click (or the keyboard's pick), -1 for a miss — the multiplatform-safe twin of `onSelect`. */
  onSelectIndex?: (index: number) => void
  /**
   * A legend click changed which series show (ECharts' `legendselectchanged`):
   * every entry's name, true when its series is on.
   */
  onLegendSelectChange?: (selected: Record<string, boolean>) => void
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

/**
 * A layered plan, flattened for the canvas: every CARTESIAN part (a grid of a
 * layer included) with its rect in the chart's box, and every FAMILY part —
 * which mounts its own interactive host over the canvas.
 */
interface FlatLayers {
  cartesian: { plan: OptionPlan; rect: Rect }[]
  families: { plan: FamilyPlan; rect: Rect; source: EChartsOption; animation: ChartAnimation }[]
  /** A family that has no host (it renders as SVG only): the whole option falls back to SVG. */
  hostless: boolean
}
function flattenLayers(p: OptionPlan): FlatLayers {
  const out: FlatLayers = { cartesian: [], families: [], hostless: false }
  const walk = (plan: OptionPlan, dx: Double, dy: Double, rect: Rect): void => {
    if (plan.kind === 'cartesian') out.cartesian.push({ plan, rect: { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h } })
    else if (plan.kind === 'family') {
      if (familyHostShape(plan.compiled.plan, { width: rect.w, height: rect.h }) === null) out.hostless = true
      out.families.push({ plan: plan.compiled.plan, rect: { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h }, source: plan.compiled.source, animation: plan.compiled.animation })
    } else for (const part of plan.parts) walk(part.plan, dx + (plan.kind === 'grids' || plan.kind === 'layers' ? rect.x : 0.0), dy + (plan.kind === 'grids' || plan.kind === 'layers' ? rect.y : 0.0), part.rect)
  }
  if (p.kind === 'layers' || p.kind === 'grids') for (const part of p.parts) walk(part.plan, 0.0, 0.0, part.rect)
  return out
}
/** Families ECharts places inside the chart by their own box keys (center / radius, or margins). */
const PLACED_FAMILIES: ReadonlySet<string> = new Set(['pie', 'gauge', 'sunburst', 'chord', 'funnel', 'treemap', 'tree', 'sankey'])

/** Whether any series of an option turns ECharts' `universalTransition` on (`true` or `{ enabled: true }`). */
function wantsUniversalTransition(option: unknown): boolean {
  return asArray(isRecord(option) ? option['series'] : undefined).some((s) => isRecord(s) && (s['universalTransition'] === true || (isRecord(s['universalTransition']) && s['universalTransition']['enabled'] === true)))
}
/** Whether a plan draws on the canvas (its family parts, if any, mounting hosts over it) rather than as SVG. */
const canvasable = (p: OptionPlan): boolean => p.kind === 'cartesian' || ((p.kind === 'grids' || p.kind === 'layers') && !flattenLayers(p).hostless)
/** Whether a plan has family parts that mount as hosts over the canvas. */
const hasFamilyParts = (p: OptionPlan): boolean => (p.kind === 'grids' || p.kind === 'layers') && flattenLayers(p).families.length > 0
/** What the canvas draws of a plan: a layered (or family-holding multi-grid) plan's cartesian parts as one multi-grid plan. */
const canvasPlan = (p: OptionPlan): OptionPlan => (p.kind === 'layers' || hasFamilyParts(p) ? { kind: 'grids', parts: flattenLayers(p).cartesian, warnings: p.kind === 'cartesian' || p.kind === 'family' ? [] : p.warnings } : p)

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
  /** The legend entries' boxes in canvas coordinates, in entry order (empty without a legend). */
  legendBoxes: Rect[]
  /** A scrolling legend's page controller, when it shows. */
  legendPager?: LegendPager | null | undefined
  /** The title's linked lines (`title.link` / `sublink`). */
  titleLinks: TitleLink[]
}

/** The `CanvasHostProps` keys `OptionChartProps` does NOT take (its own `theme`, and the chrome the compiled option draws itself). */
type HostOmitted = 'frame' | 'itemTooltip' | 'itemCursor' | 'itemSilent' | 'theme' | 'showTitle' | 'subtitle' | 'showLegend' | 'legendPosition' | 'animate' | 'updateAnimation' | 'updateDuration' | 'enterDuration' | 'enterDelay' | 'updateDelay' | 'enterEasing' | 'updateEasing'
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
export function hostPropsFor(props: OptionChartProps, animation: () => ChartAnimation = () => ECHARTS_ANIMATION_DEFAULTS): CanvasHostProps {
  const sink: Record<string, unknown> = {}
  // The animation is the OPTION's (ECharts' `animation*` keys), read live so an
  // option that turns animation off — or changes its duration — takes effect
  // on the next draw without remounting the host.
  const live: Record<string, () => unknown> = {
    animate: () => animation().enter,
    updateAnimation: () => animation().update,
    enterDuration: () => animation().enterMs,
    enterDelay: () => animation().enterDelay,
    updateDuration: () => animation().updateMs,
    updateDelay: () => animation().updateDelay,
    enterEasing: () => {
      const name = animation().enterEasing
      return (t: number) => ease(name, t)
    },
    updateEasing: () => {
      const name = animation().updateEasing
      return (t: number) => ease(name, t)
    },
  }
  for (const [k, read] of Object.entries(live)) Object.defineProperty(sink, k, { get: read, enumerable: true, configurable: true })
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
  const zoomWin = props.handle?.zoom ?? props.link?.zoom ?? signal<ZoomWindow | null>(null)
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

  /**
   * What an option-driven family host carries beyond its plan: the facade's
   * forwarded host props (so `rtl`, `toolbox`, `keyboard`, `accessibleTable`
   * and the tooltip switch reach a pie as they reach a line chart) and the
   * item hooks applying the option's `tooltip` and each series' `cursor` /
   * `silent`. Live getters over the props and the family's source option.
   */
  const familyExtras = (source: () => Record<string, unknown>, kind: () => FamilyPlan['kind'], size: () => { w: Double; h: Double }): Record<string, unknown> => ({
    get tooltip() {
      return props.tooltip !== false
    },
    get keyboard() {
      return props.keyboard !== false
    },
    get accessibleTable() {
      return props.accessibleTable !== false
    },
    get rtl() {
      return props.rtl === true
    },
    get toolbox() {
      return props.toolbox ?? {}
    },
    get onSaveImage() {
      return props.onSaveImage
    },
    // A series' `universalTransition` lets its host morph an update that
    // changes the item count, as it does on the cartesian canvas.
    get universalTransition() {
      return props.universalTransition ?? wantsUniversalTransition(source())
    },
    itemTooltip: familyItemTooltip({ option: source, kind, tooltipProp: () => props.tooltip, size }),
    itemCursor: familyItemCursor(source),
    itemSilent: familyItemSilent(source),
  })

  // The family host's live inputs, read by the mounted node's prop getters.
  const familyPlan = signal<FamilyPlan | null>(null)
  const familyBox = signal({ w: 0.0, h: 0.0 })
  const familyAnimation = signal<ChartAnimation>(ECHARTS_ANIMATION_DEFAULTS)
  const familySource = signal<Record<string, unknown>>({})
  let familyShape: string | null = null
  const familyExtrasSingle = familyExtras(
    () => familySource(),
    () => familyPlan()?.kind ?? 'pie',
    () => familyBox(),
  )
  // A single family chart sits where ECharts places it in the whole chart (a
  // pie at its center with a 75% radius, a funnel inside its margins), the
  // title and legend drawn over it; the layered path already places each part.
  Object.defineProperty(familyExtrasSingle, 'frame', {
    get: () => {
      const s0 = asArray(familySource()['series'])[0]
      if (!isRecord(s0) || typeof s0['type'] !== 'string' || !PLACED_FAMILIES.has(s0['type'] as string)) return undefined
      const box = familyBox()
      return familyRect(s0, box.w, box.h)
    },
    enumerable: true,
    configurable: true,
  })
  // A pie's outside labels keep within its view rect (the whole chart unless its box keys say otherwise).
  Object.defineProperty(familyExtrasSingle, 'view', {
    get: () => {
      const s0 = asArray(familySource()['series'])[0]
      if (!isRecord(s0) || s0['type'] !== 'pie') return undefined
      const box = familyBox()
      return circleView(s0, box.w, box.h)
    },
    enumerable: true,
    configurable: true,
  })
  const familyOptions: FamilyHostOptions = {
    host: familyExtrasSingle,
    get width() {
      return familyBox().w
    },
    get height() {
      return familyBox().h
    },
    get animation() {
      return familyAnimation()
    },
    get onSelect() {
      return props.onFamilySelect
    },
  }

  // ---- family layers over the canvas -------------------------------------
  // Each family layer of a layered option is its own interactive host in an
  // absolutely positioned box. A layer whose host shape is unchanged stays
  // MOUNTED and is fed its new plan and box, so an update tweens; the list of
  // boxes is only replaced when a layer appears, leaves or changes shape.
  interface LiveLayer {
    shape: string
    plan: ReturnType<typeof signal<FamilyPlan>>
    box: ReturnType<typeof signal<Rect>>
    animation: ReturnType<typeof signal<ChartAnimation>>
    source: ReturnType<typeof signal<Record<string, unknown>>>
    node: VNode
  }
  let liveLayers: LiveLayer[] = []
  const layerNodes = signal<VNode[]>([])
  const syncLayers = (parts: FlatLayers['families']): void => {
    const next = parts.map((part, i): LiveLayer | null => {
      const shape = untrack(() => familyHostShape(part.plan, { width: part.rect.w, height: part.rect.h, transparent: true }))
      if (shape === null) return null
      const prev = liveLayers[i]
      if (prev !== undefined && prev.shape === shape) {
        batch(() => {
          prev.plan.set(part.plan)
          prev.box.set(part.rect)
          prev.animation.set(part.animation)
          prev.source.set(part.source)
        })
        return prev
      }
      const plan = signal(part.plan)
      const box = signal(part.rect)
      const animation = signal(part.animation)
      const source = signal<Record<string, unknown>>(part.source)
      const options: FamilyHostOptions = {
        host: familyExtras(() => source(), () => plan().kind, () => box()),
        get width() {
          return box().w
        },
        get height() {
          return box().h
        },
        get animation() {
          return animation()
        },
        get onSelect() {
          return props.onFamilySelect
        },
        transparent: true,
      }
      const host = untrack(() => familyHostNode(() => plan(), options))
      if (host === null) return null
      // Under `rtl` the layer's box mirrors with the chart, as its content does.
      const left = (): Double => (props.rtl === true ? width() - box().x - box().w : box().x)
      // ECharts' `zlevel` then `z` order the layers among themselves (a higher one draws over).
      const stack = (): number => {
        const s0 = asArray(source()['series'])[0]
        const rec = isRecord(s0) ? s0 : {}
        const zl = typeof rec['zlevel'] === 'number' ? rec['zlevel'] : 0
        const z = typeof rec['z'] === 'number' ? rec['z'] : 2
        return Math.max(1, Math.round(zl * 100 + z + 1))
      }
      const node = h('div', { 'data-pyreon-chart-layer': String(i), style: () => `position:absolute;left:${left()}px;top:${box().y}px;width:${box().w}px;height:${box().h}px;z-index:${stack()}` }, host)
      return { shape, plan, box, animation, source, node }
    })
    const kept = next.filter((l): l is LiveLayer => l !== null)
    const changed = kept.length !== liveLayers.length || kept.some((l, i) => l !== liveLayers[i])
    liveLayers = kept
    if (changed) layerNodes.set(kept.map((l) => l.node))
  }
  const layerSlot = (): VNode[] | null => (mode() === 'canvas' && layerNodes().length > 0 ? layerNodes() : null)

  // One batch per draw: the mode and host-node writes of a family host, or the
  // mode flip to svg/canvas, must repaint the surface once, not per write.
  // The pins (ECharts' selection): declared before the draw effect, which seeds
  // them from the option's `selectedMap`.
  const pinned = props.handle?.selected ?? signal<number[]>([])
  // `selectedMode: 'series'` pins SERIES indices rather than datums.
  const pinnedSeries = signal<number[]>([])
  // The legend's hidden series, by name (ECharts' `legend.selected`).
  const legendHidden = signal<string[]>([])
  // A scrolling legend's page start (ECharts' `legend.scrollDataIndex`, moved by its arrows); null = the option's own.
  const legendScroll = signal<number | null>(null)
  let seededFrom: unknown = null
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
        batch(() => {
          familyPlan.set(plan.compiled.plan)
          familyBox.set({ w, h: hgt - stripH })
          familyAnimation.set(plan.compiled.animation)
          familySource.set(plan.compiled.source as Record<string, unknown>)
        })
        // One LIVE node per host shape: an option update of the same shape
        // feeds the mounted host new props, so it TWEENS (ECharts' update
        // animation) instead of remounting and replaying the entrance. The
        // probe and the build read the signals written just above, so they
        // run untracked — tracked, the draw effect would re-trigger itself.
        const shape = untrack(() => familyHostShape(plan.compiled.plan, familyOptions))
        if (shape !== null) {
          if (shape !== familyShape) {
            familyShape = shape
            hostNode.set(untrack(() => familyHostNode(() => familyPlan()!, familyOptions)))
          }
          mode.set('host')
          return
        }
      }
      familyShape = null
      mode.set('svg')
      const host = svgHost
      if (host !== null) host.innerHTML = optionToSvg(opt, compileOpts(w, hgt, idx))
      return
    }
    // A cartesian plan paints through the shared host below; a layered one
    // also mounts each family layer's own host over it.
    const flat = hasFamilyParts(plan) ? flattenLayers(plan) : null
    syncLayers(flat === null ? [] : flat.families)
    // ECharts' `selectedMap` seeds the pins, once per option (a click then owns them).
    if (opt !== seededFrom) {
      seededFrom = opt
      const cart = plan.kind === 'cartesian' ? plan.compiled : null
      const seed = cart === null ? null : selectedSeed(asArray(opt['series']), cart.seriesSource, cart.spec.categories)
      if (seed !== null) {
        pinned.set(seed.data)
        pinnedSeries.set(seed.series)
      }
      legendHidden.set(cart?.legendHidden ?? [])
      // A new option starts at its own `scrollDataIndex`.
      legendScroll.set(null)
    }
    mode.set('canvas')
  })

  /**
   * The cartesian draw list for the host's box — the same commands
   * `optionToSvg` serialises — with the frame's live overrides: the hover /
   * pin `emphasis`, the effect clock, and the entrance `progress`. EVERY frame
   * is composed here, a hovered or entering one included, so brush areas, the
   * visualMap strip, graphic elements and the timeline stay on screen while a
   * state is active (they used to drop out whenever a datum was hovered).
   */
  const compose = (plan: OptionPlan, resolved: EChartsOption, measure: MeasureText, w: Double, hgt: Double, over: { emphasis?: Emphasis | undefined; time: Double; progress: Double }): { cmds: DrawCmd[]; zoom: OptionGeometry['zoom']; legendBoxes: Rect[]; legendPager: LegendPager | null; titleLinks: TitleLink[] } => {
    const idx = stepIndex()
    const steps = timelineSteps(readOption())
    const stripH = steps === null ? 0.0 : TIMELINE_HEIGHT
    const live = (spec: ChartSpec, emphasis: Emphasis | undefined): ChartSpec => ({
      ...spec,
      ...(emphasis === undefined ? {} : { emphasis }),
      ...(over.time === 0.0 ? {} : { effectTime: over.time }),
      ...(over.progress >= 1.0 ? {} : { progress: over.progress }),
    })
    const cmds: DrawCmd[] = []
    let zoom: OptionGeometry['zoom'] = null
    let legendBoxes: Rect[] = []
    let legendPager: LegendPager | null = null
    let titleLinks: TitleLink[] = []
    if (plan.kind === 'cartesian') {
      const liveBrush = brushLive()
      const areas = liveBrush === null ? brushAreas() : [...brushAreas(), liveBrush]
      const compiled = { ...plan.compiled, spec: live(plan.compiled.spec, over.emphasis) }
      const composed = compiledCommands(compiled, resolved, measure, winOf(plan.compiled), toolActives(), areas)
      for (const c of composed.cmds) cmds.push(c)
      legendBoxes = composed.legendBoxes
      legendPager = composed.legendPager
      titleLinks = composed.titleLinks
      for (const c of pointerCmds(plan.compiled, resolved, measure, composed.chrome)) cmds.push(c)
      if (plan.compiled.zoom !== undefined) {
        const win = winOf(plan.compiled)!
        const view = zoomedView(plan.compiled, composed.chrome, win, measure)
        const p = layoutChart(view.spec, measure).plot
        zoom = { top: composed.top, offset: view.offset, plot: { x: p.x, y: p.y + composed.top, w: p.w, h: p.h }, strip: view.navigator?.strip ?? null, win }
      }
    } else if (plan.kind === 'grids') {
      // The option's ground covers the whole canvas, not only the grids' rects.
      const ground = (resolved as Record<string, unknown>)['backgroundColor']
      if (typeof ground === 'string' && ground !== '') cmds.push({ kind: 'rect', rect: { x: 0.0, y: 0.0, w, h: hgt }, fill: ground })
      let first = true
      for (const part of plan.parts) {
        if (part.plan.kind !== 'cartesian') continue
        // The hover / pin state belongs to the first grid, whose rows the host hit-tests.
        const compiled = { ...part.plan.compiled, spec: live(part.plan.compiled.spec, first ? over.emphasis : undefined) }
        first = false
        for (const c of compiledCommands(compiled, {}, measure).cmds) cmds.push(offsetCmd(c, part.rect.x, part.rect.y))
      }
      for (const c of visualMapCommands(resolved, w, hgt - stripH).cmds) cmds.push(c)
      for (const c of graphicCommands(resolved, w, hgt - stripH).cmds) cmds.push(c)
    }
    if (steps !== null) for (const c of timelineCommands({ ...steps, current: idx ?? steps.current }, w, hgt - stripH, stripH, isPlaying())) cmds.push(c)
    return { cmds, zoom, legendBoxes, legendPager, titleLinks }
  }

  /**
   * The axis pointer an axis-triggered tooltip draws at the hovered column
   * (ECharts' `tooltip.axisPointer`), in canvas space. Nothing while nothing is
   * hovered, and nothing for an item tooltip unless the option asks.
   */
  const pointerCmds = (compiled: CompiledOption, resolved: EChartsOption, measure: MeasureText, chrome: OptionChrome): DrawCmd[] => {
    const top = chrome.top
    const index = hoverIndex()
    const at = hoverAt()
    if (index < 0 || at === null) return []
    const tip = readTooltipOption((resolved as Record<string, unknown>)['tooltip'], () => undefined)
    if (tip === null || !tip.show || tip.axisPointer.type === 'none') return []
    const view = zoomedView(compiled, chrome, winOf(compiled))
    const spec = view.spec
    const i = index - view.offset
    const n = spec.categories.length
    if (i < 0 || i >= n) return []
    const vi = categoryIndex(spec, i)
    const plot0 = layoutChart(spec, measure).plot
    const plot: Rect = { x: plot0.x, y: plot0.y + top, w: plot0.w, h: plot0.h }
    const banded = spec.series.some((s) => s.kind === 'bars' || s.kind === 'stacked' || s.kind === 'grouped' || s.kind === 'waterfall')
    const pitch = banded ? plot.w / n : n > 1 ? plot.w / (n - 1) : plot.w
    const x = banded ? plot.x + (vi + 0.5) * pitch : n > 1 ? plot.x + vi * pitch : plot.x + plot.w / 2.0
    const y = at.y >= plot.y && at.y <= plot.y + plot.h ? at.y : null
    const domain = resolveYDomain(spec)
    const value = y === null || plot.h <= 0.0 ? 0.0 : domain.min + ((plot.y + plot.h - y) / plot.h) * (domain.max - domain.min)
    const t = spec.theme
    const style: AxisPointerStyle = {
      ...AXIS_POINTER_DEFAULTS,
      type: tip.axisPointer.type,
      color: tip.axisPointer.color ?? AXIS_POINTER_DEFAULTS.color,
      width: tip.axisPointer.width ?? AXIS_POINTER_DEFAULTS.width,
      dashed: tip.axisPointer.dashed || tip.axisPointer.type === 'cross',
      shadowColor: tip.axisPointer.shadowColor ?? AXIS_POINTER_DEFAULTS.shadowColor,
      label: tip.axisPointer.label,
      fontSize: t?.fontSize ?? AXIS_POINTER_DEFAULTS.fontSize,
    }
    return axisPointerCmds(plot, { x, band: pitch, y, categoryLabel: spec.categories[i] ?? '', valueLabel: plain(Math.round(value * 100.0) / 100.0) }, style)
  }

  const cartesian = (w: Double, hgt: Double, measure: MeasureText): OptionGeometry => {
    const opt = readOption()
    const idx = stepIndex()
    const steps = timelineSteps(opt)
    const stripH = steps === null ? 0.0 : TIMELINE_HEIGHT
    const planned = canvasPlan(planOption(opt, compileOpts(w, hgt - stripH, idx)))
    // `selectedMode: 'series'` tints every datum of a pinned series.
    const withSeriesPins = (c: CompiledOption): CompiledOption => (pinnedSeries().length === 0 ? c : { ...c, spec: applySeriesSelection(c.spec, pinnedSeries()) })
    // A legend-hidden series keeps its slot but draws, hits and tooltips nothing.
    const withLegend = (c0: CompiledOption): CompiledOption => {
      const scroll = legendScroll()
      const c = scroll !== null && c0.legendLayout !== undefined && c0.legendLayout.scroll ? { ...c0, legendLayout: { ...c0.legendLayout, scrollIndex: scroll } } : c0
      if (c.legend === null || legendHidden().length === 0) return c
      const applied = applyLegendHidden(c.spec.series, c.legend, legendHidden())
      return { ...c, legend: applied.entries, spec: { ...c.spec, series: applied.series } }
    }
    const plan: OptionPlan = planned.kind === 'cartesian' ? { ...planned, compiled: withLegend(withSeriesPins(magicOf(planned.compiled))) } : planned
    const resolved = resolveTimeline(opt, idx).option as EChartsOption
    const { cmds, zoom, legendBoxes, legendPager, titleLinks } = compose(plan, resolved, measure, w, hgt, { time: 0.0, progress: 1.0 })
    return { cmds, plan, option: resolved, measure, w, hgt, zoom, legendBoxes, legendPager, titleLinks }
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
    const chrome = compiledCommands(compiled, option, measure).chrome
    const top = chrome.top
    // Under a dataZoom the hit runs on the rows in view; the reported index is global.
    const zoomed = zoomedView(compiled, chrome, winOf(compiled))
    const spec: ChartSpec = zoomed.spec
    const ly = py - top
    const mk = (i: number, di: number): OptionHit => ({
      seriesIndex: i,
      dataIndex: di + zoomed.offset,
      name: spec.categories[di] ?? String(di),
      value: spec.series[i]!.values[di] ?? NaN,
    })
    // A `silent` series ignores the pointer (ECharts), so it is never hit.
    const silent = compiled.silent
    for (let i = 0; i < spec.series.length; i++) {
      if (spec.series[i]!.kind !== 'bars' || silent.includes(i)) continue
      const di = categoryIndex(spec, hitBar(barsFor(spec, i, measure), px, ly))
      if (di >= 0) return mk(i, di)
    }
    const plot = layoutChart(spec, measure).plot
    let best: OptionHit | null = null
    let bestD = 12.0
    const view = invertCategories(spec)
    for (let i = 0; i < spec.series.length; i++) {
      const s = view.series[i]!
      if (s.kind === 'bars' || s.kind === 'stacked' || s.kind === 'grouped' || silent.includes(i)) continue
      const pts = categoryPoints(spec, s.values, plot, seriesDomain(s, spec, resolveYDomain(spec), resolveY2Domain(spec)))
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
      const chrome = compiledCommands(g.plan.compiled, g.option, g.measure).chrome
      return { spec: zoomedView(g.plan.compiled, chrome, winOf(g.plan.compiled)).spec, top: chrome.top, dx: 0.0, dy: 0.0 }
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
  // ECharts' animation keys, off the option as it stands at the current timeline step.
  const optionAnimation = computed(() => resolveAnimation(resolveTimeline(readOption(), stepIndex()).option as Record<string, unknown>))
  const hostProps = hostPropsFor(props, optionAnimation)
  // A series' `universalTransition` turns the morph on for the chart (the host
  // has one timeline); the prop, when given, wins.
  Object.defineProperty(hostProps, 'universalTransition', {
    get: () =>
      props.universalTransition ?? wantsUniversalTransition(readOption()),
    enumerable: true,
    configurable: true,
  })
  // The host attaches its pointer listeners only for a tooltip; an option
  // whose series carry states (`emphasis` / `select` / `blur`) needs the
  // hover too, so the host's tooltip switch is on for either — and the
  // tooltip callback below hands back no rows unless the prop asked for them.
  const hasStates = (opt: EChartsOption): boolean => {
    const list = opt['series']
    const entries = Array.isArray(list) ? list : list === undefined ? [] : [list]
    return entries.some((entry) => typeof entry === 'object' && entry !== null && ('emphasis' in entry || 'select' in entry || 'blur' in entry))
  }
  // The host's pointer channel is on unless the prop turns it off: whether a
  // box shows is the OPTION's call (its `tooltip` component), decided per hover
  // — an option that gains a tooltip later must not need a remount.
  Object.defineProperty(hostProps, 'tooltip', {
    get: () => props.tooltip !== false || hasStates(readOption()),
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
  const hoverIndex = props.handle?.hover ?? props.link?.hover ?? signal(-1)
  /** True when a cartesian option draws an animated `lines` trail. */
  const linesEffectOn = (g: OptionGeometry): boolean =>
    g.plan.kind === 'cartesian' && (g.plan.compiled.spec.lines ?? []).some((ls) => ls.effect)
  /** The frame to paint: the cached composition, or a fresh one while a state, the effect clock or the entrance is live. */
  const stateCmds = (g: OptionGeometry, time = 0.0, progress = 1.0): DrawCmd[] => {
    const highlight = hoverIndex()
    const selected = pinned()
    const clocked = linesEffectOn(g)
    if (highlight < 0 && selected.length === 0 && !clocked && progress >= 1.0) return g.cmds
    // Emphasis indices are global; the zoomed spec counts from its first visible row.
    const off = g.zoom?.offset ?? 0
    const emphasis: Emphasis | undefined = highlight < 0 && selected.length === 0 ? undefined : { highlight: highlight < 0 ? highlight : highlight - off, selected: selected.map((k) => k - off) }
    if (g.plan.kind !== 'cartesian' && g.plan.kind !== 'grids') return g.cmds
    return compose(g.plan, g.option, g.measure, g.w, g.hgt, { emphasis, time, progress }).cmds
  }
  // ---- tooltip -----------------------------------------------------------
  // The hovered point in canvas space — the axis pointer's position.
  const hoverAt = signal<{ x: Double; y: Double } | null>(null)
  /** The category column under a canvas-space point, for an axis-triggered tooltip; -1 outside the plot. */
  const axisIndexAt = (g: OptionGeometry, px: Double, py: Double): number => {
    const f = firstSpec(g)
    if (f === null) return -1
    const lx = px - f.dx
    const ly = py - f.top - f.dy
    const l = layoutChart(f.spec, g.measure)
    const plot = l.plot
    if (lx < plot.x || lx > plot.x + plot.w || ly < plot.y || ly > plot.y + plot.h) return -1
    const n = f.spec.categories.length
    if (n === 0) return -1
    const s0 = f.spec.series[0]
    const band = s0 !== undefined && (s0.kind === 'bars' || s0.kind === 'stacked' || s0.kind === 'grouped' || s0.kind === 'waterfall')
    if (band) return categoryIndex(f.spec, Math.min(n - 1, Math.max(0, Math.floor(((lx - plot.x) / plot.w) * n)))) + (g.zoom?.offset ?? 0)
    const i = plotHitIndexIn(f.spec, l, lx, ly)
    return i < 0 ? -1 : i + (g.zoom?.offset ?? 0)
  }
  /** The drawn rect of one datum, in canvas space — what `position: 'top'` and friends sit against. */
  const itemRect = (g: OptionGeometry, seriesIndex: number, dataIndex: number): Rect | null => {
    const f = firstSpec(g)
    if (f === null) return null
    const i = dataIndex - (g.zoom?.offset ?? 0)
    const s = f.spec.series[seriesIndex]
    if (s === undefined || i < 0 || i >= s.values.length) return null
    const vi = categoryIndex(f.spec, i)
    if (s.kind === 'bars' || s.kind === 'stacked' || s.kind === 'grouped') {
      const r = barsFor(f.spec, seriesIndex, g.measure)[vi]
      return r === undefined ? null : { x: r.x + f.dx, y: r.y + f.dy + f.top, w: r.w, h: r.h }
    }
    const plot = layoutChart(f.spec, g.measure).plot
    const p = categoryPoints(f.spec, invertCategories(f.spec).series[seriesIndex]!.values, plot, seriesDomain(s, f.spec, resolveYDomain(f.spec), resolveY2Domain(f.spec)))[vi]
    return p === undefined ? null : { x: p.x + f.dx - 4.0, y: p.y + f.dy + f.top - 4.0, w: 8.0, h: 8.0 }
  }

  /** The OPTION's series index for a compiled series index (unsupported series are skipped when compiling). */
  const sourceOf = (g: OptionGeometry, specIndex: number): number => (g.plan.kind === 'cartesian' ? (g.plan.compiled.seriesSource[specIndex] ?? specIndex) : specIndex)
  /** The option's own series object behind a compiled series. */
  const rawSeriesOf = (g: OptionGeometry, specIndex: number): Record<string, unknown> | undefined => {
    const raw = asArray((g.option as Record<string, unknown>)['series'])[sourceOf(g, specIndex)]
    return isRecord(raw) ? raw : undefined
  }

  /** One series' entry at a datum: the template's fields and the formatter's `params`. */
  const tooltipEntry = (g: OptionGeometry, spec: TooltipSpec, seriesIndex: number, dataIndex: number): { entry: TooltipEntry; params: Record<string, unknown>; value: Double; named: boolean } | null => {
    const f = firstSpec(g)
    if (f === null) return null
    const s = f.spec.series[seriesIndex]
    const i = dataIndex - (g.zoom?.offset ?? 0)
    if (s === undefined || i < 0 || i >= s.values.length) return null
    const value = s.values[categoryIndex(f.spec, i)]
    if (value === undefined || !Number.isFinite(value)) return null
    const color = s.color ?? paletteAt([], seriesIndex)
    const name = f.spec.categories[i] ?? String(i)
    const shown = spec.valueFormatter === undefined ? plain(value) : String(spec.valueFormatter(value, dataIndex))
    const rawSeries = rawSeriesOf(g, seriesIndex)
    const rawData = rawSeries !== undefined ? asArray(rawSeries['data'])[dataIndex] : undefined
    const params = {
      componentType: 'series',
      componentSubType: rawSeries?.['type'],
      seriesType: rawSeries?.['type'],
      seriesIndex: sourceOf(g, seriesIndex),
      seriesName: s.label,
      name,
      dataIndex,
      data: rawData,
      value,
      color,
      marker: tooltipMarker(color),
    }
    // ECharts shows a series name only when the option gave one: a generated name is not readable.
    const named = typeof rawSeries?.['name'] === 'string' && rawSeries['name'] !== ''
    return { entry: { seriesName: s.label, name, value: shown, percent: '', values: Array.isArray(rawData) ? rawData.map((v) => plain(Number(v))) : [], color }, params, value, named }
  }

  /** Where a view goes, per the option's `position`. */
  const placeFor = (g: OptionGeometry, spec: TooltipSpec, anchor: Rect | null, params: unknown): TooltipView['place'] => tooltipPlace(spec, anchor, params, { w: g.w, h: g.hgt })

  /**
   * The tooltip for a pointer position, as the option's `tooltip` asks. The
   * hover itself (the highlight, the axis pointer) is tracked whether or not a
   * box shows.
   */
  const optionTooltip = (g: OptionGeometry, px: Double, py: Double, press: boolean): string[] | TooltipView | null => {
    const under = hitAt(g, px, py)
    const globalTip = (g.option as Record<string, unknown>)['tooltip']
    // A series' own `tooltip` refines the global one for its items (ECharts).
    const ownTip = under === null ? undefined : rawSeriesOf(g, under.seriesIndex)?.['tooltip']
    const spec = readTooltipOption(isRecord(ownTip) && (globalTip === undefined || isRecord(globalTip)) ? { ...(globalTip as Record<string, unknown> | undefined), ...ownTip } : globalTip, () => undefined)
    const axis = spec !== null && spec.trigger === 'axis'
    const index = axis ? axisIndexAt(g, px, py) : under === null ? -1 : under.dataIndex
    batch(() => {
      hoverIndex.set(index)
      hoverAt.set(index < 0 ? null : { x: px, y: py })
    })
    if (index < 0) return null
    // The prop alone (no `tooltip` component) keeps the plain default box.
    if (spec === null) {
      if (props.tooltip !== true || under === null) return null
      const f = firstSpec(g)
      const label = f?.spec.series[under.seriesIndex]?.label ?? `Series ${under.seriesIndex + 1}`
      return [under.name, `${label}: ${plain(under.value)}`]
    }
    if (!spec.show || !spec.showContent || spec.trigger === 'none' || props.tooltip === false) return null
    if (spec.triggerOn === 'none' || (spec.triggerOn === 'click' && !press)) return null
    const rows = axis
      ? (firstSpec(g)?.spec.series ?? []).map((_, si) => tooltipEntry(g, spec, si, index)).filter((e): e is NonNullable<typeof e> => e !== null)
      : [tooltipEntry(g, spec, under!.seriesIndex, under!.dataIndex)].filter((e): e is NonNullable<typeof e> => e !== null)
    if (rows.length === 0) return null
    const ordered = axis ? orderTooltipEntries(rows.map((r) => r.entry), spec.order, rows.map((r) => r.value)) : rows.map((r) => r.entry)
    const params = axis ? ordered.map((e) => rows.find((r) => r.entry === e)!.params) : rows[0]!.params
    const view: TooltipView = {
      place: placeFor(g, spec, axis ? null : itemRect(g, under!.seriesIndex, under!.dataIndex), params),
      confine: spec.confine || spec.position.kind === 'follow',
      css: spec.css,
      className: spec.className,
      enterable: spec.enterable,
      hideDelay: spec.hideDelay,
      keepOnLeave: spec.alwaysShowContent,
      transition: spec.transitionDuration,
    }
    const f = spec.formatter
    if (typeof f === 'string') return { ...view, html: tooltipBreaks(formatTooltipTemplate(f, ordered)).split('\n').join('<br/>') }
    if (typeof f === 'function') {
      const out = f(params)
      return { ...view, html: typeof out === 'string' ? out : String(out ?? '') }
    }
    // ECharts' own default content: a header, then a row per value (dot, name, bold value), numbers comma-grouped
    // unless a valueFormatter shaped them; the box edged in the series colour for an item, neutral for an axis.
    const shownOf = (e: TooltipEntry): string => (spec.valueFormatter === undefined ? tooltipNumber(rows.find((r) => r.entry === e)!.value) : e.value)
    const edge = `border-color:${axis ? '#b7b9be' : ordered[0]!.color};`
    // An unnamed series shows no name: no header on an item tooltip, no name on its axis row (ECharts' noHeader / noName).
    const nameOf = (e: TooltipEntry): string => (rows.find((r) => r.entry === e)!.named ? e.seriesName : '')
    const html = axis
      ? tooltipMarkup(ordered[0]!.name, ordered.map((e) => ({ color: e.color, name: nameOf(e), value: shownOf(e) })))
      : tooltipMarkup(nameOf(ordered[0]!), [{ color: ordered[0]!.color, name: ordered[0]!.name, value: shownOf(ordered[0]!) }])
    return { ...view, css: `${edge}${spec.css ?? ''}`, html }
  }

  /** The title link under a point, if any. */
  const titleLinkAt = (g: OptionGeometry, px: Double, py: Double): TitleLink | undefined =>
    g.titleLinks.find((l) => px >= l.rect.x && px <= l.rect.x + l.rect.w && py >= l.rect.y && py <= l.rect.y + l.rect.h)

  /** A click on a linked title opens it (ECharts' `title.link` / `sublink`); true when it landed on one. */
  const titleClickAt = (g: OptionGeometry, px: Double, py: Double): boolean => {
    const link = titleLinkAt(g, px, py)
    if (link === undefined) return false
    if (!isServer) window.open(link.url, link.target)
    return true
  }

  /** A click on a legend entry toggles its series (ECharts' `legend.selectedMode`); true when it landed on one. */
  const legendClickAt = (g: OptionGeometry, px: Double, py: Double): boolean => {
    if (g.plan.kind !== 'cartesian' || g.plan.compiled.legend === null) return false
    // A scrolling legend's arrows page it (a dimmed arrow has no page to go to).
    const pager = g.legendPager
    if (pager !== null && pager !== undefined) {
      const inside = (r: Rect): boolean => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
      const to = inside(pager.prev) ? pager.prevIndex : inside(pager.next) ? pager.nextIndex : undefined
      if (to !== undefined) {
        if (to !== null) legendScroll.set(to)
        return true
      }
    }
    const i = legendHitIndex(g.legendBoxes, px, py)
    const entry = g.plan.compiled.legend[i]
    if (entry === undefined) return false
    const names = g.plan.compiled.legend.map((e) => e.label)
    const next = legendClick(legendHidden(), entry.label, names, g.plan.compiled.legendMode ?? 'multiple')
    if (next === legendHidden()) return true
    legendHidden.set(next)
    const selected: Record<string, boolean> = {}
    for (const n of names) selected[n] = !next.includes(n)
    props.onLegendSelectChange?.(selected)
    return true
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
    const view = zoomedView(compiled, compiledCommands(compiled, g.option, g.measure).chrome, winOf(compiled))
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
      legendHidden()
      zoomWin()
    },
    layout: (box, measure) => {
      const g = cartesian(box.w, box.h, measure)
      lastGeometry = g
      lastZoom = g.plan.kind === 'cartesian' ? g.plan.compiled.zoom : undefined
      return g
    },
    render: (g, _measure, _theme, progress, time) => {
      const band = selectBand()
      if (band === null || g.zoom === null) return stateCmds(g, time, progress)
      const out = stateCmds(g, time, progress).slice()
      for (const c of renderBrushBand(g.zoom.plot, Math.min(band.a, band.b), Math.max(band.a, band.b), '#6366f1')) out.push(c)
      return out
    },
    // The entrance plays through the engine's own `progress` (bars grow, lines draw on), timed by the option's `animation*` keys.
    animates: true,
    // ECharts' per-series `cursor` over an item; 'pointer' is its default.
    cursor: (g, px, py) => {
      if (titleLinkAt(g, px, py) !== undefined) return 'pointer'
      const under = hitAt(g, px, py)
      if (under === null) return ''
      const own = rawSeriesOf(g, under.seriesIndex)?.['cursor']
      return typeof own === 'string' ? own : 'pointer'
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
          const chrome = compiledCommands(g.plan.compiled, g.option, g.measure).chrome
          const top = chrome.top
          const plot = layoutChart(zoomedView(g.plan.compiled, chrome, winOf(g.plan.compiled)).spec, g.measure).plot
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
        // The brush move handle rides 6.5px above the strip; pressing it drags the window, as in ECharts.
        if (px < r.x - 8.0 || px > r.x + r.w + 8.0 || py < r.y - 8.0 || py > r.y + r.h + 4.0) return false
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
      if (titleClickAt(g, px, py)) return
      if (legendClickAt(g, px, py)) return
      const h1 = hitAt(g, px, py)
      const pin = pinMode(g)
      // `series` pins the whole series the hit belongs to; the other modes pin the datum.
      if (pin === 'series' && h1 !== null) pinnedSeries.set(pinSelection(pinnedSeries(), h1.seriesIndex, true))
      else if (pin !== undefined && h1 !== null) pinned.set(pinSelection(pinned(), h1.dataIndex, pin === 'multiple'))
      props.onSelect?.(h1)
      props.onSelectIndex?.(h1 === null ? -1 : h1.dataIndex)
    },
    leave: () =>
      batch(() => {
        hoverIndex.set(-1)
        hoverAt.set(null)
      }),
    tooltip: (g, px, py, _theme, press) => optionTooltip(g, px, py, press),
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
      const p = categoryPoints(f.spec, invertCategories(f.spec).series[0]!.values, plot, seriesDomain(s, f.spec, resolveYDomain(f.spec), resolveY2Domain(f.spec)))[vi]
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
  return h('div', { style: 'position:relative', 'data-pyreon-step': () => String(stepIndex() ?? -1), ref: (el: HTMLDivElement | null) => { rootEl = el } }, canvasSlot, layerSlot, svgNode, hostSlot, barSlot, dataViewSlot)
}
