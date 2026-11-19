/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the live region is an <output>; the toolbar's view switch is a group of buttons with aria-pressed */
import type { VNodeChild } from '@pyreon/core'
import type { Calendar, DayCell } from './calendar-types'
import { DEFAULT_LABELS } from './labels'
import type { CalendarLabels } from './labels'
import { MonthView } from './month-view'
import type { MonthViewProps, ViewProps } from './month-view'
import { TimeGridView } from './timegrid-view'
import type { ViewName } from './views'

export type { CalendarLabels } from './labels'
export { MonthView } from './month-view'
export type { EventSlotContext, MonthViewProps, ViewProps } from './month-view'
export { TimeGridView } from './timegrid-view'
export type { DayCell }

/** Hidden from sight, still read by screen readers. */
const VISUALLY_HIDDEN = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0'

type Slots<Meta> = Pick<ViewProps<Meta>, 'renderEvent' | 'renderDay' | 'renderMore'> & Pick<MonthViewProps<Meta>, 'onMore'>

export interface CalendarViewProps<Meta = unknown> extends Slots<Meta> {
  calendar: Calendar<Meta>
  /** Words to replace (for a translation). */
  labels?: Partial<CalendarLabels>
  class?: string
}

const merged = (labels: Partial<CalendarLabels> | undefined): CalendarLabels => ({ ...DEFAULT_LABELS, ...labels, views: { ...DEFAULT_LABELS.views, ...labels?.views } })

/** The time grid of the week: use it with `view: 'week'` (or 'workWeek'); it shows the dates the calendar's window has. */
export function WeekView<Meta = unknown>(props: CalendarViewProps<Meta>): VNodeChild {
  return <TimeGridView {...props} labels={merged(props.labels)} />
}

/** The time grid of one day (or `days(n)` days): the same view as `WeekView` with the window of the calendar's `day` view. */
export function DayView<Meta = unknown>(props: CalendarViewProps<Meta>): VNodeChild {
  return <TimeGridView {...props} labels={merged(props.labels)} />
}

export interface CalendarToolbarProps<Meta = unknown> {
  calendar: Calendar<Meta>
  /** The views the switch offers, in order. Default month, week and day; an empty list hides the switch. */
  views?: readonly ViewName[]
  labels?: Partial<CalendarLabels>
  class?: string
}

/** The title with Today, Previous and Next buttons and an optional switch of the view (buttons, `aria-pressed`). */
export function CalendarToolbar<Meta = unknown>(props: CalendarToolbarProps<Meta>): VNodeChild {
  const calendar = props.calendar
  const labels = merged(props.labels)
  const views = props.views ?? (['month', 'week', 'day'] as const)

  return (
    <div class={props.class ?? 'pcal-toolbar'} role="toolbar" aria-label={labels.monthGrid}>
      <div class="pcal-nav">
        <button type="button" class="pcal-btn pcal-today" onClick={() => calendar.today()}>
          {labels.today.charAt(0).toUpperCase() + labels.today.slice(1)}
        </button>
        <button type="button" class="pcal-btn pcal-prev" aria-label={labels.previous} onClick={() => calendar.previous()}>
          <span aria-hidden="true">‹</span>
        </button>
        <button type="button" class="pcal-btn pcal-next" aria-label={labels.next} onClick={() => calendar.next()}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <h2 class="pcal-title">{() => calendar.title()}</h2>
      {views.length === 0 ? null : (
        <div class="pcal-views" role="group">
          {views.map((view) => (
            <button type="button" class="pcal-btn pcal-view" data-view={view} aria-pressed={() => (calendar.view() === view ? 'true' : 'false')} onClick={() => calendar.setView(view)}>
              {labels.views[view] ?? view}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface CalendarProps<Meta = unknown> extends CalendarViewProps<Meta> {
  /** Render the toolbar above the view. Default true. */
  toolbar?: boolean
  /** The views of the toolbar's switch. */
  views?: readonly ViewName[]
}

/**
 * The calendar: an optional toolbar, the view the calendar is on (the month grid, or the time grid of a week, work week, day
 * or days), and a polite live region that says where navigation went ("December 2026, month"). The agenda, year and timeline
 * views are not part of this release: `<Calendar>` shows the month for them.
 */
export function Calendar<Meta = unknown>(props: CalendarProps<Meta>): VNodeChild {
  const labels = merged(props.labels)
  const calendar = props.calendar
  const shared = { calendar, labels, ...(props.renderEvent === undefined ? {} : { renderEvent: props.renderEvent }), ...(props.renderDay === undefined ? {} : { renderDay: props.renderDay }), ...(props.renderMore === undefined ? {} : { renderMore: props.renderMore }) }

  return (
    <div class={props.class ?? 'pcal'} data-view={() => calendar.view()}>
      {props.toolbar === false ? null : <CalendarToolbar calendar={calendar} labels={labels} {...(props.views === undefined ? {} : { views: props.views })} />}
      {() => {
        const view = calendar.view()

        return view === 'week' || view === 'workWeek' || view === 'day' || view === 'days' ? <TimeGridView {...shared} /> : <MonthView {...shared} {...(props.onMore === undefined ? {} : { onMore: props.onMore })} />
      }}
      <output class="pcal-live" style={VISUALLY_HIDDEN} aria-live="polite" aria-atomic="true">
        {() => calendar.announcement()}
      </output>
    </div>
  )
}
