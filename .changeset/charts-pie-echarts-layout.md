---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

The engine lays a pie out the way ECharts does. `layoutArcsWith` and `ArcConfig` take the start and end angles, direction, minimum and pad angles, rose type and the zero-sum rule. The new `pie-labels` module places the slice names outside the pie on two-part guide lines, pushed apart so they never overlap and cut with an ellipsis when they would leave the chart. The native engine carries the same maths. A hit on a pie now reports the slice's input index when a slice before it draws nothing.
