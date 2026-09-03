---
'@pyreon/charts': minor
---

Polar coordinate: `layoutPolar` (categories on the ANGLE axis → radial bars in equal slots, grouped side by side or stacked along the radius, plus polar lines at slot centres; categories on the RADIUS axis → concentric arc bars sweeping by value; hole via `innerRatio`, `startAngle`, `clockwise`, fixed or data value domain, nice ticks), `renderPolar` (grid rings/spokes, sectors via the shared arc tessellation, lines + points, rim labels, entrance that grows bars and draws lines), `hitPolar` (sector, then nearest line point), `<PolarChart>` (reactive canvas host, `onSelect(hit)`, accessible table), `polarToSvg` (server-safe), and the option facade routes `bar`/`line` series with `coordinateSystem: 'polar'` (top-level `polar.radius`, `angleAxis`/`radiusAxis` category + `min`/`max` + `startAngle` + `clockwise`, per-series `stack`/`itemStyle.color`; any other series type on the polar coordinate warns). Conformance corpus 25 → 26, floor 23 → 24.
