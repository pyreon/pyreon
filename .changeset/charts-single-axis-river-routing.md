---
'@pyreon/charts': patch
---

A theme river declared with `coordinateSystem: 'singleAxis'` (ECharts' required spelling) renders as a theme river instead of being skipped as an unsupported single-axis series; the single-axis warning names ECharts' own contract (scatter / effectScatter only).
