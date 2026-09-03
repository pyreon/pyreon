---
'@pyreon/charts': minor
---

Calendar family: `layoutCalendar` (a day-per-cell grid over an ISO date range — weekday rows with `firstDay` rotation, week columns, month labels at each month's first column, alternating weekday labels, fit-to-box or fixed `cellSize`; strict ISO parsing that rejects impossible dates), `renderCalendar` (values through the shared heat ramp with a data or fixed `domain`, `emptyColor` for days without data, week-by-week entrance), `hitCalendar`, `<CalendarChart>` (reactive canvas host, `onSelect(cell)`, accessible table), `calendarToSvg` (server-safe), and the option facade maps a `heatmap` series on `coordinateSystem: 'calendar'` (`calendar.range` as year / `YYYY-MM` / date / `[start, end]`, `cellSize`, `dayLabel.firstDay`, `dayLabel.show`, `monthLabel.show`, `visualMap` colours + min/max; `orient: 'vertical'` warns; a malformed datum warns by index). Conformance corpus 23 → 24, floor 21 → 22.
