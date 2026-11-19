import { formatDate, formatTime } from '@pyreon/format'
import type { EventOccurrence, PlainDate } from './types'

/** The words the calendar says: for labels and announcements. Every one can be replaced (translated). */
export interface CalendarLabels {
  allDay: string
  today: string
  previous: string
  next: string
  /** The name of the grid of a month and of a time grid. */
  monthGrid: string
  timeGrid: string
  allDayRow: string
  /** "to" between two times of an event: "14:00 to 15:00". */
  to: string
  more(count: number): string
  events(count: number): string
  selected: string
  views: Readonly<Record<string, string>>
}

export const DEFAULT_LABELS: CalendarLabels = {
  allDay: 'all day',
  today: 'today',
  previous: 'Previous',
  next: 'Next',
  monthGrid: 'Calendar',
  timeGrid: 'Calendar, time grid',
  allDayRow: 'All day',
  to: 'to',
  more: (n) => `${n} more`,
  events: (n) => (n === 0 ? 'no events' : n === 1 ? '1 event' : `${n} events`),
  selected: 'selected',
  views: { month: 'Month', week: 'Week', workWeek: 'Work week', day: 'Day', days: 'Days', agenda: 'Agenda', year: 'Year', timeline: 'Timeline' },
}

/** "Tuesday 18 November" in the locale. */
export function dayLabel(date: PlainDate, locale: string): string {
  return formatDate(date, { locale, weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * What a screen reader hears for an event: "Design review, Tuesday 18 November, 14:00 to 15:00"; an all-day event says so
 * ("Public holiday, Tuesday 17 November, all day"); one over several days says where it starts and ends.
 */
export function eventLabel(o: EventOccurrence, locale: string, labels: CalendarLabels): string {
  const startDay = o.start.slice(0, 10) as PlainDate
  if (o.allDay) {
    const last = new Date(`${o.end}T00:00:00Z`)
    last.setUTCDate(last.getUTCDate() - 1)
    const lastDay = last.toISOString().slice(0, 10) as PlainDate
    const when = lastDay === startDay ? dayLabel(startDay, locale) : `${dayLabel(startDay, locale)} ${labels.to} ${dayLabel(lastDay, locale)}`

    return `${o.title}, ${when}, ${labels.allDay}`
  }
  const endDay = o.end.slice(0, 10) as PlainDate
  const from = formatTime(o.start, { locale, timeStyle: 'short' })
  const to = formatTime(o.end, { locale, timeStyle: 'short' })
  if (endDay === startDay) return `${o.title}, ${dayLabel(startDay, locale)}, ${from} ${labels.to} ${to}`

  return `${o.title}, ${dayLabel(startDay, locale)} ${from} ${labels.to} ${dayLabel(endDay, locale)} ${to}`
}
