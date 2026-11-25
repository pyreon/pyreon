---
title: "@pyreon/schedule — API Reference"
description: "Recurrence, business time and availability as plain data: RFC 5545 rules that stay on the wall clock across DST, working hours, free slots"
---

> **Generated** from `schedule`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [schedule](/docs/schedule).

A layer above `@pyreon/time`. A `Recurrence` is a plain object that follows RFC 5545 (iCalendar RRULE) with `@pyreon/time` values: `{ every: "week", interval: 2, on: { weekdays: [2] }, start: "2026-11-17" }`. `occurrences` is a lazy generator that jumps by period instead of stepping, so `nextOccurrence` on a ten-year-old rule costs the same as on a new one. Occurrences are wall-clock times: a daily 09:00 stays 09:00 across a clock change and only its instant moves (`toInstants`). The 31st skips months that lack one (RFC 5545), unlike `add`, which clamps. `parseRRule` / `toRRule` read and write RFC text, `describeRule` turns a rule into words. Business time: `isBusinessDay`, `addBusinessDays`, `addBusinessTime("8 working hours from Friday 15:00")`, holidays as a list or a predicate (no holiday data is shipped), split and overnight shifts. Availability: `overlaps`, `mergeIntervals`, `subtractIntervals`, `freeSlots` for booking pages, and `expandEvents` for calendar views. Verified against RFC 5545 section 3.8.5.3, the `rrule` library and a brute-force oracle. `@pyreon/schedule/core` needs only `@pyreon/time`; `@pyreon/schedule/fp` is the value-last form.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

not lowered by PMTC yet: pure computation on strings and numbers over @pyreon/time, which is web-only itself; it can become `shared` together with @pyreon/time once Swift and Kotlin ports exist; until then the compiler warns on import rather than miscompiling

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- Recurrence as plain data with RFC 5545 field names and @pyreon/time values (ISO weekdays, months 1 to 12)
- Lazy, ordered expansion that jumps by period: next occurrence of a ten-year-old rule costs a handful of candidate days
- Wall-clock occurrences: DST changes move the instant, never the wall time; toInstants resolves gaps and overlaps by disambiguation
- The 31st skips short months (RFC), last-day and n-th-weekday rules, Feb 29, week numbers, BYSETPOS, count, until, except, also
- parseRRule / toRRule for RFC 5545 text with positions in errors; describeRule with a translatable message table
- Business days and business time: holidays as a list or predicate, weekends, split and overnight shifts, "8 working hours from now"
- Intervals and availability: overlaps, merge, subtract, freeSlots with buffers, expandEvents with stable keys and per-instance overrides

## Complete example

A full, end-to-end usage of the package:

