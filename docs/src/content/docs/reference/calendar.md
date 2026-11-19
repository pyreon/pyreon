---
title: "@pyreon/calendar — API Reference"
description: "An event calendar and scheduler: event model, recurrence and time zones, month and time-grid layout"
---

> **Generated** from `calendar`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [calendar](/docs/calendar).

The pure core of an event calendar (`@pyreon/calendar/core`, no DOM): a plain event model (a date is an all-day event, a date-time is a wall clock, floating or in the event's own zone, an instant is shown in the display zone; the end is exclusive), validation with `[Pyreon] calendar:` errors that name the event, recurrence and overrides through `@pyreon/schedule`, the window of each view with navigation and titles, and the two layout algorithms as pure functions with stable keys: month lanes (multi-day and all-day events in lanes per week row, cut at the week edges with continuation flags, "+N more" per day given a capacity) and time-grid column packing (overlapping events share the width, a block grows into the free columns to its right, pinned columns keep blocks still while another is dragged, a short event keeps a minimum height, an event across midnight is a block on each day). The time grid is a wall-clock grid: on the day a zone moves its clock the skipped hour is an empty row and the repeated hour is drawn over itself, and the now line follows the clock. Per-day signatures let a reactive layer skip recomputing a day that did not change.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

an event calendar is a DOM view (pointer, keyboard and layout); the pure core is plain TypeScript a native app can call itself

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- Event model: all-day dates, floating wall clocks, events in their own zone, instants; exclusive ends; allDay(date, days) helper; validation that names the bad event
- Recurrence, overrides (title, moved, cancelled) and zones through @pyreon/schedule; an all-day event never moves with the zone; keys that are the same in every window
- View windows with navigation: month (with leading and trailing days), week and work week on any weekStart, day, days(n), agenda, year; hidden weekdays; titles through a formatter callback
- Month lanes: longer and earlier first, a total order so the result does not depend on input order, split at week edges, "+N more" per day
- Column packing: interval colouring with growth into free columns, pinned columns, minimum height, binary-search placement (200 events in one hour is not quadratic)
- Wall-clock time grid with explicit DST behaviour (23 and 25 hour days), dayStart and dayEnd clipping, a correct now line, per-day signatures for memoisation

## Complete example

A full, end-to-end usage of the package:

```tsx
import { expandOccurrences, layoutDay } from '@pyreon/calendar/core'
import type { CalendarEvent } from '@pyreon/calendar/core'

const events: CalendarEvent[] = [{ id: 'design', title: 'Design review', start: '2026-11-18T14:00', end: '2026-11-18T15:00' }, { id: 'sync', title: 'Sync', start: '2026-11-18T14:30', end: '2026-11-18T15:30' }]
const occurrences = expandOccurrences(events, { start: '2026-11-16', end: '2026-11-23' }, 'Europe/Prague')

layoutDay('2026-11-18', occurrences, 'Europe/Prague').map((b) => [b.column, b.columns])   // => [[0, 2], [1, 2]]
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`allDay`](#allday-function-experimental) | function | The start and exclusive end of an all-day event: one day by default, or `days` days. |
| [`expandOccurrences`](#expandoccurrences-function-experimental) | function | The occurrences of the events that fall in a half-open window of dates in the display zone, placed in that zone and… |
| [`visibleRange`](#visiblerange-function-experimental) | function | The window of a view around a date: the grid of a month (with its leading and trailing days), a week from `weekStart`, a… |
| [`navigate`](#navigate-function-experimental) | function | The anchor date after moving `steps` views forward (negative: back): a month, a week, a day, `days` days, an agenda, a… |
| [`viewTitle`](#viewtitle-function-experimental) | function | The title of a view through a formatter callback (the reactive entry passes `@pyreon/format`), so the core needs no… |
| [`plainTitle`](#plaintitle-function-experimental) | function | The default title formatter: `2026-11`, `2026-11-16 to 2026-11-22`, `2026`. |
| [`layoutRow`](#layoutrow-function-experimental) | function | Events as segments in lanes across one row of days (a week of a month, or the all-day row of a time grid), cut at the… |
| [`layoutMonth`](#layoutmonth-function-experimental) | function | The rows of a month grid laid out; each occurrence is in every row it touches. |
| [`daySpan`](#dayspan-function-experimental) | function | The first and last date (inclusive) an occurrence touches. |
| [`packColumns`](#packcolumns-function-experimental) | function | Overlapping blocks share the width of a day column: groups of overlapping blocks get columns by interval colouring, and… |
| [`layoutDay`](#layoutday-function-experimental) | function | The blocks of one day of a time grid: timed occurrences that touch the day, cut at its edges (an event across midnight… |
| [`layoutTimeGrid`](#layouttimegrid-function-experimental) | function | A whole time grid: the all-day row (lanes across the days), a column of blocks per day with a signature, and the slot… |
| [`daySignature`](#daysignature-function-experimental) | function | A string that changes exactly when the blocks of a day would: use it to skip recomputing a day whose occurrences did not… |
| [`nowOffset`](#nowoffset-function-experimental) | function | Where the "now" line is on a day, as a fraction of the visible day; `null` when `now` is not on that day or is outside… |
| [`dayBounds`](#daybounds-function-experimental) | function | The instants a calendar day starts and ends at in a zone. |
| [`wallMinute`](#wallminute-function-experimental) | function | The wall-clock minute from midnight an instant shows at in a zone. |
| [`slotTimes`](#slottimes-function-experimental) | function | The start times of the rows of the grid between `dayStart` and `dayEnd`, every `slot` (30 minutes by default). |
| [`visibleMinutes`](#visibleminutes-function-experimental) | function | The visible window of a day in wall-clock minutes; throws when `dayEnd` is not after `dayStart`. |
| [`CalendarEvent`](#calendarevent-type-experimental) | type | An event as plain JSON-safe data. |
| [`EventOccurrence`](#eventoccurrence-type-experimental) | type | One occurrence of an event placed in the display zone; the key (`"<id>:<occurrence>"`) is the same in every window. |
| [`TimedBlock`](#timedblock-type-experimental) | type | A block of a time-grid column; `top`, `height`, `left` and `width` are fractions. |

## API

### `allDay` `function` — **experimental**

```ts
(date: PlainDate, days?: number) => { start, end, allDay: true }
```

The start and exclusive end of an all-day event: one day by default, or `days` days. Events end exclusively, so a one-day event on the 18th ends on the 19th.

**Example**

```tsx
allDay('2026-11-18')   // => { start: '2026-11-18', end: '2026-11-19', allDay: true }
allDay('2026-11-30', 3).end   // => '2026-12-03'
```

---

### `expandOccurrences` `function` — **experimental**

```ts
(events, range: Interval<PlainDate>, zone: TimeZone) => EventOccurrence[]
```

The occurrences of the events that fall in a half-open window of dates in the display zone, placed in that zone and sorted by start. Single and recurring events (with overrides and cancellations through `@pyreon/schedule`), events in their own zone, floating wall clocks and instants. An all-day event never moves with the zone. A malformed event throws a `[Pyreon] expandOccurrences:` error that names it; `range` may be the whole result of `visibleRange()`; two events with one id are both listed, the second with a numbered key.

**Example**

```tsx
const [o] = expandOccurrences([{ id: 'p', title: 'P', start: '2026-11-18T09:00', end: '2026-11-18T10:00', timeZone: 'Europe/Prague' }], { start: '2026-11-16', end: '2026-11-23' }, 'America/New_York')
o!.start   // => '2026-11-18T03:00'
```

---

### `visibleRange` `function` — **experimental**

```ts
(view, date, options?) => { range, dates, rows }
```

The window of a view around a date: the grid of a month (with its leading and trailing days), a week from `weekStart`, a work week, a day, `days` days, an agenda, or a year. `range.end` is exclusive; hidden weekdays are left out of `dates` and `rows`.

**Example**

```tsx
visibleRange('week', '2026-11-18').range   // => { start: '2026-11-16', end: '2026-11-23' }
visibleRange('workWeek', '2026-11-18').dates.length   // => 5
```

---

### `navigate` `function` — **experimental**

```ts
(view, date, steps, options?) => PlainDate
```

The anchor date after moving `steps` views forward (negative: back): a month, a week, a day, `days` days, an agenda, a year.

**Example**

```tsx
navigate('month', '2026-01-31', 1)   // => '2026-02-28'
navigate('week', '2026-11-18', -1)   // => '2026-11-11'
```

---

### `viewTitle` `function` — **experimental**

```ts
(shown: VisibleRange, format?: TitleFormatter) => string
```

The title of a view through a formatter callback (the reactive entry passes `@pyreon/format`), so the core needs no locale. Without one it is a plain ISO form.

**Example**

```tsx
viewTitle(visibleRange('month', '2026-11-18'))   // => '2026-11'
viewTitle(visibleRange('week', '2026-11-18'), (i) => i.first + ' / ' + i.last)   // => '2026-11-16 / 2026-11-22'
```

---

### `plainTitle` `function` — **experimental**

```ts
(info: TitleInfo) => string
```

The default title formatter: `2026-11`, `2026-11-16 to 2026-11-22`, `2026`.

**Example**

```tsx
plainTitle({ view: 'year', date: '2026-11-18', first: '2026-01-01', last: '2026-12-31' })   // => '2026'
```

---

### `layoutRow` `function` — **experimental**

```ts
(occurrences, dates, capacity?) => WeekLayout
```

Events as segments in lanes across one row of days (a week of a month, or the all-day row of a time grid), cut at the row's edges with continuation flags. Longer events first, then all-day before timed, then earlier, then by key: a total order, so the lanes do not depend on the order of the input. With a `capacity`, lanes beyond it are dropped and counted per day in `more`.

**Example**

```tsx
const row = layoutRow(expandOccurrences([{ id: 'c', title: 'C', start: '2026-11-14', end: '2026-11-18' }], { start: '2026-11-09', end: '2026-11-30' }, 'UTC'), ['2026-11-16', '2026-11-17', '2026-11-18'])
row.lanes[0]![0]!.continuesBefore   // => true
```

---

### `layoutMonth` `function` — **experimental**

```ts
(occurrences, rows, capacity?) => WeekLayout[]
```

The rows of a month grid laid out; each occurrence is in every row it touches.

**Example**

```tsx
layoutMonth([], visibleRange('month', '2026-11-18').rows).length   // => 6
```

---

### `daySpan` `function` — **experimental**

```ts
(occurrence) => { first, last }
```

The first and last date (inclusive) an occurrence touches. An end exactly at midnight does not touch that day.

**Example**

```tsx
daySpan(expandOccurrences([{ id: 'a', title: 'A', start: '2026-11-16T22:00', end: '2026-11-17T00:00' }], { start: '2026-11-16', end: '2026-11-18' }, 'UTC')[0]!)   // => { first: '2026-11-16', last: '2026-11-16' }
```

---

### `packColumns` `function` — **experimental**

```ts
(blocks: { key, start, end }[], options?: { minMinutes?, pinned? }) => { key, column, columns, span }[]
```

Overlapping blocks share the width of a day column: groups of overlapping blocks get columns by interval colouring, and each block grows to the right through the columns that are free for its whole length. The result depends only on the blocks, not on their order; `pinned` keeps chosen blocks in their column; each placement is a binary search.

**Example**

```tsx
packColumns([{ key: 'a', start: 540, end: 600 }, { key: 'b', start: 570, end: 630 }]).map((p) => [p.key, p.column, p.columns])   // => [['a', 0, 2], ['b', 1, 2]]
```

---

### `layoutDay` `function` — **experimental**

```ts
(date, occurrences, zone, options?) => TimedBlock[]
```

The blocks of one day of a time grid: timed occurrences that touch the day, cut at its edges (an event across midnight is a block on each day), clipped to `dayStart` and `dayEnd`, packed into columns. Positions are fractions of the visible day. A wall-clock grid: on the day a zone skips an hour that row is empty and an event across it is taller than it lasts; on the day a zone repeats an hour the second pass is drawn over the first.

**Example**

```tsx
const list = expandOccurrences([{ id: 'a', title: 'A', start: '2026-11-18T09:00', end: '2026-11-18T10:30' }], { start: '2026-11-18', end: '2026-11-19' }, 'UTC')
layoutDay('2026-11-18', list, 'UTC')[0]!.height   // => 0.0625
```

---

### `layoutTimeGrid` `function` — **experimental**

```ts
(occurrences, dates, zone, options?) => { allDay, days, slots }
```

A whole time grid: the all-day row (lanes across the days), a column of blocks per day with a signature, and the slot times.

**Example**

```tsx
layoutTimeGrid([], ['2026-11-18'], 'UTC').slots.length   // => 48
```

---

### `daySignature` `function` — **experimental**

```ts
(date, occurrences, zone) => string
```

A string that changes exactly when the blocks of a day would: use it to skip recomputing a day whose occurrences did not change.

**Example**

```tsx
daySignature('2026-11-18', [], 'UTC')   // => ''
```

---

### `nowOffset` `function` — **experimental**

```ts
(date, now, zone, options?) => number | null
```

Where the "now" line is on a day, as a fraction of the visible day; `null` when `now` is not on that day or is outside the visible hours. It follows the wall clock, also on a day with a skipped or repeated hour.

**Example**

```tsx
nowOffset('2026-11-18', Date.UTC(2026, 10, 18, 12), 'UTC')   // => 0.5
nowOffset('2026-11-19', Date.UTC(2026, 10, 18, 12), 'UTC')   // => null
```

---

### `dayBounds` `function` — **experimental**

```ts
(date, zone) => { startMs, endMs, elapsedMinutes }
```

The instants a calendar day starts and ends at in a zone. On the day a zone moves its clock it is 23 or 25 hours.

**Example**

```tsx
dayBounds('2026-03-29', 'Europe/Prague').elapsedMinutes   // => 1380
```

---

### `wallMinute` `function` — **experimental**

```ts
(ms, zone) => number
```

The wall-clock minute from midnight an instant shows at in a zone.

**Example**

```tsx
wallMinute(Date.UTC(2026, 10, 18, 15, 30), 'UTC')   // => 930
```

---

### `slotTimes` `function` — **experimental**

```ts
(options?) => PlainTime[]
```

The start times of the rows of the grid between `dayStart` and `dayEnd`, every `slot` (30 minutes by default).

**Example**

```tsx
slotTimes({ dayStart: '08:00', dayEnd: '10:00', slot: { minutes: 45 } })   // => ['08:00', '08:45', '09:30']
```

---

### `visibleMinutes` `function` — **experimental**

```ts
(options?) => { from, to }
```

The visible window of a day in wall-clock minutes; throws when `dayEnd` is not after `dayStart`.

**Example**

```tsx
visibleMinutes({ dayStart: '08:00', dayEnd: '18:00' })   // => { from: 480, to: 1080 }
```

---

### `CalendarEvent` `type` — **experimental**

```ts
interface CalendarEvent<Meta> { id; title; start; end; allDay?; timeZone?; recurrence?; overrides?; resourceId?; editable?; color?; meta? }
```

An event as plain JSON-safe data. A date start and end make it all-day; a date-time is a wall clock (in `timeZone`, or floating in the display zone); a number is an instant. The end is exclusive.

**Example**

```tsx
const event: CalendarEvent = { id: 'a', title: 'A', start: '2026-11-18', end: '2026-11-19' }
```

---

### `EventOccurrence` `type` — **experimental**

```ts
interface EventOccurrence<Meta> { key; event; occurrence; title; allDay; start; end; startMs; endMs; recurring }
```

One occurrence of an event placed in the display zone; the key (`"<id>:<occurrence>"`) is the same in every window.

**Example**

```tsx
const none: EventOccurrence[] = []
```

---

### `TimedBlock` `type` — **experimental**

```ts
interface TimedBlock { key; occurrenceKey; top; height; column; columns; span; left; width; startMinute; endMinute; continuesBefore; continuesAfter }
```

A block of a time-grid column; `top`, `height`, `left` and `width` are fractions.

**Example**

```tsx
const blocks: TimedBlock[] = []
```

---

## Package-level notes

> **The end is exclusive:** A one-day all-day event on the 18th ends on the 19th (`allDay("2026-11-18")` makes the pair). A timed event that ends exactly at midnight does not appear on the next day. An all-day event whose end equals its start is treated as one day; a timed one is a moment.

> **Which clock a date-time is on:** A date-time with the event's `timeZone` is that zone's wall clock ("9:00 in Prague", a New York viewer sees 3:00). Without one it is floating: the same wall clock in whatever zone is displayed. An instant is shown in the display zone. A date (all-day) never moves.

> **The time grid is a wall-clock grid:** A row is the hour the clock shows. On the day a zone skips an hour the skipped row is empty and an event across it is taller than it lasts; on the day a zone repeats an hour the second pass is drawn over the same rows as the first and the two share columns when they overlap on screen. Block positions and the now line follow the clock.

> **Override keys:** An override is keyed by the original start of the occurrence: `"2026-11-18T09:00"` (in the event's wall clock), or `"2026-11-18"` for an all-day event. Moving an occurrence does not change its key.

> **Keys:** An occurrence key is `"<id>:<original start>"`, the same in every window and, for an instant event, in every zone (it uses the number). Two events with the same id are both listed and the second gets a `~2` suffix; give events unique ids.

> **Hidden days:** A day view on a hidden weekday has no dates; a month with hidden weekdays has fewer columns and keeps the leading and trailing days of the visible weeks.
