---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Geo lines animate their `effect` trail on web and native. An ECharts `lines` series on a geo carries its trail (`period`, `trailLength`, `color`, `symbolSize`), and `<MapChart trail>` runs it along `paths` on the same frame clock as cartesian lines: the web canvas host's clock, or `PyreonChartClock` on native. Under reduced motion the trail holds still.
