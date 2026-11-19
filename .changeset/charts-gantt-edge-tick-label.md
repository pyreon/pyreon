---
'@pyreon/charts': patch
---

The Gantt chart no longer clips its last time-axis label at narrow widths. Tick labels start just right of their tick, so the last one ran past the plot's right edge and a 390px-wide chart showed "29 J". A label that would overflow is now pulled back to end at the edge, and one pulled back onto the label before it is left out instead of stacked. `GanttTick` gains `labelX` and `labelShown`. The fix is in the shared engine, so the generated Swift and Kotlin chart engines carry it too.
