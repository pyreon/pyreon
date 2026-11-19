---
'@pyreon/charts': patch
---

The calendar chart no longer clips its last month label at the right edge. Month labels start over the month's first week, so a month that starts in the last column (December in a January to December range) ran past a narrow canvas: on a 358px chart "Dec" ended at 366px. A label that would overflow is now pulled back to end at the edge, and one pulled back onto the label before it is left out instead of stacked, the same rule the Gantt axis uses. `layoutCalendar` takes an optional `measure` (the chart passes the canvas measurer). The fix is in the shared engine, so the generated Swift and Kotlin chart engines carry it too.
