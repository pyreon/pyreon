---
title: Calendar
description: An event calendar and scheduler for Pyreon — event model, recurrence and time zones, month and time-grid layout
---

<PackageBadge name="@pyreon/calendar" href="/docs/calendar" />

`@pyreon/calendar` is an event calendar: the events of an app laid out in a month, a week or a day. It is built in slices. This page covers the pure core, `@pyreon/calendar/core` (no DOM, no `@pyreon/core`: the event model, recurrence and zones, the window of each view, the two layout algorithms), the reactive calendar (`createCalendar`) and the month and time-grid views. Drag to move, resize and create, the agenda, year and timeline views, and resources follow.

> **Experimental.** No drag or resize yet: you can read the calendar, move around it, select a day or a slot and click an event.

## Installation

```bash
bun add @pyreon/calendar
```

It depends on `@pyreon/time` (values, grids, zones), `@pyreon/schedule` (recurrence), `@pyreon/ambient` (locale, zone, clock) and `@pyreon/format` (labels), which install with it. The components also need `@pyreon/core`.

| Entry | What |
| --- | --- |
| `@pyreon/calendar/core` | the pure core. Only `@pyreon/time/core` and `@pyreon/schedule/core`. |
| `@pyreon/calendar` | the core plus `createCalendar`, the labels and the keyboard helpers. |
| `@pyreon/calendar/components` | `<Calendar>`, `<MonthView>`, `<WeekView>`, `<DayView>`, `<CalendarToolbar>`. |
| `@pyreon/calendar/styles.css` | an optional default look. |

## Events

An event is plain, JSON-safe data. The app owns it; nothing here changes it.

```ts
import { allDay } from '@pyreon/calendar/core'
import type { CalendarEvent } from '@pyreon/calendar/core'

const events: CalendarEvent[] = [
  { id: 'review', title: 'Design review', start: '2026-11-18T14:00', end: '2026-11-18T15:00', timeZone: 'Europe/Prague' },
  { id: 'holiday', title: 'Public holiday', ...allDay('2026-11-17') },
  { id: 'standup', title: 'Standup', start: '2026-11-16T09:00', end: '2026-11-16T09:15', recurrence: { every: 'day', start: '2026-11-16T09:00', count: 5 } },
]
```

| `start` and `end` | Meaning |
| --- | --- |
| dates (`'2026-11-18'`) | An all-day event. It never moves with the time zone. `end` is exclusive: `allDay(date, days = 1)` makes the pair. |
| date-times (`'2026-11-18T14:00'`) | A wall clock. With `timeZone` it is that zone's clock ("14:00 in Prague": a viewer in New York sees 8:00). Without, it is floating: the same clock in whatever zone is displayed. |
| numbers (milliseconds) | An instant, shown in the display zone. Its key does not change when the display zone does. |

`end` is exclusive everywhere: a timed event that ends exactly at midnight is not on the next day, and an all-day event on the 18th ends on the 19th. An all-day event whose end equals its start is one day; a timed one is a moment. An end before the start, a date mixed with a date-time, an unknown `timeZone` and the like throw a `[Pyreon] calendar:` error that names the event.

### Recurrence and overrides

`recurrence` is a `@pyreon/schedule` rule. It starts at the event's start (the event's start wins if the rule's differs) and is expanded in the event's own wall clock, so "09:00 in Prague" stays 09:00 in Prague across a DST change. `overrides` are keyed by the original start of an occurrence (`'2026-11-18T09:00'`, or `'2026-11-18'` for an all-day event):

```ts
const standup = {
  id: 'standup',
  title: 'Standup',
  start: '2026-11-16T09:00',
  end: '2026-11-16T09:15',
  timeZone: 'Europe/Prague',
  recurrence: { every: 'day', start: '2026-11-16T09:00', count: 5 },
  overrides: {
    '2026-11-17T09:00': { cancelled: true },
    '2026-11-18T09:00': { title: 'Standup (moved)', start: '2026-11-18T10:00', end: '2026-11-18T10:15' },
  },
}
```

