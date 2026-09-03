---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

The candlestick and heatmap frames move into the engine — `candlestickFrame` / `renderCandlestickChart` / `hitCandlestickChart` and `heatGridFrom` / `heatPlotFor` / `renderHeatChart` / `hitHeatChart` (exported from `@pyreon/charts/plot`) — so the web hosts and the native canvas paint the SAME command list; both modules cross into the generated native engine. The native runtimes gain `pyreonChartMeasure` (UIKit / `Paint` text width in engine units), the measurer a laid-out frame needs. `<CandlestickChart>`, `<HeatmapChart>` and `<RadarChart>` lower to native (accessor bodies inlined; a `theme` override, a cell-shaped heatmap `onSelect` and `showLegend` warn by name).
