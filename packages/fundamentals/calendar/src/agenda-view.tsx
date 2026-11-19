/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a scrollable region with a name: a <section> would not be keyboard-scrollable without tabindex, and the role is what names it */
import { For, onMount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { formatTime } from '@pyreon/format'
import { computed, signal } from '@pyreon/reactivity'
import type { AgendaDay } from './agenda'
import { dayLabel, eventLabel } from './labels'
import { colorStyle } from './month-view'
import type { ViewProps } from './month-view'
import type { EventOccurrence } from './types'
import { windowRows } from './window'

/** Row sizes of the agenda in pixels (the stylesheet draws to the same numbers): a day's heading, one event, the gap after a day. */
const HEAD = 40
const ROW = 44
const GAP = 8

function AgendaEvent<Meta>(props: { occurrence: EventOccurrence<Meta>; view: ViewProps<Meta>; date: string }): VNodeChild {
  const o = props.occurrence
  const calendar = props.view.calendar
  const label = (): string => eventLabel(o as EventOccurrence, calendar.locale(), calendar.messages())
  const time = (): string => (o.allDay ? calendar.messages().allDay : calendar.messages().range(formatTime(o.start, { locale: calendar.locale(), timeStyle: 'short' }), formatTime(o.end, { locale: calendar.locale(), timeStyle: 'short' })))

  return (
    <li class="pcal-agenda-item">
      <button
        type="button"
        class="pcal-event pcal-agenda-event"
        style={colorStyle(o.event.color)}
        data-key={o.key}
        data-time={() => time()}
        aria-label={() => label()}
        onClick={() => calendar.eventClick(o.key)}
      >
        {props.view.renderEvent === undefined ? <span class="pcal-event-title">{o.title}</span> : props.view.renderEvent({ occurrence: o, label: label(), continuesBefore: o.start.slice(0, 10) < props.date, continuesAfter: o.end.slice(0, 10) > props.date })}
      </button>
    </li>
  )
}

function Day<Meta>(props: { day: AgendaDay; view: ViewProps<Meta> }): VNodeChild {
  const calendar = props.view.calendar
  const date = props.day.date

  return (
    <section class="pcal-agenda-day" data-date={date} data-today={() => (calendar.todayDate() === date ? '' : undefined)} style={`block-size:${HEAD + props.day.occurrences.length * ROW + GAP}px`}>
      <h3 class="pcal-agenda-head">{() => `${dayLabel(date, calendar.locale())}${calendar.todayDate() === date ? `, ${calendar.messages().today}` : ''}`}</h3>
      <ul class="pcal-agenda-list">
        {props.day.occurrences.map((o) => (
          <AgendaEvent occurrence={o as EventOccurrence<Meta>} view={props.view} date={date} />
        ))}
      </ul>
    </section>
  )
}

/**
 * The agenda: a list of the days that have events (`agendaDays` long, 30 by default), each with its events in order, all-day
 * first. A list of headings and buttons, not a grid: Tab walks the events. Only the days near the viewport are in the page (the
 * heights are known, so it is windowed with a binary search over the running total), so a year of events costs what a screenful does.
 */
export function AgendaView<Meta = unknown>(props: ViewProps<Meta>): VNodeChild {
  const calendar = props.calendar
  const scroll = signal(0)
  const viewport = signal(640)
  const days = computed(() => calendar.agenda())
  const empty = computed(() => days().length === 0)
  const heights = computed(() => days().map((d) => HEAD + d.occurrences.length * ROW + GAP))
  const window = computed(() => windowRows(heights(), scroll(), viewport(), 2))
  let box: HTMLElement | null = null

  onMount(() => {
    if (box === null) return undefined
    const el = box
    viewport.set(el.clientHeight || 640)
    const watch = new ResizeObserver(() => viewport.set(el.clientHeight || 640))
    watch.observe(el)

    return () => watch.disconnect()
  })

  return (
    <div
      class={props.class ?? 'pcal-agenda'}
      data-view="agenda"
      role="region"
      aria-label={() => `${calendar.messages().views.agenda ?? 'Agenda'}, ${calendar.title()}`}
      ref={(el: HTMLElement | null) => {
        box = el
      }}
      onScroll={(e: Event) => scroll.set((e.currentTarget as HTMLElement).scrollTop)}
    >
      {() =>
        empty() ? (
          <p class="pcal-agenda-empty">{() => calendar.messages().noEvents}</p>
        ) : (
          <div class="pcal-agenda-space" style={() => `block-size:${window().total}px`}>
            <div class="pcal-agenda-window" style={() => `transform:translateY(${window().offset}px)`}>
              <For each={() => days().slice(window().start, window().end)} by={(d: AgendaDay) => d.date}>
                {(day: AgendaDay) => <Day day={day} view={props} />}
              </For>
            </div>
          </div>
        )
      }
    </div>
  )
}
