---
'@pyreon/charts': minor
---

`<PlotChart>` events: `onClick`, `onDoubleClick`, `onContextMenu` (the datum under the pointer, -1 for a miss, independent of `selectedMode`) and `onRendered` (after each paint); the handle's `dispatch` accepts `showTip` / `hideTip` / `legendAllSelect` / `legendInverseSelect`, and the handle tracks the bound chart's `seriesCount`. The native compiler names the four new events as web-only.
