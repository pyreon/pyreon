---
'@pyreon/charts': minor
'@pyreon/mcp': patch
---

The shared canvas host gains `enterDuration`, `enterDelay`, `updateDelay`, `enterEasing` and `updateEasing`, with ECharts' easing table (an entrance of 1000 ms `cubicOut` and an update of 300 ms `cubicInOut` read as ECharts' defaults).

Fixed on the way: a redraw whose content equalled a running tween's target cancelled the tween.
