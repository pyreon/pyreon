# @pyreon/schedule

Recurrence, working time and availability as plain data, on top of `@pyreon/time`. A rule is a plain object that follows RFC 5545 (iCalendar RRULE); occurrences are wall-clock strings, so a daily 09:00 stays 09:00 across daylight saving time; expansion jumps to the window you ask for instead of stepping.

> **Experimental.** Verified against RFC 5545's own examples, the `rrule` library and a brute-force oracle.

## Install

```bash
bun add @pyreon/schedule @pyreon/time
```

Entries: `@pyreon/schedule/core` (needs only `@pyreon/time`), `@pyreon/schedule` (adds `useOccursToday` and `useNextOccurrence`, which need `@pyreon/reactivity`), `@pyreon/schedule/fp` (value-last forms).

## Quick start

```ts
import { addBusinessTime, nextOccurrence, occurrencesBetween } from '@pyreon/schedule'

const standup = { every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17T09:30' } as const
const office = { hours: { 1: [{ from: '09:00', to: '17:00' }], 5: [{ from: '09:00', to: '17:00' }] } } as const

occurrencesBetween(standup, '2026-11-17', '2026-12-31') // ['2026-11-17T09:30', '2026-12-01T09:30', '2026-12-15T09:30', '2026-12-29T09:30']
nextOccurrence(standup, '2026-11-18') // '2026-12-01T09:30'
addBusinessTime('2026-11-20T15:00', { hours: 8 }, office) // '2026-11-23T15:00': 8 working hours from Friday 15:00
```

| Area | Functions |
| --- | --- |
| Recurrence | `occurrences`, `occurrencesBetween`, `nextOccurrence`, `previousOccurrence`, `occursOn`, `toInstants` |
| RFC 5545 text | `parseRRule`, `tryParseRRule`, `toRRule`, `describeRule` |
| Business time | `isBusinessDay`, `addBusinessDays`, `businessDaysBetween`, `nextBusinessDay`, `previousBusinessDay`, `addBusinessTime`, `businessTimeBetween`, `isOpen`, `nextOpening`, `nextClosing` |
| Availability | `overlaps`, `intersection`, `mergeIntervals`, `subtractIntervals`, `freeSlots`, `expandEvents` |
| Reactive | `useOccursToday`, `useNextOccurrence` |

Things worth knowing before you rely on it:

- A monthly rule on the 31st **skips** months without one (RFC 5545); `add` clamps. For "the last day" use `monthDays: [-1]`.
- `count` counts the rule's own occurrences: a date in `except` still uses one up.
- No holiday data is shipped: `holidays` is a list of dates or a predicate.
- `freeSlots` starts slots on a grid from the start of each stretch of working time, so booking pages keep offering :00 and :30.

Full guide with recipes, the DST cases, the table of differences from `rrule`, and a "coming from" table: [docs/schedule](https://pyreon.dev/docs/schedule).
