---
"@pyreon/time": minor
---

New package `@pyreon/time` (Experimental): dates and times as plain strings and numbers.

- **Values:** `PlainDate` (`"2026-11-18"`), `PlainYearMonth`, `PlainTime`, `PlainDateTime` and `Instant` (epoch milliseconds), with strict guards (`isPlainDate("2026-02-30")` is false) and `parseInstant` for timestamps that name an offset. Literals type-check without casts and polymorphic functions return the input's shape.
- **Arithmetic:** `add`, `subtract` (month and year addition clamps the day), `diff`, `between`, `startOf`, `endOf`, `compare`, `min`, `max`, `clamp`, `eachDay`, `monthGrid`, ISO weeks, `weekStartOf` and `weekendOf`. Proleptic Gregorian integer math with no `Date` object on the path.
- **Zones:** `toInstant` with Temporal's four disambiguation modes for DST gaps and overlaps, `toPlainDateTime`, `offsetAt`, `addInstant`, `isTimeZone`, from `Intl` with one cached formatter per zone and bounded caches.
- **Entries:** `@pyreon/time/core` (no dependencies) and `@pyreon/time` (re-exports core and adds `setClock`, `now`, `today`). Clocks and the active time zone follow in later releases.
- Verified with seeded differential tests against `Temporal` and a hand-verified DST table that also runs in real Chromium.
