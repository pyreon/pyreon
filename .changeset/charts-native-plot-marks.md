---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

`<PlotChart marks>` — the cartesian family — lowers to native. Each inline mark call (`bars` / `stackedBars` / `groupedBars` / `line` / `area` / `points`, literal options) becomes a `Series` over its inlined accessor, the `ChartSpec` is built inline and `renderChart` paints it; `onSelect` taps the new engine `plotHitBars`, which the web host's click now uses too (`plotHitIndex` for its tooltip), exported from `@pyreon/charts/plot` and crossing into the native engine. A `bubble` mark, a `curve` option, the legend / title / zoom / brush / navigator surfaces, formatters and a `theme` override warn by name.
