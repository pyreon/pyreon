---
'@pyreon/charts': minor
---

Family option charts honour ECharts' `colorBy` and `universalTransition`. Pie, funnel, radar, chord and theme river colour each datum from the palette by default; `colorBy: 'series'` makes them one series colour. A graph's uncategorised nodes now take the series colour by default, as in ECharts, and `colorBy: 'data'` colours them per node. A family series' `universalTransition` now lets its host morph an update that changes the item count. Before, it was dropped, and a slice-count change snapped.
