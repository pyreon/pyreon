---
'@pyreon/charts': minor
---

dataZoom + brush on `PlotChart` (ECharts' inside dataZoom + brush select). `dataZoom` adds wheel-zoom that keeps the datum under the cursor fixed, drag-pan by plot-widths, and double-click reset; `brush` adds drag-selection reporting a GLOBAL inclusive datum range through `onBrush` (Shift+drag when both gestures are on), with a persistent highlight band cleared by the next click (`onBrush(null)`). The window is a fraction pair over the data (`zoom.ts` — pure, host-agnostic math: `zoomWindow`/`panWindow`/`sliceRange`/`brushRange`), and the host slices rows through it, so geometry, hit-testing, tooltips and the accessible table stay correct with zero engine awareness. Accessors and callbacks always see GLOBAL indices — a zoom never renumbers your data. The wheel is captured (preventDefault) over a zoomable plot; drags suppress the click so panning never fires `onSelect`.
