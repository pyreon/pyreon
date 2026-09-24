---
'@pyreon/charts': patch
---

`<Chart>` (formerly `<Plot>`) no longer bundles the pie, funnel, heatmap and candlestick renderers when you don't use them. Each family mark (`<Arc>`, `<Stage>`, `<Cell>`, `<Candle>`) now carries its own host component, so importing `Chart` and `Line` costs 47.8 KB gzipped instead of 65.9 KB, 27% less. A pie through `<Arc>` no longer includes the other three families either. An import budget in CI locks this in.
