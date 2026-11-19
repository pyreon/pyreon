---
"@pyreon/schedule": minor
---

New package `@pyreon/schedule` (Experimental): recurrence, business time and availability as plain data, on top of `@pyreon/time`.

- **Recurrence:** a `Recurrence` is plain data that follows RFC 5545 (`every`, `interval`, `on` with `weekdays` / `monthDays` / `months` / `yearDays` / `weeks` / `hours` / `minutes` / `position`, `start`, `until`, `count`, `weekStart`, `except`, `also`, `timeZone`). `occurrences` is a lazy generator; `occurrencesBetween`, `nextOccurrence`, `previousOccurrence` and `occursOn` jump to the period you ask for instead of stepping, so the next occurrence of a ten-year-old rule costs the same as a new one. Occurrences are wall-clock times: a daily 09:00 stays 09:00 across DST, and `toInstants` resolves gaps and overlaps with `disambiguation`. A monthly rule on the 31st skips months without one (RFC 5545), unlike `add`, which clamps.
- **RFC 5545 text:** `parseRRule` / `tryParseRRule` read a bare rule or a `DTSTART` / `RRULE` / `EXDATE` / `RDATE` block (errors give the position); `toRRule` writes one back; `describeRule` turns a rule into words (English built in, `Intl` names for any locale, translatable `messages`).
- **Business time:** `isBusinessDay`, `addBusinessDays`, `businessDaysBetween`, `nextBusinessDay`, `previousBusinessDay`, `addBusinessTime` ("8 working hours from Friday 15:00"), `businessTimeBetween`, `isOpen`, `nextOpening`, `nextClosing`. Holidays are a list or a predicate (no holiday data is shipped); split and overnight shifts work.
- **Availability:** `overlaps`, `intersection`, `mergeIntervals`, `subtractIntervals`, `freeSlots` (grid of slots around busy time, with buffers) and `expandEvents` (single and recurring events for a calendar view, with stable keys and per-instance overrides).
- **Entries:** `@pyreon/schedule/core` (needs only `@pyreon/time`), `@pyreon/schedule` (adds `useOccursToday` and `useNextOccurrence`) and `@pyreon/schedule/fp` (value-last forms).
