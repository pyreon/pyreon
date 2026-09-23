---
'@pyreon/charts': minor
---

`<OptionChart>`'s value X axis (a scatter's, or a value-axis line's) now ticks as ECharts does, checked against ECharts' SSR output. Zero stays in view unless `scale: true`, the interval is ECharts' `nice(span / splitNumber)`, `min`/`max` (including `'dataMin'`/`'dataMax'`) are read, and labels group thousands. Before, the axis spanned the raw data extent. An inverted axis now keeps its tick step.
