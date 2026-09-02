---
'@pyreon/charts': minor
---

Tree family: `layoutTree` (tidy node-link layout — every leaf takes one slot, parents centre over their leaves; `orient: 'LR' | 'RL' | 'TB' | 'BT' | 'radial'`, `maxDepth`, a label gutter, stable child-index paths, inherited colours), `linkPoints` (smooth S-curves, orthogonal elbows, straight radial spokes), `renderTree` (links → symbols → outward leaf labels / inward inner labels, root-first entrance), `hitTree` (nearest symbol within a halo), `<TreeChart>` (reactive canvas host, `onSelect(node)`, accessible table), `treeToSvg` (server-safe), and the option facade maps `type: 'tree'` (`orient`/`layout: 'radial'`, `symbolSize`, `initialTreeDepth`, `edgeShape: 'polyline'` → elbow, `label.show`, per-node `itemStyle.color`). Conformance corpus 20 → 21, floor 18 → 19.
