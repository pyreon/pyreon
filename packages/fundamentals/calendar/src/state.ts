import { locale as ambientLocale, timeZone as ambientZone, useNow } from '@pyreon/ambient'
import { computed, signal } from '@pyreon/reactivity'
import type { Computed, Signal } from '@pyreon/reactivity'
import { eachDay, toPlainDate, weekendOf, weekStartOf } from '@pyreon/time/core'
import type { CalendarOptions, Selection } from './calendar-types'
import { createEditState, overlaid } from './editing'
import type { EditState } from './editing'
import { expandOccurrences } from './expand'
import { defaultMessages, hasAllDay } from './messages'
import type { CalendarMessages } from './messages'
import { daySpan } from './lanes'
import type { EventOccurrence, PlainDate, TimeZone, Weekday } from './types'
import { visibleRange } from './views'
import type { ViewName, VisibleRange } from './views'

/** What every part of the calendar reads. Signals and computeds; the functions in the other files work on it. */
export interface CalState<Meta> {
  readonly options: CalendarOptions<Meta>
  readonly view: Signal<ViewName>
  readonly date: Signal<PlainDate>
  readonly zone: () => TimeZone
  readonly locale: () => string
  readonly weekStart: () => Weekday
  readonly hiddenDays: () => readonly Weekday[]
  readonly now: () => number
  readonly today: Computed<PlainDate>
  readonly shown: Computed<VisibleRange>
  readonly occurrences: Computed<EventOccurrence<Meta>[]>
  /** The occurrences that touch each shown date. */
  readonly byDay: Computed<Map<PlainDate, EventOccurrence<Meta>[]>>
  readonly cursor: Signal<{ date: PlainDate; minute: number }>
  readonly selection: Signal<Selection | null>
  /** Where a keyboard selection started. */
  anchor: { date: PlainDate; minute: number } | null
  readonly announcement: Signal<string>
  readonly messages: Computed<CalendarMessages>
  readonly edit: EditState
}

function isSignal<T>(value: Signal<T> | T): value is Signal<T> {
  return typeof value === 'function'
}

/** A value or a signal the app owns: the signal itself when given (controlled), else one made here (uncontrolled). */
function own<T>(input: Signal<T> | T | undefined, fallback: () => T): Signal<T> {
  if (input === undefined) return signal(fallback())

  return isSignal(input) ? input : signal(input)
}

function bucket<Meta>(list: readonly EventOccurrence<Meta>[], dates: readonly PlainDate[]): Map<PlainDate, EventOccurrence<Meta>[]> {
  const map = new Map<PlainDate, EventOccurrence<Meta>[]>(dates.map((d) => [d, []]))
  for (const o of list) {
    const { first, last } = daySpan(o)
    for (const date of eachDay(first < (dates[0] as PlainDate) ? (dates[0] as PlainDate) : first, last > (dates.at(-1) as PlainDate) ? (dates.at(-1) as PlainDate) : last)) map.get(date)?.push(o)
  }

  return map
}

/** Say once, in development only, that "all day" has no built-in text for a language and `messages.allDay` should be set. */
function warnAllDay(locale: string, warned: Set<string>): void {
  if (process.env.NODE_ENV !== 'production') {
    const lang = locale.split(/[-_]/)[0] ?? locale
    if (hasAllDay(locale) || warned.has(lang)) return
    warned.add(lang)
    console.warn(`[Pyreon] @pyreon/calendar: there is no built-in "all day" text for "${lang}", so the English one is used. Pass messages: { allDay: '...' } (and allDayRow) to createCalendar.`)
  }
}

export function createState<Meta>(options: CalendarOptions<Meta>): CalState<Meta> {
  const zone = options.timeZone ?? ambientZone
  const locale = options.locale ?? ambientLocale
  const minute = useNow({ every: 'minute' })
  const now = options.now ?? minute
  const today = computed(() => toPlainDate(now(), zone()))
  const view = own<ViewName>(options.view, () => 'month')
  const date = own<PlainDate>(options.date, () => toPlainDate(now(), zone()))
  const weekStart = (): Weekday => options.weekStart ?? weekStartOf(locale())
  const hiddenDays = (): readonly Weekday[] => options.hiddenDays ?? []
  const shown = computed(() =>
    visibleRange(view(), date(), {
      weekStart: weekStart(),
      hiddenDays: hiddenDays(),
      weekend: options.weekend ?? weekendOf(locale()),
      ...(options.days === undefined ? {} : { days: options.days }),
      ...(options.agendaDays === undefined ? {} : { agendaDays: options.agendaDays }),
    }),
  )
  const edit = createEditState()
  // the languages already warned about, for this calendar only (at most one entry per language it has been shown in)
  const warned = new Set<string>()
  const occurrences = computed(() => overlaid(expandOccurrences(options.events(), shown().range, zone()), edit.overlay(), zone()))
  const messages = computed<CalendarMessages>(() => {
    const lang = locale()
    const mine = typeof options.messages === 'function' ? options.messages(lang) : options.messages
    const base = defaultMessages(lang)
    if (mine?.allDay === undefined) warnAllDay(lang, warned)

    return { ...base, ...mine, views: { ...base.views, ...mine?.views }, recurringScope: { ...base.recurringScope, ...mine?.recurringScope } }
  })
  const byDay = computed(() => bucket(occurrences(), shown().dates))

  return {
    options,
    view,
    date,
    zone,
    locale,
    weekStart,
    hiddenDays,
    now,
    today,
    shown,
    occurrences,
    byDay,
    cursor: signal({ date: date.peek(), minute: 0 }),
    selection: signal<Selection | null>(null),
    anchor: null,
    announcement: signal(''),
    messages,
    edit,
  }
}
