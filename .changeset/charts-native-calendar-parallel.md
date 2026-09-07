---
'@pyreon/native-compiler': minor
---

`<CalendarChart>` and `<ParallelChart>` lower natively. Their web props have no native form — a `values` record, rows mixing strings and nulls — so the host spec gained per-prop literal adapters: `values={{ '2026-01-05': 3 }}` becomes `[CalendarValue(date:value:)]`, `rows={[['4', 30], ['8', null]]}` becomes `[[Double]]` with a category resolved to its index through the `axes` literal and every gap a NaN — exactly what the web's `calendarValues` / `parallelRows` compute at runtime. A non-literal record, a category cell without an inline `axes` literal, or an unlowerable cell warns by name and emits nothing; `rowColor` warns by name and the chart renders without it. `UNLOWERED_CHART_HOSTS` is down to the ECharts option facade.
