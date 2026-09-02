---
'@pyreon/charts': minor
---

Treemap family: `layoutTreemap` (squarified layout of a value hierarchy — Bruls/Huizing/van Wijk rows, padded nesting, `maxDepth`, stable child-index paths, inherited colours tinted per depth), `renderTreemap` (fills per depth, leaf labels only where they fit, entrance scaling), `hitTreemap` (deepest cell), `<TreemapChart>` (reactive canvas host, `onSelect(cell)`, accessible leaf table), `treemapToSvg` (server-safe), and the option facade maps `type: 'treemap'` (nested `{ name, value, children }` data, `leafDepth`, `label.show`, per-node `itemStyle.color`). Conformance corpus 18 → 19, floor 16 → 17.
