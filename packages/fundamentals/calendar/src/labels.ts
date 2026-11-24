import { formatDate, formatTime } from '@pyreon/format'
import type { CalendarMessages } from './messages'
import type { EventOccurrence, PlainDate } from './types'

/** "Tuesday 18 November" in the locale. */
export function dayLabel(date: PlainDate, locale: string): string {
  return formatDate(date, { locale, weekday: 'long', day: 'numeric', month: 'long' })
}

const lastDayOf = (end: string): PlainDate => {
  const last = new Date(`${end}T00:00:00Z`)
  last.setUTCDate(last.getUTCDate() - 1)

  return last.toISOString().slice(0, 10) as PlainDate
}

/**
 * What a screen reader hears for an event: "Design review, Tuesday 18 November, 14:00 – 15:00"; an all-day event says so
 * ("Public holiday, Tuesday 17 November, all day"); one over several days says where it starts and ends.
 */
export function eventLabel(o: EventOccurrence, locale: string, messages: CalendarMessages): string {
  const startDay = o.start.slice(0, 10) as PlainDate
  if (o.allDay) {
    const lastDay = lastDayOf(o.end)
    const when = lastDay === startDay ? dayLabel(startDay, locale) : messages.range(dayLabel(startDay, locale), dayLabel(lastDay, locale))

    return `${o.title}, ${when}, ${messages.allDay}`
  }
  const endDay = o.end.slice(0, 10) as PlainDate
  const from = formatTime(o.start, { locale, timeStyle: 'short' })
  const to = formatTime(o.end, { locale, timeStyle: 'short' })
  if (endDay === startDay) return `${o.title}, ${dayLabel(startDay, locale)}, ${messages.range(from, to)}`

  return `${o.title}, ${messages.range(`${dayLabel(startDay, locale)} ${from}`, `${dayLabel(endDay, locale)} ${to}`)}`
}
