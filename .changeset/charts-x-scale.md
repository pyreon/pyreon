---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Non-linear axes for `@pyreon/charts`: scale descriptors `sqrt()`, `symlog({ constant })` and `log()`, imported bindings accepted by `<Scale y|x>` and `<Axis y|x scale>` (a numeric `xValue` x axis takes a descriptor; `yScale="log"` stays a string for the value axis). A chart that never imports one bundles none of the scale code.

Each scale is a view of the data: the geometry stays linear over transformed values, ticks are nice in the real values (decades with 1-2-5 minors for log, the ordinary nice values for sqrt, zero and decades either side for symlog) and labelled with them. A value a scale cannot place (log: not above zero, sqrt: below zero) is a gap, never a NaN pixel; symlog places everything (`sign(v) * log10(1 + |v|)`). The tooltip, the table and the labels keep the real values, a time axis stays linear, and the spoken description names a non-linear scale. On iOS and Android the compiler recognises the imported descriptor with its literal `constant` (a non-literal one warns by name) and builds the engine's own view (the transform and ticks are the generated engine's); the native spoken description names the scale too.

Also fixes the nearest-point hit (tooltip, crosshair) on a numeric x axis, which found the nearest EVENLY SPACED slot instead of the nearest drawn point.
