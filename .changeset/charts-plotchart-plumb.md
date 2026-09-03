---
'@pyreon/charts': minor
---

`PlotChart` gains the props the engine waves prepared: `y2Domain`/`y2Format` (right axis for marks with `axis: 'right'`; the crosshair places right-axis markers on their own domain), `markers` (datum-anchored point markers), `legendMaxRows` (paged legend with clickable prev/next arrows), `showTitle`/`subtitle` (a heading block that consumes height above the legend), and `tooltipFormatter` (replace the tooltip text from the resolved content). Also a correctness fix: pointer handlers now hit-test in PLOT space — the plot is drawn shifted below the title/legend, and hit rects were computed against the unshifted full-height layout, so with a legend shown a click just above a short bar reported a hit and a click inside a tall bar's upper part could miss.
