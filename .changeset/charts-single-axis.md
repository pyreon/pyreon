---
'@pyreon/charts': minor
---

Single-axis coordinate: `layoutSingleAxis` (one horizontal category or value axis with nice ticks, points placed along it and sized by a second dimension), `renderSingleAxis`, `hitSingleAxis`, `singleAxisToSvg` (server-safe), and the option facade routes `scatter` with `coordinateSystem: 'singleAxis'` over the top-level `singleAxis` (`type`, `data`, `min`/`max`, `name`; `[position, size]` or scalar data, `symbolSize`, labels, colours; other series types warn by name). Conformance corpus 36 → 37, floor 34 → 35.
