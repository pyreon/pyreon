import { computed } from '@pyreon/reactivity'
import type { Computed } from '@pyreon/reactivity'
import { monthGrid } from '@pyreon/time/core'
import { layoutAgenda } from './agenda'
import type { AgendaDay } from './agenda'
import type { CalState } from './state'
import { layoutTimeline } from './timeline'
import type { Resource, TimelineRow } from './timeline'
import { visibleMinutes } from './timegrid'
import type { EventOccurrence, PlainDate } from './types'

/** A month of the year view: its first day and its weeks (`null` for the leading and trailing days of other months). */
export interface YearMonth {
  key: string
  first: PlainDate
  weeks: readonly (readonly (PlainDate | null)[])[]
}

export interface YearModel {
  months: readonly YearMonth[]
  weekdays: readonly number[]
}

export interface TimelineModel {
  rows: readonly TimelineRow[]
  dates: readonly PlainDate[]
  /** The visible minutes of each day. */
  from: number
  to: number
}

export const createAgendaModel = <Meta>(s: CalState<Meta>): Computed<AgendaDay[]> => computed(() => layoutAgenda(s.occurrences(), s.shown().dates))

export function createYearModel<Meta>(s: CalState<Meta>): Computed<YearModel> {
  return computed(() => {
    const year = s.date().slice(0, 4)
    const weekStart = s.weekStart()
    const months = Array.from({ length: 12 }, (_, i): YearMonth => {
      const first = `${year}-${String(i + 1).padStart(2, '0')}-01` as PlainDate
      const weeks = monthGrid(first, { weekStart }).map((week) => week.map((d) => (d.slice(0, 7) === first.slice(0, 7) ? d : null)))

      return { key: first.slice(0, 7), first, weeks }
    })

    return { months, weekdays: (monthGrid(`${year}-01-01` as PlainDate, { weekStart })[0] ?? []).map((_, i) => ((weekStart + i - 1) % 7) + 1) }
  })
}

/** The id of the row of events that have no resource (or one that is not in the list). */
export const UNASSIGNED = '\u0000unassigned'

export function createTimelineModel<Meta>(s: CalState<Meta>, resources: () => readonly Resource[]): Computed<TimelineModel> {
  return computed(() => {
    const window = visibleMinutes({ ...(s.options.dayStart === undefined ? {} : { dayStart: s.options.dayStart }), ...(s.options.dayEnd === undefined ? {} : { dayEnd: s.options.dayEnd }) })
    const dates = s.shown().dates
    const rows = layoutTimeline(s.occurrences(), resources(), dates, { from: window.from, to: window.to, unassigned: { id: UNASSIGNED, title: s.messages().unassigned } }).filter((r) => r.resource.id !== UNASSIGNED || r.blocks.length > 0)

    return { rows, dates, from: window.from, to: window.to }
  })
}

/** The occurrences that touch a date (what a "+N more" popover and a year cell list). */
export const occurrencesOn = <Meta>(s: CalState<Meta>, date: PlainDate): readonly EventOccurrence<Meta>[] => s.byDay().get(date) ?? []
