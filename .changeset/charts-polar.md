---
'@pyreon/charts': minor
---

Polar coordinate: `layoutPolar` (categories on the ANGLE axis → radial bars in equal slots, grouped side by side or stacked along the radius, plus polar lines at slot centres; categories on the RADIUS axis → concentric arc bars sweeping by value; hole via `innerRatio`, `startAngle`, `clockwise`, fixed or data value domain, nice ticks), `renderPolar` (grid rings/spokes, sectors via the shared arc tessellation, lines + points, rim labels, entrance that grows bars and draws lines), `hitPolar` (sector, then nearest line point), `<PolarChart>` (reactive canvas host, `onSelect(hit)`, accessible table), `polarToSvg` (server-safe).