### `expandOccurrences`

```ts
import { expandOccurrences } from '@pyreon/calendar/core'

const occurrences = expandOccurrences(events, { start: '2026-11-16', end: '2026-11-23' }, 'America/New_York')
occurrences[0]?.key // 'standup:2026-11-16T09:00'
occurrences[0]?.start // '2026-11-16T03:00': in the display zone
```

It returns the occurrences that touch the window (half-open, in dates of the display zone), placed in the display zone, sorted by start (longer first among equal starts, then by key). The `key` is `"<id>:<original start>"`: the same in every window, so a view can key its rows by it. Two events with one id are both listed and the second key gets a `~2`, but give events unique ids.

## Views

```ts
import { navigate, viewTitle, visibleRange } from '@pyreon/calendar/core'

const week = visibleRange('week', '2026-11-18', { weekStart: 1 })
week.range // { start: '2026-11-16', end: '2026-11-23' } (end exclusive)
week.dates // the shown dates, hidden weekdays removed
navigate('week', '2026-11-18', 1) // '2026-11-25'
viewTitle(week, (info) => `${info.first} to ${info.last}`) // the formatter is yours
```

| View | Window |
| --- | --- |
| `month` | The grid of the month: whole weeks, so it includes the leading and trailing days. `rows` has one row per week. |
| `week`, `workWeek` | Seven days from `weekStart` (any weekday); `workWeek` hides `weekend` (Saturday and Sunday by default). |
| `day`, `days` | One day, or `days` days (default 3) from the date. |
| `agenda` | `agendaDays` days (default 30) from the date. |
| `year` | The calendar year (366 days in a leap year). |

`hiddenDays` removes weekdays from `dates` and `rows` in any view (a month then has fewer columns and keeps the leading and trailing days of the visible weeks); a day view on a hidden weekday has no dates. `navigate` moves by the unit of the view: a month (a 31st goes to the last day of a shorter month), a week, a day, `days` days, an agenda, a year. The title comes from a callback so the core needs no locale: the reactive calendar passes the real formatter.

## Month layout: lanes

```ts
import { layoutMonth, visibleRange } from '@pyreon/calendar/core'

const month = visibleRange('month', '2026-11-18')
const weeks = layoutMonth(occurrences, month.rows, 3) // capacity: three lanes per week
weeks[2]?.lanes[0] // the segments of the top lane: { startColumn, endColumn, lane, continuesBefore, continuesAfter }
weeks[2]?.more // per column, how many segments the capacity hid: "+N more"
```

Each occurrence becomes one segment per row it touches, cut at the row's edges with `continuesBefore` and `continuesAfter` flags (to draw the arrow or the square corner). The order is longer first, then all-day before timed, then earlier, then by key: a total order, so the lanes do not depend on the order of the input, and an event you add does not shuffle the others. With a `capacity`, lanes past it are dropped and counted per day in `more`. `layoutRow` is the same for one row, which is also the all-day row of a time grid.

## Time grid: columns and blocks

```ts
import { layoutDay, layoutTimeGrid, nowOffset } from '@pyreon/calendar/core'

const blocks = layoutDay('2026-11-18', occurrences, 'Europe/Prague', { dayStart: '08:00', dayEnd: '20:00' })
blocks[0] // { top, height, left, width, column, columns, span, continuesBefore, continuesAfter, ... }: fractions of the visible day
nowOffset('2026-11-18', Date.now(), 'Europe/Prague') // the now line, or null
```

