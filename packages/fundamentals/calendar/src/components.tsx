/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the live region is an <output>; the toolbar's view switch is a group of buttons with aria-pressed */
import type { VNodeChild } from '@pyreon/core'
import type { Calendar, DayCell } from './calendar-types'
import type { PlainDate } from './types'
import type { CalendarMessages } from './messages'
import { AgendaView } from './agenda-view'
import { MonthView } from './month-view'
import type { MonthViewProps, ViewProps } from './month-view'
import { DayPopover } from './popover'
import type { PopoverState } from './popover'
import { TimeGridView } from './timegrid-view'
import { TimelineView } from './timeline-view'
import { YearView } from './year-view'
import { signal } from '@pyreon/reactivity'
import type { ViewName } from './views'

export type { CalendarMessages } from './messages'
export { MonthView } from './month-view'
export type { EventSlotContext, MonthViewProps, ViewProps } from './month-view'
export { AgendaView } from './agenda-view'
export { DayPopover } from './popover'
export { TimeGridView } from './timegrid-view'
export { TimelineView } from './timeline-view'
export type { TimelineViewProps } from './timeline-view'
export { YearView } from './year-view'
export type { YearViewProps } from './year-view'
export type { DayCell }

/** Hidden from sight, still read by screen readers. */
const VISUALLY_HIDDEN = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0'

type Slots<Meta> = Pick<ViewProps<Meta>, 'renderEvent' | 'renderDay' | 'renderMore'> & Pick<MonthViewProps<Meta>, 'onMore'>

export interface CalendarViewProps<Meta = unknown> extends Slots<Meta> {
  calendar: Calendar<Meta>
  class?: string
}

/** The time grid of the week: use it with `view: 'week'` (or 'workWeek'); it shows the dates the calendar's window has. */
export function WeekView<Meta = unknown>(props: CalendarViewProps<Meta>): VNodeChild {
  return <TimeGridView {...props} />
}

/** The time grid of one day (or `days(n)` days): the same view as `WeekView` with the window of the calendar's `day` view. */
export function DayView<Meta = unknown>(props: CalendarViewProps<Meta>): VNodeChild {
  return <TimeGridView {...props} />
}

export interface CalendarToolbarProps<Meta = unknown> {
  calendar: Calendar<Meta>
  /** The views the switch offers, in order. Default month, week and day; an empty list hides the switch. */
  views?: readonly ViewName[]
  class?: string
}

/** The title with Today, Previous and Next buttons and an optional switch of the view (buttons, `aria-pressed`). */
export function CalendarToolbar<Meta = unknown>(props: CalendarToolbarProps<Meta>): VNodeChild {
  const calendar = props.calendar
  const text = (): CalendarMessages => calendar.messages()
  const views = props.views ?? (['month', 'week', 'day'] as const)

  return (
    <div class={props.class ?? 'pcal-toolbar'} role="toolbar" aria-label={() => text().monthGrid}>
      <div class="pcal-nav">
        <button type="button" class="pcal-btn pcal-today" onClick={() => calendar.today()}>
          {() => text().today}
        </button>
        <button type="button" class="pcal-btn pcal-prev" aria-label={() => text().previous(calendar.view())} onClick={() => calendar.previous()}>
          <span aria-hidden="true">‹</span>
        </button>
        <button type="button" class="pcal-btn pcal-next" aria-label={() => text().next(calendar.view())} onClick={() => calendar.next()}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <h2 class="pcal-title">{() => calendar.title()}</h2>
      {views.length === 0 ? null : (
        <div class="pcal-views" role="group">
          {views.map((view) => (
            <button type="button" class="pcal-btn pcal-view" data-view={view} aria-pressed={() => (calendar.view() === view ? 'true' : 'false')} onClick={() => calendar.setView(view)}>
              {() => text().views[view] ?? view}
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
  /** The "+N more" popover (default true); `false` leaves `onMore` to you. */
  moreDialog?: boolean
  /** A day of the year view was chosen. Default: show that day in the day view. */
  onDayClick?: (date: PlainDate) => void
  /** The timeline's row windowing (see `TimelineViewProps.windowed`): `true`, `false`, or the resource count above which it windows. Default 100. */
  windowed?: boolean | number
}

/**
 * The calendar: an optional toolbar, the view the calendar is on (the month grid; the time grid of a week, work week, day or
 * days; the agenda; the year; the resource timeline), the "+N more" popover of the month, and a polite live region that says
 * where navigation went ("December 2026, month").
 */
export function Calendar<Meta = unknown>(props: CalendarProps<Meta>): VNodeChild {
  const calendar = props.calendar
  const shared = { calendar, ...(props.renderEvent === undefined ? {} : { renderEvent: props.renderEvent }), ...(props.renderDay === undefined ? {} : { renderDay: props.renderDay }), ...(props.renderMore === undefined ? {} : { renderMore: props.renderMore }) }
  const popover = signal<PopoverState | null>(null)
  let root: HTMLElement | null = null

  const openMore = (date: PlainDate, anchor: HTMLElement): void => {
    if (props.onMore !== undefined) props.onMore(date, anchor)
    if (props.moreDialog === false || root === null) return
    const box = root.getBoundingClientRect()
    const at = anchor.getBoundingClientRect()
    const width = 280
    popover.set({ date, anchor, left: Math.max(0, Math.min(at.left - box.left, box.width - width)), top: at.bottom - box.top + 4 })
  }
  const dayClick = (date: PlainDate): void => {
    if (props.onDayClick !== undefined) return props.onDayClick(date)
    calendar.goTo(date)
    calendar.setView('day')
  }

  return (
    <div
      class={props.class ?? 'pcal'}
      data-view={() => calendar.view()}
      ref={(el: HTMLElement | null) => {
        root = el
      }}
    >
      {props.toolbar === false ? null : <CalendarToolbar calendar={calendar} {...(props.views === undefined ? {} : { views: props.views })} />}
      {() => {
        // a view that changes also closes the popover
        const view = calendar.view()
        popover.set(null)
        if (view === 'agenda') return <AgendaView {...shared} />
        if (view === 'year') return <YearView {...shared} onDayClick={dayClick} />
        if (view === 'timeline') return <TimelineView {...shared} {...(props.windowed === undefined ? {} : { windowed: props.windowed })} />
        if (view === 'week' || view === 'workWeek' || view === 'day' || view === 'days') return <TimeGridView {...shared} />

        return <MonthView {...shared} onMore={openMore} />
      }}
      {() => {
        const open = popover()

        return open === null ? null : <DayPopover calendar={calendar} state={open} view={shared} onClose={() => popover.set(null)} />
      }}
      <output class="pcal-live" style={VISUALLY_HIDDEN} aria-live="polite" aria-atomic="true">
        {() => calendar.announcement()}
      </output>
    </div>
  )
}
