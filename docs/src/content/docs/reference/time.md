---
title: "@pyreon/time — API Reference"
description: "Dates and times as plain strings and numbers: ISO values, DST-correct zone math, calendar grids, no classes"
---

> **Generated** from `time`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [time](/docs/time).

Plain-data date and time values for Pyreon: a date is the string `"2026-11-18"`, an instant is epoch milliseconds, and every operation is one tree-shakeable function (`add`, `diff`, `startOf`, `monthGrid`, `toInstant`). Calendar math is proleptic Gregorian integer arithmetic with no `Date` object on the path; time zones come from `Intl` with one cached formatter per zone, and `toInstant` implements Temporal's four disambiguation modes for DST gaps and overlaps. Checked against `Temporal` with seeded differential tests. `@pyreon/time/core` and `/fp` have no dependencies; `@pyreon/time` reads the ambient clock and time zone of `@pyreon/ambient` and adds the clock hooks `useToday`, `useCountdown`, `useElapsed` and `useRelative`, which update on shared, aligned tickers. Experimental.

> **Peer dependencies:** `@pyreon/core`, `@pyreon/reactivity` — install alongside this package.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

not lowered by PMTC yet: the package is pure computation on strings and numbers (an Instant is epoch milliseconds, exactly how a date is represented natively), so it can become `shared` once the Swift and Kotlin ports of the same functions exist; until then the compiler warns on import rather than miscompiling

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- Values are plain data: PlainDate "2026-11-18", PlainTime "14:30", PlainDateTime, PlainYearMonth, Instant (epoch ms)
- One function per operation: add, subtract, diff, between, startOf, endOf, compare, min, max, clamp, eachDay, monthGrid
- Month and year addition clamps the day (Jan 31 + 1 month = Feb 28), ISO week numbers, month 1-12 and weekday 1 (Mon) - 7 (Sun)
- DST-correct zones: toInstant with compatible / earlier / later / reject, toPlainDateTime, offsetAt, addInstant
- Zone data comes from Intl: no bundled tz database, one cached formatter per zone, bounded caches
- Strict parsing: isPlainDate("2026-02-30") is false; documented ISO forms; parseInstant for API timestamps
- Verified against Temporal with seeded randomized differential tests plus a hand-verified DST table that runs in Node and Chromium
- Literals type-check without casts: add("2026-01-31", &#123; months: 1 &#125;) is a PlainDate

## Complete example

A full, end-to-end usage of the package:

```tsx
import { add, diff, startOf, monthGrid, toInstant, toPlainDateTime, offsetAt } from '@pyreon/time/core'

add('2026-01-31', { months: 1 })                    // => '2026-02-28'
diff('2026-11-18', '2026-12-24', 'day')             // => 36
startOf('2026-11-18', 'week')                       // => '2026-11-16'
monthGrid('2026-11')[0]![0]                         // => '2026-10-26'

// Zones: wall-clock time in, instant out; DST gaps and overlaps follow Temporal's rules.
const t = toInstant('2026-03-29T02:30', 'Europe/Prague')   // 02:30 does not exist: shifts forward to 03:30
toPlainDateTime(t, 'Europe/Prague')                 // => '2026-03-29T03:30'
offsetAt(t, 'Europe/Prague')                        // => 120
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`add`](#add-function-experimental) | function | Add a duration to a PlainDate, PlainDateTime or PlainYearMonth; the result has the same shape. |
| [`subtract`](#subtract-function-experimental) | function | `add` with every field negated: `subtract(date, { days: 1 })` is yesterday. |
| [`diff`](#diff-function-experimental) | function | Whole `unit`s from `a` to `b`, truncated toward zero; the sign is the direction. |
| [`between`](#between-function-experimental) | function | The span from `a` to `b` broken down from years to days (and hours to milliseconds for a PlainDateTime), matching… |
| [`startOf`](#startof-function-experimental) | function | The first moment of the `unit` containing `value`. |
| [`endOf`](#endof-function-experimental) | function | The last moment of the `unit` containing `value`. |
| [`compare`](#compare-function-experimental) | function | Order two values of the same shape. |
| [`isBefore`](#isbefore-function-experimental) | function | Whether `a` is strictly before `b`. |
| [`isAfter`](#isafter-function-experimental) | function | Whether `a` is strictly after `b`. |
| [`isSame`](#issame-function-experimental) | function | Whether `a` and `b` are the same moment, or, with a `unit`, fall in the same year, month, week, day (or hour, minute,… |
| [`min`](#min-function-experimental) | function | The earliest value; at least one is required. |
| [`max`](#max-function-experimental) | function | The latest value; at least one is required. |
| [`clamp`](#clamp-function-experimental) | function | `value` limited to `lo` ... |
| [`eachDay`](#eachday-function-experimental) | function | Every date from `start` to `end`, both included, as an array. |
| [`iterateDays`](#iteratedays-function-experimental) | function | The dates from `start` to `end`, both included, one at a time, so a long range is never materialised. |
| [`monthGrid`](#monthgrid-function-experimental) | function | The weeks of a month as rows of seven dates, including the days of the neighbouring months that fill the first and last… |
| [`weekStartOf`](#weekstartof-function-experimental) | function | First day of the week for a locale as an ISO weekday (`en-US` is 7, `cs` is 1). |
| [`weekendOf`](#weekendof-function-experimental) | function | The weekend days of a locale as ISO weekdays (`en-US` is `[6, 7]`, `ar-EG` is `[5, 6]`). |
| [`dayOfWeek`](#dayofweek-function-experimental) | function | ISO weekday: 1 is Monday, 7 is Sunday (unlike `Date#getDay`). |
| [`quarterOf`](#quarterof-function-experimental) | function | The calendar quarter (January-March is 1). |
| [`dayOfYear`](#dayofyear-function-experimental) | function | 1 for January 1st through 365 or 366. |
| [`weekOfYear`](#weekofyear-function-experimental) | function | ISO 8601 week number, 1-53: week 1 contains the year's first Thursday and weeks start on Monday. |
| [`yearOfWeek`](#yearofweek-function-experimental) | function | The ISO week-based year: 2027-01-01 belongs to week 53 of 2026, and 2024-12-30 to week 1 of 2025. |
| [`daysInMonth`](#daysinmonth-function-experimental) | function | Number of days in the month of the value. |
| [`isLeapYear`](#isleapyear-function-experimental) | function | Whether a year, or the year of a value, is a Gregorian leap year (1900 and 2100 are not, 2000 is). |
| [`plainDate`](#plaindate-function-experimental) | function | Build a PlainDate from numbers (month 1-12). |
| [`plainYearMonth`](#plainyearmonth-function-experimental) | function | Build a PlainYearMonth from numbers. |
| [`plainTime`](#plaintime-function-experimental) | function | Build a PlainTime, written at the least precision that holds the value: `14:30`, `14:30:05` or `14:30:05.250`. |
| [`dateParts`](#dateparts-function-experimental) | function | The numeric fields of a date. |
| [`timeParts`](#timeparts-function-experimental) | function | The numeric fields of a time of day. |
| [`isPlainDate`](#isplaindate-function-experimental) | function | Strict guard: exactly `YYYY-MM-DD`, zero-padded, a real calendar day, years 0001-9999. |
| [`isPlainTime`](#isplaintime-function-experimental) | function | Guard for `HH:MM`, `HH:MM:SS` or `HH:MM:SS.f` to `.fff`. |
| [`isPlainDateTime`](#isplaindatetime-function-experimental) | function | Guard for a PlainDate, an upper-case `T`, a PlainTime. |
| [`isPlainYearMonth`](#isplainyearmonth-function-experimental) | function | Guard for `YYYY-MM`. |
| [`parseInstant`](#parseinstant-function-experimental) | function | Parse an ISO 8601 timestamp that names its offset into an Instant, or `null`. |
| [`normalize`](#normalize-function-experimental) | function | The canonical form of a value that came from elsewhere. |
| [`parseISO`](#parseiso-function-experimental) | function | The lenient door: read an ISO-like string people and other systems produce and return the strict value it denotes, or… |
| [`daysFromToday`](#daysfromtoday-function-experimental) | function | Calendar days from today to the day `value` falls on, in `zone`: 0 today, -1 yesterday, 1 tomorrow. |
| [`isToday`](#istoday-function-experimental) | function | Whether `value` falls on today's date in `zone`. |
| [`isYesterday`](#isyesterday-function-experimental) | function | Whether `value` falls on yesterday's date in `zone`. |
| [`isTomorrow`](#istomorrow-function-experimental) | function | Whether `value` falls on tomorrow's date in `zone`. |
| [`relativeDistance`](#relativedistance-function-experimental) | function | How far `target` is from `base`, counted the way a person says it. |
| [`useToday`](#usetoday-hook-experimental) | hook | Today's date as an accessor that flips at the local midnight of the zone (default: the active time zone of… |
| [`useCountdown`](#usecountdown-hook-experimental) | hook | A countdown to `target` (an Instant, a Date, or a wall-clock PlainDate or PlainDateTime read in the zone): the time left… |
| [`useElapsed`](#useelapsed-hook-experimental) | hook | The stopwatch counterpart of `useCountdown`: the time since `since` in days to milliseconds (zero before it), updating… |
| [`useRelative`](#userelative-hook-experimental) | hook | The structured relative distance to `target`, self-updating: `{ value: -2, unit: "minute" }` (negative is the past). |
| [`RelativeDistance`](#relativedistance-type-experimental) | type | A signed whole number of one unit; negative is the past. |
| [`RelativeUnit`](#relativeunit-type-experimental) | type | The units of a relative distance. |
| [`When`](#when-type-experimental) | type | A moment a clock hook can aim at. |
| [`ClockOptions`](#clockoptions-type-experimental) | type | Options shared by the clock hooks. |
| [`TickOptions`](#tickoptions-type-experimental) | type | Options of `useCountdown` and `useElapsed`. |
| [`Countdown`](#countdown-type-experimental) | type | What `useCountdown` returns. |
| [`toInstant`](#toinstant-function-experimental) | function | The instant at which a wall-clock time happens in a zone. |
| [`toPlainDateTime`](#toplaindatetime-function-experimental) | function | The wall-clock date and time of an instant in a zone. |
| [`toPlainDate`](#toplaindate-function-experimental) | function | The calendar date of an instant in a zone. |
| [`toPlainTime`](#toplaintime-function-experimental) | function | The time of day of an instant in a zone. |
| [`offsetAt`](#offsetat-function-experimental) | function | Minutes east of UTC at an instant: 120 for Europe/Prague in summer, 345 for Asia/Kathmandu. |
| [`addInstant`](#addinstant-function-experimental) | function | Move an instant by a duration. |
| [`isTimeZone`](#istimezone-function-experimental) | function | Whether the platform knows this time zone name. |
| [`fromDate`](#fromdate-function-experimental) | function | The wall-clock date and time of a `Date` in `zone` (default: the runtime's local zone). |
| [`toDate`](#todate-function-experimental) | function | A `Date` for an Instant, or for a wall-clock value in `zone` (default: the runtime's local zone, like… |
| [`localZone`](#localzone-function-experimental) | function | The runtime's own time zone name (`"UTC"` when the platform cannot say). |
| [`toMilliseconds`](#tomilliseconds-function-experimental) | function | The length of a duration in milliseconds. |
| [`now`](#now-function-experimental) | function | The current instant. |
| [`today`](#today-function-experimental) | function | Today's date in `zone` (default: the runtime's local zone). |
| [`setClock`](#setclock-function-experimental) | function | Pin the clock of the whole app, for tests and previews; `null` restores the system clock. |
| [`Instant`](#instant-type-experimental) | type | Epoch milliseconds, the same number as `Date.now()`. |
| [`PlainDate`](#plaindate-type-experimental) | type | `2026-11-18`. |
| [`PlainTime`](#plaintime-type-experimental) | type | `14:30`, `14:30:05` or `14:30:05.250`. |
| [`PlainDateTime`](#plaindatetime-type-experimental) | type | `2026-11-18T14:30`: no offset, no zone name. |
| [`PlainYearMonth`](#plainyearmonth-type-experimental) | type | `2026-11`. |
| [`TimeZone`](#timezone-type-experimental) | type | An IANA zone name such as `Europe/Prague`, or `UTC`. |
| [`Duration`](#duration-type-experimental) | type | A span of time. |
| [`Unit`](#unit-type-experimental) | type | Singular unit names (`DateUnit` and `TimeUnit` are the two halves). |
| [`Weekday`](#weekday-type-experimental) | type | ISO weekday: 1 Monday ... |
| [`Disambiguation`](#disambiguation-type-experimental) | type | How a wall-clock time in a DST gap or overlap picks an instant (Temporal's modes). |
| [`inZone`](#inzone-function-experimental) | function | The zone-taking functions with one zone applied, for code that works in one zone. |
| [`Adjuster`](#adjuster-type-experimental) | type | A value-to-same-value function, what `add({ months: 1 })` from `@pyreon/time/fp` returns. |
| [`Mapper`](#mapper-type-experimental) | type | A value-to-other-value function, such as `toPlainDate(zone)` or `diffFrom(base, "day")` from `@pyreon/time/fp`. |
| [`ZonedToolkit`](#zonedtoolkit-type-experimental) | type | The object `inZone` returns. |
| [`fp.add`](#fpadd-function-experimental) | function | Value-last `add`: `add({ months: 1 })` is a function you can name, pass to `map` and chain with `pipe`. |
| [`fp.subtract`](#fpsubtract-function-experimental) | function | Value-last `subtract`. |
| [`fp.startOf`](#fpstartof-function-experimental) | function | Value-last `startOf`. |
| [`fp.endOf`](#fpendof-function-experimental) | function | Value-last `endOf`. |
| [`fp.isBefore`](#fpisbefore-function-experimental) | function | A predicate: `isBefore(limit)(value)` is true for values before `limit`, so it reads correctly in `filter`. |
| [`fp.isAfter`](#fpisafter-function-experimental) | function | A predicate: true for values after `limit`. |
| [`fp.isSame`](#fpissame-function-experimental) | function | A predicate: true for values in the same unit as `other`. |
| [`isBetween`](#isbetween-function-experimental) | function | A predicate: true for values from `start` to `end`, both included. |
| [`fp.clamp`](#fpclamp-function-experimental) | function | Limit values to a range. |
| [`diffFrom`](#difffrom-function-experimental) | function | Whole units from `base` to each value: `dates.map(diffFrom(today, "day"))` reads left to right. |
| [`betweenFrom`](#betweenfrom-function-experimental) | function | The Duration from `base` to each value. |
| [`by`](#by-function-experimental) | function | A comparator that orders items by a mapped value: `items.sort(by(toDay))`. |
| [`fp.compare`](#fpcompare-function-experimental) | function | The same function as the value-first `compare`: it is already a comparator for `Array#sort`. |
| [`fp.toInstant`](#fptoinstant-function-experimental) | function | Value-last `toInstant`. |
| [`fp.toPlainDate`](#fptoplaindate-function-experimental) | function | Value-last `toPlainDate`: a groupBy key for bucketing instants by local day. |
| [`fp.toPlainTime`](#fptoplaintime-function-experimental) | function | Value-last `toPlainTime`. |
| [`fp.toPlainDateTime`](#fptoplaindatetime-function-experimental) | function | Value-last `toPlainDateTime`. |
| [`fp.offsetAt`](#fpoffsetat-function-experimental) | function | Value-last `offsetAt`. |
| [`fp.addInstant`](#fpaddinstant-function-experimental) | function | Value-last `addInstant`. |
| [`fp.monthGrid`](#fpmonthgrid-function-experimental) | function | Value-last `monthGrid`. |
| [`fp.fromDate`](#fpfromdate-function-experimental) | function | Value-last `fromDate`. |
| [`fp.toDate`](#fptodate-function-experimental) | function | Value-last `toDate`. |
| [`pipe`](#pipe-function-experimental) | function | Left-to-right composition of unary functions, typed for up to eight steps, so pipelines need no other package:… |

## API

### `add` `function` — **experimental**

```ts
<T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T, duration: Duration) => same shape as T
```

Add a duration to a PlainDate, PlainDateTime or PlainYearMonth; the result has the same shape. Years and months are applied first and clamp the day to the target month (Temporal's `constrain`), then weeks, days and the time fields. Every field is an integer and all non-zero fields share one sign. Throws a `[Pyreon]` error for an invalid value, a mixed-sign or fractional duration, time fields on a PlainDate, days on a PlainYearMonth, and a result outside years 0001-9999.

**Example**

```tsx
add('2026-01-31', { months: 1 })              // => '2026-02-28'
add('2024-02-29', { years: 1 })               // => '2025-02-28'
add('2026-12-31', { days: 1 })                // => '2027-01-01'
add('2026-11-18T23:30', { minutes: 45 })      // => '2026-11-19T00:15'
add('2026-11', { months: 3 })                 // => '2027-02'
```

**Common mistakes**

- Passing a plain `string` from user input: the type rejects it. Narrow it with `isPlainDate(x)` first; at runtime an invalid string throws
- Mixing signs (`{ months: 1, days: -1 }`): it has no single meaning and throws. Call `add` and `subtract` separately
- Adding hours to a PlainDate: a date has no time of day. Use a PlainDateTime

**See also:** `subtract` · `addInstant` · `diff`

---

### `subtract` `function` — **experimental**

```ts
<T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T, duration: Duration) => same shape as T
```

`add` with every field negated: `subtract(date, { days: 1 })` is yesterday.

**Example**

```tsx
subtract('2000-03-01', { days: 1 })           // => '2000-02-29'
subtract('2026-03-31', { months: 1 })         // => '2026-02-28'
```

**See also:** `add`

---

### `diff` `function` — **experimental**

```ts
(a: T, b: T, unit: Unit, options?: { zone?: TimeZone }) => number
```

Whole `unit`s from `a` to `b`, truncated toward zero; the sign is the direction. Works on PlainDate, PlainDateTime, PlainYearMonth, PlainTime and Instant (an Instant needs `options.zone` for year, month, week and day, because a calendar day is not always 24 hours). A month or year counts as complete when `add(a, { months: n })` (day clamped) does not pass `b`, which is what Temporal's `until` with `smallestUnit` and truncation returns, so it is not antisymmetric at month ends: January 31 to February 28 is 1 month, February 28 back to January 31 is 0.

**Example**

```tsx
diff('2026-11-18', '2026-12-24', 'day')       // => 36
diff('2026-12-24', '2026-11-18', 'day')       // => -36
diff('2026-01-31', '2026-02-28', 'month')     // => 1
diff('2026-11-18T10:00', '2026-11-18T12:59', 'hour')  // => 2
diff('10:00', '12:30', 'minute')              // => 150
diff(Date.UTC(2026, 2, 28, 11), Date.UTC(2026, 2, 29, 10), 'day', { zone: 'Europe/Prague' })  // => 1
```

**Common mistakes**

- Diffing two Instants in days without a zone throws: pass `{ zone }`, or use `{ hours }` for an exact 24-hour count

**See also:** `between` · `add`

---

### `between` `function` — **experimental**

```ts
(a: PlainDate | PlainDateTime, b: same shape) => Duration
```

The span from `a` to `b` broken down from years to days (and hours to milliseconds for a PlainDateTime), matching Temporal's `until` with `largestUnit: "year"`. All fields share the sign of the direction; every field is present.

**Example**

```tsx
between('2026-01-31', '2026-03-01')           // => { years: 0, months: 1, days: 1 }
between('2020-01-01', '2026-11-18')           // => { years: 6, months: 10, days: 17 }
between('2026-01-01T10:00', '2026-01-02T09:30')  // => { years: 0, months: 0, days: 0, hours: 23, minutes: 30, seconds: 0, milliseconds: 0 }
```

**See also:** `diff`

---

### `startOf` `function` — **experimental**

```ts
<T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T, unit: Unit, options?: { weekStart?: Weekday }) => same shape as T
```

The first moment of the `unit` containing `value`. Weeks start on `options.weekStart` (1 Monday ... 7 Sunday, default Monday). A PlainDateTime keeps the precision it came in with. A PlainDate has no time units; a PlainYearMonth has only year and month.

**Example**

```tsx
startOf('2026-11-18', 'week')                 // => '2026-11-16'
startOf('2026-11-18', 'week', { weekStart: 7 })  // => '2026-11-15'
startOf('2026-11-18', 'month')                // => '2026-11-01'
startOf('2026-11-18T14:30:05', 'hour')        // => '2026-11-18T14:00'
```

**See also:** `endOf` · `weekStartOf`

---

### `endOf` `function` — **experimental**

```ts
<T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T, unit: Unit, options?: { weekStart?: Weekday }) => same shape as T
```

The last moment of the `unit` containing `value`. For a PlainDateTime that is the last millisecond (`.999`).

**Example**

```tsx
endOf('2026-11-18', 'month')                  // => '2026-11-30'
endOf('2024-02-10', 'month')                  // => '2024-02-29'
endOf('2026-11-18T14:30', 'day')              // => '2026-11-18T23:59:59.999'
```

**See also:** `startOf`

---

### `compare` `function` — **experimental**

```ts
<T extends PlainDate | PlainDateTime | PlainYearMonth | PlainTime | Instant>(a: T, b: T) => -1 | 0 | 1
```

Order two values of the same shape. Same-length strings compare as plain strings (every field is fixed-width and zero-padded), so the common case is one string comparison; that fast path does not validate. Values written at different precision (`14:30` and `14:30`) are parsed. Usable as an `Array#sort` comparator.

**Example**

```tsx
compare('2026-11-18', '2026-11-19')           // => -1
compare('14:30', '14:30')                  // => 0
compare('2026-11-18T14:30', '2026-11-18T14:30:00.001')  // => -1
['2026-03-01', '2026-01-01'].sort(compare)    // => ['2026-01-01', '2026-03-01']
```

**See also:** `isBefore` · `isAfter` · `isSame` · `min` · `max` · `clamp`

---

### `isBefore` `function` — **experimental**

```ts
<T extends Comparable>(a: T, b: T) => boolean
```

Whether `a` is strictly before `b`.

**Example**

```tsx
isBefore('2026-01-01', '2026-01-02')          // => true
```

---

### `isAfter` `function` — **experimental**

```ts
<T extends Comparable>(a: T, b: T) => boolean
```

Whether `a` is strictly after `b`.

**Example**

```tsx
isAfter('2026-01-01', '2026-01-02')           // => false
```

---

### `isSame` `function` — **experimental**

```ts
<T extends Comparable>(a: T, b: T, unit?: Unit, options?: { weekStart?: Weekday; zone?: TimeZone }) => boolean
```

Whether `a` and `b` are the same moment, or, with a `unit`, fall in the same year, month, week, day (or hour, minute, second, millisecond for a PlainDateTime). Two Instants compared by year, month, week, day or hour need `options.zone`, because the calendar day depends on where you are; without it the call throws and says so.

**Example**

```tsx
isSame('2026-11-18', '2026-11-30', 'month')   // => true
isSame('2026-11-15', '2026-11-16', 'week')    // => false
isSame('2026-11-15', '2026-11-16', 'week', { weekStart: 7 })  // => true
isSame(Date.UTC(2026, 10, 18, 22, 30), Date.UTC(2026, 10, 18, 23, 30), 'day', { zone: 'Europe/Prague' })  // => false
```

---

### `min` `function` — **experimental**

```ts
<T extends Comparable>(...values: [T, ...T[]]) => T
```

The earliest value; at least one is required.

**Example**

```tsx
min('2026-03-01', '2026-01-01', '2026-02-01') // => '2026-01-01'
```

---

### `max` `function` — **experimental**

```ts
<T extends Comparable>(...values: [T, ...T[]]) => T
```

The latest value; at least one is required.

**Example**

```tsx
max('2026-03-01', '2026-01-01', '2026-02-01') // => '2026-03-01'
```

---

### `clamp` `function` — **experimental**

```ts
<T extends Comparable>(value: T, lo: T, hi: T) => T
```

`value` limited to `lo` ... `hi` inclusive. Throws when `lo` is after `hi`.

**Example**

```tsx
clamp('2026-05-01', '2026-01-01', '2026-03-01') // => '2026-03-01'
```

---

### `eachDay` `function` — **experimental**

```ts
(start: PlainDate, end: PlainDate, step?: number) => PlainDate[]
```

Every date from `start` to `end`, both included, as an array. `step` (default 1) moves by that many days; a negative step counts down. A range that runs the other way than `step` is empty, which is a normal answer and never guessed into a direction. Nothing is capped: the whole range is built, so use `iterateDays` for long ranges.

**Example**

```tsx
eachDay('2026-02-27', '2026-03-02')           // => ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']
eachDay('2026-11-03', '2026-11-01', -1)       // => ['2026-11-03', '2026-11-02', '2026-11-01']
```

**See also:** `iterateDays`

---

### `iterateDays` `function` — **experimental**

```ts
(start: PlainDate, end: PlainDate, step?: number) => Generator<PlainDate>
```

The dates from `start` to `end`, both included, one at a time, so a long range is never materialised. `step` is as in `eachDay`; a zero or fractional step throws when called.

**Example**

```tsx
[...iterateDays('2026-11-01', '2026-11-03')]  // => ['2026-11-01', '2026-11-02', '2026-11-03']
```

**See also:** `eachDay`

---

### `monthGrid` `function` — **experimental**

```ts
(month: PlainYearMonth | PlainDate, options?: { weekStart?: Weekday; weeks?: 6 | "auto" }) => PlainDate[][]
```

The weeks of a month as rows of seven dates, including the days of the neighbouring months that fill the first and last row. `weeks: "auto"` (default) returns only the weeks the month occupies (4 to 6 rows); `weeks: 6` always returns six rows so a date picker keeps its height. Throws for the first and last months of the supported range when the grid would leave it.

**Example**

```tsx
const grid = monthGrid('2026-11')
grid.length                                   // => 6
grid[0]                                       // => ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
monthGrid('2026-11', { weekStart: 7 }).length // => 5
monthGrid('2026-02', { weekStart: 7 })[3]![6] // => '2026-02-28'
```

**See also:** `weekStartOf` · `eachDay`

---

### `weekStartOf` `function` — **experimental**

```ts
(locale: string) => Weekday
```

First day of the week for a locale as an ISO weekday (`en-US` is 7, `cs` is 1). Reads `Intl.Locale` week data and falls back to a built-in region table when the platform has none; a malformed tag gives Monday. Cached in a bounded table.

**Example**

```tsx
weekStartOf('en-US')                          // => 7
weekStartOf('cs')                             // => 1
```

**See also:** `weekendOf` · `monthGrid`

---

### `weekendOf` `function` — **experimental**

```ts
(locale: string) => readonly Weekday[]
```

The weekend days of a locale as ISO weekdays (`en-US` is `[6, 7]`, `ar-EG` is `[5, 6]`). The array is shared and frozen.

**Example**

```tsx
weekendOf('en-US')                            // => [6, 7]
weekendOf('he-IL')                            // => [5, 6]
```

---

### `dayOfWeek` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime) => Weekday
```

ISO weekday: 1 is Monday, 7 is Sunday (unlike `Date#getDay`).

**Example**

```tsx
dayOfWeek('2026-11-18')                       // => 3
dayOfWeek('2026-11-22')                       // => 7
```

---

### `quarterOf` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime | PlainYearMonth) => 1 | 2 | 3 | 4
```

The calendar quarter (January-March is 1). `startOf`, `endOf`, `diff` and `isSame` also take the unit `quarter`. There is no `quarters` duration field (a quarter is a calendar unit, not a length, and Temporal has none): add three months with `{ months: 3 }`.

**Example**

```tsx
quarterOf('2026-11-18')                       // => 4
startOf('2026-11-18', 'quarter')              // => '2026-10-01'
endOf('2026-11-18', 'quarter')                // => '2026-12-31'
diff('2026-01-01', '2026-12-31', 'quarter')   // => 3
```

**See also:** `startOf` · `endOf`

---

### `dayOfYear` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime) => number
```

1 for January 1st through 365 or 366.

**Example**

```tsx
dayOfYear('2024-12-31')                       // => 366
```

---

### `weekOfYear` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime) => number
```

ISO 8601 week number, 1-53: week 1 contains the year's first Thursday and weeks start on Monday. Days at the turn of the year can belong to a week of the neighbouring year: see `yearOfWeek`.

**Example**

```tsx
weekOfYear('2026-11-18')                      // => 47
weekOfYear('2027-01-01')                      // => 53
weekOfYear('2024-12-30')                      // => 1
```

**See also:** `yearOfWeek`

---

### `yearOfWeek` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime) => number
```

The ISO week-based year: 2027-01-01 belongs to week 53 of 2026, and 2024-12-30 to week 1 of 2025. Use it with `weekOfYear` to label a week.

**Example**

```tsx
yearOfWeek('2027-01-01')                      // => 2026
yearOfWeek('2024-12-30')                      // => 2025
```

**See also:** `weekOfYear`

---

### `daysInMonth` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime | PlainYearMonth) => number
```

Number of days in the month of the value.

**Example**

```tsx
daysInMonth('2024-02')                        // => 29
daysInMonth('2100-02')                        // => 28
```

---

### `isLeapYear` `function` — **experimental**

```ts
(value: number | PlainDate | PlainDateTime | PlainYearMonth) => boolean
```

Whether a year, or the year of a value, is a Gregorian leap year (1900 and 2100 are not, 2000 is).

**Example**

```tsx
isLeapYear(2000)                              // => true
isLeapYear(1900)                              // => false
```

---

### `plainDate` `function` — **experimental**

```ts
(year: number, month: number, day: number) => PlainDate
```

Build a PlainDate from numbers (month 1-12). Throws on an impossible date.

**Example**

```tsx
plainDate(2026, 11, 18)                       // => '2026-11-18'
```

**Common mistakes**

- Passing a 0-based month as `Date` does: `plainDate(2026, 0, 1)` throws, months are 1-12

---

### `plainYearMonth` `function` — **experimental**

```ts
(year: number, month: number) => PlainYearMonth
```

Build a PlainYearMonth from numbers.

**Example**

```tsx
plainYearMonth(2026, 11)                      // => '2026-11'
```

---

### `plainTime` `function` — **experimental**

```ts
(hour: number, minute?: number, second?: number, millisecond?: number) => PlainTime
```

Build a PlainTime, written at the least precision that holds the value: `14:30`, `14:30:05` or `14:30:05.250`.

**Example**

```tsx
plainTime(14, 30)                             // => '14:30'
plainTime(14, 30, 5)                          // => '14:30:05'
plainTime(14, 30, 0, 250)                     // => '14:30:00.250'
```

---

### `dateParts` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime) => { year: number; month: number; day: number }
```

The numeric fields of a date. Months are 1-12.

**Example**

```tsx
dateParts('2026-11-18')                       // => { year: 2026, month: 11, day: 18 }
```

---

### `timeParts` `function` — **experimental**

```ts
(value: PlainTime | PlainDateTime) => { hour: number; minute: number; second: number; millisecond: number }
```

The numeric fields of a time of day.

**Example**

```tsx
timeParts('14:30:05.250')                     // => { hour: 14, minute: 30, second: 5, millisecond: 250 }
```

---

### `isPlainDate` `function` — **experimental**

```ts
(x: unknown) => x is PlainDate
```

Strict guard: exactly `YYYY-MM-DD`, zero-padded, a real calendar day, years 0001-9999. Never throws. The other guards (`isPlainTime`, `isPlainDateTime`, `isPlainYearMonth`) follow the grammar in the gotchas.

**Example**

```tsx
isPlainDate('2026-11-18')                     // => true
isPlainDate('2026-02-30')                     // => false
isPlainDate('2026-2-3')                       // => false
```

---

### `isPlainTime` `function` — **experimental**

```ts
(x: unknown) => x is PlainTime
```

Guard for `HH:MM`, `HH:MM:SS` or `HH:MM:SS.f` to `.fff`.

**Example**

```tsx
isPlainTime('14:30:05.250')                   // => true
isPlainTime('24:00')                          // => false
```

---

### `isPlainDateTime` `function` — **experimental**

```ts
(x: unknown) => x is PlainDateTime
```

Guard for a PlainDate, an upper-case `T`, a PlainTime. Offsets and zone names are not part of a PlainDateTime.

**Example**

```tsx
isPlainDateTime('2026-11-18T14:30')           // => true
isPlainDateTime('2026-11-18T14:30Z')          // => false
```

---

### `isPlainYearMonth` `function` — **experimental**

```ts
(x: unknown) => x is PlainYearMonth
```

Guard for `YYYY-MM`.

**Example**

```tsx
isPlainYearMonth('2026-11')                   // => true
isPlainYearMonth('2026-13')                   // => false
```

---

### `parseInstant` `function` — **experimental**

```ts
(text: string, options?: { lenient?: boolean }) => Instant | null
```

Parse an ISO 8601 timestamp that names its offset into an Instant, or `null`. Strict: upper-case `T` and `Z`, a `+hh:mm` offset with a colon, seconds required, an optional fraction of 1-9 digits truncated to milliseconds. A string without an offset is a wall-clock value, not a moment, so it is `null`: use `toInstant(value, zone)`. With `{ lenient: true }` it also accepts a space or lower-case `t` and `z`, `+0100` and `+01` offsets, missing seconds and unpadded fields. Never throws.

**Example**

```tsx
parseInstant('2026-11-18T14:30:05Z')          // => Date.UTC(2026, 10, 18, 14, 30, 5)
parseInstant('2026-11-18T14:30:05.250+01:00') // => Date.UTC(2026, 10, 18, 13, 30, 5, 250)
parseInstant('2026-11-18T14:30:05')           // => null
parseInstant('2026-11-18 14:30:05+0100', { lenient: true })  // => Date.UTC(2026, 10, 18, 13, 30, 5)
```

**See also:** `toInstant`

---

### `normalize` `function` — **experimental**

```ts
<T extends PlainDate | PlainYearMonth | PlainTime | PlainDateTime>(value: T) => same shape as T
```

The canonical form of a value that came from elsewhere. Every PlainTime and PlainDateTime this package returns is the shortest exact form: `HH:MM` when seconds and milliseconds are zero, `HH:MM:SS` when only milliseconds are zero, otherwise `HH:MM:SS.mmm` (always three digits), which is what `<input type="time">` and `<input type="datetime-local">` produce. So equal values are equal strings, and `===`, `Object.is`, a Map key and plain string sorting are correct on them. A value typed by hand or read from an API may carry extra zeros (`14:30:00`, `14:30:00.000`): normalise it once at the boundary. Dates and year-months are returned as they are; other input throws.

**Example**

```tsx
normalize('2026-11-18T14:30:00.000')          // => '2026-11-18T14:30'
normalize('14:30:05.5')                       // => '14:30:05.500'
normalize('2026-11-18')                       // => '2026-11-18'
```

**See also:** `parseISO` · `compare`

---

### `parseISO` `function` — **experimental**

```ts
(text: string) => PlainDate | PlainDateTime | PlainYearMonth | PlainTime | null
```

The lenient door: read an ISO-like string people and other systems produce and return the strict value it denotes, or `null`. Accepts a space or lower-case `t` between date and time, unpadded months, days and hours, a comma as the decimal mark, up to nine fraction digits (cut to milliseconds) and surrounding spaces. It never guesses: a string with an offset or `Z` is a moment, not a wall-clock value, so it is `null` (use `parseInstant(text, { lenient: true })`, then `toPlainDateTime(instant, zone)` for the wall-clock time in a zone), and an impossible date is `null`. The result is always canonical. The strict guards stay strict. Never throws.

**Example**

```tsx
parseISO('2026-11-18 14:30')                  // => '2026-11-18T14:30'
parseISO(' 2026-2-3 ')                        // => '2026-02-03'
parseISO('2026-11-18T14:30Z')                 // => null
toPlainDateTime(parseInstant('2026-11-18T14:30:00+01:00')!, 'Asia/Tokyo')  // => '2026-11-18T22:30'
```

**See also:** `parseInstant` · `isPlainDate`

---

### `daysFromToday` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime | Instant, zone: TimeZone, now?: Instant) => number
```

Calendar days from today to the day `value` falls on, in `zone`: 0 today, -1 yesterday, 1 tomorrow. It counts calendar days, not 24-hour spans, so it is right on the 23- and 25-hour days of a DST change and around local midnight. An Instant is read in `zone`; a plain value is taken as the local date already. `now` is for tests; in `@pyreon/time` it defaults to the pinned clock.

**Example**

```tsx
daysFromToday('2026-11-17', 'Europe/Prague', Date.UTC(2026, 10, 18, 12))   // => -1
daysFromToday(Date.UTC(2026, 10, 18, 23, 30), 'Europe/Prague', Date.UTC(2026, 10, 18, 12))  // => 1
```

**See also:** `isToday` · `isSame`

---

### `isToday` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime | Instant, zone: TimeZone, now?: Instant) => boolean
```

Whether `value` falls on today's date in `zone`. 23:30 UTC is already tomorrow in Prague; this knows.

**Example**

```tsx
isToday(Date.UTC(2026, 10, 18, 22, 30), 'Europe/Prague', Date.UTC(2026, 10, 18, 12))  // => true
isToday(Date.UTC(2026, 10, 18, 23, 30), 'Europe/Prague', Date.UTC(2026, 10, 18, 12))  // => false
```

---

### `isYesterday` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime | Instant, zone: TimeZone, now?: Instant) => boolean
```

Whether `value` falls on yesterday's date in `zone`.

**Example**

```tsx
isYesterday('2026-11-17', 'Europe/Prague', Date.UTC(2026, 10, 18, 12))  // => true
```

---

### `isTomorrow` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime | Instant, zone: TimeZone, now?: Instant) => boolean
```

Whether `value` falls on tomorrow's date in `zone`.

**Example**

```tsx
isTomorrow('2026-11-19', 'Europe/Prague', Date.UTC(2026, 10, 18, 12))  // => true
```

---

### `relativeDistance` `function` — **experimental**

```ts
(target: Instant | PlainDate | PlainDateTime, base: Instant, zone: TimeZone) => { value: number; unit: "second" | "minute" | "hour" | "day" | "week" | "month" | "year" }
```

How far `target` is from `base`, counted the way a person says it. Under a minute is seconds, under an hour minutes, under 24 hours hours (truncated toward zero). From 24 hours on it is counted by the calendar in `zone`, so yesterday is literally yesterday: under 7 calendar days it is days; then weeks while the calendar month differs by less than one or the distance is under 30 days; then calendar months (up to 11), then calendar years. A PlainDate or PlainDateTime target is a wall-clock value in `zone`. These are the thresholds of `formatRelativeTo` in `@pyreon/format`, ported with its tests, so the same two moments give the same words.

**Example**

```tsx
relativeDistance(Date.UTC(2026, 10, 18, 11, 58), Date.UTC(2026, 10, 18, 12), 'UTC')  // => { value: -2, unit: 'minute' }
relativeDistance('2026-11-17', Date.UTC(2026, 10, 18, 23, 59), 'UTC')   // => { value: -1, unit: 'day' }
relativeDistance('2026-12-20', Date.UTC(2026, 10, 18, 12), 'UTC')       // => { value: 1, unit: 'month' }
```

**See also:** `useRelative` · `daysFromToday`

---

### `useToday` `hook` — **experimental**

```ts
(zone?: TimeZone) => () => PlainDate
```

Today's date as an accessor that flips at the local midnight of the zone (default: the active time zone of `@pyreon/ambient`), on one shared ticker; correct on 23- and 25-hour days. Reactive entry (`@pyreon/time`) only. Call it in a component's setup: the ticker is released when the component goes away. Outside a component, or on a server, it returns a plain accessor and starts nothing.

**Example**

```tsx
typeof useToday('Europe/Prague')              // => 'function'
```

**Common mistakes**

- Reading `today()` once in a component body for a "today" badge: the component runs once, so the badge never flips. Use `useToday()` and read it inside JSX or an effect

**See also:** `today` · `useRelative`

---

### `useCountdown` `hook` — **experimental**

```ts
(target: When | (() => When), options?: { zone?: TimeZone; every?: Every }) => { remaining: () => Duration; totalMs: () => number; done: () => boolean }
```

A countdown to `target` (an Instant, a Date, or a wall-clock PlainDate or PlainDateTime read in the zone): the time left in days, hours, minutes, seconds and milliseconds, all zero once it has passed. Updates every second by default on a shared ticker, so a thousand countdowns are one timer. Reactive entry only; call it in a component's setup. Invalid targets throw a `[Pyreon]` error when read.

**Example**

```tsx
typeof useCountdown(Date.UTC(2031, 0, 1)).done   // => 'function'
```

**See also:** `useElapsed`

---

### `useElapsed` `hook` — **experimental**

```ts
(since: When | (() => When), options?: { zone?: TimeZone; every?: Every }) => () => Duration
```

The stopwatch counterpart of `useCountdown`: the time since `since` in days to milliseconds (zero before it), updating every second by default.

**Example**

```tsx
typeof useElapsed(Date.UTC(2020, 0, 1))      // => 'function'
```

**See also:** `useCountdown`

---

### `useRelative` `hook` — **experimental**

```ts
(target: When | (() => When), options?: { zone?: TimeZone }) => () => { value: number; unit: RelativeUnit }
```

The structured relative distance to `target`, self-updating: `{ value: -2, unit: "minute" }` (negative is the past). Calendar-true from a day on. The cadence adapts to the distance on shared tickers: every second under a minute, every minute under an hour, every hour under a day, then at local midnight; as the distance grows the reader moves to the slower ticker, so an old timestamp never holds a per-second timer and 200 labels share a handful of timers. A displayed value can lag the true boundary by up to one tick of its ticker. It produces no text: `@pyreon/format` turns `{ value, unit }` into words. Reactive entry only; call it in a component's setup.

**Example**

```tsx
typeof useRelative(Date.now() - 60_000)       // => 'function'
```

**See also:** `relativeDistance` · `useNow`

---

### `RelativeDistance` `type` — **experimental**

```ts
interface RelativeDistance { value: number; unit: RelativeUnit }
```

A signed whole number of one unit; negative is the past.

**Example**

```tsx
const d: RelativeDistance = { value: -2, unit: 'minute' }
```

---

### `RelativeUnit` `type` — **experimental**

```ts
type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
```

The units of a relative distance.

**Example**

```tsx
const unit: RelativeUnit = 'week'
```

---

### `When` `type` — **experimental**

```ts
type When = Instant | Date | PlainDate | PlainDateTime
```

A moment a clock hook can aim at. A PlainDate or PlainDateTime is a wall-clock value read in the zone.

**Example**

```tsx
const at: When = '2026-12-24T18:00'
```

---

### `ClockOptions` `type` — **experimental**

```ts
interface ClockOptions { zone?: TimeZone }
```

Options shared by the clock hooks.

**Example**

```tsx
const o: ClockOptions = { zone: 'Europe/Prague' }
```

---

### `TickOptions` `type` — **experimental**

```ts
interface TickOptions extends ClockOptions { every?: Every }
```

Options of `useCountdown` and `useElapsed`.

**Example**

```tsx
const o: TickOptions = { every: 'minute' }
```

---

### `Countdown` `type` — **experimental**

```ts
interface Countdown { remaining: () => Duration; totalMs: () => number; done: () => boolean }
```

What `useCountdown` returns.

**Example**

```tsx
const c: Countdown = useCountdown(Date.UTC(2031, 0, 1))
```

---

### `toInstant` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime, zone: TimeZone, options?: { disambiguation?: "compatible" | "earlier" | "later" | "reject" }) => Instant
```

The instant at which a wall-clock time happens in a zone. A PlainDate means its midnight (its start of day). When the clocks go forward a time can not exist, and when they go back it happens twice; `disambiguation` follows Temporal exactly: `compatible` (default) takes the first of two and shifts a missing time forward by the length of the gap, `earlier` and `later` pick a side, `reject` throws.

**Example**

```tsx
const gap = toInstant('2026-03-29T02:30', 'Europe/Prague')           // 02:30 does not exist
new Date(gap).toISOString()                   // => '2026-03-29T01:30:00.000Z'
new Date(toInstant('2026-03-29T02:30', 'Europe/Prague', { disambiguation: 'earlier' })).toISOString()  // => '2026-03-29T00:30:00.000Z'
new Date(toInstant('2026-10-25T02:30', 'Europe/Prague', { disambiguation: 'later' })).toISOString()    // => '2026-10-25T01:30:00.000Z'
```

**Common mistakes**

- Using `new Date("2026-03-29T02:30")`: it reads the machine's zone, not the zone you name, and silently shifts in a gap

**See also:** `toPlainDateTime` · `addInstant`

---

### `toPlainDateTime` `function` — **experimental**

```ts
(instant: Instant, zone: TimeZone) => PlainDateTime
```

The wall-clock date and time of an instant in a zone. Seconds are always written, milliseconds only when non-zero.

**Example**

```tsx
toPlainDateTime(0, 'Europe/Prague')           // => '1970-01-01T01:00'
toPlainDateTime(0, 'America/St_Johns')        // => '1969-12-31T20:30'
```

**See also:** `toPlainDate` · `toPlainTime` · `offsetAt`

---

### `toPlainDate` `function` — **experimental**

```ts
(instant: Instant, zone: TimeZone) => PlainDate
```

The calendar date of an instant in a zone.

**Example**

```tsx
toPlainDate(Date.UTC(2026, 10, 18, 23, 30), 'Asia/Tokyo') // => '2026-11-19'
```

---

### `toPlainTime` `function` — **experimental**

```ts
(instant: Instant, zone: TimeZone) => PlainTime
```

The time of day of an instant in a zone.

**Example**

```tsx
toPlainTime(Date.UTC(2026, 10, 18, 13, 30), 'Europe/Prague') // => '14:30'
```

---

### `offsetAt` `function` — **experimental**

```ts
(instant: Instant, zone: TimeZone) => number
```

Minutes east of UTC at an instant: 120 for Europe/Prague in summer, 345 for Asia/Kathmandu. Fractional only in the pre-1900 local-mean-time eras of some zones.

**Example**

```tsx
offsetAt(Date.UTC(2026, 6, 1), 'Europe/Prague')  // => 120
offsetAt(Date.UTC(2026, 0, 1), 'Asia/Kathmandu') // => 345
```

---

### `addInstant` `function` — **experimental**

```ts
(instant: Instant, duration: Duration, zone?: TimeZone) => Instant
```

Move an instant by a duration. Years, months, weeks and days move the zone's wall clock (so "one day later" keeps the time of day across a DST change, and the 23- or 25-hour day is handled) and need `zone`; hours, minutes, seconds and milliseconds move the instant itself. The resulting wall time is resolved with the `compatible` rule.

**Example**

```tsx
const noon = Date.UTC(2026, 2, 28, 11, 0)    // 12:00 in Prague, the day before the clocks change
new Date(addInstant(noon, { days: 1 }, 'Europe/Prague')).toISOString()  // => '2026-03-29T10:00:00.000Z'
new Date(addInstant(noon, { hours: 24 })).toISOString()                 // => '2026-03-29T11:00:00.000Z'
```

**Common mistakes**

- Expecting `{ days: 1 }` to be 24 hours: it is one calendar day. Use `{ hours: 24 }` for an exact span

**See also:** `add` · `toInstant`

---

### `isTimeZone` `function` — **experimental**

```ts
(x: unknown) => x is TimeZone
```

Whether the platform knows this time zone name. Never throws; use it to validate user input before calling the zone functions, which throw on an unknown zone.

**Example**

```tsx
isTimeZone('Europe/Prague')                   // => true
isTimeZone('Mars/Olympus')                    // => false
```

---

### `fromDate` `function` — **experimental**

```ts
(date: Date, zone?: TimeZone) => PlainDateTime
```

The wall-clock date and time of a `Date` in `zone` (default: the runtime's local zone).

**Example**

```tsx
fromDate(new Date(Date.UTC(2026, 10, 18, 13, 30)), 'Europe/Prague') // => '2026-11-18T14:30'
```

---

### `toDate` `function` — **experimental**

```ts
(value: PlainDate | PlainDateTime | Instant, zone?: TimeZone) => Date
```

A `Date` for an Instant, or for a wall-clock value in `zone` (default: the runtime's local zone, like `new Date(y, m, d)`).

**Example**

```tsx
toDate('2026-11-18T14:30', 'Europe/Prague').toISOString() // => '2026-11-18T13:30:00.000Z'
```

---

### `localZone` `function` — **experimental**

```ts
() => TimeZone
```

The runtime's own time zone name (`"UTC"` when the platform cannot say). Core functions never read it implicitly except `fromDate`, `toDate` and `today` when you omit the zone.

**Example**

```tsx
typeof localZone()                            // => 'string'
```

---

### `toMilliseconds` `function` — **experimental**

```ts
(duration: Duration) => number
```

The length of a duration in milliseconds. Only fixed-length fields count (a week is seven 24-hour days, a day is 24 hours); years and months throw because they have no fixed length: use `diff` or `addInstant`.

**Example**

```tsx
toMilliseconds({ hours: 1, minutes: 30 })     // => 5400000
toMilliseconds({ weeks: 1 })                  // => 604800000
```

---

### `now` `function` — **experimental**

```ts
() => Instant
```

The current instant. `@pyreon/time/core` returns `Date.now()`; `@pyreon/time` reads the ambient clock of `@pyreon/ambient`: the pin from `setClock`, the request's `provideClock` instant, or the server's hand-over on a hydrating page.

**Example**

```tsx
typeof now()                                  // => 'number'
```

**See also:** `setClock` · `today`

---

### `today` `function` — **experimental**

```ts
(zone?: TimeZone) => PlainDate
```

Today's date in `zone` (default: the runtime's local zone). In `@pyreon/time` it reads the pinned clock.

**Example**

```tsx
isPlainDate(today('Europe/Prague'))           // => true
```

**See also:** `now` · `setClock`

---

### `setClock` `function` — **experimental**

```ts
(clock: (() => Instant) | null) => void
```

Pin the clock of the whole app, for tests and previews; `null` restores the system clock. It is `@pyreon/ambient`'s `setClock`, re-exported, so `@pyreon/format`, `@pyreon/i18n` and every hook read the same pin. Process-wide state: on a server use `provideClock` from `@pyreon/ambient` per request.

**Example**

```tsx
setClock(() => Date.UTC(2031, 5, 18, 16, 0))
today('Asia/Tokyo')                           // => '2031-06-19'
setClock(null)
```

**Common mistakes**

- Calling it per request on a server: the pin is shared by every request in the process

---

### `Instant` `type` — **experimental**

```ts
type Instant = number
```

Epoch milliseconds, the same number as `Date.now()`.

**Example**

```tsx
const t: Instant = Date.now()
```

---

### `PlainDate` `type` — **experimental**

```ts
type PlainDate = `${number}-${number}-${number}`
```

`2026-11-18`. The type is looser than the runtime check (`"2026-1-3"` type-checks and fails `isPlainDate`), because template literal types cannot count digits.

**Example**

```tsx
const d: PlainDate = '2026-11-18'
```

---

### `PlainTime` `type` — **experimental**

```ts
type PlainTime = `${number}:${number}` | `${number}:${number}:${number}` | `${number}:${number}:${number}.${number}`
```

`14:30`, `14:30:05` or `14:30:05.250`.

**Example**

```tsx
const t: PlainTime = '14:30'
```

---

### `PlainDateTime` `type` — **experimental**

```ts
type PlainDateTime = `${PlainDate}T${PlainTime}`
```

`2026-11-18T14:30`: no offset, no zone name.

**Example**

```tsx
const dt: PlainDateTime = '2026-11-18T14:30'
```

---

### `PlainYearMonth` `type` — **experimental**

```ts
type PlainYearMonth = `${number}-${number}`
```

`2026-11`.

**Example**

```tsx
const ym: PlainYearMonth = '2026-11'
```

---

### `TimeZone` `type` — **experimental**

```ts
type TimeZone = string
```

An IANA zone name such as `Europe/Prague`, or `UTC`.

**Example**

```tsx
const z: TimeZone = 'Europe/Prague'
```

---

### `Duration` `type` — **experimental**

```ts
interface Duration { years?: number; months?: number; weeks?: number; days?: number; hours?: number; minutes?: number; seconds?: number; milliseconds?: number }
```

A span of time. Every field is an integer and every non-zero field shares one sign.

**Example**

```tsx
const d: Duration = { months: 1, days: 2 }
```

---

### `Unit` `type` — **experimental**

```ts
type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond'
```

Singular unit names (`DateUnit` and `TimeUnit` are the two halves). A plural such as `"days"` is a programmer error and throws.

**Example**

```tsx
const u: Unit = 'day'
```

---

### `Weekday` `type` — **experimental**

```ts
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
```

ISO weekday: 1 Monday ... 7 Sunday.

**Example**

```tsx
const w: Weekday = 7
```

---

### `Disambiguation` `type` — **experimental**

```ts
type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject'
```

How a wall-clock time in a DST gap or overlap picks an instant (Temporal's modes).

**Example**

```tsx
const m: Disambiguation = 'reject'
```

---

### `inZone` `function` — **experimental**

```ts
(zone: TimeZone) => { zone, today, toInstant, toPlainDate, toPlainTime, toPlainDateTime, addInstant, offsetAt, startOfDay, endOfDay }
```

The zone-taking functions with one zone applied, for code that works in one zone. Create it once (module scope or a setup function): the members are plain functions created by the `inZone` call, so a conversion does no more work than the unbound function. The zone is validated at `inZone`, so a typo fails there. It is not reactive; it pulls every zone function into the bundle, so import the individual functions when you need one or two.

**Example**

```tsx
const prague = inZone('Europe/Prague')
const t = prague.toInstant('2026-03-29T02:30')  // 02:30 does not exist: 03:30 CEST
new Date(t).toISOString()                      // => '2026-03-29T01:30:00.000Z'
prague.toPlainDate(t)                          // => '2026-03-29'
prague.offsetAt(t)                             // => 120
new Date(prague.startOfDay(t)).toISOString()   // => '2026-03-28T23:00:00.000Z'
```

**See also:** `toInstant` · `toPlainDateTime`

---

### `Adjuster` `type` — **experimental**

```ts
type Adjuster<T> = (value: T) => T
```

A value-to-same-value function, what `add({ months: 1 })` from `@pyreon/time/fp` returns.

**Example**

```tsx
import { startOf } from '@pyreon/time/fp'
const month: Adjuster<PlainDate> = startOf('month')
```

---

### `Mapper` `type` — **experimental**

```ts
type Mapper<A, B> = (value: A) => B
```

A value-to-other-value function, such as `toPlainDate(zone)` or `diffFrom(base, "day")` from `@pyreon/time/fp`.

**Example**

```tsx
import { toPlainDate } from '@pyreon/time/fp'
const day: Mapper<number, PlainDate> = toPlainDate('Europe/Prague')
```

---

### `ZonedToolkit` `type` — **experimental**

```ts
interface ZonedToolkit { readonly zone: TimeZone; today(): PlainDate; toInstant(...); toPlainDate(instant); ... }
```

The object `inZone` returns.

**Example**

```tsx
const z: ZonedToolkit = inZone('UTC')
```

---

### `fp.add` `function` — **experimental**

```ts
(duration: Duration) => <T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T) => same shape as T
```

Value-last `add`: `add({ months: 1 })` is a function you can name, pass to `map` and chain with `pipe`. The result keeps the input shape.

**Example**

```tsx
import { add } from '@pyreon/time/fp'
const nextMonth = add({ months: 1 })
nextMonth('2026-01-31')                       // => '2026-02-28'
['2026-01-31', '2026-03-01'].map(nextMonth)   // => ['2026-02-28', '2026-04-01']
```

**See also:** `add`

---

### `fp.subtract` `function` — **experimental**

```ts
(duration: Duration) => <T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T) => same shape as T
```

Value-last `subtract`.

**Example**

```tsx
import { subtract } from '@pyreon/time/fp'
subtract({ days: 1 })('2026-03-01')      // => '2026-02-28'
```

---

### `fp.startOf` `function` — **experimental**

```ts
(unit: Unit, options?: { weekStart?: Weekday }) => <T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T) => same shape as T
```

Value-last `startOf`.

**Example**

```tsx
import { startOf } from '@pyreon/time/fp'
startOf('week')('2026-11-18')              // => '2026-11-16'
startOf('week', { weekStart: 7 })('2026-11-18')  // => '2026-11-15'
```

---

### `fp.endOf` `function` — **experimental**

```ts
(unit: Unit, options?: { weekStart?: Weekday }) => <T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T) => same shape as T
```

Value-last `endOf`.

**Example**

```tsx
import { endOf } from '@pyreon/time/fp'
endOf('month')('2026-11-18')               // => '2026-11-30'
```

---

### `fp.isBefore` `function` — **experimental**

```ts
(limit: T) => (value: shape of T) => boolean
```

A predicate: `isBefore(limit)(value)` is true for values before `limit`, so it reads correctly in `filter`.

**Example**

```tsx
import { isBefore } from '@pyreon/time/fp'
['2026-01-01', '2026-06-01'].filter(isBefore('2026-03-01'))  // => ['2026-01-01']
```

---

### `fp.isAfter` `function` — **experimental**

```ts
(limit: T) => (value: shape of T) => boolean
```

A predicate: true for values after `limit`.

**Example**

```tsx
import { isAfter } from '@pyreon/time/fp'
['2026-01-01', '2026-06-01'].filter(isAfter('2026-03-01'))   // => ['2026-06-01']
```

---

### `fp.isSame` `function` — **experimental**

```ts
(other: T, unit?: Unit, options?: { weekStart?: Weekday }) => (value: shape of T) => boolean
```

A predicate: true for values in the same unit as `other`.

**Example**

```tsx
import { isSame } from '@pyreon/time/fp'
['2026-11-02', '2026-12-01'].filter(isSame('2026-11-18', 'month'))  // => ['2026-11-02']
```

---

### `isBetween` `function` — **experimental**

```ts
(start: T, end: T) => (value: shape of T) => boolean
```

A predicate: true for values from `start` to `end`, both included.

**Example**

```tsx
import { isBetween } from '@pyreon/time/fp'
['2026-01-05', '2026-02-10', '2026-03-20'].filter(isBetween('2026-02-01', '2026-03-01'))  // => ['2026-02-10']
```

---

### `fp.clamp` `function` — **experimental**

```ts
(lo: T, hi: T) => (value: shape of T) => shape of T
```

Limit values to a range. Throws when `lo` is after `hi`.

**Example**

```tsx
import { clamp } from '@pyreon/time/fp'
['2025-05-01', '2026-02-01', '2027-01-01'].map(clamp('2026-01-01', '2026-03-01'))  // => ['2026-01-01', '2026-02-01', '2026-03-01']
```

---

### `diffFrom` `function` — **experimental**

```ts
(base: T, unit: Unit, options?: { zone?: TimeZone }) => (value: shape of T) => number
```

Whole units from `base` to each value: `dates.map(diffFrom(today, "day"))` reads left to right.

**Example**

```tsx
import { diffFrom } from '@pyreon/time/fp'
['2026-01-10', '2026-01-03'].map(diffFrom('2026-01-01', 'day'))  // => [9, 2]
```

---

### `betweenFrom` `function` — **experimental**

```ts
(base: PlainDate | PlainDateTime) => (value: same shape) => Duration
```

The Duration from `base` to each value.

**Example**

```tsx
import { betweenFrom } from '@pyreon/time/fp'
betweenFrom('2026-01-31')('2026-03-01')      // => { years: 0, months: 1, days: 1 }
```

---

### `by` `function` — **experimental**

```ts
(mapper: (item: A) => K) => (a: A, b: A) => -1 | 0 | 1
```

A comparator that orders items by a mapped value: `items.sort(by(toDay))`.

**Example**

```tsx
import { by } from '@pyreon/time/fp'
const events: { d: PlainDate }[] = [{ d: '2026-03-01' }, { d: '2026-01-01' }]
events.sort(by((x) => x.d)).map((x) => x.d)  // => ['2026-01-01', '2026-03-01']
```

---

### `fp.compare` `function` — **experimental**

```ts
(a: T, b: T) => -1 | 0 | 1
```

The same function as the value-first `compare`: it is already a comparator for `Array#sort`.

**Example**

```tsx
import {  } from '@pyreon/time/fp'
const days: PlainDate[] = ['2026-03-01', '2026-01-01']
days.sort(compare)                            // => ['2026-01-01', '2026-03-01']
```

---

### `fp.toInstant` `function` — **experimental**

```ts
(zone: TimeZone, options?: { disambiguation? }) => (value: PlainDate | PlainDateTime) => Instant
```

Value-last `toInstant`.

**Example**

```tsx
import { toInstant } from '@pyreon/time/fp'
new Date(toInstant('UTC')('2026-11-18T14:30')).toISOString()  // => '2026-11-18T14:30:00.000Z'
```

---

### `fp.toPlainDate` `function` — **experimental**

```ts
(zone: TimeZone) => (instant: Instant) => PlainDate
```

Value-last `toPlainDate`: a groupBy key for bucketing instants by local day.

**Example**

```tsx
import { toPlainDate } from '@pyreon/time/fp'
toPlainDate('Asia/Tokyo')(Date.UTC(2026, 10, 18, 23, 30))  // => '2026-11-19'
```

---

### `fp.toPlainTime` `function` — **experimental**

```ts
(zone: TimeZone) => (instant: Instant) => PlainTime
```

Value-last `toPlainTime`.

**Example**

```tsx
import { toPlainTime } from '@pyreon/time/fp'
toPlainTime('Europe/Prague')(Date.UTC(2026, 10, 18, 13, 30))  // => '14:30'
```

---

### `fp.toPlainDateTime` `function` — **experimental**

```ts
(zone: TimeZone) => (instant: Instant) => PlainDateTime
```

Value-last `toPlainDateTime`.

**Example**

```tsx
import { toPlainDateTime } from '@pyreon/time/fp'
toPlainDateTime('Europe/Prague')(0)           // => '1970-01-01T01:00'
```

---

### `fp.offsetAt` `function` — **experimental**

```ts
(zone: TimeZone) => (instant: Instant) => number
```

Value-last `offsetAt`.

**Example**

```tsx
import { offsetAt } from '@pyreon/time/fp'
offsetAt('Asia/Kathmandu')(Date.UTC(2026, 0, 1))  // => 345
```

---

### `fp.addInstant` `function` — **experimental**

```ts
(duration: Duration, zone?: TimeZone) => (instant: Instant) => Instant
```

Value-last `addInstant`.

**Example**

```tsx
import { addInstant } from '@pyreon/time/fp'
new Date(addInstant({ days: 1 }, 'UTC')(Date.UTC(2026, 0, 31))).toISOString()  // => '2026-02-01T00:00:00.000Z'
```

---

### `fp.monthGrid` `function` — **experimental**

```ts
(options?: MonthGridOptions) => (month: PlainYearMonth | PlainDate) => PlainDate[][]
```

Value-last `monthGrid`.

**Example**

```tsx
import { monthGrid } from '@pyreon/time/fp'
monthGrid({ weekStart: 7 })('2026-11').length  // => 5
```

---

### `fp.fromDate` `function` — **experimental**

```ts
(zone?: TimeZone) => (date: Date) => PlainDateTime
```

Value-last `fromDate`.

**Example**

```tsx
import { fromDate } from '@pyreon/time/fp'
fromDate('UTC')(new Date(0))                  // => '1970-01-01T00:00'
```

---

### `fp.toDate` `function` — **experimental**

```ts
(zone?: TimeZone) => (value: PlainDate | PlainDateTime | Instant) => Date
```

Value-last `toDate`.

**Example**

```tsx
import { toDate } from '@pyreon/time/fp'
toDate('UTC')('1970-01-01').getTime()         // => 0
```

---

### `pipe` `function` — **experimental**

```ts
(f1: (a: A) => B, f2: (b: B) => C, ...up to eight steps) => (value: A) => result
```

Left-to-right composition of unary functions, typed for up to eight steps, so pipelines need no other package: `pipe(add({ months: 1 }), startOf("month"))` goes to the first of next month. The result is a plain function. One to three steps are direct closures. Not the same as `@pyreon/rx`'s `pipe`, which takes a source value (or signal) first and runs the steps over it; adjusters work as the steps and as the callbacks of rx's `map`, `groupBy` and `sortBy`.

**Example**

```tsx
import { add, startOf, pipe } from '@pyreon/time/fp'
const nextMonthStart = pipe(add({ months: 1 }), startOf('month'))
nextMonthStart('2026-01-31')                  // => '2026-02-01'
['2026-01-31', '2026-11-18'].map(nextMonthStart)  // => ['2026-02-01', '2026-12-01']
```

---

## Package-level notes

> **Accepted ISO forms:** PlainDate `YYYY-MM-DD` (year 0001-9999, a real day); PlainYearMonth `YYYY-MM`; PlainTime `HH:MM`, `HH:MM:SS` or `HH:MM:SS.f` to `.fff` (hour 00-23, second 00-59, no `24:00`, no leap second); PlainDateTime a PlainDate, an upper-case `T`, a PlainTime. No offsets or zone names, no lower-case `t`, no space separator, no unpadded fields: `isPlainDate("2026-2-3")` is false. Temporal accepts more; this package is strict so a value is always canonical and `compare` can be a string comparison. `parseInstant` is the one parser for timestamps with an offset.

> **Throws versus returns:** The `isPlain*` guards, `isTimeZone`, `parseInstant` and `parseISO` never throw. Every other function throws a `[Pyreon]` error on a value of the wrong shape (validate user input with a guard first), an unknown unit or zone, a mixed-sign duration, or a result outside years 0001-9999. Rendering code that must not throw belongs behind a guard or in `@pyreon/format`.

> **Time zones:** Offsets come from `Intl.DateTimeFormat`, so results follow the engine's tz data (Node, Chromium and Bun can differ for recent rule changes). One formatter per zone is cached; the table holds 64 zones (oldest dropped first, rebuilt on next use) and each zone keeps a fixed 127-slot offset table. Core functions require an explicit `zone`; the reactive entry (`@pyreon/time`) defaults it to the active time zone of `@pyreon/ambient`.

> **Month arithmetic:** `add` clamps the day (Jan 31 + 1 month = Feb 28). `diff` counts a month as complete when that clamped addition does not pass the end, which is Temporal's truncated `until`; `between` returns Temporal's unrounded breakdown, where a month ends only when the day number is reached (2012-08-31 to 2051-02-28 is 38 years, 5 months, 28 days). The two can differ by one month at month ends, exactly as in Temporal.

> **Durations:** Years and months must be whole numbers (a fractional month has no fixed length: use days or weeks). Weeks, days, hours, minutes and seconds may be fractional and balance down: `{ days: 1.5 }` is one day and twelve hours, rounded to the nearest millisecond. `{ milliseconds: 0.5 }`, NaN, Infinity and non-numbers throw. `-0` is `0`. A fraction that leaves a time of day cannot be added to a PlainDate, which throws and says to use a PlainDateTime.

> **Canonical output:** Every PlainTime and PlainDateTime the package returns is the shortest exact form (`HH:MM`, `HH:MM:SS` only when seconds are non-zero, `.mmm` only when milliseconds are non-zero), so equal values are equal strings: `===`, `Object.is`, Map keys, `groupBy` keys and plain string sorting are all correct on them. Inputs of any accepted precision stay accepted. Normalise external input once at the boundary with `normalize`. Fractions are at most three digits: finer values are rejected, not rounded.

> **Operations as values:** `@pyreon/time/fp` has the value-last form of every operation (`add({ months: 1 })` returns a function), `pipe` and `by`; they are thin wrappers over core, each tree-shakes alone, and a built adjuster costs one extra call per use, so build it once. `inZone(zone)` binds the zone-taking functions and pulls all of them. Because values are plain strings and numbers, `between(a, b)` is already the Duration `@pyreon/format` takes, and PlainDate, PlainDateTime and Instant are already its date inputs: neither package depends on the other.

> **Not included yet:** `fromTemporal` / `toTemporal` are left out: typing them without depending on Temporal typings is not clean, and a Plain value maps to Temporal with one `Temporal.PlainDate.from(value)`. Text for relative times (`useRelativeTime`, `<RelativeTime>`) belongs to `@pyreon/format`, built on `@pyreon/ambient`'s clock.
