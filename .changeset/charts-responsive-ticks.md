---
'@pyreon/charts': minor
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Axis tick density now follows the chart's size: about one value tick per 40px of plot height (per 80px of width for a horizontal chart's value axis and for a numeric x axis), between 2 and 10. A phone-width chart no longer crowds six labels into 120px, and a tall dashboard chart is no longer left with five. The value domain is rounded to the same step, so the top of the axis is always a labelled tick. Charts whose size differs from the old five-tick sweet spot will show a different number of ticks.

`<Axis y ticks={n} />` and `<Axis x ticks={n} />` pin the target (`yTicks` / `xTicks` on the spec). Both lower to iOS and Android.
