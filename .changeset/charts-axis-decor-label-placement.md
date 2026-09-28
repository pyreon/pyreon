---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

The engine's value and category axes draw split areas (`ChartSpec.ySplitArea`: bands between the ticks, the colours cycled from the axis start, one per category on a category axis), and a value axis draws minor ticks and minor split lines, each interval cut into a set number of pieces. Series labels take a rotation (about the anchor, with the offset turned with it, as zrender does), an offset, `align` and `verticalAlign`. All of it crosses to iOS and Android through the generated engine.

The native chart spec printer wrote every array field as numbers, which turned a colour list into `[NaN, NaN]`. It now keeps strings.
