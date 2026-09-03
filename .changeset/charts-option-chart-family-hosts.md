---
'@pyreon/charts': minor
---

`<OptionChart>` mounts a family option (pie, gauge, radar, candlestick, heatmap, funnel, treemap, sunburst, tree, sankey, graph, calendar, parallel, polar, themeRiver, map) on the family's OWN canvas host — hit-testing, reactive repaint and the accessible table included — via the new `familyHostNode(plan, { width, height, onSelect })`; the host's hit arrives on `onFamilySelect(kind, hit)`. Only the two host-less shapes (geo points, single axis) still render as SVG.
