---
'@pyreon/charts': minor
---

Line and area points on a category axis now sit at their band centres, under their category labels and over any bar in the same band, as ECharts draws them (its default `boundaryGap: true`). Before, the points ran edge to edge while the labels sat at band centres, so every category line chart drew its first point half a band left of its label; this applies to `PlotChart` and `<OptionChart>` alike. `xAxis.boundaryGap: false` gives the edge-to-edge layout, with the labels moved onto the points. A chart with bars keeps its bands. `markLine` and `markArea` now take a category name for `xAxis`, as ECharts does, and land on the same band positions. The native engine is regenerated with the same geometry.
