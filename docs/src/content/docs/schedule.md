---
title: Schedule
description: Recurrence, business time and availability as plain data for Pyreon — RFC 5545 rules that stay on the wall clock across DST, working hours, free slots, calendar expansion
---

<PackageBadge name="@pyreon/schedule" href="/docs/schedule" />

`@pyreon/schedule` answers the questions a calendar, a booking page or an SLA clock asks: when does this repeat, what is the next one, how many working hours are left, which slots are free. It is a layer above [`@pyreon/time`](/docs/time) and uses its plain values: a rule is a plain object, an occurrence is a `"2026-11-18T09:30"` string, an interval is `{ start, end }`. Nothing is a class, everything survives `JSON.stringify` and `structuredClone`, and every function is tree-shakeable.

> **Experimental.** It follows RFC 5545 (iCalendar RRULE) and is checked against the RFC's own examples, the `rrule` library and a brute-force oracle (see [Correctness](#correctness)). Rules that no calendar can honour throw a clear `[Pyreon]` error.

## Installation

:::code-group

```bash [npm]
npm install @pyreon/schedule @pyreon/time
```

```bash [bun]
bun add @pyreon/schedule @pyreon/time
```

```bash [pnpm]
pnpm add @pyreon/schedule @pyreon/time
```

```bash [yarn]
yarn add @pyreon/schedule @pyreon/time
```

:::

`@pyreon/time` is a dependency and installs with it. The reactive entry also needs `@pyreon/reactivity` (and `@pyreon/core` through `@pyreon/time`), which every Pyreon app has; the `/core` entry needs only `@pyreon/time`.

| Entry | Depends on | What |
| --- | --- | --- |
| `@pyreon/schedule/core` | `@pyreon/time` (its `/core` entry) | Every function as a pure function. |
| `@pyreon/schedule` | `@pyreon/time`, `@pyreon/reactivity` | The same, plus `useOccursToday` and `useNextOccurrence`, which read the active time zone and clock. |
| `@pyreon/schedule/fp` | `@pyreon/time` (its `/core` entry) | Value-last forms for `pipe`. |

## Quick start

```ts
// @check
import { addBusinessTime, nextOccurrence, occurrencesBetween } from '@pyreon/schedule'

const standup = { every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17T09:30' } as const
const office = { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } } as const

occurrencesBetween(standup, '2026-11-17', '2026-12-31') // => ['2026-11-17T09:30', '2026-12-01T09:30', '2026-12-15T09:30', '2026-12-29T09:30']
nextOccurrence(standup, '2026-11-18') // => '2026-12-01T09:30'
addBusinessTime('2026-11-20T15:00', { hours: 8 }, office) // => '2026-11-23T15:00'
```

## A rule is plain data

```ts
// @check
import type { Recurrence } from '@pyreon/schedule'

const rule: Recurrence = {
  every: 'month', // FREQ: 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute'
  interval: 1, // every N periods (default 1)
  on: { weekdays: [{ weekday: 5, nth: -1 }] }, // BY* parts: the last Friday
  start: '2026-11-27T09:00', // DTSTART: a date makes dates, a date-time makes date-times
  timeZone: 'Europe/Prague', // the zone the wall clock is in; only needed for instants
}
```

Field names follow RFC 5545 so people can map what they know; values follow `@pyreon/time` (ISO weekday 1 to 7 with 1 as Monday, month 1 to 12).

| Field | RFC 5545 | Notes |
| --- | --- | --- |
| `every`, `interval` | FREQ, INTERVAL | `hour` and `minute` need a date-time `start`. |
| `on.weekdays` | BYDAY | `5` is every Friday; `{ weekday: 5, nth: -1 }` is the last Friday (`nth` 1 to 5 or -1 to -5; up to 53 in a yearly rule). `nth` only on monthly and yearly rules. |
| `on.monthDays` | BYMONTHDAY | 1 to 31, or -1 to -31 from the end: `[-1]` is the last day. |
| `on.months`, `on.yearDays`, `on.weeks` | BYMONTH, BYYEARDAY, BYWEEKNO | `weeks` only on yearly rules. |
| `on.hours`, `on.minutes` | BYHOUR, BYMINUTE | Expand a daily rule into several times; filter an hourly or minutely one. |
| `on.position` | BYSETPOS | Pick the n-th (or n-th last) occurrence of each period: `[-1]` is the last. |
| `start`, `until`, `count` | DTSTART, UNTIL, COUNT | `until` is inclusive and a date means the whole day; `count` and `until` are exclusive. |
| `weekStart` | WKST | Default 1 (Monday). |
| `except`, `also` | EXDATE, RDATE | Dates to leave out, and dates to add. |

