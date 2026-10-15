---
'@pyreon/charts': minor
'@pyreon/mcp': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Marks accept a column. `line(prices)`, `bars(values)` and the other single-channel marks take a `Float64Array` or `number[]` in place of an accessor, and `<PlotChart>`'s `data` is optional when every mark is a column (the chart has one row per index of the longest column). A column resolves with an indexed read rather than a function call per row. Measured against the accessor form: updating a 10k- or 100k-point line is 7–15% faster, and mounting a 100k-point line ties uPlot. A 1M-point mount is not faster, because a column-only chart still allocates one placeholder row per index. New `Column` and `YChannel` types are exported from `@pyreon/charts/engine`. The native lowering does not read columns yet and warns on one.

Faster `<PlotChart>` mounts. A large accessible table (over 200 rows) is now BUILT after the first paint, not only written then, which takes ~1,000 formatted rows out of the first frame. The M4 decimation scan reads the scale and band constants once instead of per point (same arithmetic, bit-identical output; 16–18% faster on V8, 35–40% on JavaScriptCore); the generated Swift and Kotlin engines carry the same change.
