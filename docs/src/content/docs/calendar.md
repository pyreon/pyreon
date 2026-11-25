---
title: Calendar
description: An event calendar and scheduler for Pyreon — event model, recurrence and time zones, month and time-grid layout
---

<PackageBadge name="@pyreon/calendar" href="/docs/calendar" />

`@pyreon/calendar` is an event calendar: the events of an app laid out in a month, a week or a day. This page covers the pure core, `@pyreon/calendar/core` (no DOM, no `@pyreon/core`: the event model, recurrence and zones, the window of each view, the layout algorithms), the reactive calendar (`createCalendar`), the month, week, day, agenda, year and resource timeline views, moving, resizing and selecting with the pointer and the keyboard, and the recipes, theming, accessibility notes and migration table at the end.

> **Experimental.** Tested in Chromium only, and with no screen reader (see "Accessibility: what was tested"); the API may still change before 1.0.

## Installation

```bash
bun add @pyreon/calendar
```

It depends on `@pyreon/time` (values, grids, zones), `@pyreon/schedule` (recurrence), `@pyreon/ambient` (locale, zone, clock) and `@pyreon/format` (labels), which install with it. The components also need `@pyreon/core`.

| Entry | What |
| --- | --- |
| `@pyreon/calendar/core` | the pure core. Only `@pyreon/time/core` and `@pyreon/schedule/core`. |
| `@pyreon/calendar` | the core plus `createCalendar`, the messages and the keyboard helpers. |
| `@pyreon/calendar/components` | `<Calendar>`, `<MonthView>`, `<WeekView>`, `<DayView>`, `<AgendaView>`, `<YearView>`, `<TimelineView>`, `<CalendarToolbar>`, `<DayPopover>`. |
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