`start` is an occurrence only when the rule produces it: a weekly Tuesday rule that starts on a Monday begins on the next Tuesday. `count` counts the rule's own occurrences, so a date in `except` still uses one up (RFC 5545: EXDATE removes from the generated set).

## Expanding a rule

`occurrences(rule, { from, to, limit })` is a lazy generator, in order. `occurrencesBetween`, `nextOccurrence`, `previousOccurrence` and `occursOn` cover the common questions. A date bound means the whole day: `from` is its start, `to` its end, `after` skips the day, `before` stops short of it.

```ts
// @check
import { nextOccurrence, occurrences, occurrencesBetween, occursOn, previousOccurrence } from '@pyreon/schedule'

const rule = { every: 'week', on: { weekdays: [2] }, start: '2026-11-03T09:00' } as const

const list1 = [...occurrences(rule, { limit: 3 })] // => ['2026-11-03T09:00', '2026-11-10T09:00', '2026-11-17T09:00']
occurrencesBetween(rule, '2026-11-17', '2026-12-01') // => ['2026-11-17T09:00', '2026-11-24T09:00', '2026-12-01T09:00']
nextOccurrence(rule, '2026-11-17T09:00') // => '2026-11-24T09:00'
nextOccurrence(rule, '2026-11-17') // => '2026-11-24T09:00'
previousOccurrence(rule, '2026-11-17T09:00') // => '2026-11-10T09:00'
occursOn(rule, '2026-11-24') // => true
```

An endless rule (no `until`, no `count`) is fine as a generator; collect it with `to` or `limit`. Collecting one without a bound stops after a million occurrences with an error that says so.

**Expansion jumps, it does not step.** Each period's candidates are computed from the period's number, and the generator jumps to the period of `from`. `nextOccurrence` on a rule that started ten years ago costs the same as on a new one (the tests count the candidate days and bound them). A rule with a `count` is counted from its start, so it enumerates up to the count and no further. A rule that finds nothing for about five thousand periods in a row ends, so `nextOccurrence` returns `null` instead of looping.

## Recipes

Every snippet on this page is executed by the package's tests, with the outputs shown.

**"Every second Tuesday":**

```ts
// @check
import { occurrencesBetween } from '@pyreon/schedule'

occurrencesBetween({ every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17' }, '2026-11-01', '2027-01-15') // => ['2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29', '2027-01-12']
```

**"The last Friday of the month":**

```ts
// @check
import { occurrencesBetween } from '@pyreon/schedule'

occurrencesBetween({ every: 'month', on: { weekdays: [{ weekday: 5, nth: -1 }] }, start: '2026-01-01' }, '2026-01-01', '2026-04-30') // => ['2026-01-30', '2026-02-27', '2026-03-27', '2026-04-24']
```

**"Weekdays at 9:00 in the user's zone".** The rule keeps the wall time; `toInstants` turns it into instants through the zone, so 09:00 stays 09:00 when the clocks change:

```ts
// @check
import { toInstants } from '@pyreon/schedule'

const workdays = { every: 'day', on: { weekdays: [1, 2, 3, 4, 5] }, start: '2026-03-26T09:00', timeZone: 'Europe/Prague' } as const

const list1 = [...toInstants(workdays, { limit: 4 })].map((t) => new Date(t).toISOString()) // => ['2026-03-26T08:00:00.000Z', '2026-03-27T08:00:00.000Z', '2026-03-30T07:00:00.000Z', '2026-03-31T07:00:00.000Z']
```

The instants move by an hour at the clock change on 29 March (08:00Z in winter, 07:00Z in summer), and the wall time does not. For the user's own zone take it from the app (`@pyreon/ambient`'s `timeZone()`), or use the reactive hooks below.

