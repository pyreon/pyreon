---
"@pyreon/calendar": minor
---

New package `@pyreon/calendar` (Experimental), first slice: the pure core, `@pyreon/calendar/core`.

- **Event model:** a date is an all-day event, a date-time is a wall clock (in the event's own `timeZone`, or floating in the display zone), a number is an instant; the end is exclusive (`allDay(date, days?)`); malformed events throw a `[Pyreon] calendar:` error that names them.
- **`expandOccurrences`:** single and recurring events (with overrides and cancellations through `@pyreon/schedule`) over a window of dates in the display zone, with keys that are the same in every window; an all-day event never moves with the zone.
- **Views:** `visibleRange` (month with leading and trailing days, week and work week on any `weekStart`, day, `days(n)`, agenda, year, hidden weekdays), `navigate`, and `viewTitle` through a formatter callback.
- **Layouts as pure functions with stable keys:** month lanes (`layoutRow`, `layoutMonth`: longer events first in a total order, split at week edges with continuation flags, "+N more" per day) and time-grid column packing (`packColumns`, `layoutDay`, `layoutTimeGrid`: overlapping events share the width and grow into free columns, pinned columns, minimum height, midnight splits, `dayStart` and `dayEnd`, per-day signatures for memoisation).
- **A wall-clock time grid** with defined behaviour on the 23 and 25 hour days, and a correct now line (`nowOffset`).
