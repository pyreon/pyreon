---
'@pyreon/charts': minor
---

Dual y-axes at the engine level. A mark opts in with `axis: 'right'` (`MarkOptions.axis`, carried onto `Series.axis`); the right domain derives from right-axis series or pins via `ChartSpec.y2Domain`/`ChartToSvgOptions.y2Domain`, with its own `y2Format`. The right gutter is measured from the y2 tick labels exactly like the left one, the right axis line + `start`-aligned labels render when a right series exists, and each independent series scales against ITS axis. Three deliberate pins, none silent: stacked/grouped stay left (one stack, one scale), horizontal frames stay single-axis, and a chart whose EVERY series is right falls back to left. `chartToSvg` carries the options, so dual-axis charts work server-side today; the `PlotChart` prop plumb follows once the interaction wave lands.
