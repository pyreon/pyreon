// Linked charts (ECharts `connect`) and the imperative handle (ECharts
// `dispatchAction`): shared signals that any number of `<PlotChart>` hosts read
// and write IN PLACE of their private state. No bus, no registry, no
// unsubscribe — a host that unmounts just stops reading, so there is nothing
// module-level to leak.

import { batch, signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import { applyChartAction, chartAction } from './chart-actions'
import type { ChartActionInput, ChartActionState } from './chart-actions'
import type { BrushArea } from './brush-area'
import type { ZoomWindow } from './zoom'

export interface ChartLink {
  /** The shared dataZoom window; null = everything. */
  zoom: Signal<ZoomWindow | null>
  /** The shared crosshair datum index; -1 = no hover. */
  hover: Signal<number>
}

/**
 * An action for `ChartHandle.dispatch` — ECharts' `dispatchAction` vocabulary
 * in Pyreon's index spaces. `highlight` takes a VISIBLE-row index (the
 * crosshair's space; -1 clears, as `downplay` does); `select` / `unselect` /
 * `toggleSelect` take the GLOBAL datum index `onSelect` reports; the legend
 * actions take a series (mark) index; `dataZoom` takes the window as fractions
 * of the data (a full window reads back as null); `restore` clears zoom, hover,
 * selection, legend and brush areas; `takeGlobalCursor` / `brush` drive the area
 * brush and `timelineChange` / `timelinePlayChange` an `OptionChart` timeline.
 */
export type ChartAction =
  | { type: 'highlight'; index: number }
  | { type: 'downplay' }
  | { type: 'select'; index: number }
  | { type: 'unselect'; index: number }
  | { type: 'toggleSelect'; index: number }
  | { type: 'legendSelect'; series: number }
  | { type: 'legendUnselect'; series: number }
  | { type: 'legendToggle'; series: number }
  | { type: 'dataZoom'; start: number; end: number }
  | { type: 'restore' }
  /** ECharts' tooltip actions in this engine's terms: the crosshair datum (same space as `highlight`). */
  | { type: 'showTip'; index: number }
  | { type: 'hideTip' }
  /** Show every series. */
  | { type: 'legendAllSelect' }
  /** Flip every series; `count` overrides the bound chart's series count (needed with no chart bound). */
  | { type: 'legendInverseSelect'; count?: number }
  /** Arm the area brush with a type ('' disarms) — ECharts' `takeGlobalCursor` with `brushOption.brushType`. */
  | { type: 'takeGlobalCursor'; brushType: '' | 'rect' | 'polygon' | 'lineX' | 'lineY' }
  /** Show these brush areas (plot pixels; `[]` clears) — ECharts' `brush` action. */
  | { type: 'brush'; areas: BrushArea[] }
  /** Jump an `OptionChart` timeline to a step. */
  | { type: 'timelineChange'; index: number }
  /** Play or pause an `OptionChart` timeline. */
  | { type: 'timelinePlayChange'; playing: boolean }

export interface ChartHandle extends ChartLink {
  /** Pinned datums (GLOBAL indices), in selection order. */
  selected: Signal<number[]>
  /** Hidden series, by mark index — what a legend click toggles. */
  hidden: Signal<number[]>
  /** The bound chart's series count, kept by the chart (0 until one binds) — what `legendInverseSelect` flips over. */
  seriesCount: Signal<number>
  /** The area brush's armed type ('' = none) and its areas — what `takeGlobalCursor` and `brush` move. */
  brushType: Signal<string>
  brushAreas: Signal<BrushArea[]>
  /** An `OptionChart` timeline's step (-1 = the option's own) and play state (null = the option's autoPlay). */
  step: Signal<number>
  playing: Signal<boolean | null>
  /** Apply an action; every write lands in one batch, so the chart repaints once. */
  dispatch(action: ChartAction): void
}

/**
 * Create a link and hand the SAME object to every chart in the group.
 *
 * @example
 * const link = createChartLink()
 * <PlotChart data={price} marks={[line(d => d.close)]} dataZoom crosshair link={link} />
 * <PlotChart data={volume} marks={[bar(d => d.volume)]} dataZoom crosshair link={link} />
 */
export function createChartLink(): ChartLink {
  return { zoom: signal<ZoomWindow | null>(null), hover: signal(-1) }
}


/**
 * Create a handle: a link plus selection, legend state and `dispatch`. Pass it
 * as `handle` to ONE chart — its signals then ARE that chart's state, so
 * `handle.selected()` reads the chart — and as `link` to any sibling that
 * should share the window and crosshair with it.
 *
 * @example
 * const chart = createChartHandle()
 * <PlotChart data={rows} marks={[bars(d => d.v)]} handle={chart} selectedMode="multiple" />
 * <button onClick={() => chart.dispatch({ type: 'select', index: 2 })}>Pin March</button>
 * <button onClick={() => chart.dispatch({ type: 'restore' })}>Reset</button>
 */
export function createChartHandle(): ChartHandle {
  const zoom = signal<ZoomWindow | null>(null)
  const hover = signal(-1)
  const selected = signal<number[]>([])
  const hidden = signal<number[]>([])
  const seriesCount = signal(0)
  const brushType = signal('')
  const brushAreas = signal<BrushArea[]>([])
  const step = signal(-1)
  const playing = signal<boolean | null>(null)
  // One reducer for every target (`chart-actions.ts`): read the state, apply, write back only what moved.
  const dispatch = (a: ChartAction): void => {
    const z = zoom.peek()
    const before: ChartActionState = {
      zoom: z ?? { start: 0.0, end: 1.0 },
      hover: hover.peek(),
      selected: selected.peek(),
      hidden: hidden.peek(),
      seriesCount: seriesCount.peek(),
      brushType: brushType.peek(),
      areas: brushAreas.peek(),
      step: step.peek(),
      playing: playing.peek() === true,
    }
    const after = applyChartAction(before, toActionInput(a))
    batch(() => {
      if (after.zoom !== before.zoom) zoom.set(after.zoom.start <= 0.0 && after.zoom.end >= 1.0 ? null : after.zoom)
      if (after.hover !== before.hover) hover.set(after.hover)
      if (after.selected !== before.selected) selected.set(after.selected)
      if (after.hidden !== before.hidden) hidden.set(after.hidden)
      if (after.brushType !== before.brushType) brushType.set(after.brushType)
      if (after.areas !== before.areas) brushAreas.set(after.areas)
      if (after.step !== before.step) step.set(after.step)
      if (a.type === 'timelinePlayChange') playing.set(a.playing)
    })
  }
  return { zoom, hover, selected, hidden, seriesCount, brushType, brushAreas, step, playing, dispatch }
}

/** A typed action as the reducer's flat record. */
export function toActionInput(a: ChartAction): ChartActionInput {
  const base = chartAction(a.type)
  switch (a.type) {
    case 'highlight':
    case 'showTip':
    case 'select':
    case 'unselect':
    case 'toggleSelect':
    case 'timelineChange':
      return { ...base, index: a.index }
    case 'legendSelect':
    case 'legendUnselect':
    case 'legendToggle':
      return { ...base, series: a.series }
    case 'legendInverseSelect':
      return { ...base, series: a.count ?? -1 }
    case 'dataZoom':
      return { ...base, start: a.start, end: a.end }
    case 'takeGlobalCursor':
      return { ...base, brushType: a.brushType }
    case 'brush':
      return { ...base, areas: a.areas }
    case 'timelinePlayChange':
      return { ...base, playing: a.playing }
    default:
      return base
  }
}
