---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Bar labels sit and colour themselves as ECharts does. They sit inside the bar by default, and take a position (`top`, `bottom`, `left`, `right`, `inside*` and the inside corners) and a distance. An unstyled label takes zrender's automatic fill: light text haloed in the bar's colour inside it, dark text haloed in the background outside. The halo colour and width can be set. Text draw commands gain an optional halo (`stroke` and `strokeWidth`), painted by the web canvas, the SVG export and both native canvases.