**The next three occurrences, shown with `@pyreon/format`:**

```ts
// @check
import { formatDate } from '@pyreon/format/core'
import { occurrences } from '@pyreon/schedule'

const standup = { every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17T09:30' } as const
const shown = [...occurrences(standup, { from: '2026-11-18', limit: 3 })].map((o) => formatDate(o, { locale: 'en-US', dateStyle: 'medium', timeStyle: 'short' }))

shown // => ['Dec 1, 2026, 9:30 AM', 'Dec 15, 2026, 9:30 AM', 'Dec 29, 2026, 9:30 AM']
```

**Importing an `.ics` RRULE line.** `parseRRule` reads RFC text, with `DTSTART`, `EXDATE` and `RDATE` lines when you have them; `tryParseRRule` returns `null` for text from a user:

```ts
// @check
import { occurrencesBetween, parseRRule, toRRule, tryParseRRule } from '@pyreon/schedule'

const ics = ['DTSTART;TZID=Europe/Prague:20261118T090000', 'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=4', 'EXDATE;TZID=Europe/Prague:20261202T090000'].join('\n')
const rule = parseRRule(ics)

rule.every // => 'week'
rule.timeZone // => 'Europe/Prague'
occurrencesBetween(rule, '2026-11-01', '2027-01-31') // => ['2026-11-18T09:00', '2026-11-25T09:00', '2026-12-09T09:00']
toRRule(rule) // => 'DTSTART;TZID=Europe/Prague:20261118T090000\nRRULE:FREQ=WEEKLY;COUNT=4;BYDAY=WE\nEXDATE;TZID=Europe/Prague:20261202T090000'
tryParseRRule('FREQ=SOMETIMES', { start: '2026-11-18' }) // => null
```

`COUNT=4` counted the excepted 2 December too, so three dates remain. Malformed text throws a `[Pyreon]` error with the position, for example `FREQ must be YEARLY, MONTHLY, WEEKLY, DAILY, HOURLY or MINUTELY, got "WEEKLYY" (at position 5 of "FREQ=WEEKLYY")`. SECONDLY, BYSECOND, BYEASTER and several RRULE lines are not supported.

## The 31st is skipped, not clamped

> **Different from `add`, on purpose.** A monthly rule on the 31st has no occurrence in months that lack a 31st (RFC 5545 section 3.3.10). `add('2026-01-31', { months: 1 })` clamps to the 28th. A rule says "the 31st"; an `add` says "about a month later".

```ts
// @check
import { add } from '@pyreon/time'
import { occurrences } from '@pyreon/schedule'

const list1 = [...occurrences({ every: 'month', start: '2026-01-31' }, { limit: 4 })] // => ['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31']
add('2026-01-31', { months: 1 }) // => '2026-02-28'
```

For "the last day of every month" say so: `on: { monthDays: [-1] }` gives 31 January, 28 February, 31 March. A yearly rule on 29 February happens only in leap years, and 2100 is not one.

## Daylight saving time

Occurrences are wall-clock times, so a rule never drifts: a daily 09:00 in Europe/Prague is 09:00 in summer and in winter, and only its instant moves. `toInstants` resolves the two awkward wall times with the same `disambiguation` option as `@pyreon/time`:

- A time that does not exist (02:30 on the spring-forward day) follows `disambiguation`: `'compatible'`, the default, moves it forward to 03:30; `'reject'` throws.
- A time that occurs twice (01:30 on the New York fall-back day) takes the first by default; `'later'` takes the second.

```ts
// @check
import { toInstants } from '@pyreon/schedule'

const daily = { every: 'day', start: '2026-03-28T02:30', timeZone: 'Europe/Prague' } as const

const list1 = [...toInstants(daily, { limit: 3 })].map((t) => new Date(t).toISOString()) // => ['2026-03-28T01:30:00.000Z', '2026-03-29T01:30:00.000Z', '2026-03-30T00:30:00.000Z']
```

The 29th is 03:30 summer time (01:30Z) because 02:30 does not exist; the 30th is 02:30 summer time. A rule that is anchored in UTC instead drifts by an hour twice a year: keep the wall time and the zone, not a UTC hour.

