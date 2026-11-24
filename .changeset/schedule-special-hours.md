---
'@pyreon/schedule': minor
---

`BusinessCalendar` gains `specialHours`: opening windows for particular dates (a shortened day before a holiday, a Sunday opening, `[]` to close a date), as a map from date to windows or a function that returns a date's windows (`undefined` for the usual hours). A date's entry replaces its weekday's `hours` and decides the date over `weekend` and `holidays` in every business-day and business-time function (`isBusinessDay`, `addBusinessDays`, `businessDaysBetween`, `nextBusinessDay`, `previousBusinessDay`, `isOpen`, `nextOpening`, `nextClosing`, `addBusinessTime`, `businessTimeBetween`, `freeSlots`). New exported types: `SpecialHours`, `OpeningWindow`.

New `openingWindows(date, calendar)` (and `fp.openingWindows(calendar)(date)`): the times a calendar is open within one date, the same answer `isOpen` gives for every moment of it (the previous night's overnight tail included, a window past midnight ends at `T00:00` of the next day). Business-time functions require weekly `hours`, a `specialHours` map with at least one window, or a `specialHours` function; anything else throws the "no hours" error.
