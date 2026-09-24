---
'@pyreon/charts': minor
---

A value X axis (a scatter's, or a value-axis line's) now ticks as ECharts does. Zero stays in view unless scaled, the interval is ECharts' `nice(span / splitNumber)`, a minimum and maximum (including the data bounds) pin their side, and labels group thousands. Before, the axis spanned the raw data extent. An inverted axis now keeps its tick step. `ChartSpec` gains the x counterparts of the y-axis tick settings.
