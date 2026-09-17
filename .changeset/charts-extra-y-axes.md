---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

A third and later y axis (`yAxis[2]`, `yAxis[3]`, …) is now drawn on web and native, on its `position` side at its `offset`, with its own domain, tick labels and title. A series with `yAxisIndex: 2` or higher scales on it. A `yAxisIndex` that names no declared axis warns by name.
