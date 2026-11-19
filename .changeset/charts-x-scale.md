---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Non-linear axes for `@pyreon/charts`: `sqrt` and `symlog` on y, and `log`, `sqrt` and `symlog` on a numeric (`xValue`) x axis, through `yScale` / `xScale`, `<Axis y|x scale>` and `<Scale y|x>`.

Each scale is a view of the data: the geometry stays linear over transformed values, ticks are nice in the real values (decades with 1-2-5 minors for log, the ordinary nice values for sqrt, zero and decades either side for symlog) and labelled with them. A value a scale cannot place (log: not above zero, sqrt: below zero) is a gap, never a NaN pixel; symlog places everything (`sign(v) * log10(1 + |v|)`). The tooltip, the table and the labels keep the real values, a time axis stays linear, and the spoken description names a non-linear scale. They lower to iOS and Android as literals (the transform and ticks are the generated engine's).

Also fixes the nearest-point hit (tooltip, crosshair) on a numeric x axis, which found the nearest EVENLY SPACED slot instead of the nearest drawn point.
