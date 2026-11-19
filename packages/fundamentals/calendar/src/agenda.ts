import { eachDay } from '@pyreon/time/core'
import { checkOccurrences, toDates } from './check'
import { daySpan } from './lanes'
import type { EventOccurrence, PlainDate } from './types'
import type { VisibleRange } from './views'

/** One day of the agenda: its date and the occurrences that touch it, all-day first, then by start. */
export interface AgendaDay {
  date: PlainDate
  occurrences: EventOccurrence[]
}

/**
 * The days of a list that have events. A multi-day event is listed on every day it touches. Days without events are left out
 * (an agenda is what is on, not a calendar). Pure and totally ordered.
 */
export function layoutAgenda(occurrences: readonly EventOccurrence[], dates: readonly PlainDate[] | VisibleRange): AgendaDay[] {
  checkOccurrences('layoutAgenda', 'occurrences', occurrences)
  const days = toDates('layoutAgenda', 'dates', dates)
  if (days.length === 0) return []
  const map = new Map<PlainDate, EventOccurrence[]>()
  const first = days[0] as PlainDate
  const last = days.at(-1) as PlainDate
  for (const o of occurrences) {
    const span = daySpan(o)
    for (const date of eachDay(span.first < first ? first : span.first, span.last > last ? last : span.last)) {
      const list = map.get(date) ?? []
      list.push(o)
      map.set(date, list)
    }
  }
  const order = (a: EventOccurrence, b: EventOccurrence): number => Number(b.allDay) - Number(a.allDay) || a.startMs - b.startMs || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

  return days.filter((d) => map.has(d)).map((date) => ({ date, occurrences: (map.get(date) as EventOccurrence[]).sort(order) }))
}

