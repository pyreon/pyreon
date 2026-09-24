---
'@pyreon/charts': patch
---

`<Plot>` no longer bundles the pie, funnel, heatmap and candlestick renderers when you don't use them. Each family mark (`<Arc>`, `<Stage>`, `<Cell>`, `<Candle>`) now carries its own host component, so importing `Plot` and `Line` costs 49.3 KB gzipped instead of 65.9 KB, 25% less. A pie through `<Arc>` no longer includes the other three families either. An import budget in CI locks this in.
