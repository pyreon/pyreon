/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- the WAI-ARIA grid pattern: the grid's keyboard is handled once on the grid element and its cells are the roving focus targets (exactly one has tabindex 0) */
import { For } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import type { TimeGridDay, TimeGridModel } from './calendar-types'
import { dayLabel, eventLabel } from './labels'
import { Handles, colorStyle, dayWeekday, editState, followCursor, isRtl, usePointer } from './month-view'
import type { ResolvedView, ViewProps } from './month-view'
import type { EventOccurrence, EventSegment, TimedBlock } from './types'
import { formatDate, formatTime } from '@pyreon/format'

const pad = (n: number): string => String(n).padStart(2, '0')
const timeText = (minute: number): string => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`

export type TimeGridViewProps<Meta = unknown> = ViewProps<Meta>

function blockStyle(block: TimedBlock, slotStart: number, slot: number, from: number, to: number): string {
  const span = to - from
  const offset = (block.startMinute - slotStart) / slot
  // percentages are of the slot cell: top inside it, height in slots, left and width of the column
  const height = (block.height * span) / slot

  return `top:${(offset * 100).toFixed(4)}%;height:${(height * 100).toFixed(4)}%;inset-inline-start:${(block.left * 100).toFixed(4)}%;inline-size:${(block.width * 100).toFixed(4)}%;--pcal-slots:${height.toFixed(3)}`
}

function Block<Meta>(props: { block: TimedBlock; slotStart: number; occurrences: () => Map<string, EventOccurrence<Meta>>; view: ResolvedView<Meta> }): VNodeChild {
  const o = props.occurrences().get(props.block.occurrenceKey)
  if (o === undefined) return null
  const calendar = props.view.calendar
  const grid = calendar.timeGrid()
  const state = editState(calendar, o.key)

  // the time drawn in the block follows the drag; only the block being dragged reads the target, so the others are not re-run by a move
  const shownStart = computed(() => (calendar.isEditing(o.key) ? (calendar.editing()?.target.start ?? o.start) : o.start))

  const label = (): string => eventLabel(o as EventOccurrence, calendar.locale(), calendar.messages())
  const slot = props.view.renderEvent

  return (
    <button
      type="button"
      class="pcal-event pcal-block"
      style={`${blockStyle(props.block, props.slotStart, grid.slot, grid.from, grid.to)}${colorStyle(o.event.color)}`}
      data-short={props.block.endMinute - props.block.startMinute < 45 ? '' : undefined}
      data-editable={state.editable}
      data-dragging={state.dragging}
      data-pending={state.pending}
      data-recurring={o.recurring ? '' : undefined}
      data-continues-before={props.block.continuesBefore ? '' : undefined}
      data-continues-after={props.block.continuesAfter ? '' : undefined}
      data-key={o.key}
      aria-label={() => label()}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        calendar.eventClick(o.key)
      }}
    >
      <span class="pcal-block-in">
        {slot === undefined ? <span class="pcal-event-title">{o.title}</span> : slot({ occurrence: o, label: label(), continuesBefore: props.block.continuesBefore, continuesAfter: props.block.continuesAfter })}
        <span class="pcal-block-time" aria-hidden="true" data-time={() => formatTime(shownStart(), { locale: calendar.locale(), timeStyle: 'short' })} />
      </span>
      <Handles calendar={calendar} occurrenceKey={o.key} startEdge={!props.block.continuesBefore} endEdge={!props.block.continuesAfter} />
    </button>
  )
}

function AllDayEvent<Meta>(props: { segment: EventSegment; occurrences: () => Map<string, EventOccurrence<Meta>>; view: ResolvedView<Meta> }): VNodeChild {
  const o = props.occurrences().get(props.segment.occurrenceKey)
  if (o === undefined) return null

  const label = (): string => eventLabel(o as EventOccurrence, props.view.calendar.locale(), props.view.calendar.messages())
  const state = editState(props.view.calendar, o.key)

  return (
    <button
      type="button"
      class="pcal-event pcal-allday-event"
      data-editable={state.editable}
      data-dragging={state.dragging}
      data-pending={state.pending}
      style={`--pcal-span:${props.segment.endColumn - props.segment.startColumn + 1};--pcal-lane:${props.segment.lane}${colorStyle(o.event.color)}`}
      data-continues-before={props.segment.continuesBefore ? '' : undefined}
      data-continues-after={props.segment.continuesAfter ? '' : undefined}
      data-key={o.key}
      aria-label={() => label()}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        props.view.calendar.eventClick(o.key)
      }}
    >
      {props.view.renderEvent === undefined ? <span class="pcal-event-title">{o.title}</span> : props.view.renderEvent({ occurrence: o, label: label(), continuesBefore: props.segment.continuesBefore, continuesAfter: props.segment.continuesAfter })}
      <Handles calendar={props.view.calendar} occurrenceKey={o.key} startEdge={!props.segment.continuesBefore} endEdge={!props.segment.continuesAfter} />
    </button>
  )
}

interface GridContext<Meta> {
  view: ResolvedView<Meta>
  grid: () => TimeGridModel
  occurrences: () => Map<string, EventOccurrence<Meta>>
}

/** One slot cell: the events that start in it, the now line when it is in it, and its state in the markup. */
function SlotCell<Meta>(props: { ctx: GridContext<Meta>; day: TimeGridDay; minute: number }): VNodeChild {
  const ctx = props.ctx
  const day = props.day
  const minute = props.minute
  const calendar = ctx.view.calendar
  const grid = ctx.grid
  const open = (): boolean | undefined => {
    if (day.business === null) return undefined
    const at = (minute - grid().from) / (grid().to - grid().from)

    return day.business.some((w) => at >= w.top && at < w.top + w.height - 1e-9)
  }
  const selected = (): boolean => {
    const s = calendar.selection()

    return s !== null && !s.allDay && `${day.date}T${timeText(minute)}` >= s.start && `${day.date}T${timeText(minute)}` < s.end
  }

  return (
    <div
      class="pcal-slot"
      role="gridcell"
      data-date={day.date}
      data-minute={minute}
      data-weekend={day.weekend ? '' : undefined}
      data-business={() => (open() === undefined ? undefined : open() ? 'open' : 'closed')}
      data-selected={() => (selected() ? '' : undefined)}
      aria-selected={() => (selected() ? 'true' : 'false')}
      tabIndex={() => (calendar.cursor().date === day.date && calendar.cursor().minute === minute ? 0 : -1)}
      onClick={() => calendar.selectSlot(day.date, minute)}
    >
      <span class="pcal-sr">{() => `${dayLabel(day.date, calendar.locale())}, ${formatTime(`${day.date}T${timeText(minute)}` as never, { locale: calendar.locale(), timeStyle: 'short' })}`}</span>
      <For each={() => day.blocks().filter((b) => b.startMinute >= minute && b.startMinute < minute + grid().slot)} by={(b: TimedBlock) => b.key}>
        {(block: TimedBlock) => <Block block={block} slotStart={minute} occurrences={ctx.occurrences} view={ctx.view} />}
      </For>
      {() => {
        const offset = day.nowOffset()
        if (offset === null) return null
        const at = grid().from + offset * (grid().to - grid().from)
        if (!(at >= minute && at < minute + grid().slot)) return null

        return <div class="pcal-now" aria-hidden="true" style={`top:${(((at - minute) / grid().slot) * 100).toFixed(3)}%`} />
      }}
    </div>
  )
}

function SlotRow<Meta>(props: { ctx: GridContext<Meta>; index: number }): VNodeChild {
  const ctx = props.ctx
  const index = props.index
  const calendar = ctx.view.calendar
  const minute = ctx.grid().from + index * ctx.grid().slot

  return (
    <div class="pcal-row" role="row" data-hour={minute % 60 === 0 ? '' : undefined}>
      <div class="pcal-gutter-cell" role="rowheader" data-hour={minute % 60 === 0 ? '' : undefined}>
        <span>{() => formatTime(`2026-01-01T${timeText(minute)}` as never, { locale: calendar.locale(), timeStyle: 'short' })}</span>
      </div>
      <For each={() => ctx.grid().days} by={(d: TimeGridDay) => d.key}>
        {(day: TimeGridDay) => <SlotCell ctx={ctx} day={day} minute={minute} />}
      </For>
    </div>
  )
}

function AllDayRow<Meta>(props: { ctx: GridContext<Meta> }): VNodeChild {
  const ctx = props.ctx
  const calendar = ctx.view.calendar

  return (
    <div class="pcal-allday" role="row" style={() => `--pcal-lanes:${Math.max(1, ctx.grid().allDay().lanes.length)}`}>
      <div class="pcal-gutter-cell" role="rowheader">{() => calendar.messages().allDayRow}</div>
      <For each={() => ctx.grid().days} by={(d: TimeGridDay) => d.key}>
        {(day: TimeGridDay) => {
          const index = ctx.grid().days.findIndex((d) => d.date === day.date)

          return (
            <div class="pcal-allday-cell" role="gridcell" data-date={day.date} tabIndex={-1}>
              <span class="pcal-sr">{() => `${dayLabel(day.date, calendar.locale())}, ${calendar.messages().allDayRow}`}</span>
              <For each={() => ctx.grid().allDay().lanes.flat().filter((s) => s.startColumn === index)} by={(s: EventSegment) => s.key}>
                {(segment: EventSegment) => <AllDayEvent segment={segment} occurrences={ctx.occurrences} view={ctx.view} />}
              </For>
            </div>
          )
        }}
      </For>
    </div>
  )
}

function HeaderRow<Meta>(props: { ctx: GridContext<Meta> }): VNodeChild {
  const ctx = props.ctx
  const calendar = ctx.view.calendar

  return (
    <div class="pcal-head" role="row">
      <div class="pcal-corner" role="columnheader">
        <span class="pcal-sr">{() => calendar.messages().timeGrid}</span>
      </div>
      <For each={() => ctx.grid().days} by={(d: TimeGridDay) => d.key}>
        {(day: TimeGridDay) => (
          <div class="pcal-colhead" role="columnheader" data-weekend={day.weekend ? '' : undefined} data-today={() => (calendar.todayDate() === day.date ? '' : undefined)} aria-current={() => (calendar.todayDate() === day.date ? 'date' : undefined)} aria-label={() => dayLabel(day.date, calendar.locale())}>
            <span class="pcal-colhead-weekday">{dayWeekday(Number(new Date(`${day.date}T00:00:00Z`).getUTCDay() || 7), calendar.locale(), 'short')}</span>
            <span class="pcal-colhead-date">{formatDate(day.date, { locale: calendar.locale(), day: 'numeric' })}</span>
          </div>
        )}
      </For>
    </div>
  )
}

/**
 * The time grid of a week, a work week, a day or a few days: a WAI-ARIA grid whose rows are the slots and whose columns are the
 * days, with a header row (the days, today marked), an all-day row (events in lanes), a time gutter, the events as buttons
 * inside the slot they start in (sized and placed by the column packing), opening hours shaded, and the now line from the
 * ambient clock. The arrows move by slot and day, Home and End to the first and last slot, PageUp and PageDown by a week of
 * columns, Shift with them selects a range of slots, Enter selects, Escape clears.
 */
export function TimeGridView<Meta = unknown>(props: TimeGridViewProps<Meta>): VNodeChild {
  const calendar = props.calendar
  let root: HTMLElement | null = null
  const occurrences = computed(() => new Map(calendar.occurrences().map((o) => [o.key, o as EventOccurrence<Meta>])))
  const grid = computed(() => calendar.timeGrid())
  const view = props
  const ctx: GridContext<Meta> = { view, grid: () => grid(), occurrences: () => occurrences() }
  followCursor(
    () => root,
    () => `[data-date="${calendar.cursor().date}"][data-minute="${calendar.cursor().minute}"]`,
    () => grid().days.length + calendar.range().start,
  )
  usePointer(
    () => root,
    calendar,
    'time',
  )

  return (
    <div
      class={props.class ?? 'pcal-timegrid'}
      role="grid"
      aria-label={() => `${calendar.messages().timeGrid}, ${calendar.title()}`}
      aria-multiselectable="true"
      aria-colcount={() => grid().days.length + 1}
      data-view="timegrid"
      style={() => `--pcal-columns:${grid().days.length}`}
      ref={(el: HTMLElement | null) => {
        root = el
      }}
      onKeyDown={(e: KeyboardEvent) => {
        const hit = (e.target as HTMLElement).closest<HTMLElement>('.pcal-event')
        if (hit?.dataset.key !== undefined && calendar.onEventKeyDown(hit.dataset.key, e, 'time', { rtl: isRtl(root) })) {
          e.preventDefault()

          return
        }
        if (hit !== null && e.key !== 'Escape') return
        if (calendar.onKeyDown(e, 'time', { rtl: isRtl(root) })) e.preventDefault()
      }}
    >
      <HeaderRow ctx={ctx} />
      <AllDayRow ctx={ctx} />
      <div class="pcal-body">
        <For each={() => grid().slots.map((_, i) => i)} by={(i: number) => String(i)}>
          {(index: number) => <SlotRow ctx={ctx} index={index} />}
        </For>
      </div>
    </div>
  )
}
