// Linked charts (ECharts `connect`) and the imperative handle (ECharts
// `dispatchAction`): shared signals that any number of `<PlotChart>` hosts read
// and write IN PLACE of their private state. No bus, no registry, no
// unsubscribe — a host that unmounts just stops reading, so there is nothing
// module-level to leak.

import { batch, signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import { legendToggle } from './legend-toggle'
import { clampWindow, isFullWindow } from './zoom'
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
 * of the data (a full window reads back as null); `restore` clears all four.
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

export interface ChartHandle extends ChartLink {
  /** Pinned datums (GLOBAL indices), in selection order. */
  selected: Signal<number[]>
  /** Hidden series, by mark index — what a legend click toggles. */
  hidden: Signal<number[]>
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

const without = (xs: number[], i: number): number[] => xs.filter((x) => x !== i)

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
  const dispatch = (a: ChartAction): void =>
    batch(() => {
      switch (a.type) {
        case 'highlight':
          hover.set(a.index)
          break
        case 'downplay':
          hover.set(-1)
          break
        case 'select':
          if (!selected().includes(a.index)) selected.set([...selected(), a.index])
          break
        case 'unselect':
          if (selected().includes(a.index)) selected.set(without(selected(), a.index))
          break
        case 'toggleSelect':
          selected.set(selected().includes(a.index) ? without(selected(), a.index) : [...selected(), a.index])
          break
        case 'legendSelect':
          if (hidden().includes(a.series)) hidden.set(without(hidden(), a.series))
          break
        case 'legendUnselect':
          if (!hidden().includes(a.series)) hidden.set([...hidden(), a.series])
          break
        case 'legendToggle':
          hidden.set(legendToggle(hidden(), a.series))
          break
        case 'dataZoom': {
          const w = clampWindow({ start: a.start, end: a.end })
          zoom.set(isFullWindow(w) ? null : w)
          break
        }
        case 'restore':
          zoom.set(null)
          hover.set(-1)
          selected.set([])
          hidden.set([])
          break
      }
    })
  return { zoom, hover, selected, hidden, dispatch }
}
