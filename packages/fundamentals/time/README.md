# @pyreon/time

Dates and times as plain strings and numbers: ISO values, DST-correct zone math, calendar grids. No classes, no method chains, one tree-shakeable function per operation.

> **Experimental.** The value layer is complete and checked against `Temporal`. Clocks (`useNow`, `useCountdown`, ...) and the active time zone follow in later releases.

A date is `"2026-11-18"`, a time is `"14:30"`, an instant is the epoch-millisecond number `Date.now()` returns. Literals type-check without casts, and `add('2026-01-31', { months: 1 })` is a `PlainDate`.

## Install

```bash
bun add @pyreon/time
```

`@pyreon/time/core` has no dependencies. `@pyreon/time` re-exports it and adds a pinnable clock (`setClock`, `now`, `today`).

## Quick start

```ts
import { add, diff, startOf, monthGrid, toInstant, toPlainDateTime, isPlainDate } from '@pyreon/time/core'

add('2026-01-31', { months: 1 }) // '2026-02-28' (the day clamps)
diff('2026-11-18', '2026-12-24', 'day') // 36
startOf('2026-11-18', 'week') // '2026-11-16' (Monday)
monthGrid('2026-11')[0]![0] // '2026-10-26'

isPlainDate('2026-02-30') // false (strict: a real calendar day, zero-padded)

// Zones: wall-clock in, instant out; DST gaps and overlaps follow Temporal's four disambiguation modes.
const t = toInstant('2026-03-29T02:30', 'Europe/Prague') // 02:30 does not exist: 03:30 CEST
toPlainDateTime(t, 'Europe/Prague') // '2026-03-29T03:30:00'
```

## What is in it

| Area | Functions |
| --- | --- |
| Build and check | `plainDate`, `plainYearMonth`, `plainTime`, `isPlainDate`, `isPlainTime`, `isPlainDateTime`, `isPlainYearMonth`, `dateParts`, `timeParts`, `parseInstant` |
| Arithmetic | `add`, `subtract`, `diff`, `between`, `startOf`, `endOf`, `toMilliseconds` |
| Compare | `compare`, `isBefore`, `isAfter`, `isSame`, `min`, `max`, `clamp` |
| Calendar | `dayOfWeek`, `dayOfYear`, `weekOfYear`, `yearOfWeek`, `daysInMonth`, `isLeapYear`, `eachDay`, `monthGrid`, `weekStartOf`, `weekendOf` |
| Zones and instants | `toInstant`, `toPlainDateTime`, `toPlainDate`, `toPlainTime`, `offsetAt`, `addInstant`, `isTimeZone`, `localZone` |
| `Date` interop | `fromDate`, `toDate` |
| Clock (`@pyreon/time` only) | `setClock`, `now`, `today` |

Months are 1-12 and weekdays are ISO 1 (Monday) to 7 (Sunday). Calendar math is proleptic Gregorian integer arithmetic with no `Date` object on the path; time zones come from `Intl` with one cached formatter per zone.

## Correctness

Seeded randomized tests compare every arithmetic, comparison, week, grid and zone function with `Temporal` (`bun run test:oracle`; Node 24 has no `Temporal`, Bun 1.4 and Node 26 do), plus a hand-verified table of DST gaps and overlaps, 30- and 45-minute zones and the Apia skipped day that runs in Node and in real Chromium.

Full guide: [docs/time](https://pyreon.dev/docs/time). Generated API reference: [docs/reference/time](https://pyreon.dev/docs/reference/time).
