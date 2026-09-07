// `<CalendarChart>` — a GitHub-style contribution calendar on a canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { calendarDomain, layoutCalendar, renderCalendar } from './calendar'
import { calendarValues, hitCalendar } from './calendar-web'
import type { CalendarCell, CalendarLayout, CalendarOptions } from './calendar'
import { plain } from './format'
import type { Double } from './types'

export interface CalendarChartProps extends CanvasHostProps {
  /** ISO dates, inclusive. */
  start: string
  end: string
  values: Record<string, Double> | (() => Record<string, Double>)
  calendar?: CalendarOptions
  /** Fired with the day cell under the click, or null for a miss. */
  onSelect?: (cell: CalendarCell | null) => void
}

export function CalendarChart(props: CalendarChartProps): VNode {
  const readValues = (): Record<string, Double> => (typeof props.values === 'function' ? props.values() : props.values)
  return canvasHost<CalendarLayout>({
    props,
    defaultHeight: 140,
    caption: 'Calendar data',
    track: () => {
      readValues()
    },
    layout: (box) => layoutCalendar(props.start, props.end, { x: box.x + 4.0, y: box.y + 4.0, w: box.w - 8.0, h: box.h - 8.0 }, props.calendar),
    render: (layout) => renderCalendar(layout, calendarValues(readValues()), props.calendar),
    select: (layout, px, py) => {
      props.onSelect?.(hitCalendar(layout, px, py))
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