Hourly and minutely rules run on the wall clock, from the rule's start. When a whole local day is skipped (Samoa, 30 December 2011) the instants of the skipped day and the next day coincide and are emitted once.

## Business time

No holiday data is shipped. A calendar takes `holidays` as a list of dates or as a predicate, and `weekend` (default Saturday and Sunday).

```ts
// @check
import { addBusinessDays, businessDaysBetween, isBusinessDay, nextBusinessDay } from '@pyreon/schedule'

const calendar = { holidays: ['2026-12-25', '2026-12-26'] } as const

isBusinessDay('2026-12-25', calendar) // => false
addBusinessDays('2026-12-24', 1, calendar) // => '2026-12-28'
nextBusinessDay('2026-11-20', calendar) // => '2026-11-23'
businessDaysBetween('2026-12-21', '2026-12-29', calendar) // => 5
```

A predicate plugs in a rule, a cached public-holiday API result or a per-country table; it must return a boolean for every date (one that throws, or returns something else, raises a `[Pyreon]` error naming the date):

```ts
// @check
import { isBusinessDay } from '@pyreon/schedule'

const fixed = new Set(['01-01', '05-01', '12-25'])
const calendar = { holidays: (date: string) => fixed.has(date.slice(5)) }

isBusinessDay('2027-01-01', calendar) // => false
isBusinessDay('2027-01-04', calendar) // => true
```

`addBusinessDays(date, 0)` returns the date unchanged. A calendar in which every day is a weekend or a holiday throws instead of looping.

### Working hours

`hours` gives opening windows by ISO weekday; absent or empty means closed. Windows may be split (a lunch break) and may run overnight: a window whose `to` is not after its `from` (`22:00` to `06:00`) belongs to the day it starts on. `"00:00"` to `"00:00"` is a whole day.

```ts
// @check
import { addBusinessTime, businessTimeBetween, isOpen, nextClosing, nextOpening } from '@pyreon/schedule'

const day = [{ from: '09:00', to: '12:00' }, { from: '13:00', to: '17:00' }] as const
const shop = { hours: { 1: day, 2: day, 3: day, 4: day, 5: day } } as const

isOpen('2026-11-18T12:30', shop) // => false
nextOpening('2026-11-18T12:30', shop) // => '2026-11-18T13:00'
nextClosing('2026-11-18T10:00', shop) // => '2026-11-18T12:00'
businessTimeBetween('2026-11-20T10:00', '2026-11-23T10:00', shop) // => { hours: 7, minutes: 0 }
```

Windows are half-open: open at `from`, closed at `to`. `nextOpening` and `nextClosing` are strictly after the moment. `isOpen`, `nextOpening` and `nextClosing` return `false` or `null` for a calendar that never opens, while `addBusinessTime` on one throws.

**Special hours on particular dates.** `specialHours` gives a date its own windows: a shortened day before a holiday, a Sunday opening before Christmas, or `[]` to close a date. A date's entry replaces its weekday's `hours` and decides the date over `weekend` and `holidays`, so a date that is on both lists is open with its special windows; every business-day and business-time function reads it. Like `holidays`, it is a map or a function (return `undefined` for the usual hours):

```ts
// @check
import { addBusinessTime, isBusinessDay, isOpen, nextClosing } from '@pyreon/schedule'

const day = [{ from: '09:00', to: '17:00' }] as const
const shop = {
  hours: { 1: day, 2: day, 3: day, 4: day, 5: day },
  holidays: ['2026-12-25'],
  specialHours: { '2026-12-24': [{ from: '09:00', to: '13:00' }], '2026-12-20': [{ from: '10:00', to: '16:00' }] },
} as const

isOpen('2026-12-24T15:00', shop) // => false
nextClosing('2026-12-24T10:00', shop) // => '2026-12-24T13:00'
isBusinessDay('2026-12-20', shop) // => true
addBusinessTime('2026-12-24T12:00', { hours: 2 }, shop) // => '2026-12-28T10:00'
```

**An SLA due date: "respond within 8 business hours".**

