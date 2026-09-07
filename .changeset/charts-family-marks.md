---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

The grammar covers the row-array families. `<Plot>` takes four family marks — `<Arc value label color? innerRadius?>` (pie / donut), `<Stage value label color? sort? gap? …>` (funnel), `<Cell x y value colors? gap?>` (heatmap) and `<Candle open high low close upColor? downColor? widthRatio?>` (candlestick, the plot's `x` channel labels each period) — and renders that family's host instead of the cartesian plot, channels as accessors, the mark's options where the host keeps them; `<Tip>`, `<Legend>` and `<Axis y format>` still apply. One family per plot: a second family mark, or a cartesian mark beside one, is reported and ignored. Two more cartesian children: `<Label text at series color radius>` declares the engine's datum-anchored point markers (`at="max"` / `"min"` / an index) and `<Rule x>` a vertical reference line. On native the compiler desugars a family plot to the host it names, byte-identical to writing that host directly, so the accessor inlining, the chrome, the tap and the entrance are inherited. `Label`, not `Text`: `<Text>` is the canonical primitive and the native compiler dispatches on the tag name.