- **Packing.** Events that overlap, directly or in a chain, form a group; the group's events get columns by the usual interval colouring (the first free column), and each event then grows to the right through the columns that are free for its whole length, so a lone event beside a crowd is wide. The result depends only on the events, not their order. `pinned` (a map from key to column) keeps events in their column: pass the previous columns while one event is dragged and the others stay where they are. A short event is drawn at least `minBlockMinutes` tall (15), and takes a column for that height.
- **Midnight.** An event across midnight is a block on each day, flagged `continuesBefore` / `continuesAfter`. An event that ends exactly at midnight is not on the next day.
- **`dayStart` and `dayEnd`** clip the visible day (`'24:00'` for the end); events outside it are dropped, events across its edges are cut and flagged. `slotTimes` lists the rows.
- **Performance.** Placement is a binary search, so 200 events in one hour is not quadratic; the package's tests lay out 1,000 events in a month and 500 in a week well within a second. A `daySignature` string changes exactly when a day's blocks would, so a reactive layer can skip a day that did not change.

### Days that change length

A time grid is a **wall-clock grid**: a row is the hour the clock shows, and every day has the same rows, so a week reads straight across.

- On the day a zone **skips an hour** (spring forward, 23 hours) that hour's row is empty, and an event across it is taller than it lasts: 01:30 to 03:30 is one hour long and two rows tall. Nothing can start inside the skipped hour.
- On the day a zone **repeats an hour** (fall back, 25 hours) the second pass is drawn over the same rows as the first. Two events that overlap on screen share columns even though they do not overlap in time. An event that reads as ending before it starts (it starts in the first pass and ends in the second) gets its minimum height.
- **The now line** follows the clock: during the repeated hour it is at the same row in both passes. `dayBounds(date, zone).elapsedMinutes` is 1380 or 1500 on those days, if you need the real length.

This is the choice Google Calendar and most schedulers make; the alternative (a grid in elapsed time) would give the DST day different rows from its neighbours and break the shared time gutter.

## The reactive calendar

```tsx
import { createCalendar } from '@pyreon/calendar'
import { Calendar } from '@pyreon/calendar/components'
import '@pyreon/calendar/styles.css'

const calendar = createCalendar({
  events: () => events(), // a reactive source; the calendar never changes it
  view: 'month', // a value, or a signal you own
  onRangeChange: (range) => load(range), // fetch the events of the visible window
  onSelect: (range) => openNewEventDialog(range), // a clicked day or slot, or a confirmed keyboard range
  onEventClick: (event, occurrence) => openEvent(event.id, occurrence.occurrence),
})

export const App = () => <Calendar calendar={calendar} />
```

`createCalendar(options)` returns the state; the components are one way to draw it, and you can draw it yourself.

| Option | |
| --- | --- |
| `events` | Reactive. A new array is fine; an unchanged event costs nothing. |
| `view`, `date` | A value (the calendar owns the state; `setView`, `goTo`, `next`, `previous` and `today` change it) or a `signal` you own (controlled: the calendar follows it and writes to it). `date` defaults to today in the display zone. |
| `timeZone`, `locale` | Accessors. Default: the ambient ones from `@pyreon/ambient` (`setLocale`, `provideLocale`, `setTimeZone`), so a change re-renders the title, the labels and the places of events. |
| `weekStart`, `weekend`, `hiddenDays` | Default to the locale's (`weekStartOf`, `weekendOf`); `hiddenDays: [6, 7]` removes weekend columns. |
| `dayStart`, `dayEnd`, `slot`, `minBlockMinutes` | The visible hours, the row size (30 minutes) and the shortest block (15). |
| `businessHours` | A `WorkingHours` (from `@pyreon/schedule`) or a `BusinessCalendar` (with `weekend` and `holidays`): the hours outside it are shaded (`data-business="closed"`). |
| `monthCapacity` | Segments per week row before "+N more" (3). |
| `days` | How many days the `'days'` view shows (3). |
| `now` | The clock for the now line. Default: the ambient clock (a minute tick; on the server, the instant the page was rendered at, which is how the HTML matches what the client hydrates). |

