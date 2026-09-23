---
'@pyreon/charts': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Charts: a 100,000-point line mounts ~9× faster in real Chromium (~320ms → ~36ms), measured head-to-head against ECharts 6 in `examples/benchmark` (`bun run bench:charts`). The layout measured every category label with `measureText`; it now samples them the way ECharts' `calculateCategoryInterval` does (every `floor(n/40)`-th label past 40). The label step is no longer capped at 200, which drew ~500 overlapping labels on a 100,000-category axis. The accessible table formats only the rows it shows (`chartTable` takes a `limit` and reports `total`) and updates its cells in place instead of remounting 1,000 rows per draw. The y extent is streamed instead of copied twice per resolve, and the accessibility input reuses the drawn layout instead of laying the chart out a second time.
