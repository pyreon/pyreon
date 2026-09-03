---
'@pyreon/charts': minor
---

Theme-river family (streamgraph): `layoutRiver` (layers stacked without gaps on a symmetric `silhouette` baseline or a `zero` baseline, missing values as 0, widest-point label anchors, category ticks), `smoothPoints` (Catmull–Rom sampling) + `layerPolygon`, `renderRiver` (layers back to front, axis, labels only where the layer is thick enough, left-to-right entrance), `hitRiver` (front-most layer under the point), `<RiverChart>` (reactive canvas host, `onSelect(layer)`, accessible table), `riverToSvg` (server-safe), and the option facade maps `type: 'themeRiver'` (`[date, value, name]` triples grouped into streams over the sorted date axis, `singleAxis`, `label.show`; a malformed triple warns by index). Conformance corpus 26 → 27, floor 24 → 25.
