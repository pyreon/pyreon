---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`xAxis.inverse: true` runs the x axis right to left, on web and native. Category charts reverse every per-datum channel together, and hits still report the original datum index. A continuous x axis inverts through its domain.
