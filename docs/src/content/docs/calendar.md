---
title: Calendar
description: An event calendar and scheduler for Pyreon — event model, recurrence and time zones, month and time-grid layout
---

<PackageBadge name="@pyreon/calendar" href="/docs/calendar" />

`@pyreon/calendar` is an event calendar: the events of an app laid out in a month, a week or a day. It is built in slices. This page covers the pure core, `@pyreon/calendar/core`, which has no DOM and no `@pyreon/core`: the event model, recurrence and zones, the window and title of each view, and the two layout algorithms. The reactive calendar and the view components follow.

> **Experimental.**

## Installation

```bash
bun add @pyreon/calendar
```

It depends on `@pyreon/time` (values, grids, zones) and `@pyreon/schedule` (recurrence), which install with it.

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

## Notes

- **Display zone and event zones are separate.** Pass the display zone to every function; each event's `timeZone` only decides what its wall clock means.
- **All-day events never shift.** They are dates, not instants.
- **The core never mutates your events**, and every function is pure, so results can be cached by their inputs.
