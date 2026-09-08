---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`sma`, `ema` and `trend` lower to iOS and Android

The indicator arithmetic moves to `indicator-values.ts`, which joins
`ENGINE_FILES`, so `smaValues` / `emaValues` / `stdevValues` / `trendValues`
cross to Swift and Kotlin. The emitters then recognise the marks the way they
already recognise `bubble` → `bubbleRadii`: map the rows, hand them to the
named engine function.

The generic mark constructors stay web-only — PMTC cannot represent a type
parameter, and the generator refuses an emit with warnings, so one generic
function in the file would take the whole thing with it. That is why the split
exists, and it mirrors `boxplot.ts` / `boxplot-chart.ts`.

`bollinger` still warns by name: it returns an ARRAY of marks to spread, which
is a different shape from a mark call, and lowering it to a single line would
be a wrong answer rather than a missing one. A non-literal window warns too,
naming the limit rather than lowering a window the emit cannot type.