What it gives: `range()` (the visible window, end exclusive, a month with its leading and trailing days), `dates()`, `title()` (through `@pyreon/format`, in the active locale: "November 2026", "16 – 22 Nov 2026"), `month()` and `timeGrid()` (the view models below), `occurrences()`, `cursor()` (the focused cell), `selection()`, `announcement()`.

### View models, and what recomputes

`month()` is the weeks of the grid; `timeGrid()` is the days of a time grid. Each week's `layout()` and each day's `blocks()` and `nowOffset()` is its own computed, **memoised by a signature of the occurrences it holds**: changing one event recomputes only the days and weeks it touches (a test counts the layouts, and a real-browser test checks that the other days' DOM nodes are not mutated and their event components do not run again). Node identity is stable too: weeks and days are keyed, so a keyed `<For>` keeps their nodes when you navigate. `instrument: { layoutDay, layoutRow }` is a hook that is called on each layout, for tests and profiling.

## Views

```tsx
import { CalendarToolbar, MonthView, WeekView } from '@pyreon/calendar/components'

export function Planner(props: { calendar: Calendar }) {
  return (
    <>
      <CalendarToolbar calendar={props.calendar} views={['month', 'week']} />
      <MonthView calendar={props.calendar} labels={{}} />
    </>
  )
}
```

`<Calendar calendar>` is the toolbar, the view the calendar is on and a live region; `<MonthView>`, `<WeekView>`/`<DayView>` (the time grid) and `<CalendarToolbar>` are usable on their own. The agenda, year and timeline views are not part of this release; `<Calendar>` shows the month for them.

- **Render slots**: `renderEvent({ occurrence, label, continuesBefore, continuesAfter })` (what goes inside an event; keep the accessible name, which is `label`), `renderDay(cell)` (the head of a day in a month), `renderMore(count, date)` and `onMore(date)` (the "+N more" button).
- **Words**: `labels` replaces every string the calendar says ("all day", "today", "N more", the names of the views, the grid names), for a translation.
- **Styling**: `@pyreon/calendar/styles.css` is a small default look; or style the `pcal-*` classes and data attributes (`data-today`, `data-selected`, `data-outside`, `data-weekend`, `data-business`, `data-continues-before`, `data-continues-after`, `data-recurring`). Sizes and colours are custom properties on `.pcal` (`--pcal-slot`, `--pcal-lane-size`, `--pcal-event`, ...); an event's `color` becomes its `--pcal-event`.

### The month

A WAI-ARIA **grid** of day cells. The events are buttons inside the cell they start in, sized to span the days they last, in lanes (longer first), with "+N more" when a week holds more than `monthCapacity` lanes. A multi-day event that continues into the next week starts again, with `data-continues-before`, in that week's first cell.

### The week, the work week, the day

A WAI-ARIA **grid** whose rows are the slots and whose columns are the days, with a header row, an all-day row, a time gutter, each event a button inside the slot it starts in (placed and sized by the column packing), opening hours shaded, and the now line in the slot the clock is in (also on a day with a skipped or repeated hour: see "Days that change length"). A week in `hiddenDays` has fewer columns. Slots are `slot` minutes (30 by default) from `dayStart` to `dayEnd`.

## Keyboard and accessibility

| Key | Month | Time grid |
| --- | --- | --- |
| Left, Right | a day (swapped in right-to-left; skips hidden weekdays) | a day |
| Up, Down | a week | a slot |
| Home, End | the first and last shown day of the week | the first and last slot of the day |
| PageUp, PageDown | a month (Shift: a year) | a week of columns |
| Shift with the arrows or Home and End | extends a selection | extends a selection (slots, across days) |
| Enter, Space | selects the focused day, or confirms the range Shift made (`onSelect`) | the same for slots |
| Escape | clears the selection | the same |

Exactly one cell is in the tab order (the cursor), so Tab enters the grid once and leaves it once; events and "+N more" are buttons you reach with Tab inside it. When the cursor leaves the visible window (PageDown into the next month), the calendar moves there and **focus follows**: it is kept on the cursor cell across view changes and range changes if it was in the grid.

**Why a grid for both views.** A month is a table of days: the grid pattern gives arrow navigation and a cell per day. The time grid is also a grid because its job is choosing a slot (a day and a time) with the keyboard; the events are reachable as buttons inside it, and each carries a full label. A list would read events well but gives no way to choose an empty slot. The events' order in the DOM is row by row (by start time across the days).

**What a screen reader hears.** A day cell is named by its content: its full date ("Wednesday 18 November, today") and the events that start in it. An event is a button named "Design review, Wednesday 18 November, 14:00 to 15:00"; all-day events say "all day" and ones over several days say where they start and end ("Conference, Monday 16 November to Wednesday 18 November, all day"). Today is `aria-current="date"`; selected cells are `aria-selected`. Colour is never the only carrier: a continuation has a square corner (and `data-continues-*`), "+N more" is text. A polite live region says where navigation went ("December 2026, month"). Visible text and accessible names agree (the time of a block is drawn from `data-time`, not as text), which is what `axe-core` checks in the package's tests (month, week and day).

**Right to left.** The arrow keys swap, the layout uses logical properties, events start at the inline start. Direction comes from the element (`dir`); no option is needed. There is no animation, so nothing to reduce.

## Recipes

### A team calendar that loads what is on screen

```tsx
import { createCalendar } from '@pyreon/calendar'
import { Calendar } from '@pyreon/calendar/components'
import type { CalendarEvent } from '@pyreon/calendar'
import { useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'

export function TeamCalendar() {
  const range = signal<{ start: string; end: string } | null>(null)
  const query = useQuery(() => ({
    queryKey: ['events', range()?.start, range()?.end],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const r = range()
      const response = await fetch(`/api/events?from=${r?.start}&to=${r?.end}`)
      return response.json()
    },
    enabled: range() !== null,
    placeholderData: (previous: CalendarEvent[] | undefined) => previous,
  }))
  const calendar = createCalendar({
    events: () => query.data() ?? [],
    onRangeChange: (r) => range.set(r),
  })

  return <Calendar calendar={calendar} />
}
```

`onRangeChange` is called once at the start and whenever the window moves (not when an event changes), with a half-open window of dates in the display zone: fetch that range (send a margin if your server stores events in other zones). Keeping the previous data as a placeholder means the events do not blink while the next window loads.

### Business hours

```ts
const calendar = createCalendar({
  events: () => [],
  view: 'week',
  businessHours: { hours: { 1: [{ from: '09:00', to: '17:00' }], 2: [{ from: '09:00', to: '17:00' }], 3: [{ from: '09:00', to: '12:00' }] }, weekend: [6, 7], holidays: ['2026-12-25'] },
  dayStart: '07:00',
  dayEnd: '20:00',
})
```

A `WorkingHours` alone (`{ 1: [{ from, to }] }`) also works; a window that ends before it starts (22:00 to 02:00) runs overnight and shades the early hours of the next day. Closed slots have `data-business="closed"`.

### Recurring events

```ts
const standup = {
  id: 'standup',
  title: 'Standup',
  start: '2026-11-16T09:00',
  end: '2026-11-16T09:15',
  timeZone: 'Europe/Prague',
  recurrence: { every: 'week', on: { weekdays: [1, 2, 3, 4, 5] }, start: '2026-11-16T09:00' },
  overrides: { '2026-11-18T09:00': { cancelled: true } },
}
```

Every occurrence has its own key (`standup:2026-11-18T09:00`), the same in every window, and `onEventClick(event, occurrence)` is told which one was clicked (`occurrence.occurrence` is the key of an override).

## Notes

- **Display zone and event zones are separate.** Pass the display zone to every function; each event's `timeZone` only decides what its wall clock means.
- **All-day events never shift.** They are dates, not instants.
- **The core never mutates your events**, and every function is pure, so results can be cached by their inputs.