The window can be the whole result of `visibleRange()` (`expandOccurrences(events, shown, zone)`) or its `range`; `layoutMonth(occurrences, shown, { capacity })` and `layoutTimeGrid(occurrences, shown, zone)` likewise take the whole result or its `rows` or `dates`. Every public function checks the shape of its arguments at the boundary and throws `[Pyreon] <function>: <argument> must be ..., got ...` with what was given (and, for the result of a sibling function, what it is), never a message from an inner function.

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
| `businessHours` | A `WorkingHours` (from `@pyreon/schedule`) or a `BusinessCalendar` (with `weekend`, `holidays` and `specialHours`): the hours outside it are shaded (`data-business="closed"`). The open times of each day come from schedule's `openingWindows`, so the shading and `constrainTo: 'businessHours'` agree with `isOpen` minute for minute. A `BusinessCalendar` is read as schedule reads it (default weekend Saturday and Sunday); a bare `WorkingHours` opens every weekday it lists. Hours that open nothing (`{}`, `{ hours: {} }`, a `specialHours` map of empty lists) shade every slot closed; a calendar with neither `hours` nor `specialHours` shades nothing; a malformed one reports schedule's `[Pyreon]` error. |
| `messages` | Every word the calendar says (an object, or a function of the locale): see "Messages and languages". |
| `editable`, `snap`, `minDuration`, `constrainTo`, `onEventChange`, `chooseScope` | Editing: see "Editing" below. |
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
      <MonthView calendar={props.calendar} />
    </>
  )
}
```

`<Calendar calendar>` is the toolbar, the view the calendar is on and a live region; `<MonthView>`, `<WeekView>`/`<DayView>` (the time grid) and `<CalendarToolbar>` are usable on their own.

- **Render slots**: `renderEvent({ occurrence, label, continuesBefore, continuesAfter })` (what goes inside an event; keep the accessible name, which is `label`), `renderDay(cell)` (the head of a day in a month), `renderMore(count, date)` and `onMore(date)` (the "+N more" button).
- **Words**: see "Messages and languages" below. Nothing in the components is a hard-coded English string.
- **Styling**: `@pyreon/calendar/styles.css` is a finished default look (see "The default look and its variables"); or style the `pcal-*` classes and data attributes (`data-today`, `data-selected`, `data-outside`, `data-weekend`, `data-business`, `data-continues-before`, `data-continues-after`, `data-recurring`, `data-short`). An event's `color` becomes its `--pcal-event`.

### The month

A WAI-ARIA **grid** of day cells. The events are buttons inside the cell they start in, sized to span the days they last, in lanes (longer first), with "+N more" when a week holds more than `monthCapacity` lanes. A multi-day event that continues into the next week starts again, with `data-continues-before`, in that week's first cell.

### The week, the work week, the day

A WAI-ARIA **grid** whose rows are the slots and whose columns are the days, with a header row, an all-day row, a time gutter, each event a button inside the slot it starts in (placed and sized by the column packing), opening hours shaded, and the now line in the slot the clock is in (also on a day with a skipped or repeated hour: see "Days that change length"). A week in `hiddenDays` has fewer columns. Slots are `slot` minutes (30 by default) from `dayStart` to `dayEnd`.

### On a phone

The stylesheet answers to the width of the calendar (a container query), not the screen. Below 560 px the **month** shows events as thin bars (their names stay in the markup, and a tap on a day calls `onSelect`, so open a day view or a list there); the **time grid** keeps columns at least `--pcal-col-min` wide (96 px) and **scrolls sideways** with the time gutter and the header kept in place, instead of squeezing seven columns into 40 px each. For a phone the better answer is usually fewer columns: `view: 'days'` with `days: 1` to `3` (and `views` of the toolbar to match). A group of many overlapping events is crowded in any narrow column; a one-day view gives them the whole width. Focus rings are 3 px in `--pcal-focus` (a stronger blue in light mode, a light blue in dark mode); colours follow `prefers-color-scheme` through the system colours, so dark mode needs no extra CSS.

### Messages and languages

Every word the calendar says comes from `calendar.messages()`, which follows the locale. Defaults come from the platform where it has the word: "Month", "Week", "Day" and "Year" from `Intl.DisplayNames`, "Today" and the names of the previous and next buttons ("last week", "next month") from `Intl.RelativeTimeFormat`, numbers from `Intl.NumberFormat` (so "+٣" in Arabic), the hour cycle of the time gutter from the locale through `@pyreon/format` (12 hours in `en-US`, 24 in `cs`). The platform has no word for "all day", "Agenda", "Timeline", "Work week", "No events", "Unassigned", "Resource" or "Close", so a small table covers them in `en`, `cs`, `ar`, `ja`, `de`, `fr` and `es` (plain interface wording; the Czech and Spanish "Agenda", the French "Planning" and the Japanese work week, which is left in English, are the ones a native speaker should check); for any other language the English text is used and, in development only, a `[Pyreon]` warning says once that `messages.allDay` should be set (nothing is logged in production). The announcements ("moved to", "change cancelled") and the recurring-edit choices, the default is an English placeholder (or a symbol such as "+3" where one works), because inventing a translation is worse than saying so. Replace what you need:

```ts
const calendar = createCalendar({
  events: () => events(),
  // an object, or a function of the locale (it may read your translation signals, and the calendar follows them)
  messages: (locale) => ({
    allDay: t('calendar.allDay'),
    more: (n) => t('calendar.more', { count: n }),
    moved: (title, when) => t('calendar.moved', { title, when }),
  }),
})
```

With `@pyreon/i18n`, call your translator inside that function: `messages: () => ({ allDay: i18n.t('allDay') })` re-runs when the language changes. `defaultMessages(locale)` shows every key and its default.

### The default look and its variables

The stylesheet sets a system UI font stack (set `--pcal-font: inherit` to use the page's), tabular numbers, tinted event chips with a stronger edge in the event's colour, today as a filled day number, subtle weekend and business-hours shading, equal month rows, and a dark scheme that follows `prefers-color-scheme`. In `forced-colors` mode events keep a border, today and the selection are outlined, and the focus ring is the system `Highlight`; transitions run only when `prefers-reduced-motion` is not `reduce`. All of it is custom properties on `.pcal`:

| Variable | What |
| --- | --- |
| `--pcal-font`, `--pcal-font-size` | The font stack and base size (14px). |
| `--pcal-bg`, `--pcal-fg` | Page colours (default `Canvas` and `CanvasText`, so the page's `color-scheme` decides light or dark). |
| `--pcal-accent`, `--pcal-accent-fg` | Today's number, the pressed view button, the selection tint. |
| `--pcal-border`, `--pcal-border-soft`, `--pcal-muted` | Lines (grid, cells) and secondary text. |
| `--pcal-today`, `--pcal-selected`, `--pcal-outside`, `--pcal-weekend`, `--pcal-closed` | Backgrounds of today, a selection, days outside the month, weekends and closed hours. |
| `--pcal-event`, `--pcal-event-tint`, `--pcal-event-bg`, `--pcal-event-fg`, `--pcal-event-edge` | An event's colour (set per event by `color`), how strongly it tints the chip (16%, 26% in dark), the chip background and text derived from it, and the edge width. |
| `--pcal-now`, `--pcal-focus` | The now line and the focus ring. |
| `--pcal-radius`, `--pcal-event-radius` | Corners of the calendar and of an event. |
| `--pcal-lane-size`, `--pcal-day-head`, `--pcal-slot-n`, `--pcal-gutter`, `--pcal-col-min` | Month lane height and day head, the height of a time slot in pixels (a number), the time gutter and the narrowest day column of the time grid. |

**Overlaps.** Events that overlap share the day column. A block narrower than 72px shows its title on one line with an ellipsis (never cut inside a glyph) and the time goes first; hovering or focusing it opens it to at least 160px over its neighbours, and its accessible name always has the full text. The calendar does not collapse four or more overlaps into a "+N" stack in this release: use `renderEvent` and a narrower `dayStart` to `dayEnd` window, or the day view, for very busy days.

## More views: agenda, year, timeline, and the "+N more" popover

`<Calendar>` switches every view: `month`, `week`, `workWeek`, `day`, `days`, `agenda`, `year` and `timeline` (the toolbar's `views` prop chooses which buttons it shows). The names in the switch, "No events", "Unassigned", "Resource" and "Close" come from the built-in table (en, cs, ar, ja, de, fr, es) or `messages`; see "Messages and languages".

- **Agenda** (`<AgendaView>`): the days that have events in a window of `agendaDays` (30). A list of headings and buttons, not a grid: Tab walks the events, all-day first. It is windowed inside the package: the heights are known, so a binary search over the running total decides which days are in the page, and a year of events costs the days on screen. (`@pyreon/virtual` was not used: it would add TanStack Virtual for rows whose heights the calendar already knows.)
- **Year** (`<YearView>`): twelve small months. A day with events is shaded by how many (1 to 4 or more) and its spoken name has the count ("Wednesday 18 November, 2 events"). One tab stop for the whole year; the arrows move by day and week across the months, PageUp and PageDown by a month. A click or Enter calls `onDayClick(date)`; `<Calendar>` opens that day in the day view.
- **Timeline** (`<TimelineView>`, option `resources: () => [{ id, title }]`): one row per resource, the shown days side by side along the top (each day is its `dayStart` to `dayEnd`), events as bars in the row of their `resourceId` (a string, or a list for an event on several resources: it is in each row). Overlapping events stack in lanes in their row. Events with no resource, or one that is not in `resources`, go to an "Unassigned" row (`messages.unassigned`). It is a WAI-ARIA grid like the month and the time grid: a row per resource numbered by `aria-rowindex`, one gridcell per day under the day headers (a bar sits in the cell of the day it starts on, and may run on across the next days), `businessHours` marked as in the time grid (`data-business` on each cell, the open hours drawn light over the closed tint), and one tab stop: the arrows move by day and resource, Home and End to the first and last day, Ctrl+Home and Ctrl+End to the first and last resource, PageUp and PageDown by ten resources, Enter into the day's events (or selecting the day when it has none), Escape back to the cell. Up to 100 resources every row is drawn, so a screen reader's reading cursor reaches them all; above that the rows are windowed, so 200 resources cost the rows on screen, each still numbered (`windowed`: `true`, `false` or the threshold, on `<TimelineView>` and `<Calendar>`). The resource column and the header stay in place when it scrolls. `days` sets how many days it shows (a week by default)., with the now line along the axis (the same ambient clock as the time grid). Each row is its own memoised layout: changing one event lays out only the rows that hold it (`instrument.layoutResource` counts them). Drag over an empty stretch of a row to select it: `onSelect` gets `resourceId`.
- **Drag between resources**: with `editable`, drag a bar to another row (the pointer layer of the time grid, extended): `onEventChange` receives `resourceId` (where it went) and `fromResourceId`. For an event on several resources only the row it was dragged from changes. Keyboard: grab with Enter, Up and Down give it to the row above or below, Left and Right move it in time, Enter drops. `applyEventChange` applies the resource: for a recurring event `'all'` and `'following'` change the series, and `'this'` moves one occurrence by storing `resourceId` in its override (the calendar's own override field, which `@pyreon/schedule`'s `expandEvents` never sees: it still gets only `start`, `end` and `cancelled`, and `expandOccurrences` shows the occurrence on its new row).
- **"+N more" popover**: `<Calendar>` opens a non-modal dialog with every event of the day. Focus moves in, Tab and Shift+Tab stay inside, Escape closes it and returns the focus to the "+N more" button (or the day, if the button has been re-rendered), a press outside closes it without taking the focus, and choosing an event closes it and calls `onEventClick`. `moreDialog={false}` leaves it to `onMore(date, button)`; `<DayPopover>` is exported.

**What it costs, measured here.** On this machine (one run each, in real Chromium: bounds the tests assert, not claims about other libraries): a month with 1,000 events first rendered in about 65 ms and an edit afterwards took about 9 ms (358 nodes in the page); 200 resources by a week with 1,000 events first rendered in about 45 ms with 22 rows drawn of 200, and scrolling by 4,000 px took about 63 ms. The tests fail above 1,500 ms and 500 ms for the month and 2,000 ms for the timeline, so a regression of an order of magnitude shows. Changing one event lays out only its rows (the rows' events are grouped in one pass over the events, O(events)).

## Editing: move, resize, select

Set `editable: true` (an event's own `editable` wins: `false`, `true`, or `{ move, resize }`) and give `onEventChange`. The calendar proposes; **the app decides**.

```ts
const calendar = createCalendar({
  events: () => events(),
  editable: true,
  snap: 15, // minutes (default: the slot); minDuration defaults to snap
  constrainTo: 'businessHours', // or (range) => boolean
  onEventChange: async (change) => {
    const saved = await api.save(change) // return false, throw or reject to refuse
    if (!saved) return false
    events.set(replaceEvent(events(), change)) // update your events before you resolve
  },
})
```

- **Pointer.** Drag an event to move it; drag the strip at either edge to resize it (top and bottom of a block, both ends of a bar, swapped in right-to-left text); drag over empty cells to select (`onSelect`). It is built on pointer events and pointer capture, so a drag keeps working when the pointer leaves the element or the window. A mouse drag starts after 4 px, so a click is still a click; **touch needs a long press (350 ms)**, and a finger that moves first is scrolling, not dragging. The event follows the pointer with a transform, snapped to the cell it would land in, and nothing else is laid out again; near the top or bottom of a scrolling time grid it scrolls. Escape, a cancelled pointer, a drop outside the grid or unmounting puts everything back.
- **What lands where.** In the time grid the start snaps to `snap` and the duration is kept; over a day cell only the day changes (a timed event keeps its time); a timed event dropped on the all-day row becomes all-day, and an all-day event dropped on a slot becomes an hour long. A resize is snapped and never shorter than `minDuration` (a day for all-day events). `moveTarget`, `resizeTarget` and `nudgeTarget` are pure and exported if you write your own pointer layer; `calendar.beginEdit`, `previewEdit`, `dropEdit` and `cancelEdit` are the session it uses.
- **Optimistic, with rollback.** The event is shown at its new place (`data-pending`) while the app answers. `false`, a throw or a rejection puts it back and announces it. An event waiting for the app cannot be edited again. An app that never answers leaves it pending: add a timeout to your own call.
- **Recurring events.** `chooseScope(change)` (an app callback: open your dialog) returns `'this'`, `'following'`, `'all'` or `null` to cancel; the default is `'this'`. `applyEventChange(change.event, change, zone)` returns the plain data to store: an override for `this`, a shifted series (and overrides) for `all`, or the series ended the day before plus a new event with the id `<id>~<occurrence>` for `following`. Expanding the result with `expandOccurrences` shows the edit, and a fuzz test checks every scope against it.
- **Keyboard.** On an event, Enter or Space grabs it (announced), the arrows move it by `snap` or a day (week in the month), Shift with the arrows resizes the end, Enter drops it, Escape cancels. The announcements say, for example, "Design review moved to Wednesday 18 November, 15:00 – 16:00"; they come from `messages` (`moved`, `resized`, `grabbed`, `cancelled`, `failed`), in English unless you replace them.
- **The month moves, it does not resize, a timed event inside one day** (a day is too coarse for it; use the week or day view). All-day and multi-day events resize from either end.
- **Touch.** A touch drag disables page scrolling only after the long press; `touch-action` is not changed.

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

**What a screen reader hears.** A day cell is named by its content: its full date ("Wednesday 18 November, today") and the events that start in it. An event is a button named "Design review, Wednesday 18 November, 14:00 – 15:00"; all-day events say "all day" and ones over several days say where they start and end ("Conference, Monday 16 November – Wednesday 18 November, all day"). Today is `aria-current="date"`; selected cells are `aria-selected`. Colour is never the only carrier: a continuation has a square corner (and `data-continues-*`), "+N more" is text. A polite live region says where navigation went ("December 2026, month"). Visible text and accessible names agree (the time of a block is drawn from `data-time`, not as text), which is what `axe-core` checks in the package's tests (month, week and day).

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

### Drag to reschedule, with the server's say

```tsx
import { createCalendar } from '@pyreon/calendar'
import type { CalendarEvent } from '@pyreon/calendar'
import { Calendar } from '@pyreon/calendar/components'
import { signal } from '@pyreon/reactivity'

