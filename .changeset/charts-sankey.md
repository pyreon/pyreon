---
'@pyreon/charts': minor
---

Sankey family: `layoutSankey` (columns by longest path with cycle back-edges, self-loops and unknown endpoints dropped BY NAME rather than silently; node bands sized by max(in, out) at one shared scale; weighted-centre relaxation with collision resolution; `nodeWidth`, `nodePadding`, `iterations`, `align: 'left' | 'justify'`), `ribbonPoints` (S-curve ribbons stacked so they never cross at a node, entrance growing from the source), `renderSankey`, `hitSankey` (band, then ribbon via point-in-polygon), `<SankeyChart>` (reactive canvas host, `onSelect(hit)`, accessible table), `sankeyToSvg` (server-safe), and the option facade maps `type: 'sankey'` (`data`/`nodes` + `links`/`edges`, `nodeWidth`, `nodeGap`, `nodeAlign`, `layoutIterations`, `label.show`; `orient: 'vertical'` warns). Conformance corpus 21 → 22, floor 19 → 20.
