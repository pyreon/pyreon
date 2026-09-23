---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Option axes now draw ECharts' `splitArea`: bands between the ticks, the colours cycled from the axis start, one per category on a category axis. A value axis draws `minorTick` and `minorSplitLine`, each interval cut into `minorTick.splitNumber` pieces. Series labels read `label.rotate` (about the anchor, with `offset` turned with it, as zrender does), `offset`, `align` and `verticalAlign`. An ECharts differential holds all of it. All of it crosses to iOS and Android through the engine, and the three axis keys no longer warn there.

The native chart spec printer wrote every array field as numbers, which turned a colour list into `[NaN, NaN]`. It now keeps strings.
