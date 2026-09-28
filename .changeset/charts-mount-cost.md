---
'@pyreon/charts': patch
---

Faster first paint for `<Chart>` / `<PlotChart>`, from a profile against uPlot and Chart.js:

- Every row went through every mark accessor twice on mount: once for the frame, and again for the canvas's accessible description (26% of mount JS at 1M points, and it ran even with `accessibleTable={false}`). A chart over all its rows now resolves them once and both read the result.
- An accessible table over 200 rows now fills right after the chart's first paint rather than before it. At 1k rows its layout was about 9 ms of a ~10.5 ms first frame. A screen reader reaches the table one frame later; smaller tables still fill at mount, and a server render still ships the table filled.
