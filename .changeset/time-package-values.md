---
"@pyreon/time": minor
---

New package `@pyreon/time` (Experimental): dates and times as plain strings and numbers.

- **Values:** `PlainDate` (`"2026-11-18"`), `PlainYearMonth`, `PlainTime`, `PlainDateTime` and `Instant` (epoch milliseconds), with strict guards (`isPlainDate("2026-02-30")` is false) and `parseInstant` for timestamps that name an offset. Literals type-check without casts and polymorphic functions return the input's shape.
- **Arithmetic:** `add`, `subtract` (month and year addition clamps the day), `diff`, `between`, `startOf`, `endOf`, `compare`, `min`, `max`, `clamp`, `eachDay`, `monthGrid`, ISO weeks, `weekStartOf` and `weekendOf`. Proleptic Gregorian integer math with no `Date` object on the path.
- **Zones:** `toInstant` with Temporal's four disambiguation modes for DST gaps and overlaps, `toPlainDateTime`, `offsetAt`, `addInstant`, `isTimeZone`, from `Intl` with one cached formatter per zone and bounded caches.
- **Entries:** `@pyreon/time/core` (no dependencies), `@pyreon/time` (re-exports core and adds `setClock`, `now`, `today` and clock-reading day helpers) and `@pyreon/time/fp` (the value-last form of every operation plus `pipe`; `inZone(zone)` in core binds the zone functions). Clocks and the active time zone follow in later releases.
- **Robust input:** one rule, fuzzed: bad data returns the value, a guard's `false` or a parser's `null`, or throws a `[Pyreon]` error that says how to fix it. Fractional days to seconds balance down, `parseISO` and `parseInstant(text, { lenient: true })` read messy input, and `isToday` and `isSame(a, b, 'day', { zone })` answer in calendar days.
- Verified with seeded differential tests against `Temporal` and a hand-verified DST table that also runs in real Chromium.
