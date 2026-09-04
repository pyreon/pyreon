---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

`<PlotChart brush onBrush>` lowers natively — the last gesture surface. `brush.ts` is now a crossing engine module (`brushRange`: a pixel span → a GLOBAL inclusive datum range under the window; `brushBand`: where a committed range sits on the plot through the window; `renderBrushBand`: the translucent band with dashed edges) that the web host consumes unchanged and that generates into `PyreonChartEngine.swift/.kt`. On iOS and Android a plain drag on the plot selects (the web's rule without `dataZoom`), the band is drawn inside the chrome wrap, a plain tap clears the selection, and a NAMED `onBrush` handler receives `BrushRange | null`. With `dataZoom` on, the web brushes on Shift+drag, which touch does not have, so that one combination stays web-only and warns by name; an inline `onBrush` arrow warns by name too (the brush still selects). `@pyreon/charts/plot` also exports `brushBand`, `renderBrushBand` and the `BrushRange` / `BrushBand` types.
