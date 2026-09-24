---
'@pyreon/charts': minor
---

The engine's `ChartSpec` gains an optional `drawOrder` (ECharts' `zlevel` / `z`): a series with a higher order paints over a lower one, while the legend, palette and hit test keep series order. The native engine is regenerated to paint by it.
