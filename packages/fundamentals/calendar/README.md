# @pyreon/calendar

An event calendar and scheduler for Pyreon, built in slices. This README describes what has landed: the pure core, `@pyreon/calendar/core` (no DOM, no `@pyreon/core`): the event model, recurrence and zones, the window of each view, and the month and time-grid layout algorithms.

> **Experimental.**

```bash
bun add @pyreon/calendar
```

```ts
import { expandOccurrences, layoutDay, visibleRange } from '@pyreon/calendar/core'

const week = visibleRange('week', '2026-11-18')
const occurrences = expandOccurrences(events, week.range, 'Europe/Prague')
for (const date of week.dates) layoutDay(date, occurrences, 'Europe/Prague') // blocks with top, height, column, columns
```

- **Events are plain data.** A date start and end make an all-day event (the end is exclusive: `allDay('2026-11-18')`); a date-time is a wall clock, in the event's own `timeZone` or floating in the display zone; a number is an instant. Recurrence and overrides (moved, retitled, cancelled) go through `@pyreon/schedule`.
- **Layouts are pure functions with stable keys**: month lanes (longer first, a total order, split at week edges with continuation flags, "+N more") and column packing for a time grid (overlapping events share the width and grow into free columns; pinned columns; minimum height; midnight splits).
- **The time grid is a wall-clock grid.** On the day a zone skips an hour, that row is empty; on the day it repeats an hour the second pass is drawn over the first. Block positions and the now line follow the clock.

Full guide: [docs/calendar](https://pyreon.dev/docs/calendar).
