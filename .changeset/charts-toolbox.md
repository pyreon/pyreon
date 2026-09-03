---
'@pyreon/charts': minor
---

Toolbox on `PlotChart` (ECharts' `toolbox`): `saveAsImage` exports the current frame as an SVG through the engine's own serializer (download, or `onSaveImage(svg)` for custom handling), `restore` resets zoom, brush, legend toggles, legend page and any magicType override, and `magicType: ['line', 'bar']` retypes the independent marks (stacked/grouped/points keep their geometry). `toolbox.ts` is a pure layout (`renderToolbox`/`hitToolbox`/`toolboxTools`) with the legend's hit-rect contract.
