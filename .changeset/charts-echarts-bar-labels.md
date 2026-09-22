---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Option bar labels sit and colour themselves as ECharts does. They sit inside the bar by default, and `label.position` (`top`, `bottom`, `left`, `right`, `inside*` and the inside corners) and `distance` are read. An unstyled label takes zrender's automatic fill: light text haloed in the bar's colour inside it, dark text haloed in the background outside. `textBorderColor` and `textBorderWidth` set the halo. Text draw commands gain an optional halo (`stroke` and `strokeWidth`), painted by the web canvas, the SVG export and both native canvases.
