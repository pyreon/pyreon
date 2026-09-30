---
'@pyreon/charts': minor
---

The engine lays bars out the way ECharts does. A single series leaves ECharts' 31% category gap (was 25%). Grouped series use its `max(35 − 4 × columns, 15)%` category gap and 10% bar gap. `ChartSpec` takes `barWidth`, `barMaxWidth` and `barMinWidth` (pixels or percent), `barGap` (including `'-100%'` overlap) and `barCategoryGap`, and a stack is one column. `barsFor` now returns a stacked or grouped series' own rects, so a tooltip `position` and the focus ring find those bars. The native engine is regenerated.
