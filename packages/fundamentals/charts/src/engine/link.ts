// Linked charts (ECharts `connect`): a pair of shared signals that any number
// of `<PlotChart link>` hosts read and write IN PLACE of their private zoom
// window and crosshair datum. No bus, no registry, no unsubscribe — a host
// that unmounts just stops reading, so there is nothing module-level to leak.

import { signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import type { ZoomWindow } from './zoom'

export interface ChartLink {
  /** The shared dataZoom window; null = everything. */
  zoom: Signal<ZoomWindow | null>
  /** The shared crosshair datum index; -1 = no hover. */
  hover: Signal<number>
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
