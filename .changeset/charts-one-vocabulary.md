---
'@pyreon/charts': minor
---

**Breaking:** `<Chart>` has one selection callback, `<Tip>` is `<Tooltip>`, and the pie, funnel, heatmap and candlestick are marks.

- `<Chart onSelect={(i) => …}>` receives the index of the drawn item on the web, iOS and Android: the row for the cartesian marks, `<Arc>`, `<Stage>` and `<Candle>`, and the cell for `<Cell>`. `<Chart onSelectIndex>` is removed. Over `<Cell>`, `onSelect` used to receive the heatmap host's cell object on the web and could not lower on native; it is now the cell index everywhere.
- `<Tip>` is renamed `<Tooltip>` (`TipProps` → `TooltipProps`).
- `PieChart`, `FunnelChart`, `HeatmapChart` and `CandlestickChart` leave the main entry for `@pyreon/charts/engine`. Write `<Chart data><Arc value label /></Chart>`, `<Stage>`, `<Cell>` or `<Candle>` instead. The family components with no row-per-datum shape (gauge, radar, treemap, sankey, …) stay in the main entry.
