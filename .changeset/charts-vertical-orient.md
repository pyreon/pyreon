---
'@pyreon/charts': minor
---

`<SankeyChart>`, `<CalendarChart>` and `<ParallelChart>` take `orient="vertical"` (the option facade honours `series.orient`, `calendar.orient` and `parallel.layout` instead of warning): the horizontal layout reflected across the diagonal, on web, iOS and Android. `transposeCmds` / `transposeRect` / `transposePoint` join the engine's RTL mirror as pure draw-list transforms.
