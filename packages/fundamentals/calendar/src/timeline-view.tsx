/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- the WAI-ARIA grid pattern: rows are resources, a row has one cell per shown day under the day headers, the events of a day are buttons inside its cell, and the cells are the roving focus targets (exactly one has tabindex 0) */
import { For, onMount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { formatDate } from '@pyreon/format'
import { computed, signal } from '@pyreon/reactivity'
import { dayLabel, eventLabel } from './labels'
import { Handles, colorStyle, dayWeekday, editState, isRtl, usePointer } from './month-view'
import type { ViewProps } from './month-view'
import type { Calendar } from './calendar-types'
import type { TimelineBlock, TimelineRow } from './timeline'
import type { TimelineModel } from './view-models'
import type { EventOccurrence, PlainDate } from './types'
import { windowRows } from './window'
import type { RowWindow } from './window'

/** Pixels of one lane of events in a row, and the space around a row's lanes (the stylesheet's row is these numbers). */
const LANE = 28
const PAD = 4

const rowHeight = (row: TimelineRow): number => row.lanes * LANE + PAD * 2

function Block<Meta>(props: { block: () => TimelineBlock; occurrences: () => Map<string, EventOccurrence<Meta>>; view: ViewProps<Meta> }): VNodeChild {
  const first = props.block()
  const o = props.occurrences().get(first.occurrenceKey)
  if (o === undefined) return null
  const calendar = props.view.calendar

  // the block is read through an accessor: a keyed block is made once and its place changes under it (a new window, an edit)
  const b = (): TimelineBlock => props.block()
  const state = editState(calendar, o.key)

  const label = (): string => eventLabel(o as EventOccurrence, calendar.locale(), calendar.messages())

  return (
    <button
      type="button"
      class="pcal-event pcal-tl-block"
      tabIndex={-1}
      style={() => `inset-inline-start:${(b().left * 100).toFixed(4)}%;inline-size:${(b().width * 100).toFixed(4)}%;inset-block-start:${PAD + b().lane * LANE}px;block-size:${LANE - 4}px${colorStyle(o.event.color)}`}
      data-key={o.key}
      data-resource={first.resourceId}
      data-all-day={o.allDay ? '' : undefined}
      data-continues-before={() => (b().continuesBefore ? '' : undefined)}
      data-continues-after={() => (b().continuesAfter ? '' : undefined)}
      data-editable={state.editable}
      data-dragging={state.dragging}
      data-pending={state.pending}
      aria-label={() => label()}
      onClick={() => calendar.eventClick(o.key)}
    >
      {props.view.renderEvent === undefined ? <span class="pcal-event-title">{o.title}</span> : props.view.renderEvent({ occurrence: o, label: label(), continuesBefore: first.continuesBefore, continuesAfter: first.continuesAfter })}
      <Handles calendar={calendar} occurrenceKey={o.key} startEdge={!first.continuesBefore} endEdge={!first.continuesAfter} />
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

/** The day a block starts in: its cell (a block that runs on is drawn from its first day's cell, as the time grid draws a block from the slot it starts in). */
const dayOfBlock = (b: TimelineBlock, days: number): number => Math.min(days - 1, Math.max(0, Math.floor(b.left * days + 1e-9)))

interface RowProps<Meta> {
  id: string
  row: () => TimelineRow
  /** The row's place in the grid (the header is 1), for `aria-rowindex`: a windowed row says where it is in the whole list. */
  index: () => number
  occurrences: () => Map<string, EventOccurrence<Meta>>
  view: ViewProps<Meta>
  model: () => TimelineModel
  /** The cell that holds the grid's one tab stop. */
  focus: () => { id: string | undefined; date: PlainDate | undefined }
}

function Row<Meta>(props: RowProps<Meta>): VNodeChild {
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
  // opening hours along the lane (under the bars), as fractions of the whole axis
  const open = (): { start: number; size: number }[] => {
    const m = props.model()
    const n = m.dates.length

    return m.business.flatMap((windows, i) => (windows ?? []).map((w) => ({ start: (i + w.top) / n, size: w.height / n })))
  }

  return (
    <div class="pcal-tl-row" role="row" aria-rowindex={() => props.index()} data-resource={r.resource.id} style={() => `block-size:${rowHeight(props.row())}px`}>
      <div class="pcal-tl-name" role="rowheader">
        {r.resource.title}
      </div>
      <div class="pcal-tl-lane" role="none" data-resource={r.resource.id} style={() => `--pcal-tl-days:${props.model().dates.length}`}>
        {() => open().map((w) => <div class="pcal-tl-open" aria-hidden="true" style={`inset-inline-start:${(w.start * 100).toFixed(3)}%;inline-size:${(w.size * 100).toFixed(3)}%`} />)}
        {() => (selected() === undefined ? null : <div class="pcal-tl-selection" aria-hidden="true" style={selected()} />)}
        <For each={() => props.model().dates.map((date, i) => ({ date, i }))} by={(d: { date: PlainDate }) => d.date}>
          {(day: { date: PlainDate; i: number }) => {
            const index = (): number => props.model().dates.indexOf(day.date)
            const business = (): 'open' | 'closed' | undefined => {
              const windows = props.model().business[index()]
              if (windows === null || windows === undefined) return undefined

              return windows.length > 0 ? 'open' : 'closed'
            }

            return (
              <div
                class="pcal-tl-cell"
                role="gridcell"
                data-date={day.date}
                data-business={() => business()}
                tabIndex={() => (props.focus().id === r.resource.id && props.focus().date === day.date ? 0 : -1)}
              >
                <span class="pcal-sr">{() => dayLabel(day.date, calendar.locale())}</span>
                <For each={() => props.row().blocks.filter((b) => dayOfBlock(b, props.model().dates.length) === index())} by={(b: TimelineBlock) => b.key}>
                  {(block: TimelineBlock) => <Block block={() => props.row().blocks.find((x) => x.key === block.key) ?? block} occurrences={props.occurrences} view={props.view} />}
                </For>
              </div>
            )
          }}
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

/** The rows to draw: all of them, or (above the `windowed` threshold) the ones on screen, with their offset and the total height. */
function rowWindow(windowed: () => boolean | number | undefined, model: () => TimelineModel, scroll: () => number, viewport: () => number): () => RowWindow {
  const windowing = computed(() => {
    const w = windowed()
    const n = model().rows.length

    return w === undefined ? n > WINDOW_ABOVE : typeof w === 'number' ? n > w : w
  })

  return computed(() => {
    const heights = model().rows.map(rowHeight)
    if (windowing()) return windowRows(heights, scroll(), viewport(), 4)

    return { start: 0, end: heights.length, offset: 0, total: heights.reduce((a, b) => a + b, 0) }
  })
}

/** The timeline view's own props. */
export interface TimelineViewProps<Meta = unknown> extends ViewProps<Meta> {
  /**
   * Draw only the rows on screen: `true` always, `false` never, a number when there are more resources than it. Default 100.
   * Every row carries its `aria-rowindex` either way, but a screen reader's reading cursor reaches only the rows in the DOM, so
   * a short list is drawn whole.
   */
  windowed?: boolean | number
}

/** Draw all the rows up to this many resources (see `windowed`). */
const WINDOW_ABOVE = 100

/**
 * The timeline: one row per resource (a room, a person), the shown days side by side along the top, each event a bar in the
 * row of its resource (an event with several resources is in each row; overlapping events stack in lanes in the row). A
 * WAI-ARIA grid: a header row of days, then a row per resource whose cells are its days (the events of a day are buttons in
 * its cell), opening hours marked, one tab stop with the arrows moving by day and resource (Home and End to the first and
 * last day, Ctrl with them to the first and last resource, PageUp and PageDown by ten resources), Enter into a cell's events
 * (or selecting the day when it has none), Escape back out. A long list of resources is windowed (their heights are known),
 * so 200 resources cost the rows on screen, each still numbered by `aria-rowindex`; the resource column and the header stay
 * in place when the grid scrolls. Drag a bar to another row to give the event to that resource.
 */
export function TimelineView<Meta = unknown>(props: TimelineViewProps<Meta>): VNodeChild {
  const calendar = props.calendar
  const scroll = signal(0)
  const viewport = signal(560)
  const model = computed(() => calendar.timeline())
  const occurrences = computed(() => new Map(calendar.occurrences().map((o) => [o.key, o as EventOccurrence<Meta>])))
  // the empty state is a value of its own, so a scroll or an edit does not rebuild the body
  const empty = computed(() => model().rows.length === 0)
  const byId = computed(() => new Map(model().rows.map((r, i) => [r.resource.id, { row: r, index: i }])))
  const window = rowWindow(() => props.windowed, model, scroll, viewport)
  // the cell with the grid's one tab stop: a resource and a day (the calendar's cursor day until the arrows move it)
  const focusAt = signal<{ id: string | undefined; date: PlainDate | undefined }>({ id: undefined, date: undefined })
  const focus = computed(() => {
    const m = model()
    const at = focusAt()
    const id = at.id !== undefined && byId().has(at.id) ? at.id : m.rows[0]?.resource.id
    const cursor = calendar.cursor().date
    const date = at.date !== undefined && m.dates.includes(at.date) ? at.date : m.dates.includes(cursor) ? cursor : m.dates[0]

    return { id, date }
  })
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

  const keys = timelineKeyboard({ calendar, model, byId, window, viewport, scroll, focusAt, root: () => root })

  return (
    <div
      class={props.class ?? 'pcal-timeline'}
      role="grid"
      data-view="timeline"
      aria-label={() => `${calendar.messages().views.timeline ?? 'Timeline'}, ${calendar.title()}`}
      aria-rowcount={() => model().rows.length + 1}
      aria-colcount={() => model().dates.length + 1}
      // a grid with no cells is still a scrolling region: it takes the focus itself so a keyboard can reach and scroll it
      tabIndex={() => (empty() ? 0 : -1)}
      style={() => `--pcal-tl-days:${model().dates.length}`}
      ref={(el: HTMLElement | null) => {
        root = el
      }}
      onScroll={(e: Event) => scroll.set((e.currentTarget as HTMLElement).scrollTop)}
      onKeyDown={(e: KeyboardEvent) => {
        const target = e.target as HTMLElement
        const hit = target.closest<HTMLElement>('.pcal-event[data-key]')
        if (hit?.dataset.key !== undefined) {
          if (timelineKey(calendar, hit.dataset.key, hit.dataset.resource, e, isRtl(root))) {
            e.preventDefault()

            return
          }
          // a bar being moved owns the arrows; a bar at rest moves the grid's focus from its cell
          if (calendar.editing() !== null) return
        }
        const cell = target.closest<HTMLElement>('.pcal-tl-cell')
        if (cell !== null && keys(cell, e, hit !== null)) e.preventDefault()
      }}
    >
      <TimelineHead calendar={calendar} model={() => model()} />
      {() =>
        empty() ? (
          // a grid's children are rows: the empty state is a row whose one cell spans the columns
          <div class="pcal-tl-row" role="row" aria-rowindex={2}>
            <div class="pcal-tl-empty pcal-agenda-empty" role="gridcell" aria-colspan={model().dates.length + 1}>
              {() => calendar.messages().noEvents}
            </div>
          </div>
        ) : (
          <div class="pcal-tl-body" role="none" style={() => `block-size:${window().total}px`}>
            {() => (model().now === null ? null : <div class="pcal-tl-nowarea" aria-hidden="true"><div class="pcal-tl-now" style={`inset-inline-start:${((model().now as number) * 100).toFixed(3)}%`} /></div>)}
            <div class="pcal-tl-window" role="none" style={() => `transform:translateY(${window().offset}px)`}>
              <For each={() => model().rows.slice(window().start, window().end)} by={(r: TimelineRow) => r.resource.id}>
                {(row: TimelineRow) => (
                  <Row
                    id={row.resource.id}
                    row={() => byId().get(row.resource.id)?.row ?? row}
                    index={() => (byId().get(row.resource.id)?.index ?? 0) + 2}
                    occurrences={() => occurrences()}
                    view={props}
                    model={() => model()}
                    focus={() => focus()}
                  />
                )}
              </For>
            </div>
          </div>
        )
      }
    </div>
  )
}

/** The header row: the resource column's head and a column header per shown day (with the hours along the top for one or two days). */
function TimelineHead<Meta>(props: { calendar: Calendar<Meta>; model: () => TimelineModel }): VNodeChild {
  const calendar = props.calendar
  const model = props.model

  return (
  <div class="pcal-tl-head" role="row" aria-rowindex={1}>
    <div class="pcal-tl-corner" role="columnheader">
      {() => calendar.messages().resource}
    </div>
    <div class="pcal-tl-axis" role="none">
      <div class="pcal-tl-days" role="none">
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
  )
}

/** Where a grid key moves the focus from a resource's day: `[row, day]` (clamped later), or `null` for a key that does not move it. */
function gridMove(key: string, at: { row: number; day: number; rows: number; days: number; rtl: boolean; ctrl: boolean }): [number, number] | null {
  const back = at.rtl ? 1 : -1
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [at.row, at.day + back],
    ArrowRight: [at.row, at.day - back],
    ArrowUp: [at.row - 1, at.day],
    ArrowDown: [at.row + 1, at.day],
    Home: at.ctrl ? [0, at.day] : [at.row, 0],
    End: at.ctrl ? [at.rows - 1, at.day] : [at.row, at.days - 1],
    PageUp: [at.row - 10, at.day],
    PageDown: [at.row + 10, at.day],
  }

  return moves[key] ?? null
}

interface KeyboardContext<Meta> {
  calendar: Calendar<Meta>
  model: () => TimelineModel
  byId: () => Map<string, { row: TimelineRow; index: number }>
  window: () => { start: number; end: number }
  viewport: () => number
  scroll: { set(value: number): void }
  focusAt: { set(value: { id: string | undefined; date: PlainDate | undefined }): void }
  root: () => HTMLElement | null
}

/**
 * The grid keyboard of the timeline, on a cell (or on a bar at rest, for the moves and Escape): the arrows by day and
 * resource, Home and End (with Ctrl, the first and last resource), PageUp and PageDown by ten, Enter into the day's events
 * (or selecting the day when it has none), Escape from an event back to its cell. Returns whether it handled the key.
 */
function timelineKeyboard<Meta>(c: KeyboardContext<Meta>): (cell: HTMLElement, e: KeyboardEvent, fromEvent: boolean) => boolean {
  /** Move the tab stop to a resource's day and focus it, scrolling a windowed row into the drawn rows first. */
  const moveTo = (rowIndex: number, dayIndex: number): void => {
    const m = c.model()
    const row = m.rows[Math.min(Math.max(rowIndex, 0), m.rows.length - 1)]
    const date = m.dates[Math.min(Math.max(dayIndex, 0), m.dates.length - 1)]
    const el = c.root()
    if (row === undefined || date === undefined || el === null) return
    const at = c.byId().get(row.resource.id)?.index ?? 0
    const w = c.window()
    if (at < w.start + 1 || at >= w.end - 1) {
      // the row's top, less a third of the viewport so it is not at the very edge
      let top = 0
      for (let i = 0; i < at; i++) top += rowHeight(m.rows[i] as TimelineRow)
      const next = Math.max(0, top - c.viewport() / 3)
      el.scrollTop = next
      c.scroll.set(next)
    }
    c.focusAt.set({ id: row.resource.id, date })
    const selector = `.pcal-tl-row[data-resource="${CSS.escape(row.resource.id)}"] [role=gridcell][data-date="${date}"]`
    const cell = el.querySelector<HTMLElement>(selector)
    if (cell !== null) cell.focus()
    else queueMicrotask(() => el.querySelector<HTMLElement>(selector)?.focus())
  }
  /** Enter on a cell: into its first event, or select the day of that resource when it has none. */
  const enter = (cell: HTMLElement, id: string, day: number): void => {
    const first = cell.querySelector<HTMLElement>('.pcal-event[data-key]')
    if (first !== null) {
      first.focus()

      return
    }
    const m = c.model()
    const date = m.dates[day] as PlainDate
    c.calendar.select({ date, minute: m.from }, { date, minute: Math.max(m.from, m.to - c.calendar.timeGrid().slot) }, 'time', id)
  }

  return (cell, e, fromEvent) => {
    const m = c.model()
    const id = cell.closest<HTMLElement>('.pcal-tl-row')?.dataset.resource
    const row = id === undefined ? -1 : (c.byId().get(id)?.index ?? -1)
    const day = m.dates.indexOf(cell.dataset.date as PlainDate)
    if (id === undefined || row < 0 || day < 0) return false
    const move = gridMove(e.key, { row, day, rows: m.rows.length, days: m.dates.length, rtl: isRtl(c.root()), ctrl: e.ctrlKey || e.metaKey })
    if (move !== null) {
      moveTo(move[0], move[1])

      return true
    }
    if (e.key === 'Escape' && fromEvent) {
      moveTo(row, day)

      return true
    }
    if ((e.key === 'Enter' || e.key === ' ') && !fromEvent) {
      enter(cell, id, day)

      return true
    }

    return false
  }
}

/**
 * The keyboard of a grabbed bar in the timeline: left and right move it in time (by the step), up and down give it to the
 * resource above or below, Shift with left and right resizes the end, Enter grabs and drops, Escape cancels.
 */
function timelineKey<Meta>(calendar: Calendar<Meta>, key: string, resourceId: string | undefined, e: KeyboardEvent, rtl: boolean): boolean {
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
