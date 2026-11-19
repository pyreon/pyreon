/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- the WAI-ARIA grid pattern: rows are resources, the lane of a row is its one cell, and the events inside it are buttons */
import { For, onMount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { formatDate } from '@pyreon/format'
import { computed, signal } from '@pyreon/reactivity'
import { dayLabel, eventLabel } from './labels'
import { Handles, colorStyle, dayWeekday, editState, isRtl, usePointer } from './month-view'
import type { ViewProps } from './month-view'
import type { TimelineBlock, TimelineRow } from './timeline'
import type { TimelineModel } from './view-models'
import type { EventOccurrence, PlainDate } from './types'
import { windowRows } from './window'

/** Pixels of one lane of events in a row, and the space around a row's lanes (the stylesheet's row is these numbers). */
const LANE = 28
const PAD = 4

const rowHeight = (row: TimelineRow): number => row.lanes * LANE + PAD * 2

function Block<Meta>(props: { block: TimelineBlock; occurrences: () => Map<string, EventOccurrence<Meta>>; view: ViewProps<Meta> }): VNodeChild {
  const o = props.occurrences().get(props.block.occurrenceKey)
  if (o === undefined) return null
  const calendar = props.view.calendar
  const b = props.block
  const state = editState(calendar, o.key)

  const label = (): string => eventLabel(o as EventOccurrence, calendar.locale(), calendar.messages())

  return (
    <button
      type="button"
      class="pcal-event pcal-tl-block"
      style={`inset-inline-start:${(b.left * 100).toFixed(4)}%;inline-size:${(b.width * 100).toFixed(4)}%;inset-block-start:${PAD + b.lane * LANE}px;block-size:${LANE - 4}px${colorStyle(o.event.color)}`}
      data-key={o.key}
      data-resource={b.resourceId}
      data-all-day={o.allDay ? '' : undefined}
      data-continues-before={b.continuesBefore ? '' : undefined}
      data-continues-after={b.continuesAfter ? '' : undefined}
      data-editable={state.editable}
      data-dragging={state.dragging}
      data-pending={state.pending}
      aria-label={() => label()}
      onClick={() => calendar.eventClick(o.key)}
    >
      {props.view.renderEvent === undefined ? <span class="pcal-event-title">{o.title}</span> : props.view.renderEvent({ occurrence: o, label: label(), continuesBefore: b.continuesBefore, continuesAfter: b.continuesAfter })}
      <Handles calendar={calendar} occurrenceKey={o.key} startEdge={!b.continuesBefore} endEdge={!b.continuesAfter} />
    </button>
  )
}

/** Where a wall-clock moment is along the axis (0 to 1); outside the shown days it is the nearer edge. */
function axisFraction(m: TimelineModel, wall: string): number {
  const index = m.dates.indexOf(wall.slice(0, 10) as PlainDate)
  if (index < 0) return wall.slice(0, 10) < (m.dates[0] ?? '') ? 0 : 1
  const size = m.to - m.from
  const minute = wall.length > 10 ? Math.min(size, Math.max(0, Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16)) - m.from)) : 0

  return (index * size + minute) / (m.dates.length * size)
}

function Row<Meta>(props: { id: string; row: () => TimelineRow; occurrences: () => Map<string, EventOccurrence<Meta>>; view: ViewProps<Meta>; days: number; model: () => TimelineModel }): VNodeChild {
  // the row is read through an accessor: a keyed row component is made once, and its layout changes under it
  const r = { resource: props.row().resource }
  const calendar = props.view.calendar
  // the range selected by dragging on this row
  const selected = (): string | undefined => {
    const x = calendar.selection()
    if (x === null || x.allDay || x.resourceId !== r.resource.id) return undefined
    const a = axisFraction(props.model(), x.start)
    const b = axisFraction(props.model(), x.end)

    return `inset-inline-start:${(a * 100).toFixed(3)}%;inline-size:${((b - a) * 100).toFixed(3)}%`
  }

  return (
    <div class="pcal-tl-row" role="row" data-resource={r.resource.id} style={() => `block-size:${rowHeight(props.row())}px`}>
      <div class="pcal-tl-name" role="rowheader">
        {r.resource.title}
      </div>
      <div class="pcal-tl-lane" role="gridcell" data-resource={r.resource.id} style={`--pcal-tl-days:${props.days}`}>
        {() => (selected() === undefined ? null : <div class="pcal-tl-selection" aria-hidden="true" style={selected()} />)}
        <For each={() => props.row().blocks} by={(b: TimelineBlock) => b.key}>
          {(block: TimelineBlock) => <Block block={block} occurrences={props.occurrences} view={props.view} />}
        </For>
      </div>
    </div>
  )
}

/** The hours written along the top when only one or two days are shown. */
function hourMarks(from: number, to: number): number[] {
  const marks: number[] = []
  for (let h = Math.ceil(from / 60); h * 60 < to; h += 2) marks.push(h)

  return marks
}

/**
 * The timeline: one row per resource (a room, a person), the shown days side by side along the top, each event a bar in the
 * row of its resource (an event with several resources is in each row; overlapping events stack in lanes in the row). The rows
 * are windowed (their heights are known), so 200 resources cost the rows on screen; the resource column and the header stay in
 * place when the grid scrolls. Drag a bar to another row to give the event to that resource.
 */
