// `<CalendarChart>` — a GitHub-style contribution calendar on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { calendarDomain, hitCalendarIndex, layoutCalendar, renderCalendar } from './calendar'
import { calendarValues, hitCalendar } from './calendar-web'
import type { CalendarCell, CalendarLayout, CalendarOptions } from './calendar'
import { plain } from './format'
import type { Double, Rect } from './types'
import type { VisualMapSpec } from './visual-map'
import { visualMapHost } from './visual-map-host'
import type { VisualMapSelection } from './visual-map-host'

export interface CalendarChartProps extends CanvasHostProps {
  /** ISO dates, inclusive. */
  start: string
  end: string
  values: Record<string, Double> | (() => Record<string, Double>)
  calendar?: CalendarOptions
  /** `'vertical'` lays the chart out top-to-bottom — the horizontal layout reflected across the diagonal (ECharts `orient` / `layout`). */
  orient?: 'horizontal' | 'vertical'
  /** Fired with the day cell under the click, or null for a miss. */
  onSelect?: (cell: CalendarCell | null) => void
  /** The cell's INDEX under the click (into the layout's cells), or -1 — the multiplatform-safe twin of `onSelect`. */
  onSelectIndex?: (index: number) => void
  /**
   * An ECharts-style visualMap beside the chart: its domain drives the ramp,
   * a `calculable` strip's handles drag the in-range interval and a piecewise
   * strip's swatches toggle; values outside the selection take the inactive colour.
   */
  visualMap?: VisualMapSpec | (() => VisualMapSpec | undefined) | undefined
  /** Fired as the visualMap selection changes. */
  onVisualMapChange?: (selection: VisualMapSelection) => void
}

export function CalendarChart(props: CalendarChartProps): VNode {
  const readValues = (): Record<string, Double> => (typeof props.values === 'function' ? props.values() : props.values)
  const vm = visualMapHost(
    () => (typeof props.visualMap === 'function' ? props.visualMap() : props.visualMap),
    (sel) => props.onVisualMapChange?.(sel),
  )
  let outer: Rect = { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }
  const dragSpec = {
    start: (_l: unknown, px: Double, py: Double) => vm.start(outer, px, py),
    move: (_l: unknown, px: Double, py: Double) => vm.move(outer, px, py),
    end: () => vm.end(),
  }
  return canvasHost<CalendarLayout>({
    drag: dragSpec,
    props,
    transpose: () => props.orient === 'vertical',
    defaultHeight: 140,
    caption: 'Calendar data',
    track: () => {
      readValues()
      vm.track()
    },
    layout: (rawBox, _measure, theme) => {
      outer = rawBox
      const box = vm.chartBox(rawBox)
      return layoutCalendar(props.start, props.end, { x: box.x + 4.0, y: box.y + 4.0, w: box.w - 8.0, h: box.h - 8.0 }, { labelColor: theme.label, emptyColor: theme.muted, stops: theme.ramp, ...props.calendar })
    },
    animates: true,
    render: (layout, _measure, theme, progress) => {
      const spec = vm.current()
      const cmds = renderCalendar(layout, calendarValues(readValues()), { labelColor: theme.label, emptyColor: theme.muted, stops: spec?.stops ?? theme.ramp, ...props.calendar, ...vm.selection(), progress })
      for (const c of vm.cmds(outer)) cmds.push(c)
      return cmds
    },
    select: (layout, px, py) => {
      if (vm.click(outer, px, py)) return
      props.onSelect?.(hitCalendar(layout, px, py))
      props.onSelectIndex?.(hitCalendarIndex(layout, px, py))
    },
    // The keyboard walks the days WITH data (what the accessible table lists).
    pick: (layout, i) => {
      const values = readValues()
      const cell = layout.cells.filter((c) => values[c.date] !== undefined)[i]
      if (cell === undefined) return
      props.onSelect?.(cell)
      props.onSelectIndex?.(layout.cells.indexOf(cell))
    },
    focusRect: (layout, i) => {
      const values = readValues()
      return layout.cells.filter((c) => values[c.date] !== undefined)[i]?.rect ?? null
    },
    tooltip: (layout, px, py) => {
      const c = hitCalendar(layout, px, py)
      if (c === null) return null
      const v = readValues()[c.date]
      return v === undefined ? [c.date] : [c.date, plain(v)]
    },
    a11y: (layout) => {
      const values = readValues()
      const withData = layout.cells.filter((c) => values[c.date] !== undefined)
      const dom = calendarDomain(layout, calendarValues(values))
      return {
        title: props.title,
        categories: withData.map((c) => c.date),
        series: [{ label: props.title ?? `${props.start} to ${props.end} (${dom.min} to ${dom.max})`, values: withData.map((c) => values[c.date]!), kind: 'bars' }],
      }
    },
  })
}
