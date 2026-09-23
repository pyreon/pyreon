---
'@pyreon/charts': minor
---

`<OptionChart>` honours ECharts' `zlevel` and `z` on series. A cartesian series with a higher `zlevel`, then `z`, now paints over a lower one; the legend, palette and hit test keep series order. Family layers stack among themselves the same way. The engine's `ChartSpec` gains an optional `drawOrder`, and the native engine is regenerated to paint by it.
