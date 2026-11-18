---
"@pyreon/format": minor
"@pyreon/ambient": minor
---

`@pyreon/format` now sits on `@pyreon/ambient`, and gains relative time that updates itself.

- **One locale, one zone, one clock.** `locale`, `setLocale`, `provideLocale`, `timeZone`, `setTimeZone` and `provideTimeZone` are re-exported from `@pyreon/ambient` (a regular dependency of the reactive entry; `@pyreon/format/core` stays dependency-free), so an app with `@pyreon/format`, `@pyreon/time` and `@pyreon/ambient` has one locale, one time zone and one clock. Behaviour is unchanged.
- **`useRelativeTime(target, options?)` and `<RelativeTime>`:** a relative label that keeps itself current. It updates at the moment the text changes (each second under a minute, at the target's own minute and hour marks, at local midnight once it counts days), every label on a page shares two timers, a server render starts none and hydrates without a mismatch with the clock hand-over, and `threshold: { after: { days: 7 }, as: 'medium' }` switches to an absolute date. `<RelativeTime>` renders `<time datetime title>` with the exact time on hover.
- **`relativeFormatter` without a `base`** reads the ambient clock in the reactive entry (a plain `now()` per call); `@pyreon/format/core` still requires a base.
- **A date-only target is that day in the display zone** in relative time (`formatRelativeTo`): at 10:00 in Tokyo, `2026-11-18` is "10 hours ago" instead of "1 hour ago", and from midnight on the 19th in Kiritimati it is "yesterday" instead of "10 hours ago". `@pyreon/time`'s `relativeDistance` gives the same words; both packages test one shared table.
- **`@pyreon/ambient`:** `useNow({ every })` accepts a function returning `{ at: instant }` for one update at an exact instant, then reads the function again. Readers that each want their own instant share ONE timer. A function `every` is also read again after every update of the ticker the reader holds. `_resetLocaleState` also forgets printed warnings.
- Fix: `relativeFormatter({ style })` (and `formatRelative`/`formatRelativeTo` options with only `style`) kept `numeric: 'always'` instead of the `auto` default.
