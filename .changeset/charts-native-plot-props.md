---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

The remaining `<PlotChart>` inputs lower to native: a literal `theme={{ … }}` merges over the default theme (Candlestick and Heatmap hosts too); `format` / `xFormat` / `y2Format` lower as the engine's formatter by name (`compact`), a factory call (`fixed(1)`, `currency`, `percent`) or a closure; a `bubble` mark carries area-mapped radii through the new engine `bubbleRadii` (which `resolveMarks` now uses on the web). What still warns by name on native: `dataZoom`, `brush`, `navigator`, `zoomPresets`.
