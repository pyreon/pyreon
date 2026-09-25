---
'@pyreon/charts': patch
---

The README gains a measured browser performance section against uPlot, Chart.js and Recharts (first painted frame and full-data update, 1k to 1M points, plus 1k bars and minimal bundle size), re-measured after the mount-cost, table-update and M4-from-values fixes. It reports the losses as losses: the default `<PlotChart>` is still slower than uPlot on every line mount and than Chart.js from 100k points up. It states that a large accessible table is written after the measured frame on both mount and update, so that cost moved rather than disappeared. It also states that the 1M and 100k cells are JIT-tier sensitive.
