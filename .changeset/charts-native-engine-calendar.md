---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Calendar geometry joins the generated native chart engine. `layoutCalendar` / `renderCalendar` / `calendarDomain` / `hitCalendarIndex` are rewritten Date-free (proleptic-Gregorian civil arithmetic in exact Doubles: `daysFromCivil`, `civilFromDays`, `weekdayOfDays`, `parseIsoDays`, `formatIsoDays` — all new exports) and bundled into `PyreonChartEngine.swift` / `.kt`. BREAKING for direct engine callers: `calendarDomain` and `renderCalendar` take a `CalendarValue[]` (`{ date, value }`) instead of a record — wrap a record with the new `calendarValues(record)`; `calendarDomain` returns a `Domain` (`{ min, max }`) and `CalendarOptions.domain` is a `Domain`, not a tuple; `CalendarLayout` gains `startDay` / `days`. `parseIsoDate` / `formatIsoDate` (epoch ms) and the nullable `hitCalendar` move to `engine/calendar-web.ts`, `calendarToSvg` to `family-svg.ts` — the `@pyreon/charts/plot` re-exports and `<CalendarChart values={record}>` are unchanged.
