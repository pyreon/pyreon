---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Numbers read as ECharts shows them: axis ticks, tooltips, the spoken description and the accessible table now group thousands by default (`60,000`, not `60000`), matching ECharts' `addCommas`. `currency('$')` groups too (`$60,000`). Series value labels are unchanged, since ECharts' `{c}` shows the raw value, and an explicit `format` still wins everywhere.

A `<Band>`, and the envelope of `<Bollinger>`, now fills translucently by default (opacity 0.3, as `<Area>` does) instead of opaquely in the palette colour, which hid the lines drawn over it. `areaOpacity` sets it.

The generated Swift and Kotlin chart engines are regenerated, so iOS and Android show the same numbers.
