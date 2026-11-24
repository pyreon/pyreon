---
'@pyreon/schedule': minor
---

`BusinessCalendar` gains `specialHours`: opening windows for particular dates (a shortened day before a holiday, a Sunday opening, `[]` to close a date), as a map from date to windows or a function that returns a date's windows (`undefined` for the usual hours). A date's entry replaces its weekday's `hours` and decides the date over `weekend` and `holidays` in every business-day and business-time function (`isBusinessDay`, `addBusinessDays`, `businessDaysBetween`, `nextBusinessDay`, `previousBusinessDay`, `isOpen`, `nextOpening`, `nextClosing`, `addBusinessTime`, `businessTimeBetween`, `freeSlots`). New exported types: `SpecialHours`, `OpeningWindow`.
