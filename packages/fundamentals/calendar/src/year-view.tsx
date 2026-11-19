/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions -- the WAI-ARIA grid pattern: one tab stop for the whole year, the arrows move the focus by day and week across the months */
import type { VNodeChild } from '@pyreon/core'
import { formatDate } from '@pyreon/format'
import { computed } from '@pyreon/reactivity'
import { dayLabel } from './labels'
import { dayWeekday, followCursor, isRtl } from './month-view'
import type { ViewProps } from './month-view'
import type { PlainDate } from './types'
import type { YearMonth } from './view-models'

export interface YearViewProps<Meta = unknown> extends ViewProps<Meta> {
  /** Called with the day that was clicked or confirmed with Enter. */
  onDayClick?: (date: PlainDate) => void
}

function Cell<Meta>(props: { date: PlainDate | null; view: YearViewProps<Meta> }): VNodeChild {
  const date = props.date
  const calendar = props.view.calendar
  if (date === null) return <div class="pcal-year-day" role="gridcell" data-empty="" aria-hidden="true" />

  const count = (): number => calendar.dayOccurrences(date).length

  return (
    <div
      class="pcal-year-day"
      role="gridcell"
      data-date={date}
      data-busy={() => (count() > 0 ? String(Math.min(count(), 4)) : undefined)}
      data-today={() => (calendar.todayDate() === date ? '' : undefined)}
      data-weekend={undefined}
      aria-current={() => (calendar.todayDate() === date ? 'date' : undefined)}
      tabIndex={() => (calendar.cursor().date === date ? 0 : -1)}
      onClick={() => {
        calendar.setCursor(date)
        props.view.onDayClick?.(date)
      }}
    >
      <span class="pcal-sr">{() => `${dayLabel(date, calendar.locale())}${count() > 0 ? `, ${calendar.messages().events(count())}` : ''}`}</span>
      <span aria-hidden="true">{formatDate(date, { locale: calendar.locale(), day: 'numeric' })}</span>
    </div>
  )
}

function MonthCard<Meta>(props: { month: YearMonth; view: YearViewProps<Meta> }): VNodeChild {
  const calendar = props.view.calendar
  const m = props.month

  return (
    <section class="pcal-year-month">
      <h3 class="pcal-year-title">{() => formatDate(m.first, { locale: calendar.locale(), month: 'long' })}</h3>
      <div role="grid" aria-label={() => formatDate(m.first, { locale: calendar.locale(), month: 'long', year: 'numeric' })}>
        <div class="pcal-year-weekdays" role="row">
          {() =>
            calendar.year().weekdays.map((d) => (
              <span role="columnheader" aria-label={dayWeekday(d, calendar.locale())}>
                {dayWeekday(d, calendar.locale(), 'narrow')}
              </span>
            ))
          }
        </div>
        {m.weeks.map((week) => (
          <div class="pcal-year-week" role="row">
            {week.map((date) => (
              <Cell date={date} view={props.view} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * The year: twelve small months. A day with events is shaded by how many (1 to 4 or more) and its spoken name has the count;
 * clicking a day (or Enter) calls `onDayClick`. One tab stop for the whole year, arrows by day and week across the months,
 * Home and End within the week, PageUp and PageDown by a month.
 */
export function YearView<Meta = unknown>(props: YearViewProps<Meta>): VNodeChild {
  const calendar = props.calendar
  let root: HTMLElement | null = null
  const year = computed(() => calendar.year())
  followCursor(
    () => root,
    () => `[data-date="${calendar.cursor().date}"]`,
    () => calendar.date().slice(0, 4),
  )

  return (
    <div
      class={props.class ?? 'pcal-year'}
      data-view="year"
      ref={(el: HTMLElement | null) => {
        root = el
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          props.onDayClick?.(calendar.cursor().date)
          e.preventDefault()

          return
        }
        if (calendar.onKeyDown(e, 'month', { rtl: isRtl(root) })) e.preventDefault()
      }}
    >
      {() => year().months.map((m) => <MonthCard month={m} view={props} />)}
    </div>
  )
}
