---
'@pyreon/charts': minor
---

Linked charts (ECharts `connect`): `createChartLink()` returns a shared `{ zoom, hover }` pair; pass it as `<PlotChart link>` to every chart in a group and wheel-zoom, pan, navigator drags, presets and the crosshair datum stay in sync across all of them. The host exposes `data-pyreon-hover` beside `data-pyreon-zoom`.
