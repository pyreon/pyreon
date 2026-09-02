---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

`<PlotChart showLegend>`'s legend tap toggle and paging lower natively. The toggle rule is now an engine module (`legend-toggle.ts`: `legendToggle` / `hideHiddenSeries` / `legendHitIndex` / `pagerHit`) that the web host consumes — a hidden series keeps its slot, stacked/grouped series are zeroed rather than emptied, exactly as before — and that generates into `PyreonChartEngine.swift/.kt`. On native the hidden set and the legend page are host state; a tap on an entry toggles it, the entries render muted, `legendMaxRows` pages through the pager arrows, and a tap is resolved pager → entry → preset → selection, the web's order. `legendToggle={false}` keeps the legend inert on every target.