```ts
// @check
import { addBusinessTime } from '@pyreon/schedule'

const day = [{ from: '09:00', to: '17:00' }] as const
const support = { hours: { 1: day, 2: day, 3: day, 4: day, 5: day }, holidays: ['2026-11-23'] } as const

addBusinessTime('2026-11-20T15:00', { hours: 8 }, support) // => '2026-11-24T15:00'
addBusinessTime('2026-11-20T09:00', { hours: 8 }, support) // => '2026-11-20T17:00'
addBusinessTime('2026-11-21T10:00', { minutes: 30 }, support) // => '2026-11-24T09:30'
```

Time outside opening hours does not count, a result that fills a window stays at its closing time, and a start outside hours begins at the next opening. A negative duration goes back. Only hours, minutes and seconds are accepted; use `addBusinessDays` for days.

## Availability

Intervals are half-open, `[start, end)`: `[9:00, 10:00)` and `[10:00, 11:00)` do not overlap.

```ts
// @check
import { intersection, mergeIntervals, overlaps, subtractIntervals } from '@pyreon/schedule'

const a = { start: '2026-11-18T09:00', end: '2026-11-18T10:00' }
const b = { start: '2026-11-18T10:00', end: '2026-11-18T11:00' }

overlaps(a, b) // => false
intersection(a, { start: '2026-11-18T09:30', end: '2026-11-18T12:00' }) // => { start: '2026-11-18T09:30', end: '2026-11-18T10:00' }
mergeIntervals([b, a]) // => [{ start: '2026-11-18T09:00', end: '2026-11-18T11:00' }]
subtractIntervals([{ start: '2026-11-18T09:00', end: '2026-11-18T17:00' }], [{ start: '2026-11-18T12:00', end: '2026-11-18T13:00' }]) // => [{ start: '2026-11-18T09:00', end: '2026-11-18T12:00' }, { start: '2026-11-18T13:00', end: '2026-11-18T17:00' }]
```

**A booking page's free slots.** `freeSlots` returns slots of a given length inside the working hours, around busy time, with optional buffers. Slot starts sit on a grid of `step` (default the duration) from the start of each stretch of working time, so a page keeps offering :00 and :30 whatever the meetings do:

```ts
// @check
import { freeSlots } from '@pyreon/schedule'

const slots = freeSlots({
  within: { start: '2026-11-18T09:00', end: '2026-11-18T17:00' },
  calendar: { hours: { 3: [{ from: '09:00', to: '17:00' }] } },
  busy: [{ start: '2026-11-18T10:00', end: '2026-11-18T10:45' }, { start: '2026-11-18T13:00', end: '2026-11-18T15:00' }],
  duration: { minutes: 60 },
  buffer: { before: { minutes: 15 } },
})

slots.map((s) => s.start) // => ['2026-11-18T09:00', '2026-11-18T11:00', '2026-11-18T12:00', '2026-11-18T16:00']
```

The slots never overlap busy time, stay inside `within` and the calendar, keep the buffers (`before` is free time wanted after a busy interval, `after` before the next one), and are sorted. A zero or negative duration or step throws; more than `limit` (default 100000) slots throws. Busy lists may be unsorted and overlapping. Instants (numbers) work too, without a calendar.

## Expanding events for a calendar view

`expandEvents(events, range)` turns single and recurring events into the instances that overlap a window, sorted, for a month or week view. Each instance carries a stable `key` and `occurrence`: the same instance has the same key whatever the window, so a view can key its rows by it. `occurrence` is the original start as a number (the wall-clock milliseconds counted as if it were UTC); it does not change when an instance is moved.

```ts
// @check
import { expandEvents } from '@pyreon/schedule'

const standup = { id: 'standup', start: '2026-11-16T09:00', end: '2026-11-16T09:15', rule: { every: 'day', on: { weekdays: [1, 2, 3, 4, 5] }, start: '2026-11-16T09:00' } } as const
const window = { start: '2026-11-18T00:00', end: '2026-11-21T00:00' } as const
const original = Date.UTC(2026, 10, 19, 9)

expandEvents([standup], window).map((i) => i.start) // => ['2026-11-18T09:00', '2026-11-19T09:00', '2026-11-20T09:00']
expandEvents([{ ...standup, overrides: [{ occurrence: original, cancelled: true }] }], window).map((i) => i.start) // => ['2026-11-18T09:00', '2026-11-20T09:00']
expandEvents([{ ...standup, overrides: [{ occurrence: original, start: '2026-11-19T11:00' }] }], window).map((i) => `${i.start}-${i.end}`) // => ['2026-11-18T09:00-2026-11-18T09:15', '2026-11-19T11:00-2026-11-19T11:15', '2026-11-20T09:00-2026-11-20T09:15']
expandEvents([standup], window).map((i) => i.key === `standup:${i.occurrence}`) // => [true, true, true]
```

