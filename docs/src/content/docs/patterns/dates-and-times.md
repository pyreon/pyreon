---
title: "Dates and times"
summary: "Keep dates as ISO strings and instants as epoch milliseconds, do the math with @pyreon/time, and name the zone whenever a day matters."
seeAlso: [dev-warnings]
---

## The pattern

A date is a string (`'2026-11-18'`), a moment is the number `Date.now()` returns, and a zone is a name you pass. `@pyreon/time` does the arithmetic on those values, so nothing depends on the machine's time zone, and the same code gives the same answer on the server and in the browser.

```ts
import { add, diff, startOf, toInstant, toPlainDate, isToday, isPlainDate } from '@pyreon/time/core'

// Calendar math on date strings: no Date object, no time zone.
add('2026-01-31', { months: 1 }) // '2026-02-28'
diff('2026-11-18', '2026-12-24', 'day') // 36
startOf('2026-11-18', 'week') // '2026-11-16'

// A moment and a zone give a local date. Say the zone every time a day matters.
toPlainDate(Date.UTC(2026, 10, 18, 23, 30), 'Europe/Prague') // '2026-11-19'
isToday(Date.UTC(2026, 10, 18, 23, 30), 'Europe/Prague') // false once Prague's day has turned

// Check data at the boundary; arithmetic on a malformed value throws.
isPlainDate(userInput)
```

Why not `Date`: it holds a moment but gets used for calendar days, and the two differ twice a year. Days are not always 24 hours, months have 28 to 31 days, and `new Date()` reads the machine's zone, so a server in UTC and a browser in Prague disagree.

## Why

A string or a number carries no zone and no hidden state, so it serializes, compares and renders the same everywhere. The zone enters only where a day or a clock reading matters, as an argument you can see.

## Anti-pattern

The classic mistakes:

- **Date math with `setDate` or milliseconds across DST.** `new Date(t + 24 * 3_600_000)` is not "tomorrow" on the 23- and 25-hour days. Add days to the calendar value (`add('2026-03-28', { days: 1 })`) or, for an instant, `addInstant(t, { days: 1 }, zone)`, which keeps the time of day.
- **`new Date('2026-11-18')` shown in local time.** A date-only string parses as UTC midnight, so west of Greenwich it displays as the previous day. A date-only string is a calendar date: keep it as a string and format it as that day (a formatter should).
- **`new Date()` read in a component body.** The component runs once, so the value is frozen at mount and the server and client disagree during hydration. Read the clock inside an effect or an event handler, and pin it in tests with `setClock`.
- **`toISOString().slice(0, 10)` as "today".** That is today in UTC. Use `today(zone)`.
- **Comparing two instants by day without a zone.** `isSame(a, b, 'day')` needs `{ zone }` because the day depends on where you are.
- **Zero-based months and Sunday-first weekdays.** Here months are 1-12 and weekdays are ISO: 1 Monday to 7 Sunday.
- **Assuming a wall-clock time exists once.** In a DST gap it does not exist and in an overlap it happens twice. `toInstant(value, zone, { disambiguation })` says which one you mean.

```ts
// BROKEN: a day is not always 24 hours, and getDate() reads the machine's zone
const tomorrow = new Date(Date.now() + 24 * 3_600_000)
const label = new Date('2026-11-18').toLocaleDateString() // the 17th in New York

// Correct
const next = add('2026-11-18', { days: 1 }) // '2026-11-19'
const same = addInstant(Date.now(), { days: 1 }, 'Europe/Prague') // same time of day tomorrow
```

## Related

- `@pyreon/time` for the functions, and its docs page for recipes (month grid, business days, fiscal quarters, time zones).
