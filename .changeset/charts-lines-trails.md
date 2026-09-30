---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

ECharts `lines` series are now an engine feature, and their animated `effect` trail works. The head travels each line once per `period`, trailing `trailLength` of it in `effect.color`, driven by a frame clock in the web canvas host and in new `PyreonChartClock` native views. Under reduced motion the clock holds at 0 and the chart is still.
