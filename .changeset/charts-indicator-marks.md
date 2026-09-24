---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/compiler': patch
---

The technical indicators are now `<Chart>` marks: `<Sma y window>`, `<Ema y window>`, `<Trend y>` and `<Bollinger y window k>` (a filled envelope `k` standard deviations wide, 2 by default, plus its middle line). They draw exactly what the array form's `sma`, `ema`, `trend` and `...bollinger` factories draw. Under a `color` pivot each series gets its own indicator over its own column. A mark with no `window` is skipped with a dev warning.

Each indicator component carries its own factory, so a `<Chart>` without one does not bundle the indicator arithmetic. The resolver code shared by all indicators adds about 0.2 KB gzipped to `<Chart>` + `<Line>` (43.9 KB to 44.1 KB).

On iOS and Android the compiler desugars the tags to the same `sma` / `ema` / `trend` / `...bollinger` calls, and the emit is byte-identical to the array form when `window` and `k` are numeric literals. The charts import migration lists the new names.
