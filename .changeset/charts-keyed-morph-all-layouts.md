---
'@pyreon/charts': minor
---

`<Chart by>`'s keyed geometry morph now covers stacked and grouped bars, horizontal charts, log scales and dual-axis charts, not only plain vertical bars and lines. Each frame of the morph is laid out and styled by the renderer's own code (the same stack, group, log and right-axis geometry, with corners, gradients, patterns and state fills), so the last morph frame is exactly the finished chart; an entering stacked segment grows from its own base rather than from the axis. Areas, bands, waterfalls, scatter and numeric-x charts keep the per-row value tween, as does an update that changes a series' kind or the chart's orientation.
