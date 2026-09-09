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

`bollinger` lowers too. It returns an ARRAY of marks, so it arrives as a
spread element rather than a call, and the emitters expand it into the two
Series it names — the envelope as a band (upper in `values`, lower in
`values2`) and its middle line. Its edge arithmetic moved into the crossing
module as `bollingerEdge`, which the web form now calls as well, so the two
cannot drift.

A non-literal window or width still warns by name rather than lowering
something the emit cannot type, as does a spread of anything other than
`bollinger`.