export function TeamCalendar() {
  const events = signal<CalendarEvent[]>([])
  const calendar = createCalendar({
    events: () => events(),
    editable: true,
    snap: 15,
    onEventChange: async (change) => {
      const response = await fetch(`/api/events/${change.event.id}`, { method: 'PATCH', body: JSON.stringify({ start: change.start, end: change.end }) })
      if (!response.ok) return false // the event goes back and the calendar says "the change was not saved"
      events.set(events().map((e) => (e.id === change.event.id ? { ...e, start: change.start, end: change.end } : e)))
    },
  })

  return <Calendar calendar={calendar} />
}
```

The event is shown at its new place (`data-pending`) while the request is out; a refusal, a thrown error or a rejected promise puts it back. Update your events before you resolve, or the event snaps back for a frame. Add your own timeout if the server may never answer: an event waiting for an answer cannot be edited again.

### A booking view: business hours and free slots

```tsx
import { createCalendar } from '@pyreon/calendar'
import { freeSlots } from '@pyreon/schedule/core'

const hours = { 1: [{ from: '09:00', to: '17:00' }], 2: [{ from: '09:00', to: '17:00' }], 3: [{ from: '09:00', to: '17:00' }], 4: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '16:00' }] }

const free = () => freeSlots({ within: weekWindow(), busy: bookings().map((b) => ({ start: b.start, end: b.end })), duration: { minutes: 30 } })