An event's rule must start at the event's `start`. A moved instance appears where it was moved to, even when its original time is outside the window; a long event that began before the window still shows. All-day events use dates, with the end the day after. Instances last as long as the event does, on the wall clock. The cost depends on the window, not on how long ago the event started.

## Describing a rule

`describeRule` turns a rule into words: English is built in, weekday and month names come from `Intl` for any locale, and `messages` replaces any of about thirty phrases so the sentence frame can be translated through your own i18n.

```ts
// @check
import { describeRule } from '@pyreon/schedule'

describeRule({ every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17' }) // => 'Every 2 weeks on Tuesday'
describeRule({ every: 'month', on: { weekdays: [{ weekday: 5, nth: -1 }] }, start: '2026-11-27T09:00' }) // => 'Every month on the last Friday at 09:00'
describeRule({ every: 'week', start: '2026-11-17' }, { locale: 'de' }) // => 'Every week on Dienstag'
describeRule({ every: 'year', on: { weeks: [20], weekdays: [1] }, start: '2026-05-11' }) // => 'Custom schedule'
```

Rules with no natural sentence (week numbers, year days, set positions, a weekday list mixed with month days, hourly rules with minute lists) return the `custom` phrase, "Custom schedule", rather than a wrong sentence; `except` and `also` are not described. To translate, keep the phrases in your catalog and pass them as `messages`. With `@pyreon/i18n`:

```ts
// @check
import { createI18n } from '@pyreon/i18n/core'
import { describeRule } from '@pyreon/schedule'
import type { RuleMessages } from '@pyreon/schedule'

const i18n = createI18n({
  locale: 'cs',
  messages: { cs: { 'rule.everyNWeeks': 'každé {n} týdny', 'rule.onWeekdays': 've dnech: {list}', 'rule.custom': 'Vlastní plán' } },
})
const messages: Partial<RuleMessages> = { everyNWeeks: i18n.t('rule.everyNWeeks'), onWeekdays: i18n.t('rule.onWeekdays'), custom: i18n.t('rule.custom') }

describeRule({ every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17' }, { locale: 'cs', messages }) // => 'Každé 2 týdny ve dnech: úterý'
```

The templates use `{n}`, `{list}`, `{nth}`, `{weekday}` and `{date}` placeholders (single braces, so an i18n library that interpolates `{{name}}` leaves them alone).

## Reactive helpers

The root entry adds two hooks for components, built on `@pyreon/time`'s `useToday`, so they follow the rule's `timeZone` or else the active zone and flip at local midnight on one shared ticker:

```tsx
// @check
import { useNextOccurrence, useOccursToday } from '@pyreon/schedule'

const trashDay = { every: 'week', on: { weekdays: [4] }, start: '2026-11-05', timeZone: 'Europe/Prague' } as const

export function TrashReminder() {
  const today = useOccursToday(trashDay)
  const next = useNextOccurrence(trashDay)

  return <p>{() => (today() ? 'Put the bins out today' : `Next collection: ${next()}`)}</p>
}
```

`useNextOccurrence` is day-accurate: an occurrence earlier today still counts until midnight.

## Correctness

The expansion is the product, so it is verified three ways, and every disagreement with another implementation is documented.

- **RFC 5545 section 3.8.5.3.** All 39 examples of the RFC are a fixed table in the tests, parsed from the RFC's own `DTSTART`, `EXDATE` and `RRULE` text with `parseRRule`; every list matches. One RFC example has a printed error (an hourly `UNTIL` in UTC that cannot produce the listed 15:00; the test uses the corrected value and asserts what the printed text means).
- **The `rrule` library** (a dev dependency of the tests only): thousands of seeded random rules and windows are compared, with every divergence below skipped only where it is documented and tested.
- **A brute-force oracle** that evaluates the RFC day by day with its own calendar arithmetic: 3000 seeded wide rules (every BY part, any positions, mixed BYDAY, week numbers, `count`, `until`, `except`, `also`) agree.

