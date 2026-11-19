---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`<Axis x inverse>` for `@pyreon/charts`: reverse the DIRECTION of the x axis (first category, or the smallest x, at the right) without moving the y axis.

Only the picture reverses. Clicks, the tooltip, brush ranges and `onSelect` report data indices, the keyboard walk stays in data order, the accessible table keeps its order, and a zoom window stays in data fractions. Under `rtl` the two cancel (RTL mirrors the plot, `inverse` reverses the direction within it), so the plot reads left to right again. Works on category, numeric and time axes and on horizontal charts; lowers to iOS and Android as a literal `xInverse` field (the engine is handed the rows reversed through the same keep map `maxPoints` uses, so taps map back to data order).

Also fixes the keyboard pick on a thinned (`maxPoints`) chart, which reported the position in the thinned list instead of the datum's row.
