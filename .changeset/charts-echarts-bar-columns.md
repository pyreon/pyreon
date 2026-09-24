---
'@pyreon/charts': minor
---

`<OptionChart>` lays bars out the way ECharts does, checked against ECharts' own SSR output. A single series now leaves ECharts' 31% category gap (was 25%). Grouped series use its `max(35 − 4 × columns, 15)%` category gap and 10% bar gap. `barWidth`, `barMaxWidth` and `barMinWidth` (pixels or percent), `barGap` (including `'-100%'` overlap) and `barCategoryGap` are now honoured, and a stack is one column. `barsFor` now returns a stacked or grouped series' own rects, so a tooltip `position` and the focus ring find those bars. The native engine is regenerated.