Where `rrule` differs, ours follows the RFC text:

| | `rrule` 2.8.1 | `@pyreon/schedule` |
| --- | --- | --- |
| Unsorted `BYHOUR` / `BYMINUTE` | Emits in list order, so `COUNT` counts the wrong occurrences | Chronological, as the RFC's examples are |
| `BYDAY` mixing `FR` and `-1FR` | Returns nothing | The union of the entries |
| `BYSETPOS` beyond the period (`-3` of one) | Clamps and repeats the occurrence | Ignored: there is no such instance |
| `BYSETPOS` in the first, partial week | Counts positions only from `DTSTART` | Counts in the whole week, then drops days before `DTSTART` (as monthly and yearly do) |
| `BYWEEKNO` | Leaves out days of week N that fall in the neighbouring calendar year | All days of the week-year's week N |
| Hourly or minutely after a skipped day or hour | Drifts off the interval grid | Stays on the grid |
| A date `UNTIL` on a date-time rule | Midnight: the last day is dropped | The whole last day |
| A rule that never occurs | Scans to the year 9999 (minutes of CPU for minutely rules) | Ends in milliseconds |
| `BYDAY=1MO` on a weekly rule | Accepted | An error (RFC: only monthly and yearly) |

DST cases are tested in Europe/Prague and America/New_York (spring forward, fall back, a weekly rule whose instant moves while its wall time does not), alongside month ends, leap days, week 53 and `count` with `except`.

## Limits and errors

Every function validates its input and throws a `[Pyreon]` error that names the function, the input and the fix. Rules that cannot occur (a 30th of February) throw when built. A hostile value, such as an object whose getter throws, is reported as unreadable data rather than leaking its own error. Opening hours are wall-clock windows and a day with a clock change is not special-cased.

## Coming from

| You use | Here |
| --- | --- |
| `new RRule({ freq: RRule.WEEKLY, byweekday: [RRule.TU] })` (rrule.js) | `{ every: 'week', on: { weekdays: [2] }, start }`; `RRule.fromString(text)` is `parseRRule(text)`; `rule.toString()` is `toRRule(rule)`; `rule.between(a, b)` is `occurrencesBetween(rule, a, b)`; `rule.after(d)` is `nextOccurrence(rule, d)`; `rule.toText()` is `describeRule(rule)` |
| rrule.js `dtstart: new Date(...)` and `tzid` | A wall-clock `start` string and `timeZone`; `toInstants` for `Date`s |
| rrule.js `RRuleSet` (`exdate`, `rdate`) | `except` and `also` on the rule |
| later.js `later.parse.recur().every(2).dayOfWeek()` | `{ every: 'week', interval: 2, ... }`; later.js has no RFC 5545 and no wall-clock time zones |
| date-fns `addBusinessDays(d, n)` | `addBusinessDays(date, n, calendar)`; weekends and holidays are in the calendar |
| date-fns `differenceInBusinessDays(a, b)` | `businessDaysBetween(b, a, calendar)` (from the first date, included, to the second, excluded) |
| date-fns `isWeekend(d)` | `!isBusinessDay(date, { weekend })` |
| moment-business-days `moment.updateLocale('us', { holidays })` | `{ holidays: [...] }` or a predicate in the calendar, passed to each call |
| moment-business-days `businessAdd(n)`, `nextBusinessDay()` | `addBusinessDays(date, n, calendar)`, `nextBusinessDay(date, calendar)` |
| A cron string for "weekdays at 9" | `{ every: 'day', on: { weekdays: [1, 2, 3, 4, 5] }, start: '...T09:00' }` |

## Related

- [`@pyreon/time`](/docs/time): the plain values, arithmetic and zones this package builds on.
- [`@pyreon/format`](/docs/format): shows occurrences and intervals to people.
- [Dates and times](/docs/patterns/dates-and-times): when to use which.
