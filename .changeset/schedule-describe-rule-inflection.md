---
'@pyreon/schedule': minor
---

`describeRule` takes inflected names and follows the locale's hour cycle. `messages.weekdays`, `messages.nthWeekdays` and `messages.months` give the weekday and month names in the form a language needs after a preposition (Czech `ve středu`, not `ve středa`); without them the names are still `Intl`'s. The n-th weekdays ("the last Friday") get their own `messages.onNthWeekdays` phrase (default: `onWeekdays`), because the preposition can differ (Czech `ve středu` but `v poslední pátek`). Times are written with `Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })`, so `en-US` reads `7:00 PM` (previously always `19:00`); without a `locale` they stay `HH:mm`, and the new `formatTime` option replaces them. Fixes #4845.
