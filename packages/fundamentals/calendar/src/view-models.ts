import { computed } from '@pyreon/reactivity'
import type { Computed } from '@pyreon/reactivity'
import { monthGrid } from '@pyreon/time/core'
import { layoutAgenda } from './agenda'
import type { AgendaDay } from './agenda'
import type { CalState } from './state'
import { assignToRows, layoutTimelineRow } from './timeline'
import type { Resource, TimelineRow } from './timeline'
import { Memo, memoLayout, signatureOf } from './models'
import { nowOffset, visibleMinutes } from './timegrid'
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
  /** Where "now" is along the whole axis (0 to 1), or `null` when today is not shown or its hours are not. */
  now: number | null
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

/**
 * The timeline: a row per resource, each its own memoised layout (recomputed only when the occurrences of that row change, so
 * editing one event lays out only its rows) and the now line along the axis from the same clock as the time grid.
 */
export function createTimelineModel<Meta>(s: CalState<Meta>, resources: () => readonly Resource[]): Computed<TimelineModel> {
  const memo = new Memo<Computed<TimelineRow>>()
  const unassigned = (): Resource => ({ id: UNASSIGNED, title: s.messages().unassigned })
  const window = (): { from: number; to: number } => visibleMinutes({ ...(s.options.dayStart === undefined ? {} : { dayStart: s.options.dayStart }), ...(s.options.dayEnd === undefined ? {} : { dayEnd: s.options.dayEnd }) })
  const assigned = computed(() => assignToRows(s.occurrences(), resources(), unassigned()))

  // everything a row's layout depends on is read inside its own computed, so a row made for one window is right for the next
  const axisOf = (): { dates: readonly PlainDate[]; from: number; to: number; key: string } => {
    const { from, to } = window()
    const dates = s.shown().dates

    return { dates, from, to, key: `${from}|${to}|${dates[0] ?? ''}|${dates.length}` }
  }
  const resourceOf = (id: string): Resource => (id === UNASSIGNED ? unassigned() : (resources().find((x) => x.id === id) as Resource))

  return computed(() => {
    const { dates, from, to } = axisOf()
    const keep = new Set<string>()
    const all = [...resources(), unassigned()]
    const rows = all.map((r) => {
      keep.add(r.id)
      const layout = memo.get(r.id, () =>
        memoLayout(
          () => `${axisOf().key}|${resourceOf(r.id).title}|${signatureOf(assigned().get(r.id) ?? [])}`,
          () => ({ list: assigned().get(r.id) ?? [], resource: resourceOf(r.id), axis: axisOf() }),
          (input) => {
            s.options.instrument?.layoutResource?.(r.id)

            return layoutTimelineRow(input.list, input.resource, input.axis.dates, { from: input.axis.from, to: input.axis.to })
          },
        ),
      )

      return layout()
    })
    memo.sweep(keep)
    let now: number | null = null
    const at = s.now()
    dates.forEach((d, i) => {
      const offset = nowOffset(d, at, s.zone(), { ...(s.options.dayStart === undefined ? {} : { dayStart: s.options.dayStart }), ...(s.options.dayEnd === undefined ? {} : { dayEnd: s.options.dayEnd }) })
      if (offset !== null) now = (i + offset) / dates.length
    })

    return { rows: rows.filter((r) => r.resource.id !== UNASSIGNED || r.blocks.length > 0), dates, from, to, now }
  })
}

/** The occurrences that touch a date (what a "+N more" popover and a year cell list). */
export const occurrencesOn = <Meta>(s: CalState<Meta>, date: PlainDate): readonly EventOccurrence<Meta>[] => s.byDay().get(date) ?? []
