---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

OptionChart and optionToSvg now draw a pie the way ECharts does. They read startAngle, endAngle, clockwise, minAngle, padAngle, roseType, stillShowZeroSum and the series' box keys. Labels are the slice names outside the pie on two-part guide lines, pushed apart so they never overlap and cut with an ellipsis when they would leave the chart. The pie also reads label.position, formatter, alignTo, edgeDistance, rotate, overflow and minShowLabelAngle, labelLine, avoidLabelOverlap, percentPrecision and the empty circle. The default radius is ECharts' 50% (chord 80%). All of this is checked against ECharts' own SSR output. The engine gains layoutArcsWith, ArcConfig and pie-labels, so the native engine carries the same maths. A hit on a pie now reports the slice's input index when a slice before it draws nothing.
