---
'@pyreon/charts': minor
---

`lines` series in the option facade (cartesian): each datum's `coords` (or a bare `[[x, y], …]` array) becomes a polyline through the chart's pixel api, with `lineStyle.width` / `color` at series or datum level, axes seeded from every vertex; a datum without coords warns by index, and `effect` (animated trails) warns by name. Lowered as an internal custom plan, so `customCommands` serves hosts. Conformance corpus 32 → 33, floor 30 → 31.