const calendar = createCalendar({
  events: () => [...bookings(), ...free().map((s, i) => ({ id: `free-${i}`, title: 'Free', start: s.start, end: s.end, color: '#15803d' }))],
  businessHours: hours, // shades what is closed
  constrainTo: 'businessHours', // and refuses a drop outside it
  view: 'week',
  onEventClick: (event) => event.id.startsWith('free-') && book(event),
})
```

`freeSlots` answers "when can a 30-minute slot start" from the opening windows and what is taken; the calendar draws the answer as ordinary events.

### Editing a recurring event: this, following, all

```ts
import { applyEventChange } from '@pyreon/calendar/core'

const calendar = createCalendar({
  events: () => events(),
  editable: true,
  chooseScope: (change) => askUser(change.event.title), // 'this' | 'following' | 'all', or null to cancel
  onEventChange: (change) => {
    events.set(events().flatMap((e) => (e.id === change.event.id ? applyEventChange(e, change, zone) : [e])))
  },
})
```

`'this'` adds an override (`overrides['2026-11-23T09:00'] = { start, end }`), `'all'` shifts the series and the keys of its overrides, `'following'` ends the series the day before (`recurrence.until`) and adds a second event (`<id>~<occurrence>`) that carries on from the new start with the remaining `count`. The result is plain data: store it as it is, and `expandOccurrences` shows the edit.

### Rooms: a resource timeline

```tsx
const calendar = createCalendar({
  view: 'timeline',
  resources: () => rooms(), // [{ id: 'a', title: 'Room A' }, ...]
  events: () => bookings(), // each with resourceId: 'a' (or a list)
  editable: true,
  dayStart: '08:00',
  dayEnd: '18:00',
  onEventChange: (change) => move(change.event.id, { room: change.resourceId, start: change.start, end: change.end }),
})
```

Dragging a bar to another row sends `resourceId` and `fromResourceId`; the optimistic display, the rollback and the keyboard work as in the other views. 200 resources cost the rows on screen.

### Printing a week

```tsx
<Calendar calendar={calendar} toolbar={false} />
// with view 'week' and dayStart and dayEnd set to the hours you want on paper, then window.print()
```

The stylesheet has an `@media print` section: light colours, no scrolling or sticky parts, no buttons, no now line, rows kept whole across a page break. Checked here by emulating print media in Chromium and looking at the result; not on a real printer or PDF driver.

## Theming

Everything the default stylesheet draws is a custom property on `.pcal` (the table is under "The default look and its variables"). Three common cases:

```css
/* brand colour: today, the pressed button and the selection follow it */
.pcal { --pcal-accent: #7c3aed; --pcal-accent-fg: #fff; }

/* denser: smaller slots and lanes, a smaller font */
.pcal { --pcal-font-size: 13px; --pcal-slot-n: 22; --pcal-lane-size: 18px; --pcal-day-head: 24px; }

/* a dark theme you control (a class on the page) instead of the system setting */
.dark .pcal { color-scheme: dark; --pcal-bg: #0f172a; --pcal-fg: #e2e8f0; --pcal-accent: #60a5fa; --pcal-event-tint: 26%; }
```

An event's own colour is its `color` field (a plain CSS colour); the chip tint, its text and its edge derive from it, and in the tests a teal and an amber event pass `axe-core` contrast in both schemes. To replace the look entirely, do not import the stylesheet: every part has a `pcal-*` class and state is on data attributes (`data-today`, `data-selected`, `data-outside`, `data-weekend`, `data-business`, `data-recurring`, `data-short`, `data-editable`, `data-dragging`, `data-pending`). Custom content goes through `renderEvent`, `renderDay` and `renderMore`; keep the accessible name (`label`).

## Accessibility: what was tested, and with what

**No screen reader and no browser other than Chromium has been used on this calendar yet.** Everything below was checked with `axe-core`, real key and pointer events in Chromium, and screenshots. These manual checks are still owed before it should be called accessible:

- a VoiceOver and an NVDA pass on the month, the week, the timeline and the keyboard editing of an event (grab, move, resize, drop, cancel, and what the live region says);
- Safari and Firefox, for every view and for the pointer layer (pointer capture, `elementsFromPoint`, the container queries, `:dir()`);
- a real touch device for the long-press drag (the non-passive `touchmove` that stops the page scrolling is the part most worth trying) and for the sideways scroll of the time grid and the timeline at phone width;
- a real printer or PDF driver for the print styles.

- **Tested:** `axe-core` 4.14.1 in real Chromium finds no violation, colour contrast included, in the month, the week, the day, the agenda, the year, the timeline and the open popover in the light scheme, and in the dark scheme for the month, week, agenda, year and timeline with two custom event colours. Every keyboard path (grid arrows, Home, End, PageUp, PageDown, ranges with Shift, Enter, Escape, the grab-move-drop-cancel of an event, the popover's Tab trap and Escape) is driven with real key events and asserted. Right to left and a 375 px width were looked at in screenshots.
- **Semantics:** the month and the time grid are WAI-ARIA grids with one tab stop and a roving focus; cells are named by their content (the full date, "today", the events that start in it); events are buttons named "Design review, Wednesday 18 November, 14:00 – 15:00"; the agenda is a list of headings and buttons; the timeline is a grid of resource rows; the popover is a non-modal dialog; a polite live region announces navigation, grabs, moves, resizes, cancellations and refusals.
- **Not tested:** no screen reader (VoiceOver, NVDA, JAWS, TalkBack) was used by anyone; no switch or voice-control software; no Firefox or Safari; no real touch device (touch is emulated); forced-colors only through Chromium's emulation (closed business hours are not drawn there). The reading experience of the grids in a screen reader, the time grid's tab order (by start time across the days, not day by day) and the announcement texts (English placeholders unless you set `messages`) are the parts most worth a real listen.
- **Motion and colour:** nothing animates when the user asks for reduced motion; state is never colour alone (today is a filled number, a continuation is a flat edge, the selection is a tint and an `aria-selected`).

## Coming from another calendar

Checked on 2026-11-19 against each project's own page (a fetch of the pricing page, the docs page or the README). A row says only what the source said; "does not state" means the page fetched did not say, not that the feature is absent. This is a map of names, not a feature comparison.

| | What its page says | In `@pyreon/calendar` |
| --- | --- | --- |
| **FullCalendar** (fullcalendar.io/pricing) | The Standard tier is MIT with "every standard view and feature"; Timeline and resource views, the vertical resource view and printer-friendly rendering are listed as Premium (paid, from $480 per the page). | Month, week, day, agenda, year and the resource timeline are in one MIT package; print styles are in the stylesheet. Events are plain `{ start, end }` data; resources are the `resources` option and an event's `resourceId`. |
| **react-big-calendar** (github.com/jquense/react-big-calendar) | MIT; you must choose a localizer (Moment.js, Globalize.js, date-fns or Day.js). The README does not state its views, drag and drop, resources or accessibility. | No localizer: words and dates come from `@pyreon/ambient`, `@pyreon/format` and the platform's `Intl`; `locale`, `timeZone` and `weekStart` are options. |
| **Schedule-X** (schedule-x.dev/docs/calendar) | The views listed are month grid, week, day and month agenda; the plugins listed include drag and drop, resize, event recurrence, a resource scheduler and a current time indicator (some marked with a star the page does not explain). The page states no licence. | Move, resize, recurrence, resources and a now line (week and day) are built in; the timeline has no now line yet. Check licences and the starred plugins on their site before choosing. |
| **Toast UI Calendar** (github.com/nhn/tui.calendar) | MIT; daily, weekly and monthly views; schedules can be adjusted by mouse dragging; plain JS, React and Vue wrappers. The repository header says it was archived by its owner on 2 September 2026 and is read-only. | The same three views and more, maintained here; there is no per-framework wrapper, it is Pyreon components. |

Left out because the pages above did not confirm them: timezone and recurrence support of react-big-calendar and Toast UI Calendar, bundle sizes, and the accessibility claims of every library.

| If you wrote | Write |
| --- | --- |
| `events={[{ title, start: Date, end: Date }]}` | `events: () => [{ id, title, start: '2026-11-18T09:00', end: '2026-11-18T10:00' }]`; add `timeZone: 'Europe/Prague'` for a wall clock in a zone; an all-day event is dates with an exclusive end (`allDay(date)`) |
| `onEventDrop` and `onEventResize` | `onEventChange(change)` (one callback; return `false` to refuse) with `editable: true` |
| `resources` and `resourceId` | `resources: () => [{ id, title }]` and an event's `resourceId` (a string or a list), view `'timeline'` |
| `datesSet` | `onRangeChange(range)`, a half-open window of dates |
| `eventContent` or a custom event component | `renderEvent({ occurrence, label })` |

## Follow-ups (not part of this release)

- **`gridMove` and `slotMove` belong in `@pyreon/time`** next to `monthGrid`, after #4686 merges; then adopt them in the private `CalendarBase` picker (`packages/ui/primitives/src/CalendarBase.tsx`) and in the site's `DemoTime`, which keeps its own copy of the arrow, Home, End and PageUp and PageDown logic.
- **A website product page with a live demo** (month, week, timeline, drag with rollback) on the docs site.
- **Native status: web-only.** The calendar is DOM and pointer events (grid roles, `elementsFromPoint`, CSS container queries) and has no SwiftUI or Compose lowering; its manifest declares `web-only` with that reason. A native calendar would be its own design on the platform's controls, sharing `@pyreon/calendar/core` (the layouts and `applyEventChange` are DOM-free).
- **Timeline:** row groups (a heading over rows that share a group); a ghost of the original place while dragging; selecting by keyboard in the timeline; the manual checks listed under "Accessibility".

## Notes

- **Display zone and event zones are separate.** Pass the display zone to every function; each event's `timeZone` only decides what its wall clock means.
- **All-day events never shift.** They are dates, not instants.
- **The core never mutates your events**, and every function is pure, so results can be cached by their inputs.
