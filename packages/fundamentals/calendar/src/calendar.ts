import { formatDate, formatDateRange } from '@pyreon/format'
import { batch, computed, effect, getCurrentScope, runUntracked } from '@pyreon/reactivity'
import { toPlainDate } from '@pyreon/time/core'
import type { Calendar, CalendarOptions } from './calendar-types'
import { handleKey, moveCursor, rangeOf, selectRange } from './interaction'
import { createMonthModel, createTimeGridModel } from './models'
import { createState } from './state'
import type { CalState } from './state'
import type { PlainDate } from './types'
import { navigate, viewTitle } from './views'
import type { TitleInfo, ViewName } from './views'

/** The title of the shown window in the active locale, through `@pyreon/format`. */
function title<Meta>(s: CalState<Meta>, info: TitleInfo): string {
  const locale = s.locale()
  switch (info.view) {
    case 'month':
      return formatDate(info.date, { locale, month: 'long', year: 'numeric' })
    case 'year':
      return formatDate(info.date, { locale, year: 'numeric' })
    case 'day':
      return formatDate(info.date, { locale, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    default:
      return info.first === info.last ? formatDate(info.first, { locale, dateStyle: 'medium' }) : formatDateRange(info.first, info.last, { locale, day: 'numeric', month: 'short', year: 'numeric' })
  }
}

function shift<Meta>(s: CalState<Meta>, steps: number): void {
  s.date.set(navigate(s.view.peek(), s.date.peek(), steps, { ...(s.options.days === undefined ? {} : { days: s.options.days }) }))
}

/**
 * The reactive calendar: the view and the anchor date (yours, as signals, or its own), the window and the title in the
 * active locale and zone, the month and the time grid as view models whose layouts are memoised per week and per day (changing
 * one event recomputes only the days it touches), the focused cell, a selection, and the grid keyboard. No drag or resize yet.
 */
export function createCalendar<Meta = unknown>(options: CalendarOptions<Meta>): Calendar<Meta> {
  const s = createState(options)
  const month = createMonthModel(s)
  const timeGrid = createTimeGridModel(s)
  const rangeTitle = computed(() => viewTitle(s.shown(), (info) => title(s, info)))
  const stops: { dispose(): void }[] = []
  const rangeWatcher = effect(() => {
    const r = s.shown().range
    runUntracked(() => options.onRangeChange?.(r))
  })
  stops.push(rangeWatcher)
  let first = true
  stops.push(
    effect(() => {
      const text = rangeTitle()
      const view = s.view()
      if (first) {
        first = false

        return
      }
      runUntracked(() => s.announcement.set(`${text}, ${view}`))
    }),
  )
  const api: Calendar<Meta> = {
    view: () => s.view(),
    setView: (view: ViewName) => s.view.set(view),
    date: () => s.date(),
    goTo: (date: PlainDate) => batch(() => s.date.set(date)),
    next: () => shift(s, 1),
    previous: () => shift(s, -1),
    today: () => s.date.set(toPlainDate(s.now(), s.zone())),
    range: () => s.shown().range,
    dates: () => s.shown().dates,
    title: () => rangeTitle(),
    month,
    timeGrid,
    occurrences: () => s.occurrences(),
    todayDate: () => s.today(),
    cursor: () => s.cursor(),
    setCursor: (date, minute = 0) => moveCursor(s, date, minute),
    selection: () => s.selection(),
    selectDay: (date) => selectRange(s, rangeOf(s, 'month', { date, minute: 0 }, { date, minute: 0 })),
    selectSlot: (date, minute) => {
      s.cursor.set({ date, minute })
      selectRange(s, rangeOf(s, 'time', { date, minute }, { date, minute }))
    },
    clearSelection: () => {
      s.anchor = null
      s.selection.set(null)
    },
    eventClick: (key) => {
      const occurrence = runUntracked(() => s.occurrences()).find((o) => o.key === key)
      if (occurrence !== undefined) options.onEventClick?.(occurrence.event, occurrence)
    },
    announcement: () => s.announcement(),
    timeZone: () => s.zone(),
    locale: () => s.locale(),
    weekStart: () => s.weekStart(),
    onKeyDown: (event, grid, o) => handleKey(s, event, grid, o?.rtl === true),
    dispose() {
      for (const stop of stops) stop.dispose()
      month.dispose()
      timeGrid.dispose()
      rangeTitle.dispose()
    },
  }
  getCurrentScope()?.add(() => api.dispose())

  return api
}
