/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- the WAI-ARIA grid pattern: the grid's keyboard is handled once on the grid element and its cells are the roving focus targets (exactly one has tabindex 0), which a <table> without grid semantics does not give */
import { For, onMount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { computed, effect } from '@pyreon/reactivity'
import type { Calendar, DayCell, MonthWeek } from './calendar-types'
import { dayLabel, eventLabel } from './labels'
import type { EventOccurrence, EventSegment, PlainDate } from './types'
import { formatDate } from '@pyreon/format'
import { attachPointer } from './pointer'

export interface EventSlotContext<Meta = unknown> {
  occurrence: EventOccurrence<Meta>
  /** The accessible name of the event. */
  label: string
  /** The event continues from an earlier row or day / goes on after this one. */
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface ViewProps<Meta = unknown> {
  calendar: Calendar<Meta>
  class?: string
  /** What goes inside an event: default its title. */
  renderEvent?: (context: EventSlotContext<Meta>) => VNodeChild
  /** What goes in a day's head in a month: default the day of the month. */
  renderDay?: (cell: DayCell) => VNodeChild
  /** The "+N more" button: default "N more". */
  renderMore?: (count: number, date: PlainDate) => VNodeChild
}

/** The props of a view (the words come from `calendar.messages()`). */
export type ResolvedView<Meta = unknown> = ViewProps<Meta>

/** Called when a "+N more" button is pressed. */
export interface MonthViewProps<Meta = unknown> extends ViewProps<Meta> {
  onMore?: (date: PlainDate) => void
}

// pyreon-lint-disable-next-line pyreon/no-window-in-ssr -- only called from keydown handlers, which exist only in a browser
export const isRtl = (el: Element | null): boolean => el !== null && getComputedStyle(el).direction === 'rtl'

/** The pointer layer of a grid, attached on mount and removed on unmount; it also keeps focus on a keyboard-grabbed event while the layout moves it. */
export function usePointer<Meta>(root: () => HTMLElement | null, calendar: Calendar<Meta>, grid: 'month' | 'time'): void {
  onMount(() => {
    const el = root()
    if (el === null) return undefined
    const detach = attachPointer(el, calendar, grid)
    // pyreon-lint-disable-next-line pyreon/no-effect-in-mount -- it moves DOM focus, which exists only after mount
    const keep = effect(() => {
      const editing = calendar.editing()
      if (editing === null || editing.by !== 'keyboard') return
      queueMicrotask(() => {
        const button = el.querySelector<HTMLElement>(`.pcal-event[data-key="${CSS.escape(editing.key)}"]`)
        if (button !== null && button !== document.activeElement) button.focus({ preventScroll: false })
      })
    })

    return () => {
      keep.dispose()
      detach()
    }
  })
}

/** Keep focus in a grid when the focused cell moves or the view changes: refocus the cell that is the cursor, if focus was inside. */
export function followCursor(root: () => HTMLElement | null, cellOf: () => string | null, track: () => unknown): void {
  let inside = false
  onMount(() => {
    const el = root()
    if (el === null) return undefined
    const enter = (): void => void (inside = true)
    const leave = (event: FocusEvent): void => {
      if (!(event.relatedTarget instanceof Node) || !el.contains(event.relatedTarget)) inside = el.contains(document.activeElement) && document.hasFocus() ? true : false
    }
    // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- focus tracking on the grid element this component renders; removed in the cleanup
    el.addEventListener('focusin', enter)
    // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- same
    el.addEventListener('focusout', leave)
    // pyreon-lint-disable-next-line pyreon/no-effect-in-mount -- it moves DOM focus, which exists only after mount
    const follow = effect(() => {
      track()
      const selector = cellOf()
      if (!inside || selector === null) return
      queueMicrotask(() => {
        const cell = el.querySelector<HTMLElement>(selector)
        if (cell !== null && cell !== document.activeElement) cell.focus({ preventScroll: false })
      })
    })

    return () => {
      el.removeEventListener('focusin', enter)
      el.removeEventListener('focusout', leave)
      follow.dispose()
    }
  })
}

/** The state of an event in the markup: editable, being dragged or grabbed, waiting for the app. Each one is its own computed, so a drag re-runs only the dragged event's bindings. */
export function editState<Meta>(calendar: Calendar<Meta>, key: string): { editable: () => string | undefined; dragging: () => string | undefined; pending: () => string | undefined } {
  const editing = computed(() => calendar.isEditing(key))

  return {
    editable: () => (calendar.canEdit(key, 'move') ? '' : undefined),
    dragging: () => (editing() ? '' : undefined),
    pending: () => (calendar.isPending(key) ? '' : undefined),
  }
}

/** The edge handles of an event that can be resized: `start` and `end` (logical, so they swap in right-to-left text). */
export function Handles<Meta>(props: { calendar: Calendar<Meta>; occurrenceKey: string; startEdge: boolean; endEdge: boolean }): VNodeChild {
  return () =>
    props.calendar.canEdit(props.occurrenceKey, 'resize') ? (
      <>
        {props.startEdge ? <span class="pcal-handle" data-edge="start" aria-hidden="true" /> : null}
        {props.endEdge ? <span class="pcal-handle" data-edge="end" aria-hidden="true" /> : null}
      </>
    ) : null
}

const SAFE_COLOR = /^[#\w(),.%\s-]{1,64}$/

/** An event's colour as a style fragment, or nothing when it is not a plain CSS colour. */
export function colorStyle(color: string | undefined): string {
  return color !== undefined && SAFE_COLOR.test(color) ? `;--pcal-event:${color}` : ''
}

function segmentStyle(segment: EventSegment, color: string | undefined): string {
  const span = segment.endColumn - segment.startColumn + 1

  return `--pcal-span:${span};--pcal-lane:${segment.lane}${colorStyle(color)}`
}

/** One event segment of a month week, inside the cell it starts in. */
function Segment<Meta>(props: { segment: EventSegment; occurrences: () => Map<string, EventOccurrence<Meta>>; view: ResolvedView<Meta> }): VNodeChild {
  const o = props.occurrences().get(props.segment.occurrenceKey)
  if (o === undefined) return null
  const state = editState(props.view.calendar, o.key)
  // a timed event inside one day is moved in the month, not resized (a day is too coarse for it)
  const resizable = o.allDay || o.start.slice(0, 10) !== o.end.slice(0, 10)

  const label = (): string => eventLabel(o as EventOccurrence, props.view.calendar.locale(), props.view.calendar.messages())
  const slot = props.view.renderEvent

  return (
    <button
      type="button"
      class="pcal-event"
      style={segmentStyle(props.segment, o.event.color)}
      data-all-day={o.allDay ? '' : undefined}
      data-editable={state.editable}
      data-dragging={state.dragging}
      data-pending={state.pending}
      data-recurring={o.recurring ? '' : undefined}
      data-continues-before={props.segment.continuesBefore ? '' : undefined}
      data-continues-after={props.segment.continuesAfter ? '' : undefined}
      data-key={o.key}
      aria-label={() => label()}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        props.view.calendar.eventClick(o.key)
      }}
    >
      {slot === undefined ? <span class="pcal-event-title">{o.title}</span> : slot({ occurrence: o, label: label(), continuesBefore: props.segment.continuesBefore, continuesAfter: props.segment.continuesAfter })}
      <Handles calendar={props.view.calendar} occurrenceKey={o.key} startEdge={resizable && !props.segment.continuesBefore} endEdge={resizable && !props.segment.continuesAfter} />
    </button>
  )
}

function WeekRow<Meta>(props: { week: MonthWeek; view: ResolvedView<Meta>; occurrences: () => Map<string, EventOccurrence<Meta>> }): VNodeChild {
  const calendar = props.view.calendar
  const week = props.week
  const layout = computed(() => week.layout())

  const lanesCount = (): number => layout().lanes.length + (layout().more.some((n) => n > 0) ? 1 : 0)
  const capacity = (): number => layout().lanes.length

  return (
    <div class="pcal-week" role="row" style={() => `--pcal-lanes:${lanesCount()}`}>
      {week.days.map((cell, column) => (
        <div
          class="pcal-day"
          role="gridcell"
          data-date={cell.date}
          data-outside={cell.inMonth ? undefined : ''}
          data-weekend={cell.weekend ? '' : undefined}
          data-today={() => (calendar.todayDate() === cell.date ? '' : undefined)}
          data-selected={() => {
            const s = calendar.selection()

            return s !== null && s.allDay && cell.date >= s.start && cell.date < s.end ? '' : undefined
          }}
          aria-current={() => (calendar.todayDate() === cell.date ? 'date' : undefined)}
          aria-selected={() => {
            const s = calendar.selection()

            return s !== null && s.allDay && cell.date >= s.start && cell.date < s.end ? 'true' : 'false'
          }}
          tabIndex={() => (calendar.cursor().date === cell.date ? 0 : -1)}
          onClick={() => {
            calendar.setCursor(cell.date)
            calendar.selectDay(cell.date)
          }}
        >
          <span class="pcal-sr">{() => `${dayLabel(cell.date, calendar.locale())}${calendar.todayDate() === cell.date ? `, ${calendar.messages().today}` : ''}`}</span>
          <span class="pcal-day-head" aria-hidden="true">
            {props.view.renderDay === undefined ? formatDate(cell.date, { locale: calendar.locale(), day: 'numeric' }) : props.view.renderDay(cell)}
          </span>
          <For each={() => layout().lanes.flat().filter((s) => s.startColumn === column)} by={(s: EventSegment) => s.key}>
            {(segment: EventSegment) => <Segment segment={segment} occurrences={props.occurrences} view={props.view} />}
          </For>
          {() =>
            (layout().more[column] ?? 0) > 0 ? (
              <button
                type="button"
                class="pcal-more"
                dir="auto"
                style={`--pcal-lane:${capacity()}`}
                onClick={(e: MouseEvent) => {
                  e.stopPropagation()
                  ;(props.view as ResolvedView<Meta> & MonthViewProps<Meta>).onMore?.(cell.date)
                }}
              >
                {props.view.renderMore === undefined ? calendar.messages().more(layout().more[column] ?? 0) : props.view.renderMore(layout().more[column] ?? 0, cell.date)}
              </button>
            ) : null
          }
        </div>
      ))}
    </div>
  )
}

/**
 * The month: a WAI-ARIA grid of day cells (arrows move a day or a week, Home and End the week's first and last day, PageUp and
 * PageDown a month, with Shift a year, Shift with the arrows selects a range, Enter selects, Escape clears), with the events as
 * buttons inside the cell they start in, spanning the days they last, in lanes, with "+N more". Today and the selection are
 * marked in the markup and in the cell's name; focus stays on the cursor cell across moves, view changes and range changes.
 */
export function MonthView<Meta = unknown>(props: MonthViewProps<Meta>): VNodeChild {
  const view = props
  const calendar = props.calendar
  let root: HTMLElement | null = null
  const occurrences = computed(() => new Map(calendar.occurrences().map((o) => [o.key, o as EventOccurrence<Meta>])))
  followCursor(
    () => root,
    () => `[data-date="${calendar.cursor().date}"]`,
    () => calendar.month().key,
  )
  usePointer(
    () => root,
    calendar,
    'month',
  )

  return (
    <div
      class={props.class ?? 'pcal-month'}
      role="grid"
      aria-label={() => `${calendar.messages().monthGrid}, ${calendar.title()}`}
      aria-multiselectable="true"
      data-view="month"
      style={() => `--pcal-days:${calendar.month().weekdays.length};--pcal-capacity:${calendar.month().capacity}`}
      ref={(el: HTMLElement | null) => {
        root = el
      }}
      onKeyDown={(e: KeyboardEvent) => {
        const hit = (e.target as HTMLElement).closest<HTMLElement>('.pcal-event, .pcal-more')
        if (hit?.dataset.key !== undefined && calendar.onEventKeyDown(hit.dataset.key, e, 'month', { rtl: isRtl(root) })) {
          e.preventDefault()

          return
        }
        if (hit !== null && e.key !== 'Escape') return
        if (calendar.onKeyDown(e, 'month', { rtl: isRtl(root) })) e.preventDefault()
      }}
    >
      <div class="pcal-weekdays" role="row">
        {() =>
          calendar.month().weekdays.map((weekday) => (
            <div class="pcal-weekday" role="columnheader" aria-label={dayWeekday(weekday, calendar.locale())}>
              <span>{dayWeekday(weekday, calendar.locale(), 'short')}</span>
            </div>
          ))
        }
      </div>
      <For each={() => calendar.month().weeks} by={(w: MonthWeek) => w.key}>
        {(week: MonthWeek) => <WeekRow week={week} view={view} occurrences={() => occurrences()} />}
      </For>
    </div>
  )
}

/** A weekday's name (1 Monday ... 7 Sunday) in the locale. */
export function dayWeekday(weekday: number, locale: string, width: 'long' | 'short' = 'long'): string {
  // 2026-11-16 is a Monday
  const date = `2026-11-${String(15 + weekday).padStart(2, '0')}` as PlainDate

  return formatDate(date, { locale, weekday: width })
}
