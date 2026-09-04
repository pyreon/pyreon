---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-kotlin': minor
'@pyreon/charts': patch
---

`@pyreon/charts/plot` family hosts lower to native. `<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>` and `<PolarChart>` — the hosts whose props are plain data — now emit `PyreonChartCanvas` over the generated engine (`renderX(layoutX(...))` with the web host's own box arithmetic), sized by a `GeometryReader` / `BoxWithConstraints` or by `width` / `height`, with `title` as the accessibility label and `data-testid` as the identifier. The accessor-prop hosts (`PlotChart`, `PieChart`, `GaugeChart`, `RadarChart`, `FunnelChart`, `HeatmapChart`, `CandlestickChart`), `CalendarChart` (a record) and `ParallelChart` (mixed rows) warn BY NAME on native instead of naming a view that does not exist. Importing from `@pyreon/charts/plot` no longer raises the package's web-only warning (that rationale is about the ECharts bridge at the root). The Swift/Kotlin stub typecheck links the REAL generated engine when a chart host is present. `PyreonChartCanvas.kt` scales its draw list by the display density so the engine's units read as dp, matching CSS px on the web and points on iOS. README: the native-geometry section names the lowered hosts.
