---
'@pyreon/charts': minor
---

Sunburst family: `layoutSunburst` (radial partition — one ring per depth, sibling spans proportional to value inside the parent's span, `padAngle`, `maxDepth`, `sort: 'desc' | 'none'`, `startAngle`, stable child-index paths, inherited colours tinted per ring), `renderSunburst` (arc bands via the shared polygon tessellation, labels only where the chord fits, clockwise entrance sweep), `hitSunburst` (deepest arc, hole-aware, wraps past 12 o'clock), `<SunburstChart>` (reactive canvas host, `innerRatio`, `onSelect(arc)`, accessible leaf table), `sunburstToSvg` (server-safe), and the option facade maps `type: 'sunburst'` (nested data, `radius: [inner, outer]` → hole ratio, `sort: null`, `startAngle` degrees, `label.show`, per-node `itemStyle.color`). Conformance corpus 19 → 20, floor 17 → 18.
