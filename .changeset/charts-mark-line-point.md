---
'@pyreon/charts': minor
---

`markLine` / `markPoint` reach the engine in every ECharts spelling: `median` rules, point-to-point `[from, to]` pairs (statistics, `coord`s or `xAxis` + `yAxis` pairs), `average` points (the datum nearest the mean), category-named `coord`s, `value` labels, per-mark `lineStyle` / `itemStyle` colours and `symbolSize`. The engine's `Annotation` gains a segment form (`x1` / `y1` / `x2` / `y2`) and `PointMarker.at` accepts `'average'`.
