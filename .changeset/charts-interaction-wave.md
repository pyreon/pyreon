---
"@pyreon/charts": minor
---

Interaction wave for the plot engine: legend entries are now click-to-toggle (on by default with `showLegend`, opt out with `legendToggle: false`) — the domain rescales to the visible series, hidden entries render muted at their own hue, and the accessible table keeps every series because hiding is a visual focus tool, not a data edit. New `crosshair` prop draws a dashed rule through the hovered datum's column with a marker on each visible line/area/points series. `renderLegend` returns per-entry hit `boxes` and honours a `muted` flag on entries.
