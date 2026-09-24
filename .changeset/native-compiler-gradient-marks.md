---
'@pyreon/native-compiler': patch
---

A mark's literal `gradient` option (`stops` + `direction`) lowers to the engine's `SeriesGradient` on Swift and Kotlin for `<PlotChart>` marks.
