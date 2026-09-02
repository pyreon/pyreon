---
'@pyreon/charts': minor
---

Graph family: `layoutGraph` (DETERMINISTIC force layout — seeded PRNG, Fruchterman–Reingold repulsion/attraction with gravity and cooling, symbols clamped inside the box; `circular` and `none` (data coordinates) layouts; symbol radius by value; category colours; unknown-endpoint links dropped BY NAME), `renderGraph` (links width-by-value under symbols, opt-in labels, entrance converging from the centre), `hitGraph`, `<GraphChart>` (reactive canvas host, `onSelect(node)`, accessible table), `graphToSvg` (server-safe), and the option facade maps `type: 'graph'` (`data`/`nodes` with id/name/value/category/x/y, `links`/`edges` by name or index, `categories`, `layout`, `symbolSize`, `force.repulsion/edgeLength/gravity`, `label.show`; a `symbolSize` FUNCTION warns). Conformance corpus 22 → 23, floor 20 → 21.
