---
'@pyreon/charts': minor
---

The plot engine's first parity wave: curves, annotations, bubbles, value
labels, and an entrance animation.

- `smooth` and `step` curve interpolators, passed as imported bindings
  (`line(y, { curve: smooth })`). `smooth` is monotone cubic — it never
  invents an extremum the data does not have. A curve is a polyline
  densifier, so every backend gets it for free.
- `annotations` on `<PlotChart>` and `chartToSvg`: dashed reference rules at
  a y or x value, translucent bands between two, each with an optional label,
  placed by the same scale the axis is labelled with.
- `bubble(y, r)` sizes points by a second channel, mapped by AREA rather than
  radius — radius-proportional bubbles exaggerate the data.
- `bars(y, { showValues: true })` labels each bar with its formatted value; a
  negative bar's label goes under the bar.
- An entrance animation, on by default and off under `prefers-reduced-motion`
  or `animate: false`. Implemented as `ChartSpec.progress` — a pure engine
  parameter the host tweens, so every frame is testable and native backends
  will animate with no animation code of their own.
- `line` and `polyline` draw commands take an optional `dash`.
