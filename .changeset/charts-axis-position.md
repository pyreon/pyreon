---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Axis `position` maps on web and native: `xAxis.position: 'top'` draws the x axis above the plot, a lone `yAxis.position: 'right'` draws the value axis on the right, and two y axes whose first is placed right swap sides with `yAxisIndex` following. Two y axes placed on the same side warn by name.
