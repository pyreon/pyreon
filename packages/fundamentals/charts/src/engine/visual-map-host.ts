// The interactive visualMap on a canvas host: the strip beside the chart, its
// handles dragged and pieces toggled, and the selection handed to the value
// renderer. Heatmap, calendar and map hosts share it, so one gesture model
// serves every family that colours by value.

import { signal } from '@pyreon/reactivity'
import type { DrawCmd, Double, Domain, Rect } from './types'
import { visualSelectionOptions, visualStripOf } from './visual-map'
import type { VisualMapSpec } from './visual-map'
import {
  renderVisualStrip,
  visualStripDrag,
  visualStripHandleAt,
  visualStripPieceAt,
  visualStripPlace,
  visualStripToggle,
  visualStripValueAt,
} from './visual-strip'

/** What a selection change reports: the continuous range, or the per-piece selection. */
export interface VisualMapSelection {
  range: [Double, Double]
  selected: boolean[]
}

export interface VisualMapHost {
  /** The spec with the user's live selection applied, or undefined without a visualMap. */
  current: () => VisualMapSpec | undefined
  /** The chart's box after reserving the strip's space (right of the chart when vertical, below when horizontal). */
  chartBox: (box: Rect) => Rect
  /** The strip's commands for the host box. */
  cmds: (box: Rect) => DrawCmd[]
  /** Renderer options for the selection (`inRange` / `outBands` / `outColor`), plus the value domain. */
  selection: () => { domain?: Domain; inRange?: Domain; outBands?: Double[]; outColor?: string }
  /** A press on a handle starts a drag. */
  start: (box: Rect, px: Double, py: Double) => boolean
  move: (box: Rect, px: Double, py: Double) => void
  end: () => void
  /** A click on a piece toggles it; true when the click was the strip's. */
  click: (box: Rect, px: Double, py: Double) => boolean
  /** Read by the host's `track`, so a gesture repaints. */
  track: () => void
}

export function visualMapHost(
  read: () => VisualMapSpec | undefined,
  onChange?: (selection: VisualMapSelection) => void,
): VisualMapHost {
  const range = signal<[Double, Double] | null>(null)
  const selected = signal<boolean[] | null>(null)
  let handle = -1.0
  const current = (): VisualMapSpec | undefined => {
    const spec = read()
    if (spec === undefined) return undefined
    return { ...spec, range: range() ?? spec.range, selected: selected() ?? spec.selected }
  }
  const stripAt = (spec: VisualMapSpec, box: Rect): { x: Double; y: Double } => {
    const at = visualStripPlace(visualStripOf(spec), box.w, box.h).at
    return { x: box.x + at.x, y: box.y + at.y }
  }
  const report = (spec: VisualMapSpec): void => onChange?.({ range: spec.range, selected: spec.selected })
  return {
    current,
    chartBox: (box) => {
      const spec = current()
      if (spec === undefined) return box
      const place = visualStripPlace(visualStripOf(spec), box.w, box.h)
      return { x: box.x, y: box.y, w: place.chartW, h: place.chartH }
    },
    cmds: (box) => {
      const spec = current()
      if (spec === undefined) return []
      return renderVisualStrip(visualStripOf(spec), stripAt(spec, box), { min: spec.range[0], max: spec.range[1] }, spec.selected)
    },
    selection: () => {
      const spec = current()
      if (spec === undefined) return {}
      return { domain: { min: spec.domain[0], max: spec.domain[1] }, ...visualSelectionOptions(spec) }
    },
    start: (box, px, py) => {
      const spec = current()
      if (spec === undefined) return false
      handle = visualStripHandleAt(visualStripOf(spec), stripAt(spec, box), { min: spec.range[0], max: spec.range[1] }, px, py)
      return handle >= 0.0
    },
    move: (box, px, py) => {
      const spec = current()
      if (spec === undefined || handle < 0.0) return
      const strip = visualStripOf(spec)
      const v = visualStripValueAt(strip, stripAt(spec, box), px, py)
      const next = visualStripDrag(strip, { min: spec.range[0], max: spec.range[1] }, handle, v)
      range.set([next.min, next.max])
      report({ ...spec, range: [next.min, next.max] })
    },
    end: () => {
      handle = -1.0
    },
    click: (box, px, py) => {
      const spec = current()
      if (spec === undefined) return false
      const strip = visualStripOf(spec)
      const i = visualStripPieceAt(strip, stripAt(spec, box), px, py)
      if (i < 0.0) return false
      const next = visualStripToggle(strip, spec.selected, i)
      selected.set(next)
      report({ ...spec, selected: next })
      return true
    },
    track: () => {
      read()
      range()
      selected()
    },
  }
}
