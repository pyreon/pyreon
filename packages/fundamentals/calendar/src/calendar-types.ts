import type { BusinessCalendar, WorkingHours } from '@pyreon/schedule/core'
import type { Duration, PlainTime } from '@pyreon/time/core'
import type { Signal } from '@pyreon/reactivity'
import type { CalendarEvent, EventOccurrence, Interval, PlainDate, PlainDateTime, TimedBlock, TimeZone, Weekday, WeekLayout } from './types'
import type { CalendarMessages } from './messages'
import type { ViewName } from './views'

/** The selection: a day or a range of days (all-day), or a range of time in a day. `end` is exclusive. */
export interface Selection {
  start: PlainDate | PlainDateTime
  end: PlainDate | PlainDateTime
  allDay: boolean
}

export interface CalendarOptions<Meta = unknown> {
  /** The events: read reactively; the calendar never changes the array or the events. */
  events: () => readonly CalendarEvent<Meta>[]
  /** The view: a value (uncontrolled; `setView` changes it) or a signal you own (controlled). Default `'month'`. */
  view?: Signal<ViewName> | ViewName
  /** The anchor date: a value, or a signal you own. Default: today in the display zone. */
  date?: Signal<PlainDate> | PlainDate
  /** How many days the `'days'` view shows. Default 3. */
  days?: number
  /** The display zone and the locale. Default: the ambient ones (`@pyreon/ambient`). */
  timeZone?: () => TimeZone
  locale?: () => string
  /** Default: the locale's. */
  weekStart?: Weekday
  weekend?: readonly Weekday[]
  hiddenDays?: readonly Weekday[]
  /** The visible hours of a day, and the size of a slot (30 minutes by default). */
  dayStart?: PlainTime
  dayEnd?: PlainTime | '24:00'
  slot?: Duration
  /** The shortest a block is drawn, in minutes. Default 15. */
  minBlockMinutes?: number
  /** Opening hours to shade in the time grid. */
  businessHours?: WorkingHours | BusinessCalendar
  /** Segments per week row of the month before "+N more". Default 3. */
  monthCapacity?: number
  /** Whether a click or a key on an empty day or slot selects. Default true. */
  selectable?: boolean
  /** The words the calendar says: replace any of them (an object, or a function of the locale that can read your translation signals). */
  messages?: Partial<CalendarMessages> | ((locale: string) => Partial<CalendarMessages>)
  /** The clock for the "now" line, in milliseconds. Default: `@pyreon/ambient`'s, a reactive minute tick. */
  now?: () => number
  /** Called with the range of a clicked day or slot, or of a keyboard selection that was confirmed. */
  onSelect?: (range: Selection) => void
  onEventClick?: (event: CalendarEvent<Meta>, occurrence: EventOccurrence<Meta>) => void
  /** Called when the visible window changes (and once at the start): fetch the events for it. */
  onRangeChange?: (range: Interval<PlainDate>) => void
  /** Counters for tests and profiling: called each time a day's or a week's layout is computed. */
  instrument?: { layoutDay?: (date: PlainDate) => void; layoutRow?: (date: PlainDate) => void }
}

export interface DayCell {
  date: PlainDate
  key: string
  /** In the month on show (the other days of a month grid are leading and trailing days). */
  inMonth: boolean
  weekend: boolean
}

export interface MonthWeek {
  key: string
  days: readonly DayCell[]
  /** Lanes of segments and "+N more" counts; recomputed only when this week's events change. */
  layout: () => WeekLayout
}

export interface TimeGridDay {
  date: PlainDate
  key: string
  weekend: boolean
  /** The blocks of the day; recomputed only when this day's events change. */
  blocks: () => readonly TimedBlock[]
  /** The now line as a fraction of the visible day, or `null`. */
  nowOffset: () => number | null
  /** Opening hours as fractions of the visible day: `{ top, height }`. */
  business: readonly { top: number; height: number }[] | null
}

export interface TimeGridModel {
  days: readonly TimeGridDay[]
  /** The all-day row: lanes across the visible days. */
  allDay: () => WeekLayout
  slots: readonly PlainTime[]
  /** The visible minutes of a day and the slot size, for keyboard navigation. */
  from: number
  to: number
  slot: number
}

export interface Calendar<Meta = unknown> {
  view(): ViewName
  setView(view: ViewName): void
  date(): PlainDate
  goTo(date: PlainDate): void
  next(): void
  previous(): void
  today(): void
  /** The visible window: `start` inclusive, `end` exclusive; a month includes its leading and trailing days. */
  range(): Interval<PlainDate>
  /** The shown dates. */
  dates(): readonly PlainDate[]
  title(): string
  /** Every word the calendar says, in the active locale (reactive: it follows the locale and your `messages`). */
  messages(): CalendarMessages
  /** The month on show, as `YYYY-MM` (what a month grid highlights). */
  month(): { key: string; weeks: readonly MonthWeek[]; weekdays: readonly Weekday[]; capacity: number }
  timeGrid(): TimeGridModel
  /** Every occurrence in the window. */
  occurrences(): readonly EventOccurrence<Meta>[]
  /** Today in the display zone (changes at midnight). */
  todayDate(): PlainDate
  /** The focused day (and slot) of the grid: where the arrow keys start. */
  cursor(): { date: PlainDate; minute: number }
  setCursor(date: PlainDate, minute?: number): void
  selection(): Selection | null
  /** Select a day, or a slot of a day, as a click does (calls `onSelect`). */
  selectDay(date: PlainDate): void
  selectSlot(date: PlainDate, minute: number): void
  clearSelection(): void
  eventClick(occurrenceKey: string): void
  /** What the live region says (navigation and selection). */
  announcement(): string
  timeZone(): TimeZone
  locale(): string
  weekStart(): Weekday
  /** The grid keyboard: arrows, Home, End, PageUp, PageDown (with Shift for a range), Enter, Escape. Returns `true` when it handled the key. */
  onKeyDown(event: KeyboardEvent, grid: 'month' | 'time', options?: { rtl?: boolean }): boolean
  dispose(): void
}
