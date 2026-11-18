---
title: Time
description: Dates and times as plain strings and numbers for Pyreon — ISO values, DST-correct zone math, calendar grids, no classes
---

<PackageBadge name="@pyreon/time" href="/docs/time" />

`@pyreon/time` treats a date as what it already is in your props, your JSON and your URL: a string. `"2026-11-18"` is a date, `"14:30"` is a time of day, and an instant is the epoch-millisecond number `Date.now()` returns. Every operation is one plain function, so there is nothing to construct, nothing to clone and nothing to unwrap, and a bundler keeps only the functions you import.

> **Experimental.** The value layer described here is complete and checked against `Temporal`. The clocks (`useNow`, `useToday`, `useRelativeTime`, `useCountdown`) and the active time zone arrive in later releases, so the API may still change in a minor version.

## Installation

:::code-group

```bash [npm]
npm install @pyreon/time
```

```bash [bun]
bun add @pyreon/time
```

```bash [pnpm]
pnpm add @pyreon/time
```

```bash [yarn]
yarn add @pyreon/time
```

:::

`@pyreon/time/core` has no dependencies and works anywhere JavaScript runs. `@pyreon/time` re-exports all of it and adds a pinnable clock (`setClock`, `now`, `today`). `@pyreon/time/fp` has the value-last forms of every operation and `pipe` (see [Composing operations](#composing-operations)).

## Quick start

```ts
// @check
import { add, diff, startOf, monthGrid, isPlainDate } from '@pyreon/time/core'

add('2026-01-31', { months: 1 }) // '2026-02-28': the day clamps to the end of the month
diff('2026-11-18', '2026-12-24', 'day') // 36
startOf('2026-11-18', 'week') // '2026-11-16': weeks start on Monday unless you say otherwise
monthGrid('2026-11')[0] // ['2026-10-26', ..., '2026-11-01']

// User input is a plain string. Check it once at the boundary, then the types carry it.
function addWeek(input: string): string | null {
  return isPlainDate(input) ? add(input, { weeks: 1 }) : null
}
```

## The values

| Type | Looks like | Notes |
| --- | --- | --- |
| `PlainDate` | `2026-11-18` | proleptic Gregorian, years 0001-9999, always zero-padded |
| `PlainYearMonth` | `2026-11` | |
| `PlainTime` | `14:30`, `14:30:05`, `14:30:05.250` | one to three fraction digits |
| `PlainDateTime` | `2026-11-18T14:30` | a date, an upper-case `T`, a time; no offset, no zone |
| `Instant` | `1795008605250` | epoch milliseconds, exactly `Date.now()` |
| `TimeZone` | `Europe/Prague`, `UTC` | an IANA name |

Months are 1-12 and weekdays are ISO: 1 is Monday and 7 is Sunday, unlike `Date`. A `Duration` is `{ years, months, weeks, days, hours, minutes, seconds, milliseconds }` with integer fields that all share one sign.

Literals type-check without a cast, and a function that takes any date shape hands back the same shape:

```ts
// @check
import { add, startOf } from '@pyreon/time/core'
import type { PlainDate, PlainDateTime } from '@pyreon/time/core'

const a: PlainDate = add('2026-01-31', { months: 1 })
const b: PlainDateTime = startOf('2026-11-18T14:30:05', 'hour')
```

The types are looser than the runtime check, because template literal types cannot count digits: `'2026-1-3'` type-checks and fails `isPlainDate`. A plain `string` is rejected by the type system, so the guard is how user input gets in.

### Canonical output

Every PlainTime and PlainDateTime this package returns is the shortest exact form: `HH:MM` when seconds and milliseconds are zero, `HH:MM:SS` when only milliseconds are zero, otherwise `HH:MM:SS.mmm` with three digits. That is what `<input type="time">` and `<input type="datetime-local">` produce, so values round-trip through forms unchanged, and it means equal values are equal strings: `===`, `Object.is` (a signal), a `Map` key, a `groupBy` key and plain string sorting are all correct on values this package produced. Inputs of any accepted precision stay accepted; normalise external input once at the boundary:

```ts
// @check
import { add, normalize } from '@pyreon/time/core'

normalize('2026-11-18T14:30:00.000') // '2026-11-18T14:30'
add('2026-11-18T14:30:00', { seconds: 30 }) // '2026-11-18T14:30:30'
add('2026-11-18T14:30:00.000', { minutes: 1 }) // '2026-11-18T14:31'
```

### Which strings are valid

The `isPlain*` guards are strict and never throw: exactly `YYYY-MM-DD` (a real day: `isPlainDate('2026-02-30')` and `isPlainDate('2026-2-3')` are both false), `YYYY-MM`, `HH:MM[:SS[.fff]]` (hour 00-23, second 00-59, no `24:00`), and a date plus `T` plus a time. Offsets and zone names are not part of a Plain value; lower-case `t`, a space separator and unpadded fields are rejected. Strictness is what lets `compare` be a string comparison.

A timestamp from an API names its offset and is a different thing, an instant:

```ts
// @check
import { parseInstant, toPlainDateTime } from '@pyreon/time/core'

const t = parseInstant('2026-11-18T14:30:05Z') // epoch milliseconds, or null if it is not a valid timestamp
if (t !== null) toPlainDateTime(t, 'Europe/Prague') // '2026-11-18T15:30:05'
```

## Arithmetic

`add` and `subtract` take a value and a duration. Years and months go first and clamp the day to the target month (Temporal's `constrain`), then weeks, days and the time fields:

```ts
// @check
import { add, subtract } from '@pyreon/time/core'

add('2024-02-29', { years: 1 }) // '2025-02-28'
add('2026-11-18T23:30', { minutes: 45 }) // '2026-11-19T00:15'
subtract('2026-03-31', { months: 1 }) // '2026-02-28'
```

`diff(a, b, unit)` counts whole units from `a` to `b`, truncating toward zero, and the sign is the direction. `between(a, b)` breaks the span down:

```ts
// @check
import { between, diff } from '@pyreon/time/core'

diff('2026-12-24', '2026-11-18', 'day') // -36
diff('2026-11-18T10:00', '2026-11-18T12:59', 'hour') // 2
between('2020-01-01', '2026-11-18') // { years: 6, months: 10, days: 17 }
```

Both follow `Temporal`, including its one subtlety: `diff` counts a month as complete when adding that many months (day clamped) does not pass the end, while `between` returns Temporal's unrounded breakdown. So `diff('2026-01-31', '2026-02-28', 'month')` is 1, and `diff` back from February 28 to January 31 is 0. Mixed-sign durations (`{ months: 1, days: -1 }`) and fractional fields throw, as in Temporal.

`startOf` and `endOf` take any unit from `year` to `millisecond`, including `quarter` (calendar quarters: January, April, July, October; `quarterOf(date)` is 1 to 4, and `diff` and `isSame` take `quarter` too). There is no `quarters` duration field, as in Temporal: add three months with `{ months: 3 }`. A date has no hours, so `startOf('2026-11-18', 'hour')` throws; use a `PlainDateTime`. `compare`, `isBefore`, `isAfter`, `isSame`, `min`, `max` and `clamp` order values of one shape. Mixing shapes (`compare('2026-11-18', '2026-11-18T00:00')`) throws, and the error names both values and their shapes; bring them to one shape first, either by giving the date a time (`` `${date}T00:00` ``) or by taking the date of the date-time (`dt.slice(0, 10)`). Same-length strings compare as strings, because every field is fixed-width, and values written at different precision (`14:30` and `14:30:00`, which compare equal) are parsed.

## Calendars

```ts
// @check
import { monthGrid, weekStartOf, weekOfYear, yearOfWeek } from '@pyreon/time/core'

monthGrid('2026-11', { weekStart: 7 }).length // 5 rows
monthGrid('2026-11', { weeks: 6 }).length // 6 rows, so a date picker keeps its height
weekStartOf('en-US') // 7
weekStartOf('cs') // 1
weekOfYear('2027-01-01') // 53
yearOfWeek('2027-01-01') // 2026: this day belongs to the last ISO week of 2026
```

`monthGrid` returns rows of seven `PlainDate`s including the neighbouring months' days. A date picker renders it directly:

```tsx
import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { monthGrid, add, isSame } from '@pyreon/time'

function Month() {
  const month = signal('2026-11' as const)
  const grid = () => monthGrid(month(), { weekStart: 1, weeks: 6 })

  return (
    <div>
      <button onClick={() => month.set(add(month(), { months: -1 }))}>Previous</button>
      <For each={grid} by={(week) => week[0]}>
        {(week) => <div>{week.map((day) => <span>{day.slice(8)}</span>)}</div>}
      </For>
      <button onClick={() => month.set(add(month(), { months: 1 }))}>Next</button>
    </div>
  )
}
```

## Time zones

The package ships no tz database. Offsets come from `Intl.DateTimeFormat`, with one cached formatter per zone, so results agree with `Date` and `Temporal` on the same engine.

```ts
// @check
import { toInstant, toPlainDateTime, offsetAt, isTimeZone } from '@pyreon/time/core'

const t = toInstant('2026-11-18T14:30', 'Europe/Prague')
toPlainDateTime(t, 'Europe/Prague') // '2026-11-18T14:30'
offsetAt(t, 'Europe/Prague') // 60 (minutes east of UTC)
isTimeZone('Mars/Olympus') // false; zone functions throw on an unknown zone, so check user input
```

A wall-clock time can fall in a DST gap (it does not exist) or overlap (it happens twice). `toInstant` follows Temporal's four `disambiguation` modes exactly:

| Mode | In a gap (`2026-03-29T02:30`, Prague) | In an overlap (`2026-10-25T02:30`, Prague) |
| --- | --- | --- |
| `compatible` (default) | `03:30` CEST, shifted forward by the length of the gap | the first one (`02:30` CEST) |
| `earlier` | `01:30` CET, shifted back | the first one |
| `later` | `03:30` CEST | the second one (`02:30` CET) |
| `reject` | throws | throws |

`addInstant(instant, { days: 1 }, zone)` moves the zone's wall clock, so it keeps the time of day across a DST change (the day is 23 or 25 hours long); `{ hours: 24 }` moves the instant by exactly 24 hours. Calendar fields need a zone, time fields do not.

```ts
// @check
import { addInstant } from '@pyreon/time/core'

const noon = Date.UTC(2026, 2, 28, 11, 0) // 12:00 in Prague, the day before the clocks change
addInstant(noon, { days: 1 }, 'Europe/Prague') // 12:00 CEST the next day: 23 hours later
addInstant(noon, { hours: 24 }) // exactly 24 hours later: 13:00 CEST
```

Core functions take the zone as an argument. `fromDate`, `toDate` and `today` use the runtime's local zone when you leave it out, like `new Date(y, m, d)`.

### The clock

In `@pyreon/time` (not `/core`), `now()` and `today(zone)` read a pinnable clock, so tests and previews are deterministic:

```ts
// @check
import { setClock, today } from '@pyreon/time'

setClock(() => Date.UTC(2031, 5, 18, 16, 0))
today('Asia/Tokyo') // '2031-06-19'
setClock(null) // back to the system clock
```

`setClock` is process-wide state: do not call it per request on a server.

## Composing operations

Every operation above takes the value first. `@pyreon/time/fp` has the value-last form of each one, so an operation can be built once, named, passed to `map`, `filter` and `groupBy`, and chained:

```ts
// @check
import { add, endOf, isBetween, pipe, startOf } from '@pyreon/time/fp'
import type { PlainDate } from '@pyreon/time/core'

const nextMonthStart = pipe(add({ months: 1 }), startOf('month'))
const dates: PlainDate[] = ['2026-01-31', '2026-11-18']

dates.map(nextMonthStart) // ['2026-02-01', '2026-12-01']

const inFebruary = isBetween('2026-02-01', '2026-02-28')
dates.filter(inFebruary) // []
```

An `Adjuster<T>` is a plain `(value: T) => T` and a `Mapper<A, B>` a plain `(value: A) => B`; there are no classes and nothing to unwrap. The fp forms are thin wrappers over core, each is tree-shakeable on its own, and a built adjuster costs one extra function call per use, so build it once (module scope, not inside a loop). `add`, `subtract`, `startOf` and `endOf` keep the input's shape in the types. Binary questions put the value last so they read inside `filter` and `map`: `isBefore(limit)`, `isAfter`, `isSame(other, 'month')`, `isBetween(start, end)`, `clamp(lo, hi)`, `diffFrom(base, 'day')`, `betweenFrom(base)`. `compare` stays binary because it already is an `Array#sort` comparator, and `by(mapper)` makes a comparator from a mapper.

Zone-taking functions take the zone first: `toInstant(zone, options?)`, `toPlainDate(zone)`, `toPlainDateTime(zone)`, `toPlainTime(zone)`, `offsetAt(zone)` and `addInstant(duration, zone?)`.

### Building blocks

Named adjusters from composition, all checked:

```ts
// @check
import { add, endOf, pipe, startOf, toPlainDate, by } from '@pyreon/time/fp'

const sameDayNextMonth = add({ months: 1 }) // '2026-01-31' -> '2026-02-28', clamped
const startOfNextWeek = pipe(add({ weeks: 1 }), startOf('week')) // '2026-11-18' -> '2026-11-23'

// The end of the calendar quarter is a unit. (Fiscal quarters that do not start in January compose from months: see the recipe.)
const endOfQuarter = endOf('quarter') // '2026-11-18' -> '2026-12-31'

// A comparator from a mapper: events ordered by their local day.
const byDay = by((event: { at: number }) => toPlainDate('Europe/Prague')(event.at))

// Bucket instants by local day: the zone-aware conversion is the groupBy key.
const dayKey = toPlainDate('Europe/Prague')
dayKey(Date.UTC(2026, 10, 18, 23, 30)) // '2026-11-19'
```

### With `@pyreon/rx`

Adjusters are plain unary functions, so `@pyreon/rx`'s `map`, `groupBy` and `sortBy` take them directly, with a plain array or a signal source, and neither package depends on the other. `@pyreon/rx`'s own `pipe` takes a *source* first and runs steps over it, while `pipe` from `@pyreon/time/fp` composes functions into a new function; use whichever reads better, since adjusters work as the steps of either.

```ts
import { signal } from '@pyreon/reactivity'
import { groupBy } from '@pyreon/rx'
import { startOf } from '@pyreon/time/fp'

const dates = signal(['2026-02-10', '2026-01-05', '2026-02-20'])
const byMonth = groupBy(dates, startOf('month'))
byMonth() // { '2026-02-01': ['2026-02-10', '2026-02-20'], '2026-01-01': ['2026-01-05'] }
```

### Working in one zone

`inZone(zone)` returns the zone-taking functions with the zone applied. Create it once; the members are plain functions made by that call, so a conversion costs no more than the unbound function. The zone is validated at `inZone`, so a typo fails there. It is not reactive, and it pulls every zone function into the bundle: when you need one or two, import them directly.

```ts
// @check
import { inZone } from '@pyreon/time/core'

const prague = inZone('Europe/Prague')
const t = prague.toInstant('2026-03-29T02:30') // 02:30 does not exist: 03:30 CEST
prague.toPlainDate(t) // '2026-03-29'
prague.offsetAt(t) // 120
prague.startOfDay(t) // the instant of local midnight that day
prague.today() // today's date in Prague
```

### Composing with `@pyreon/format`

Values are plain strings and numbers, so `@pyreon/time` and `@pyreon/format` compose without depending on each other: a PlainDate, a PlainDateTime or an Instant is already a date input for a formatter, and `between(a, b)` is already the `Duration` shape `formatDuration` takes. The examples below require `@pyreon/format`; they are not executed by this package's tests (the shapes line up structurally, and a type test proves it).

```ts
import { between, toPlainDate } from '@pyreon/time/fp'
import { formatDate, formatDuration } from '@pyreon/format'

formatDate('2026-11-18', 'long') // a PlainDate is a date input
formatDuration(between('2026-01-01', '2026-03-05')) // a Duration from between() is a duration input

// A formatter that first converts an instant to a date in a zone:
const tokyoDay = (instant: number) => formatDate(toPlainDate('Asia/Tokyo')(instant), 'long')
```

## Reading messy input

The strict guards stay strict. When a value arrives from somewhere you do not control, `parseISO` is the one lenient door and it returns the canonical strict types or `null` (offset strings are moments: see the next section):

```ts
// @check
import { parseISO, parseInstant, fromDate } from '@pyreon/time/core'

parseISO('2026-11-18 14:30') // '2026-11-18T14:30': a space or lower-case t is accepted
parseISO(' 2026-2-3 ') // '2026-02-03': unpadded fields
parseISO('2026-11-18T14:30Z') // null: that is a moment, not a wall-clock value
parseInstant('2026-11-18 14:30:05+0100', { lenient: true }) // 1795008605000
fromDate(new Date(0), 'UTC') // '1970-01-01T00:00': a Date comes in through fromDate
```

## What time did this offset string mean in a zone?

A string with an offset is a moment, so it goes through `parseInstant`, and the zone turns it back into a wall-clock time:

```ts
// @check
import { parseInstant, toPlainDateTime } from '@pyreon/time/core'

const t = parseInstant('2026-11-18T14:30:00+01:00') // 1795008600000, or null if it is not a valid timestamp
if (t !== null) toPlainDateTime(t, 'Asia/Tokyo') // '2026-11-18T22:30'
```

`parseISO('2026-11-18T14:30:00+01:00')` is `null` on purpose: it reads wall-clock values, and an offset string is not one.

## Is it today?

`isToday`, `isYesterday`, `isTomorrow` and `daysFromToday` answer in calendar days in a zone, not in 24-hour spans, so they are right around local midnight and on the 23- and 25-hour days of a DST change. Comparing two instants by a calendar unit needs a zone, because the day depends on where you are:

```ts
// @check
import { isSame, isToday } from '@pyreon/time/core'

const a = Date.UTC(2026, 10, 18, 22, 30) // 23:30 in Prague
const b = Date.UTC(2026, 10, 18, 23, 30) // 00:30 the next day in Prague
isSame(a, b, 'day', { zone: 'Europe/Prague' }) // false
isSame(a, b, 'day', { zone: 'UTC' }) // true
isToday(a, 'Europe/Prague', Date.UTC(2026, 10, 18, 12)) // true; the third argument is "now", for tests
```

`isSame(a, b, 'day')` without a zone throws a `[Pyreon]` error that says so.

## Recipes

Every snippet here is run by the package's tests, with the outputs shown.

**A month grid for a date picker**, starting the week where the locale does:

```ts
// @check
import { monthGrid, weekStartOf } from '@pyreon/time/core'

const grid = monthGrid('2026-11', { weekStart: weekStartOf('cs'), weeks: 6 })
grid.length // 6
grid[0]![0] // '2026-10-26'
grid[5]![6] // '2026-12-06'
```

**Every weekday in a range** (`eachDay` builds the array; `iterateDays` yields one date at a time for long ranges, and `eachDay(a, b, -1)` counts down; a reversed range with the default step is `[]`):

```ts
// @check
import { dayOfWeek, eachDay } from '@pyreon/time/core'

eachDay('2026-11-16', '2026-11-24').filter((d) => dayOfWeek(d) <= 5)
// ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24']
```

**The next business day**, by composition:

```ts
// @check
import { add, dayOfWeek } from '@pyreon/time/core'
import type { PlainDate } from '@pyreon/time/core'

const skipWeekend = (d: PlainDate): PlainDate => add(d, { days: dayOfWeek(d) === 6 ? 2 : dayOfWeek(d) === 7 ? 1 : 0 })
const nextBusinessDay = (d: PlainDate): PlainDate => skipWeekend(add(d, { days: 1 }))

nextBusinessDay('2026-11-20') // '2026-11-23': Friday to Monday
```

**Age from a birthday:**

```ts
// @check
import { diff } from '@pyreon/time/core'

diff('1990-05-20', '2026-11-18', 'year') // 36
diff('1990-11-19', '2026-11-18', 'year') // 35: the birthday is tomorrow
```

**Countdown parts from two instants:**

```ts
// @check
import { between, toPlainDateTime } from '@pyreon/time/core'

const now = Date.UTC(2026, 10, 18, 12, 0, 0)
const target = Date.UTC(2026, 11, 25, 15, 30, 10)
between(toPlainDateTime(now, 'UTC'), toPlainDateTime(target, 'UTC'))
// { years: 0, months: 1, days: 7, hours: 3, minutes: 30, seconds: 10, milliseconds: 0 }
```

**A meeting time in other zones:**

```ts
// @check
import { toInstant, toPlainDateTime } from '@pyreon/time/core'

const meeting = toInstant('2026-11-18T10:00', 'America/New_York')
toPlainDateTime(meeting, 'Europe/Prague') // '2026-11-18T16:00'
toPlainDateTime(meeting, 'Asia/Kathmandu') // '2026-11-18T20:45'
```

**Group records by local day:**

```ts
// @check
import { toPlainDate } from '@pyreon/time/fp'
import type { PlainDate } from '@pyreon/time/core'

const records = [{ at: Date.UTC(2026, 10, 18, 22, 30) }, { at: Date.UTC(2026, 10, 18, 23, 30) }, { at: Date.UTC(2026, 10, 19, 5, 0) }]
const dayKey = toPlainDate('Europe/Prague')
const byDay = new Map<PlainDate, number>()

for (const r of records) byDay.set(dayKey(r.at), (byDay.get(dayKey(r.at)) ?? 0) + 1)
// Map { '2026-11-18' => 1, '2026-11-19' => 2 }
```

**Start and end of a fiscal quarter** (the fiscal year starts in April):

```ts
// @check
import { add, dateParts, startOf } from '@pyreon/time/core'
import { add as addBy, endOf as endOfBy, pipe } from '@pyreon/time/fp'
import type { PlainDate } from '@pyreon/time/core'

const fiscalQuarterStart = (d: PlainDate): PlainDate => {
  const monthIndex = (dateParts(d).month - 4 + 12) % 12 // 0 for April

  return startOf(add(d, { months: -(monthIndex % 3) }), 'month')
}
const fiscalQuarterEnd = pipe(fiscalQuarterStart, addBy({ months: 2 }), endOfBy('month'))

fiscalQuarterStart('2026-11-18') // '2026-10-01'
fiscalQuarterEnd('2026-11-18') // '2026-12-31'
```

A note on `pipe` and types: when its first step is a generic adjuster (`add({ ... })`) and a later step names a concrete type, TypeScript cannot infer the input type. Start with a function that names it (as `fiscalQuarterEnd` does), or write the step as a function.

## Coming from

Months are 1-12 and weekdays are 1 (Monday) to 7 (Sunday) here. Every call in the right-hand column was run.

| You write | Here |
| --- | --- |
| date-fns `addDays(d, 1)`, `addMonths(d, 1)` | `add(d, { days: 1 })`, `add(d, { months: 1 })` |
| date-fns `differenceInCalendarDays(b, a)` | `diff(a, b, 'day')` |
| date-fns `startOfWeek(d, { weekStartsOn: 1 })` | `startOf(d, 'week')` |
| date-fns `endOfMonth(d)` | `endOf(d, 'month')` |
| date-fns `eachDayOfInterval({ start, end })` | `eachDay(start, end)` |
| date-fns `getISOWeek(d)`, `isSameDay(a, b)` | `weekOfYear(d)`, `isSame(a, b, 'day')` |
| date-fns `isValid(parseISO(s))` | `isPlainDate(s)` (strict) or `parseISO(s) !== null` (lenient) |
| Day.js `dayjs(d).add(1, 'month')` | `add(d, { months: 1 })` |
| Day.js `dayjs(b).diff(a, 'day')` | `diff(a, b, 'day')` |
| Day.js `dayjs(d).startOf('week')` (Sunday first) | `startOf(d, 'week', { weekStart: 7 })` |
| Day.js `startOf('isoWeek')` | `startOf(d, 'week')` |
| Day.js `dayjs(t).tz('Europe/Prague')` | `toPlainDateTime(t, 'Europe/Prague')` |
| Day.js `dayjs.tz(s, zone).valueOf()` | `toInstant(s, zone)` |
| Luxon `DateTime.fromISO(s).plus({ days: 1 })` | `add(s, { days: 1 })` |
| Luxon `b.diff(a, 'days').days` | `diff(a, b, 'day')` |
| Luxon `DateTime.fromMillis(t, { zone })` | `toPlainDateTime(t, zone)` |
| Luxon `DateTime.fromISO(s, { zone }).toMillis()` | `toInstant(s, zone)` |
| Moment `moment(s).add(1, 'months')` | `add(s, { months: 1 })` |
| Moment `moment(b).diff(a, 'days')` | `diff(a, b, 'day')` |
| Moment `startOf('isoWeek')` | `startOf(d, 'week')` |
| Moment `moment().isSame(d, 'day')` | `isToday(d, zone)` |
| Temporal `PlainDate.from(s).add({ days: 1 }).toString()` | `add(s, { days: 1 })` |
| Temporal `a.until(b, { largestUnit: 'day' }).days` | `diff(a, b, 'day')` |
| Temporal `a.until(b, { largestUnit: 'year' })` | `between(a, b)` |
| Temporal `plain.toZonedDateTime(zone).epochMilliseconds` | `toInstant(plain, zone)` |
| Temporal `Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(z).toPlainDateTime()` | `toPlainDateTime(t, z)` |

Formatting (`format('yyyy-MM-dd')`, `toLocaleString`) lives in `@pyreon/format`.

## Errors and warnings

One rule everywhere: the `isPlain*` guards, `isTimeZone`, `parseInstant` and `parseISO` never throw and answer `false` or `null`. Every other function either returns a correct value or throws a `TypeError` or `RangeError` whose message starts with `[Pyreon]`, names the function, says what it got and what it expected, and says how to fix it. That covers a value of the wrong shape, an unknown unit or zone, a mixed-sign duration, a fractional month or year, and a result outside years 0001-9999. Arithmetic on a malformed value throws rather than returning a wrong date; check data with a guard first. A seeded fuzz test calls every export with random bad input to hold the line. Fractions of weeks, days, hours, minutes and seconds in a duration balance down to milliseconds (`{ days: 1.5 }` is one day and twelve hours); fractional years and months have no fixed length and are rejected. In development an unknown duration field (`{ day: 1 }`) warns once per call.

## How it is checked

- **Seeded differential tests against `Temporal`**: thousands of random cases for every arithmetic, comparison, week, grid and zone function, in Europe/Prague, America/New_York, America/St_Johns (30-minute), Asia/Kathmandu (45-minute), Australia/Lord_Howe (30-minute DST shift), Pacific/Apia (the skipped day of 2011), Africa/Casablanca, Asia/Tokyo and UTC, with samples concentrated around each zone's real transitions. They run under Bun (`bun run test:oracle`) because Node 24 has no `Temporal`.
- **A hand-verified table** of gaps, overlaps for every disambiguation mode, 30- and 45-minute zones and a zone that changed its rules. It runs in Node and in real Chromium, because `Intl` zone data differs by engine.
- **Month-grid parity** with the private date math `@pyreon/ui-primitives`' calendar uses today.

## Not included yet

`fromTemporal` and `toTemporal` are left out: a Plain value maps to Temporal with one `Temporal.PlainDate.from(value)`, and typing the reverse without depending on Temporal typings is not clean. Formatting lives in `@pyreon/format`.

## API reference

The complete, generated reference is on the [@pyreon/time API reference](/docs/reference/time) page.
