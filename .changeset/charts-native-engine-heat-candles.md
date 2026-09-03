---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Heatmap and candlestick geometry join the generated native chart engine. `buildHeatGrid` / `renderHeat` / `hitHeatCell` and `ohlcExtent` / `renderCandles` / `hitCandle` are bundled into `PyreonChartEngine.swift` / `.kt`. The colour ramp is now a plain function, `rampColor(stops, t)` (new export); `HeatmapOptions.ramp` (a closure) is REPLACED by `stops?: string[]` (default `HEAT_RAMP`), and the closure factory `colorRamp(stops)` moves to `engine/heat-ramp.ts` (still exported from `@pyreon/charts/plot`, built on `rampColor`). `renderCandles`' options parameter is optional instead of defaulting to `{}`; `hitCandle` is now exported from `/plot`.
