---
'@pyreon/charts': minor
---

`<OptionChart>`'s value axes now tick exactly as ECharts does, checked against ECharts' own SSR output by a new differential test. The changes:

- Zero stays in view unless `yAxis.scale: true`; before, a line chart's axis was fitted to the data.
- The interval is ECharts' `nice(span / splitNumber)`, which also steps by 3 (for example 0, 300, 600 where the facade drew 0, 500, 1000).
- `splitNumber` is read.
- A lone `min` or `max`, or `'dataMin'` / `'dataMax'`, pins that side, and a pinned bound is a tick of its own.
- Default labels group thousands (`1,500`).

`PlotChart`'s ticks are unchanged. The engine gains `ChartSpec.ySplit`, `yZero`, `yMin`, `yMax`, `yMinData`, `yMaxData` and `Domain.step`, and the native engine is regenerated.
