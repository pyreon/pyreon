---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
---

ECharts axes map further. On web and native, an axis `name` becomes its title, `show: false` hides the axis, `yAxis.splitLine.show: false` drops the grid, and `yAxis.type: 'log'` uses the log scale. Natively, `yAxis` may now be an array, whose second entry is the right axis (domain and title), and a series with `yAxisIndex: 1` scales on it. Unmapped per-axis keys and a one-sided `min`/`max` now warn by name instead of being silently ignored.
