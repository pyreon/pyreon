---
"@pyreon/charts": minor
---

The finance family joins the interaction contract: `CandlestickChart` gains `onSelect` (candle index; the full column is the hit target, because a wick is one pixel wide) and an OHLC `tooltip`; `HeatmapChart` gains `onSelect` (the tapped CELL — categories plus aggregated value, null for a miss, and an undrawn cell IS a miss because absence is not selectable) and a cell `tooltip`. New pure hit helpers `hitCandle` and `hitHeatCell` ship from the engine, so the same geometry answers native hosts.
