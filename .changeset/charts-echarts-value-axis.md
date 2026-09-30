---
'@pyreon/charts': minor
---

The engine's value axes can tick exactly as ECharts does:

- Zero stays in view unless the axis is scaled.
- The interval is ECharts' `nice(span / splitNumber)`, which also steps by 3 (for example 0, 300, 600).
- A lone minimum or maximum, or the data bound, pins that side, and a pinned bound is a tick of its own.
- Labels group thousands (`1,500`).

`PlotChart`'s ticks are unchanged. The engine gains `ChartSpec.ySplit`, `yZero`, `yMin`, `yMax`, `yMinData`, `yMaxData` and `Domain.step`, and the native engine is regenerated.
