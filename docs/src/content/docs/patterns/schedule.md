---
title: "Recurrence, working hours and availability"
summary: "Store a recurring event as a rule, expand a window with @pyreon/schedule, keep the wall time and the zone, and count working time with a calendar."
seeAlso: [dates-and-times]
---

## The pattern

A repeating event is stored once, as a rule: plain data that follows RFC 5545. You ask the rule for the window you need: the occurrences of a month, the next one, whether it happens today. Times stay wall-clock times with a zone name, so "09:00" is 09:00 in summer and in winter. Working time and free slots are computed from a calendar of hours, holidays and busy intervals.

```ts
import { addBusinessTime, expandEvents, freeSlots, nextOccurrence } from '@pyreon/schedule'

const standup = { id: 'standup', start: '2026-11-16T09:00', end: '2026-11-16T09:15', rule: { every: 'week', on: { weekdays: [1, 3, 5] }, start: '2026-11-16T09:00', timeZone: 'Europe/Prague' } } as const

nextOccurrence(standup.rule, '2026-11-18T09:00') // '2026-11-20T09:00'
expandEvents([standup], { start: '2026-11-01T00:00', end: '2026-12-01T00:00' }) // the instances of November, each with a stable key
addBusinessTime('2026-11-20T15:00', { hours: 8 }, { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } }) // '2026-11-23T15:00'
```

## Why

A rule is small, editable and exact; the expansion jumps to the window, so asking for the next occurrence of a rule that started ten years ago costs the same as for a new one. Occurrences are wall-clock times, so they do not drift when the clocks change; only the instant moves, and `toInstants` computes it through the zone. RFC 5545 skips a month that lacks the day (the 31st), where `add` clamps; a rule that says "the last day of the month" is `monthDays: [-1]`.

## Anti-pattern

```ts
// BROKEN: stepping day by day, storing expanded rows, and anchoring the hour in UTC
let d = event.start
while (d <= end) {
  if (matches(d)) rows.push({ ...event, start: d }) // thousands of rows to edit, and an edit means rewriting all of them
  d = add(d, { days: 1 })
}
const nine = Date.UTC(2026, 0, 5, 8) + week * 7 // 09:00 in winter, 10:00 after the clocks change
const due = add('2026-11-20T15:00', { hours: 8 }) // counts the night and the weekend

// Correct
const rule = { every: 'week', on: { weekdays: [1, 3, 5] }, start: '2026-11-16T09:00', timeZone: 'Europe/Prague' } as const
const occurrences = occurrencesBetween(rule, '2026-11-01', '2026-12-01')
const dueAt = addBusinessTime('2026-11-20T15:00', { hours: 8 }, calendar)
```

Also: assuming `count` stops counting an excepted date (it does not, as in RFC 5545), clamping to the month's last day where a rule must skip (use `monthDays: [-1]` for "last day"), and showing holidays as data this package ships (it ships none: pass a list or a predicate).

## Related

- `@pyreon/schedule` for the functions, and its docs page for recipes (every second Tuesday, DST, free slots, SLA due dates, month views, `.ics` import).
- `@pyreon/time` for the plain values underneath.