export function TimelineView<Meta = unknown>(props: ViewProps<Meta>): VNodeChild {
  const calendar = props.calendar
  const scroll = signal(0)
  const viewport = signal(560)
  const model = computed(() => calendar.timeline())
  const occurrences = computed(() => new Map(calendar.occurrences().map((o) => [o.key, o as EventOccurrence<Meta>])))
  // the empty state is a value of its own, so a scroll or an edit does not rebuild the body
  const empty = computed(() => model().rows.length === 0)
  const byId = computed(() => new Map(model().rows.map((r) => [r.resource.id, r])))
  const window = computed(() => windowRows(model().rows.map(rowHeight), scroll(), viewport(), 4))
  let root: HTMLElement | null = null

  onMount(() => {
    if (root === null) return undefined
    const el = root
    viewport.set(el.clientHeight || 560)
    const watch = new ResizeObserver(() => viewport.set(el.clientHeight || 560))
    watch.observe(el)

    return () => watch.disconnect()
  })

  usePointer(
    () => root,
    calendar,
    'timeline',
  )

  return (
    <div
      class={props.class ?? 'pcal-timeline'}
      role="grid"
      data-view="timeline"
      aria-label={() => `${calendar.messages().views.timeline ?? 'Timeline'}, ${calendar.title()}`}
      aria-rowcount={() => model().rows.length + 1}
      style={() => `--pcal-tl-days:${model().dates.length}`}
      ref={(el: HTMLElement | null) => {
        root = el
      }}
      onScroll={(e: Event) => scroll.set((e.currentTarget as HTMLElement).scrollTop)}
      onKeyDown={(e: KeyboardEvent) => {
        const hit = (e.target as HTMLElement).closest<HTMLElement>('.pcal-event[data-key]')
        if (hit?.dataset.key !== undefined && timelineKey(calendar, hit.dataset.key, hit.dataset.resource, e, isRtl(root))) e.preventDefault()
      }}
    >
      <div class="pcal-tl-head" role="row">
        <div class="pcal-tl-corner" role="columnheader">
          {() => calendar.messages().resource}
        </div>
        <div class="pcal-tl-axis">
          <div class="pcal-tl-days">
            {() =>
              model().dates.map((d) => (
                <div class="pcal-tl-day" role="columnheader" data-today={calendar.todayDate() === d ? '' : undefined} aria-label={dayLabel(d, calendar.locale())}>
                  <span class="pcal-colhead-weekday">{dayWeekday(Number(new Date(`${d}T00:00:00Z`).getUTCDay() || 7), calendar.locale(), 'short')}</span>
                  <span class="pcal-colhead-date">{formatDate(d, { locale: calendar.locale(), day: 'numeric' })}</span>
                </div>
              ))
            }
          </div>
          {() =>
            model().dates.length <= 2 ? (
              <div class="pcal-tl-hours" aria-hidden="true">
                {model().dates.flatMap(() => hourMarks(model().from, model().to).map((h) => <span style={`inset-inline-start:${(((h * 60 - model().from) / (model().to - model().from)) * 100).toFixed(3)}%`}>{h}</span>))}
              </div>
            ) : null
          }
        </div>
      </div>
      {() =>
        empty() ? (
          <p class="pcal-agenda-empty">{() => calendar.messages().noEvents}</p>
        ) : (
          <div class="pcal-tl-body" style={() => `block-size:${window().total}px`}>
            {() => (model().now === null ? null : <div class="pcal-tl-nowarea" aria-hidden="true"><div class="pcal-tl-now" style={`inset-inline-start:${((model().now as number) * 100).toFixed(3)}%`} /></div>)}
            <div class="pcal-tl-window" style={() => `transform:translateY(${window().offset}px)`}>
              <For each={() => model().rows.slice(window().start, window().end)} by={(r: TimelineRow) => r.resource.id}>
                {(row: TimelineRow) => <Row id={row.resource.id} row={() => byId().get(row.resource.id) ?? row} occurrences={() => occurrences()} view={props} days={model().dates.length} model={() => model()} />}
              </For>
            </div>
          </div>
        )
      }
    </div>
  )
}

/**
 * The keyboard of a grabbed bar in the timeline: left and right move it in time (by the step), up and down give it to the
 * resource above or below, Shift with left and right resizes the end, Enter grabs and drops, Escape cancels.
 */
function timelineKey<Meta>(calendar: ViewProps<Meta>['calendar'], key: string, resourceId: string | undefined, e: KeyboardEvent, rtl: boolean): boolean {
  const editing = calendar.editing()
  if (editing?.key === key && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
    const rows = calendar.timeline().rows
    const current = editing.target.resourceId ?? resourceId
    const at = rows.findIndex((r) => r.resource.id === current)
    const next = rows[at + (e.key === 'ArrowDown' ? 1 : -1)]
    if (next === undefined || resourceId === undefined) return true
    calendar.previewEdit({ ...editing.target, resourceId: next.resource.id, fromResourceId: editing.target.fromResourceId ?? resourceId })

    return true
  }
  // time runs along the row: left and right are the time grid's up and down
  const mapped = { ArrowLeft: rtl ? 'ArrowDown' : 'ArrowUp', ArrowRight: rtl ? 'ArrowUp' : 'ArrowDown' }[e.key]
  if (editing?.key === key && mapped !== undefined) {
    const event = new KeyboardEvent('keydown', { key: mapped, shiftKey: e.shiftKey })

    return calendar.onEventKeyDown(key, event, 'time', { rtl: false })
  }

  return calendar.onEventKeyDown(key, e, 'time', { rtl })
}
