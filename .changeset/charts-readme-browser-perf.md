---
'@pyreon/charts': patch
---

The README gains a measured browser performance section against uPlot, Chart.js and Recharts (first painted frame and full-data update, 1k to 1M points, plus 1k bars and minimal bundle size), re-measured after the mount-cost fixes. It reports the losses as losses: the default `<PlotChart>` is still slower than uPlot on every line cell and than Chart.js from 100k points and on updates, and it states that the deferred accessible-table fill happens after the measured first frame, so its cost moved rather than disappeared.
