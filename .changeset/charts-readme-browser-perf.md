---
'@pyreon/charts': patch
---

The README gains a measured browser performance section against uPlot, Chart.js and Recharts (first painted frame and full-data update, 1k to 1M points, plus 1k bars and minimal bundle size). It reports the losses as losses: the default `<PlotChart>` is slower than uPlot and Chart.js on every line cell, mostly because of the default accessible data table on small charts and a second full pass over the rows for the chart description on large ones.