```tsx
import { occurrencesBetween, nextOccurrence, addBusinessTime } from '@pyreon/schedule'

const standup = { every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17T09:30' } as const

occurrencesBetween(standup, '2026-11-17', '2026-12-31')   // => ['2026-11-17T09:30', '2026-12-01T09:30', '2026-12-15T09:30', '2026-12-29T09:30']
nextOccurrence(standup, '2026-11-18')                    // => '2026-12-01T09:30'
addBusinessTime('2026-11-20T15:00', { hours: 8 }, { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } })   // => '2026-11-23T15:00'
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`occurrences`](#occurrences-function-experimental) | function | The occurrences of a rule, lazily and in order. |
| [`occurrencesBetween`](#occurrencesbetween-function-experimental) | function | Every occurrence from `from` to `to`, both included; a date bound means the whole day. |
| [`nextOccurrence`](#nextoccurrence-function-experimental) | function | The first occurrence strictly after `after`, or `null`. |
| [`previousOccurrence`](#previousoccurrence-function-experimental) | function | The last occurrence strictly before `before`, or `null`. |
| [`occursOn`](#occurson-function-experimental) | function | Whether the rule has an occurrence on a date. |
| [`toInstants`](#toinstants-function-experimental) | function | The occurrences as instants through the rule's `timeZone` (required). |
| [`parseRRule`](#parserrule-function-experimental) | function | Read RFC 5545 text: a bare rule, `RRULE:...`, or a block with `DTSTART` (with `TZID` or `VALUE=DATE`), `RRULE`, `EXDATE`… |
| [`tryParseRRule`](#tryparserrule-function-experimental) | function | `parseRRule` that returns `null` instead of throwing: for user input and imports. |
| [`toRRule`](#torrule-function-experimental) | function | Write a rule as RFC 5545 text: a `DTSTART` line, an `RRULE` line, and `EXDATE` / `RDATE` lines when needed. |
| [`describeRule`](#describerule-function-experimental) | function | A rule in words, in English by default; weekday and month names follow `locale` through `Intl`, and `messages` replaces… |
| [`isBusinessDay`](#isbusinessday-function-experimental) | function | Not on the calendar's `weekend` (default Saturday and Sunday) and not a holiday. |
| [`addBusinessDays`](#addbusinessdays-function-experimental) | function | Move by `n` business days (negative goes back). |
| [`businessDaysBetween`](#businessdaysbetween-function-experimental) | function | The business days from `a` (included) to `b` (excluded); negative when `b` is earlier. |
| [`nextBusinessDay`](#nextbusinessday-function-experimental) | function | The first business day after a date. |
| [`previousBusinessDay`](#previousbusinessday-function-experimental) | function | The last business day before a date. |
| [`addBusinessTime`](#addbusinesstime-function-experimental) | function | Add working time: "8 working hours from Friday 15:00" is Monday 15:00. |
| [`businessTimeBetween`](#businesstimebetween-function-experimental) | function | The working time between two moments as `{ hours, minutes }` (plus seconds when needed); negative when `b` is earlier. |
| [`isOpen`](#isopen-function-experimental) | function | Is the calendar open at a moment? A window is half-open: open at its `from`, closed at its `to`. |
| [`nextOpening`](#nextopening-function-experimental) | function | The next time the calendar opens, strictly after `at`; `null` when it never opens within ten years. |
| [`openingWindows`](#openingwindows-function-experimental) | function | The times the calendar is open within one date (midnight to midnight), in order: the same answer `isOpen` gives for… |
| [`nextClosing`](#nextclosing-function-experimental) | function | The next time the calendar closes, strictly after `at`. |
| [`overlaps`](#overlaps-function-experimental) | function | Whether two half-open intervals share time: `[9:00, 10:00)` and `[10:00, 11:00)` do not. |
| [`intersection`](#intersection-function-experimental) | function | The shared part of two intervals, or `null`. |
| [`mergeIntervals`](#mergeintervals-function-experimental) | function | Sort and merge: overlapping and touching intervals become one, empty ones are dropped, the input is not changed. |
| [`subtractIntervals`](#subtractintervals-function-experimental) | function | What is left of `from` once `busy` is taken out: sorted, not overlapping, no empty pieces. |
| [`freeSlots`](#freeslots-function-experimental) | function | Slots of `duration` that fit inside `within` (and the calendar's opening hours), not touching `busy`, with… |
| [`expandEvents`](#expandevents-function-experimental) | function | What a calendar view needs: the instances of single and recurring events that overlap `range`, sorted, each with a… |
| [`useOccursToday`](#useoccurstoday-function-experimental) | function | Reactive: does the rule occur today, in the rule's `timeZone` or the active zone? Flips at local midnight. |
| [`useNextOccurrence`](#usenextoccurrence-function-experimental) | function | Reactive: the next occurrence from today on (today included), moving on at local midnight in the rule's zone or the… |
| [`Recurrence`](#recurrence-type-experimental) | type | A repeating rule as plain data. |
| [`Interval`](#interval-type-experimental) | type | A half-open interval `[start, end)` of date-times, dates or instants. |
| [`BusinessCalendar`](#businesscalendar-type-experimental) | type | Business days and opening hours. |
| [`SpecialHours`](#specialhours-type-experimental) | type | Opening windows of particular dates, as a map or a function (`undefined` = the usual hours). |
| [`WorkingHours`](#workinghours-type-experimental) | type | Opening windows by ISO weekday; absent or empty is closed. |
| [`CalendarEvent`](#calendarevent-type-experimental) | type | An event for `expandEvents`: one-off, or repeating when it has a `rule` that starts at the event's start. |
| [`EventInstance`](#eventinstance-type-experimental) | type | One instance of an event inside the window. |
| [`fp.occurrencesBetween`](#fpoccurrencesbetween-function-experimental) | function | Value-last `occurrencesBetween`. |
| [`fp.nextOccurrence`](#fpnextoccurrence-function-experimental) | function | Value-last `nextOccurrence`. |
| [`fp.previousOccurrence`](#fppreviousoccurrence-function-experimental) | function | Value-last `previousOccurrence`. |
| [`fp.occursOn`](#fpoccurson-function-experimental) | function | Value-last `occursOn`. |
| [`fp.describeRule`](#fpdescriberule-function-experimental) | function | Value-last `describeRule`. |
| [`fp.isBusinessDay`](#fpisbusinessday-function-experimental) | function | Value-last `isBusinessDay`: `isBusinessDay(cal)` is a predicate for `filter`. |
| [`fp.addBusinessDays`](#fpaddbusinessdays-function-experimental) | function | Value-last `addBusinessDays`. |
| [`fp.businessDaysBetween`](#fpbusinessdaysbetween-function-experimental) | function | Value-last `businessDaysBetween` (the first date goes last). |
| [`fp.nextBusinessDay`](#fpnextbusinessday-function-experimental) | function | Value-last `nextBusinessDay`. |
| [`fp.previousBusinessDay`](#fppreviousbusinessday-function-experimental) | function | Value-last `previousBusinessDay`. |
| [`fp.addBusinessTime`](#fpaddbusinesstime-function-experimental) | function | Value-last `addBusinessTime`. |
| [`fp.isOpen`](#fpisopen-function-experimental) | function | Value-last `isOpen`. |
| [`fp.nextOpening`](#fpnextopening-function-experimental) | function | Value-last `nextOpening`. |
| [`fp.openingWindows`](#fpopeningwindows-function-experimental) | function | Value-last `openingWindows`. |
| [`fp.nextClosing`](#fpnextclosing-function-experimental) | function | Value-last `nextClosing`. |
| [`fp.overlaps`](#fpoverlaps-function-experimental) | function | Value-last `overlaps`. |
| [`fp.intersection`](#fpintersection-function-experimental) | function | Value-last `intersection`. |
| [`fp.subtractIntervals`](#fpsubtractintervals-function-experimental) | function | Value-last `subtractIntervals`. |
| [`fp.expandEvents`](#fpexpandevents-function-experimental) | function | Value-last `expandEvents`. |

## API

### `occurrences` `function` — **experimental**

```ts
(rule: Recurrence, range?: { from?, to?, limit? }) => Generator<PlainDate | PlainDateTime>
```

The occurrences of a rule, lazily and in order. A rule with neither `until` nor `count` is endless: bound it with `to` or `limit` (a date bound means the whole day). The rule is checked when you call it. `start` is not an occurrence unless the rule produces it; `count` counts the rule's own occurrences (an `except` date still uses one up); a month day a month lacks is skipped, never clamped.

**Example**

```tsx
[...occurrences({ every: 'week', start: '2026-11-17' }, { limit: 3 })]   // => ['2026-11-17', '2026-11-24', '2026-12-01']
[...occurrences({ every: 'month', start: '2026-01-31' }, { limit: 3 })]   // => ['2026-01-31', '2026-03-31', '2026-05-31']
```

**Common mistakes**

- Stepping day by day with `add` to find occurrences: it is slow, clamps the 31st, and misses RFC rules. Use `occurrencesBetween` or `nextOccurrence`
- Storing every occurrence of a recurring event as a row: store the rule and expand a window with `expandEvents`
- Anchoring a recurring local time in UTC: it drifts by an hour twice a year. Keep the wall time and the `timeZone`, convert with `toInstants`

**See also:** `occurrencesBetween` · `nextOccurrence` · `toInstants`

---

### `occurrencesBetween` `function` — **experimental**

```ts
(rule: Recurrence, from, to) => (PlainDate | PlainDateTime)[]
```

Every occurrence from `from` to `to`, both included; a date bound means the whole day.

**Example**

```tsx
occurrencesBetween({ every: 'day', start: '2026-11-01' }, '2026-11-03', '2026-11-05')   // => ['2026-11-03', '2026-11-04', '2026-11-05']
```

---

### `nextOccurrence` `function` — **experimental**

```ts
(rule: Recurrence, after) => PlainDate | PlainDateTime | null
```

The first occurrence strictly after `after`, or `null`. Jumps to the period of `after`; only a rule with `count` is counted from its start.

**Example**

```tsx
nextOccurrence({ every: 'month', start: '2026-01-31' }, '2026-02-01')   // => '2026-03-31'
nextOccurrence({ every: 'day', start: '2026-01-01', count: 3 }, '2026-01-03')   // => null
```

---

### `previousOccurrence` `function` — **experimental**

```ts
(rule: Recurrence, before) => PlainDate | PlainDateTime | null
```

The last occurrence strictly before `before`, or `null`.

**Example**

```tsx
previousOccurrence({ every: 'week', start: '2026-11-02' }, '2026-11-18')   // => '2026-11-16'
```

---

### `occursOn` `function` — **experimental**

```ts
(rule: Recurrence, date: PlainDate) => boolean
```

Whether the rule has an occurrence on a date.

**Example**

```tsx
occursOn({ every: 'week', start: '2026-11-17' }, '2026-11-24')   // => true
occursOn({ every: 'week', start: '2026-11-17' }, '2026-11-25')   // => false
```

---

### `toInstants` `function` — **experimental**

```ts
(rule: Recurrence, range?, options?: { disambiguation? }) => Generator<Instant>
```

The occurrences as instants through the rule's `timeZone` (required). A wall time that does not exist on a spring-forward day follows `disambiguation` (default `compatible`: moved forward, so 02:30 becomes 03:30); one that occurs twice on a fall-back day takes the first. Hourly and minutely rules run on the wall clock; a repeated instant is emitted once. Range bounds are wall values or instants.

**Example**

```tsx
[...toInstants({ every: 'day', start: '2026-03-28T02:30', timeZone: 'Europe/Prague' }, { limit: 3 })].map((t) => new Date(t).toISOString())   // => ['2026-03-28T01:30:00.000Z', '2026-03-29T01:30:00.000Z', '2026-03-30T00:30:00.000Z']
```

---

### `parseRRule` `function` — **experimental**

```ts
(text: string, options?: { start?, timeZone? }) => Recurrence
```

Read RFC 5545 text: a bare rule, `RRULE:...`, or a block with `DTSTART` (with `TZID` or `VALUE=DATE`), `RRULE`, `EXDATE` and `RDATE`. `options` fill in what the text leaves out. A UTC `UNTIL` or `EXDATE` is read in the rule's zone. Not supported: SECONDLY, BYSECOND, BYEASTER, several RRULEs. Malformed text throws a `[Pyreon]` RangeError with the position.

**Example**

```tsx
parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU', { start: '2026-11-17' })   // => { every: 'week', start: '2026-11-17', interval: 2, on: { weekdays: [2] } }
parseRRule('DTSTART:20261118T090000\nRRULE:FREQ=DAILY;COUNT=3').start   // => '2026-11-18T09:00'
```

**See also:** `tryParseRRule` · `toRRule`

---

### `tryParseRRule` `function` — **experimental**

```ts
(text: string, options?) => Recurrence | null
```

`parseRRule` that returns `null` instead of throwing: for user input and imports.

**Example**

```tsx
tryParseRRule('FREQ=SOMETIMES', { start: '2026-11-18' })   // => null
```

---

### `toRRule` `function` — **experimental**

```ts
(rule: Recurrence) => string
```

Write a rule as RFC 5545 text: a `DTSTART` line, an `RRULE` line, and `EXDATE` / `RDATE` lines when needed. `parseRRule(toRRule(rule))` is the same rule. An `until` in a zone is written in UTC.

**Example**

```tsx
toRRule({ every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17' })   // => 'DTSTART;VALUE=DATE:20261117\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'
```

---

### `describeRule` `function` — **experimental**

```ts
(rule: Recurrence, options?: { locale?, messages?, formatTime? }) => string
```

A rule in words, in English by default; weekday and month names follow `locale` through `Intl`, and `messages` replaces any of about 30 phrases so an app can translate through its own i18n. For languages that inflect a name after a preposition, `messages.weekdays` / `nthWeekdays` / `months` give the forms (Czech `ve středu`, not `ve středa`), and `messages.onNthWeekdays` wraps the n-th weekdays with their own preposition (`v poslední pátek`). Times follow the locale's hour cycle through `Intl` (`7:00 PM` for `en-US`, `19:00` for `cs`; `HH:mm` without a `locale`), and `formatTime` replaces them. Rules with no natural sentence (week numbers, year days, set positions) return the `custom` phrase, "Custom schedule". `except` and `also` are not described.

**Example**

```tsx
describeRule({ every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17' })   // => 'Every 2 weeks on Tuesday'
describeRule({ every: 'month', on: { weekdays: [{ weekday: 5, nth: -1 }] }, start: '2026-11-27T09:00' })   // => 'Every month on the last Friday at 09:00'
```

---

### `isBusinessDay` `function` — **experimental**

```ts
(date, calendar: BusinessCalendar) => boolean
```

Not on the calendar's `weekend` (default Saturday and Sunday) and not a holiday. A date with its own `specialHours` entry is a business day when that entry has a window (even on a weekend or holiday), and not one when it is empty.

**Example**

```tsx
isBusinessDay('2026-11-18', {})   // => true
isBusinessDay('2026-12-25', { holidays: ['2026-12-25'] })   // => false
```

---

### `addBusinessDays` `function` — **experimental**

```ts
(date: PlainDate, n: number, calendar) => PlainDate
```

Move by `n` business days (negative goes back). `n` of 0 returns the date unchanged.

**Example**

```tsx
addBusinessDays('2026-11-20', 1, {})   // => '2026-11-23'
addBusinessDays('2026-12-24', 2, { holidays: ['2026-12-25'] })   // => '2026-12-29'
```

---

### `businessDaysBetween` `function` — **experimental**

```ts
(a: PlainDate, b: PlainDate, calendar) => number
```

The business days from `a` (included) to `b` (excluded); negative when `b` is earlier.

**Example**

```tsx
businessDaysBetween('2026-11-16', '2026-11-23', {})   // => 5
```

---

### `nextBusinessDay` `function` — **experimental**

```ts
(date: PlainDate, calendar) => PlainDate
```

The first business day after a date.

**Example**

```tsx
nextBusinessDay('2026-11-20', {})   // => '2026-11-23'
```

---

### `previousBusinessDay` `function` — **experimental**

```ts
(date: PlainDate, calendar) => PlainDate
```

The last business day before a date.

**Example**

```tsx
previousBusinessDay('2026-11-23', {})   // => '2026-11-20'
```

---

### `addBusinessTime` `function` — **experimental**

```ts
(start: PlainDateTime, duration: Duration, calendar) => PlainDateTime
```

Add working time: "8 working hours from Friday 15:00" is Monday 15:00. Time outside opening hours does not count; a result that fills a window stays at its closing time. Negative durations go back. Needs `hours`; an overnight window (`22:00` to `06:00`) belongs to the day it starts on. Only hours, minutes and seconds: use `addBusinessDays` for days.

**Example**

```tsx
addBusinessTime('2026-11-20T15:00', { hours: 8 }, { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } })   // => '2026-11-23T15:00'
```

**Common mistakes**

- Adding `{ hours: 8 }` with `add` for an SLA: it counts nights and weekends. Use `addBusinessTime`

---

### `businessTimeBetween` `function` — **experimental**

```ts
(a, b, calendar) => Duration
```

The working time between two moments as `{ hours, minutes }` (plus seconds when needed); negative when `b` is earlier.

**Example**

```tsx
businessTimeBetween('2026-11-20T15:00', '2026-11-23T11:00', { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } })   // => { hours: 4, minutes: 0 }
```

---

### `isOpen` `function` — **experimental**

```ts
(at: PlainDateTime, calendar) => boolean
```

Is the calendar open at a moment? A window is half-open: open at its `from`, closed at its `to`.

**Example**

```tsx
isOpen('2026-11-20T10:00', { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } })   // => true
isOpen('2026-11-20T17:00', { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } })   // => false
```

---

### `nextOpening` `function` — **experimental**

```ts
(at: PlainDateTime, calendar) => PlainDateTime | null
```

The next time the calendar opens, strictly after `at`; `null` when it never opens within ten years.

**Example**

```tsx
nextOpening('2026-11-20T18:00', { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } })   // => '2026-11-23T09:00'
```

---

### `openingWindows` `function` — **experimental**

```ts
(date: PlainDate, calendar) => Interval[]
```

The times the calendar is open within one date (midnight to midnight), in order: the same answer `isOpen` gives for every moment of it. Includes the tail of an overnight window that started the day before (even when the date itself is closed), and ends a window that runs past midnight at the next day's `T00:00`. One interpretation of a calendar for views: `@pyreon/calendar` shades business hours with it.

**Example**

```tsx
openingWindows('2026-12-24', { hours: { 4: [{ from: '09:00', to: '17:00' }] }, specialHours: { '2026-12-24': [{ from: '09:00', to: '13:00' }] } })   // => [{ start: '2026-12-24T09:00', end: '2026-12-24T13:00' }]
openingWindows('2026-11-21', { hours: { 5: [{ from: '22:00', to: '02:00' }] } })   // => [{ start: '2026-11-21T00:00', end: '2026-11-21T02:00' }]
```

---

### `nextClosing` `function` — **experimental**

```ts
(at: PlainDateTime, calendar) => PlainDateTime | null
```

The next time the calendar closes, strictly after `at`.

**Example**

```tsx
nextClosing('2026-11-20T10:00', { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } })   // => '2026-11-20T17:00'
```

---

### `overlaps` `function` — **experimental**

```ts
(a: Interval, b: Interval) => boolean
```

Whether two half-open intervals share time: `[9:00, 10:00)` and `[10:00, 11:00)` do not.

**Example**

```tsx
overlaps({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' }, { start: '2026-11-18T09:30', end: '2026-11-18T11:00' })   // => true
overlaps({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' }, { start: '2026-11-18T10:00', end: '2026-11-18T11:00' })   // => false
```

---

### `intersection` `function` — **experimental**

```ts
(a: Interval, b: Interval) => Interval | null
```

The shared part of two intervals, or `null`.

**Example**

```tsx
intersection({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' }, { start: '2026-11-18T09:30', end: '2026-11-18T11:00' })   // => { start: '2026-11-18T09:30', end: '2026-11-18T10:00' }
```

---

### `mergeIntervals` `function` — **experimental**

```ts
(list: Interval[]) => Interval[]
```

Sort and merge: overlapping and touching intervals become one, empty ones are dropped, the input is not changed.

**Example**

```tsx
mergeIntervals([{ start: '2026-11-18T10:00', end: '2026-11-18T11:00' }, { start: '2026-11-18T09:00', end: '2026-11-18T10:00' }])   // => [{ start: '2026-11-18T09:00', end: '2026-11-18T11:00' }]
```

---

### `subtractIntervals` `function` — **experimental**

```ts
(from: Interval[], busy: Interval[]) => Interval[]
```

What is left of `from` once `busy` is taken out: sorted, not overlapping, no empty pieces. `busy` may be unsorted and overlapping.

**Example**

```tsx
subtractIntervals([{ start: '2026-11-18T09:00', end: '2026-11-18T17:00' }], [{ start: '2026-11-18T12:00', end: '2026-11-18T13:00' }])   // => [{ start: '2026-11-18T09:00', end: '2026-11-18T12:00' }, { start: '2026-11-18T13:00', end: '2026-11-18T17:00' }]
```

---

### `freeSlots` `function` — **experimental**

```ts
(options: { within, busy, duration, step?, calendar?, buffer?, limit? }) => Interval[]
```

Slots of `duration` that fit inside `within` (and the calendar's opening hours), not touching `busy`, with `buffer.before` / `buffer.after` of free time around them. Starts sit on a grid of `step` (default `duration`) from the start of each stretch of working time, so slots stay at :00 and :30 whatever the meetings do. Zero or negative durations throw; more than `limit` (default 100000) slots throws. Works on date-times or instants.

**Example**

```tsx
freeSlots({ within: { start: '2026-11-18T09:00', end: '2026-11-18T12:00' }, busy: [{ start: '2026-11-18T10:00', end: '2026-11-18T10:30' }], duration: { minutes: 60 } }).map((s) => s.start)   // => ['2026-11-18T09:00', '2026-11-18T11:00']
```

---

### `expandEvents` `function` — **experimental**

```ts
(events: CalendarEvent[], range: Interval) => EventInstance[]
```

What a calendar view needs: the instances of single and recurring events that overlap `range`, sorted, each with a stable `key` (`"<id>:<occurrence>"`) and `occurrence` (the original start as a number; it does not depend on the window or on moves). `overrides` cancel or move single instances. The cost depends on the window, not on how long ago an event started.

**Example**

```tsx
expandEvents([{ id: 'standup', start: '2026-11-16T09:00', end: '2026-11-16T09:15', rule: { every: 'day', start: '2026-11-16T09:00' } }], { start: '2026-11-18T00:00', end: '2026-11-20T00:00' }).map((i) => i.start)   // => ['2026-11-18T09:00', '2026-11-19T09:00']
```

---

### `useOccursToday` `function` — **experimental**

```ts
(rule: Recurrence) => () => boolean
```

Reactive: does the rule occur today, in the rule's `timeZone` or the active zone? Flips at local midnight. Call it in a component's setup. From the root entry only.

**Example**

```tsx
typeof useOccursToday   // => 'function'
```

---

### `useNextOccurrence` `function` — **experimental**

```ts
(rule: Recurrence) => () => PlainDate | PlainDateTime | null
```

Reactive: the next occurrence from today on (today included), moving on at local midnight in the rule's zone or the active zone. Day-accurate. From the root entry only.

**Example**

```tsx
typeof useNextOccurrence   // => 'function'
```

---

### `Recurrence` `type` — **experimental**

```ts
interface Recurrence { every: "day" | "week" | "month" | "year" | "hour" | "minute"; interval?; on?: { weekdays?, monthDays?, months?, yearDays?, weeks?, hours?, minutes?, position? }; start; until?; count?; weekStart?; except?; also?; timeZone? }
```

A repeating rule as plain data. Field names follow RFC 5545 (FREQ, INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, BYYEARDAY, BYWEEKNO, BYHOUR, BYMINUTE, BYSETPOS, DTSTART, UNTIL, COUNT, WKST, EXDATE, RDATE); values follow @pyreon/time.

**Example**

```tsx
const rule: Recurrence = { every: 'week', on: { weekdays: [1, 3] }, start: '2026-11-16' }
```

---

### `Interval` `type` — **experimental**

```ts
interface Interval<T = PlainDateTime> { start: T; end: T }
```

A half-open interval `[start, end)` of date-times, dates or instants.

**Example**

```tsx
const slot: Interval = { start: '2026-11-18T09:00', end: '2026-11-18T09:30' }
```

---

### `BusinessCalendar` `type` — **experimental**

```ts
interface BusinessCalendar { weekend?: Weekday[]; hours?: WorkingHours; holidays?: PlainDate[] | ((date) => boolean); specialHours?: SpecialHours; timeZone? }
```

Business days and opening hours. No holiday data is shipped: pass a list or a predicate. `specialHours` gives particular dates their own windows (a shortened day, a Sunday opening); they replace the weekday hours and decide the date over `weekend` and `holidays`.

**Example**

```tsx
const cal: BusinessCalendar = { holidays: ['2026-12-25'], specialHours: { '2026-12-24': [{ from: '09:00', to: '13:00' }] } }
```

---

### `SpecialHours` `type` — **experimental**

```ts
type SpecialHours = { [date: PlainDate]: OpeningWindow[] } | ((date: PlainDate) => OpeningWindow[] | undefined)
```

Opening windows of particular dates, as a map or a function (`undefined` = the usual hours). An empty list closes the date. Used by every business-day and business-time function.

**Example**

```tsx
const special: SpecialHours = { '2026-12-24': [{ from: '09:00', to: '13:00' }], '2026-12-31': [] }
```

---

### `WorkingHours` `type` — **experimental**

```ts
type WorkingHours = { [weekday in 1..7]?: { from: PlainTime; to: PlainTime }[] }
```

Opening windows by ISO weekday; absent or empty is closed. A window whose `to` is not after its `from` runs overnight.

**Example**

```tsx
const hours: WorkingHours = { 1: [{ from: '09:00', to: '17:00' }] }
```

---

### `CalendarEvent` `type` — **experimental**

```ts
interface CalendarEvent { id?; start; end; rule?: Recurrence; overrides? }
```

An event for `expandEvents`: one-off, or repeating when it has a `rule` that starts at the event's start.

**Example**

```tsx
const e: CalendarEvent = { id: 'a', start: '2026-11-18T09:00', end: '2026-11-18T10:00' }
```

---

### `EventInstance` `type` — **experimental**

```ts
interface EventInstance { id?; key: string; occurrence: number; start; end }
```

One instance of an event inside the window.

**Example**

```tsx
const key: EventInstance['key'] = 'a:1'
```

---

### `fp.occurrencesBetween` `function` — **experimental**

```ts
(from, to) => (rule: Recurrence) => PlainValue[]
```

Value-last `occurrencesBetween`.

**Example**

```tsx
import { occurrencesBetween } from '@pyreon/schedule/fp'
occurrencesBetween('2026-11-02', '2026-11-16')({ every: 'week', start: '2026-11-02' })   // => ['2026-11-02', '2026-11-09', '2026-11-16']
```

---

### `fp.nextOccurrence` `function` — **experimental**

```ts
(after) => (rule: Recurrence) => PlainValue | null
```

Value-last `nextOccurrence`.

**Example**

```tsx
import { nextOccurrence } from '@pyreon/schedule/fp'
nextOccurrence('2026-11-18')({ every: 'week', start: '2026-11-02' })   // => '2026-11-23'
```

---

### `fp.previousOccurrence` `function` — **experimental**

```ts
(before) => (rule: Recurrence) => PlainValue | null
```

Value-last `previousOccurrence`.

**Example**

```tsx
import { previousOccurrence } from '@pyreon/schedule/fp'
previousOccurrence('2026-11-18')({ every: 'week', start: '2026-11-02' })   // => '2026-11-16'
```

---

### `fp.occursOn` `function` — **experimental**

```ts
(date) => (rule: Recurrence) => boolean
```

Value-last `occursOn`.

**Example**

```tsx
import { occursOn } from '@pyreon/schedule/fp'
occursOn('2026-11-09')({ every: 'week', start: '2026-11-02' })   // => true
```

---

### `fp.describeRule` `function` — **experimental**

```ts
(options?) => (rule: Recurrence) => string
```

Value-last `describeRule`.

**Example**

```tsx
import { describeRule } from '@pyreon/schedule/fp'
describeRule()({ every: 'day', start: '2026-11-18' })   // => 'Every day'
```

---

### `fp.isBusinessDay` `function` — **experimental**

```ts
(calendar) => (date) => boolean
```

Value-last `isBusinessDay`: `isBusinessDay(cal)` is a predicate for `filter`.

**Example**

```tsx
import { isBusinessDay } from '@pyreon/schedule/fp'
isBusinessDay({})('2026-11-21')   // => false
```

---

### `fp.addBusinessDays` `function` — **experimental**

```ts
(n, calendar) => (date: PlainDate) => PlainDate
```

Value-last `addBusinessDays`.

**Example**

```tsx
import { addBusinessDays } from '@pyreon/schedule/fp'
addBusinessDays(2, {})('2026-11-20')   // => '2026-11-24'
```

---

### `fp.businessDaysBetween` `function` — **experimental**

```ts
(b, calendar) => (a: PlainDate) => number
```

Value-last `businessDaysBetween` (the first date goes last).

**Example**

```tsx
import { businessDaysBetween } from '@pyreon/schedule/fp'
businessDaysBetween('2026-11-23', {})('2026-11-16')   // => 5
```

---

### `fp.nextBusinessDay` `function` — **experimental**

```ts
(calendar) => (date: PlainDate) => PlainDate
```

Value-last `nextBusinessDay`.

**Example**

```tsx
import { nextBusinessDay } from '@pyreon/schedule/fp'
nextBusinessDay({})('2026-11-20')   // => '2026-11-23'
```

---

### `fp.previousBusinessDay` `function` — **experimental**

```ts
(calendar) => (date: PlainDate) => PlainDate
```

Value-last `previousBusinessDay`.

**Example**

```tsx
import { previousBusinessDay } from '@pyreon/schedule/fp'
previousBusinessDay({})('2026-11-23')   // => '2026-11-20'
```

---

### `fp.addBusinessTime` `function` — **experimental**

```ts
(duration, calendar) => (start: PlainDateTime) => PlainDateTime
```

Value-last `addBusinessTime`.

**Example**

```tsx
import { addBusinessTime } from '@pyreon/schedule/fp'
addBusinessTime({ hours: 1 }, { hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T09:00')   // => '2026-11-18T10:00'
```

---

### `fp.isOpen` `function` — **experimental**

```ts
(calendar) => (at: PlainDateTime) => boolean
```

Value-last `isOpen`.

**Example**

```tsx
import { isOpen } from '@pyreon/schedule/fp'
isOpen({ hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T10:00')   // => true
```

---

### `fp.nextOpening` `function` — **experimental**

```ts
(calendar) => (at: PlainDateTime) => PlainDateTime | null
```

Value-last `nextOpening`.

**Example**

```tsx
import { nextOpening } from '@pyreon/schedule/fp'
nextOpening({ hours: { 4: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T10:00')   // => '2026-11-19T09:00'
```

---

### `fp.openingWindows` `function` — **experimental**

```ts
(calendar) => (date: PlainDate) => Interval[]
```

Value-last `openingWindows`.

**Example**

```tsx
import { openingWindows } from '@pyreon/schedule/fp'
openingWindows({ hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18')   // => [{ start: '2026-11-18T09:00', end: '2026-11-18T17:00' }]
```

---

### `fp.nextClosing` `function` — **experimental**

```ts
(calendar) => (at: PlainDateTime) => PlainDateTime | null
```

Value-last `nextClosing`.

**Example**

```tsx
import { nextClosing } from '@pyreon/schedule/fp'
nextClosing({ hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T10:00')   // => '2026-11-18T17:00'
```

---

### `fp.overlaps` `function` — **experimental**

```ts
(b: Interval) => (a: Interval) => boolean
```

Value-last `overlaps`.

**Example**

```tsx
import { overlaps } from '@pyreon/schedule/fp'
overlaps({ start: '2026-11-18T09:30', end: '2026-11-18T11:00' })({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' })   // => true
```

---

### `fp.intersection` `function` — **experimental**

```ts
(b: Interval) => (a: Interval) => Interval | null
```

Value-last `intersection`.

**Example**

```tsx
import { intersection } from '@pyreon/schedule/fp'
intersection({ start: '2026-11-18T09:30', end: '2026-11-18T11:00' })({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' })   // => { start: '2026-11-18T09:30', end: '2026-11-18T10:00' }
```

---

### `fp.subtractIntervals` `function` — **experimental**

```ts
(busy: Interval[]) => (from: Interval[]) => Interval[]
```

Value-last `subtractIntervals`.

**Example**

```tsx
import { subtractIntervals } from '@pyreon/schedule/fp'
subtractIntervals([{ start: '2026-11-18T12:00', end: '2026-11-18T13:00' }])([{ start: '2026-11-18T09:00', end: '2026-11-18T14:00' }])   // => [{ start: '2026-11-18T09:00', end: '2026-11-18T12:00' }, { start: '2026-11-18T13:00', end: '2026-11-18T14:00' }]
```

---

### `fp.expandEvents` `function` — **experimental**

```ts
(range: Interval) => (events) => EventInstance[]
```

Value-last `expandEvents`.

**Example**

```tsx
import { expandEvents } from '@pyreon/schedule/fp'
expandEvents({ start: '2026-11-18T00:00', end: '2026-11-19T00:00' })([{ id: 'a', start: '2026-11-18T09:00', end: '2026-11-18T10:00' }]).map((i) => i.start)   // => ['2026-11-18T09:00']
```

---

## Package-level notes

> **The 31st is skipped, not clamped:** A monthly rule on the 31st has no occurrence in April, June, September and November (RFC 5545 section 3.3.10). `add("2026-01-31", { months: 1 })` clamps to the 28th. They differ on purpose: a calendar rule says "the 31st", an add says "about a month later". For "the last day of every month" use `monthDays: [-1]`.

> **Wall-clock occurrences:** A rule's occurrences are wall-clock times. A daily 09:00 in Europe/Prague is 09:00 in summer and winter; its instant moves by an hour at the clock change. Anchoring a recurring local time in UTC drifts by an hour twice a year. `toInstants` resolves a wall time that does not exist (02:30 on a spring-forward day) by `disambiguation`, default `compatible`: moved forward to 03:30.

> **count, except and start:** `count` counts the rule's own occurrences, so an `except` date still uses one up (RFC 5545: EXDATE removes from the generated set). `start` is an occurrence only if the rule produces it: a weekly Tuesday rule that starts on a Monday begins on the next Tuesday.

> **Bounds and endless rules:** A rule with neither `until` nor `count` is endless; `occurrences` is lazy. Collecting without `to` or `limit` stops after one million occurrences with an error. A date bound means the whole day: `from` is its start, `to` its end, `after` skips it, `before` stops short of it.

> **Rules that never occur:** Rules that cannot occur (a 30th of February) throw when built. A rule that finds nothing for about five thousand periods in a row ends, so `nextOccurrence` returns `null` instead of looping.

> **Holidays:** No holiday data is shipped. Pass `holidays` as a list of dates or a predicate (a static list per country and year, a public-holiday API result). A predicate must return a boolean for every date; one that throws raises a `[Pyreon]` error naming the date.

> **Business time is counted on the wall clock:** Opening hours are wall-clock windows; a day with a clock change is not special-cased. A window ending at or before its start runs overnight into the next day and belongs to the day it starts on, whatever the next day is.

> **Free slot grid:** `freeSlots` starts slots on a grid of `step` from the start of each stretch of working time, not from the end of each meeting, so a booking page keeps offering :00 and :30. A zero-length busy interval is ignored.

> **Differences from rrule:** Verified against the `rrule` library; where they differ ours follows the RFC: chronological order for unsorted BYHOUR, union of plain and n-th BYDAY, whole-week BYSETPOS, week-year BYWEEKNO, an interval grid that never drifts, a date UNTIL meaning the whole day.
