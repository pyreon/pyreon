---
'@pyreon/charts': minor
'@pyreon/mcp': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Marks accept a column. `line(prices)`, `bars(values)` and the other single-channel marks take a `Float64Array` or `number[]` in place of an accessor, and `<PlotChart>`'s `data` is optional when every mark is a column (the chart has one row per index of the longest column). A column resolves with an indexed read rather than a function call per row, and a plain `number[]` of the chart's length whose entries are all numbers or `NaN` is used as the series without a copy (a typed array, a short array or one holding an infinity is copied once). Against uPlot 1.6 with the same `number[]` input, a 1M-point line now mounts in a statistical tie (14.9ms each, from 22.8ms), a 10k-point line is 1.14× behind (was 1.35×), and updates are 2–2.5× faster. New `Column` and `YChannel` types are exported from `@pyreon/charts/engine`. The native lowering does not read columns yet and warns on one.

Faster `<PlotChart>` mounts. For a chart over 200 rows, both the accessible table and the canvas's spoken description (`aria-label`) are now BUILT after the first paint rather than before it; the canvas carries its title until then, and a server render still describes in full. The y-extent scan runs as a seed pass plus a bare min/max loop (V8 1.48 → 0.53ms over 1M values). The M4 decimation scan reads the scale and band constants once instead of per point (same arithmetic, bit-identical output; 16–18% faster on V8, 35–40% on JavaScriptCore). The generated Swift and Kotlin engines carry both engine changes. Measured on a 1M-point line mount: 22.8ms → 19.6ms.
